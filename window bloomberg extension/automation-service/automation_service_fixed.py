#!/usr/bin/env python3
"""
Bloomberg Extension Automation Service - Fixed Version
=====================================================

A lightweight Python service that provides keyboard automation for the Bloomberg Extension.
Uses pynput to send real keyboard events that bypass browser security restrictions.

Features:
- Real Ctrl+P and Enter keystrokes
- Configurable timing delays
- Health check endpoint
- Cross-platform support
- Local-only HTTP API with proper CORS

Author: Claude
Version: 1.1.0 (Fixed CORS)
"""

import json
import time
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import signal
import sys
import urllib.request
import urllib.error

try:
    from pynput import keyboard
    from pynput.keyboard import Key, Listener
except ImportError:
    print("❌ Error: pynput is not installed!")
    print("💡 Please run: pip install pynput")
    sys.exit(1)

# Configuration
DEFAULT_PORT = 8888
DEFAULT_HOST = 'localhost'
DEFAULT_PRINT_DELAY = 2.0  # Seconds to wait between Ctrl+P and first Enter
DEFAULT_SAVE_DELAY = 1.5   # Seconds to wait between first Enter and second Enter
DEFAULT_PAGE_WAIT = 1.0    # Seconds to wait before starting automation

# Logging setup with UTF-8 encoding for Windows
import io
import sys

# Set UTF-8 for stdout to handle emojis
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('automation_service.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

class AutomationService:
    """Main automation service class"""
    
    def __init__(self, port=DEFAULT_PORT, host=DEFAULT_HOST):
        self.port = port
        self.host = host
        self.server = None
        self.is_running = False
        self.is_automating = False  # Lock to prevent concurrent automations
        self.current_automation = None  # Track current automation details
        self.automation_start_time = None
        self.completion_callbacks = []  # Store completion callback URLs
        self.current_tab_info = None  # Track current tab being automated
        self.current_automation_request = None  # Track current request info
        self.last_completed_automation = None  # Store last completed automation info
        
        # Enhanced timeout and recovery system
        self.automation_timeout = 60  # Maximum automation time in seconds
        self.heartbeat_interval = 5  # Heartbeat check every 5 seconds
        self.last_heartbeat = time.time()
        self.stuck_automation_threshold = 30  # Consider stuck after 30 seconds
        
        # Automation tracking for recovery
        self.automation_history = []  # Store last 10 automations
        self.max_history = 10
        self.recovery_attempts = 0
        self.max_recovery_attempts = 3
        
        self.stats = {
            'started_at': time.time(),
            'total_requests': 0,
            'print_requests': 0,
            'errors': 0,
            'concurrent_rejections': 0,
            'timeouts': 0,
            'recoveries': 0,
            'last_automation': None,
            'callbacks_sent': 0
        }
        
        # Timing configuration
        self.print_delay = DEFAULT_PRINT_DELAY
        self.save_delay = DEFAULT_SAVE_DELAY
        self.page_wait = DEFAULT_PAGE_WAIT
        
        # Start background monitoring thread
        self.start_monitoring_thread()
        
        logger.info(f"🚀 Automation Service initialized on {host}:{port} with timeout monitoring")
    
    def start_monitoring_thread(self):
        """Start background thread for monitoring automations"""
        def monitor_automations():
            while self.is_running or not hasattr(self, 'is_running'):
                time.sleep(self.heartbeat_interval)
                
                if self.is_automating:
                    current_time = time.time()
                    automation_duration = current_time - self.automation_start_time
                    
                    # Check for stuck automation
                    if automation_duration > self.stuck_automation_threshold:
                        logger.warning(f"⚠️ Automation running for {automation_duration:.1f}s - checking if stuck")
                        
                        # Check if automation exceeded timeout
                        if automation_duration > self.automation_timeout:
                            logger.error(f"❌ Automation timeout ({automation_duration:.1f}s) - forcing recovery")
                            self.force_automation_recovery("timeout")
                    
                    # Update heartbeat
                    self.last_heartbeat = current_time
        
        # Start monitoring thread
        monitor_thread = threading.Thread(target=monitor_automations, daemon=True)
        monitor_thread.start()
        logger.info("🔄 Started automation monitoring thread")
    
    def force_automation_recovery(self, reason="unknown"):
        """Force recovery from stuck automation"""
        try:
            logger.warning(f"🔧 Forcing automation recovery - reason: {reason}")
            
            # Store failed automation in history
            if self.current_automation_request:
                failed_automation = {
                    'timestamp': time.time(),
                    'duration': time.time() - self.automation_start_time if self.automation_start_time else 0,
                    'request_info': self.current_automation_request.copy(),
                    'failure_reason': reason,
                    'stage': self.current_automation.get('stage', 'unknown') if self.current_automation else 'unknown'
                }
                self.add_to_history(failed_automation)
            
            # Send failure notification
            self.send_completion_notification(
                success=False,
                message=f"Automation recovery triggered - {reason}",
                duration=time.time() - self.automation_start_time if self.automation_start_time else 0
            )
            
            # Reset automation state
            self.is_automating = False
            self.current_automation = None
            self.current_tab_info = None
            self.current_automation_request = None
            self.automation_start_time = None
            
            # Update stats
            self.stats['timeouts' if reason == 'timeout' else 'recoveries'] += 1
            self.recovery_attempts += 1
            
            logger.info(f"✅ Automation recovery completed - service ready for new requests")
            
        except Exception as e:
            logger.error(f"❌ Recovery failed: {e}")
    
    def add_to_history(self, automation_record):
        """Add automation to history for debugging"""
        self.automation_history.append(automation_record)
        
        # Keep only recent history
        if len(self.automation_history) > self.max_history:
            self.automation_history.pop(0)
    
    def get_service_health(self):
        """Get comprehensive service health status"""
        current_time = time.time()
        
        health_status = {
            'service_running': self.is_running,
            'is_automating': self.is_automating,
            'last_heartbeat': self.last_heartbeat,
            'heartbeat_age': current_time - self.last_heartbeat,
            'automation_duration': current_time - self.automation_start_time if self.automation_start_time else 0,
            'recovery_attempts': self.recovery_attempts,
            'automation_history_count': len(self.automation_history),
            'service_uptime': current_time - self.stats['started_at'],
            'current_stage': self.current_automation.get('stage') if self.current_automation else None
        }
        
        # Determine health score
        health_score = 100
        if health_status['heartbeat_age'] > 10:
            health_score -= 20
        if health_status['automation_duration'] > self.stuck_automation_threshold:
            health_score -= 30
        if self.recovery_attempts > 2:
            health_score -= 25
            
        health_status['health_score'] = max(0, health_score)
        health_status['status'] = 'healthy' if health_score > 80 else 'degraded' if health_score > 50 else 'critical'
        
        return health_status
    
    def send_completion_notification(self, success=True, message="", duration=0):
        """Send completion notification to registered callbacks"""
        if not self.completion_callbacks:
            return
        
        notification_data = {
            'automation_completed': True,
            'success': success,
            'message': message,
            'duration': duration,
            'tab_info': self.current_tab_info,
            'timestamp': time.time()
        }
        
        for callback_url in self.completion_callbacks[:]:  # Copy list to avoid modification during iteration
            try:
                # Send HTTP POST to callback URL
                req = urllib.request.Request(
                    callback_url,
                    data=json.dumps(notification_data).encode(),
                    headers={'Content-Type': 'application/json'}
                )
                
                with urllib.request.urlopen(req, timeout=5) as response:
                    if response.status == 200:
                        logger.info(f"✅ Completion notification sent to {callback_url}")
                        self.stats['callbacks_sent'] += 1
                    else:
                        logger.warning(f"⚠️ Callback returned status {response.status}")
                        
            except Exception as e:
                logger.warning(f"❌ Failed to send callback to {callback_url}: {e}")
                # Remove failed callback
                if callback_url in self.completion_callbacks:
                    self.completion_callbacks.remove(callback_url)
    
    def send_ctrl_p(self):
        """Send Ctrl+P keystroke"""
        try:
            keyboard_controller = keyboard.Controller()
            
            # Press Ctrl+P
            logger.info("⌨️  Sending Ctrl+P...")
            with keyboard_controller.pressed(Key.ctrl):
                keyboard_controller.press('p')
                keyboard_controller.release('p')
            
            return True
        except Exception as e:
            logger.error(f"❌ Failed to send Ctrl+P: {e}")
            return False
    
    def send_enter(self):
        """Send Enter keystroke"""
        try:
            keyboard_controller = keyboard.Controller()
            
            # Press Enter
            logger.info("⌨️  Sending Enter...")
            keyboard_controller.press(Key.enter)
            keyboard_controller.release(Key.enter)
            
            return True
        except Exception as e:
            logger.error(f"❌ Failed to send Enter: {e}")
            return False
    
    def execute_print_automation(self, custom_print_delay=None, custom_save_delay=None, custom_page_load_delay=None, request_info=None):
        """Execute the full print automation sequence with double Enter"""
        # Check if automation is already running
        if self.is_automating:
            logger.warning("🚫 Automation already in progress, rejecting request")
            self.stats['concurrent_rejections'] += 1
            return False, "Automation already in progress. Please wait for current automation to complete."
        
        # Store request info for tracking
        if request_info:
            self.current_automation_request = request_info
            logger.info(f"🎯 Starting automation for tab {request_info.get('tab_id')} - {request_info.get('filename')}")
        
        try:
            self.is_automating = True  # Set lock
            self.automation_start_time = time.time()
            print_delay = custom_print_delay if custom_print_delay is not None else self.print_delay
            save_delay = custom_save_delay if custom_save_delay is not None else self.save_delay
            page_wait = custom_page_load_delay if custom_page_load_delay is not None else self.page_wait
            
            # Track current automation details
            self.current_automation = {
                'start_time': self.automation_start_time,
                'print_delay': print_delay,
                'save_delay': save_delay,
                'expected_duration': page_wait + print_delay + save_delay + 1, # +1 buffer
                'stage': 'starting',
                'tab_id': request_info.get('tab_id') if request_info else None,
                'link_index': request_info.get('link_index') if request_info else None
            }
            
            logger.info(f"🤖 Starting print automation (page wait: {page_wait}s, print delay: {print_delay}s, save delay: {save_delay}s)...")
            
            # Wait for page to be ready
            self.current_automation['stage'] = 'page_wait'
            logger.info(f"⏳ Waiting {page_wait}s for page to load...")
            time.sleep(page_wait)
            
            # Step 1: Send Ctrl+P
            self.current_automation['stage'] = 'ctrl_p'
            if not self.send_ctrl_p():
                return False, "Failed to send Ctrl+P"
            
            # Step 2: Wait for print dialog to appear
            self.current_automation['stage'] = 'print_dialog_wait'
            logger.info(f"⏳ Waiting {print_delay}s for print dialog...")
            time.sleep(print_delay)
            
            # Step 3: Send first Enter (confirms print dialog, selects "Save as PDF")
            self.current_automation['stage'] = 'first_enter'
            logger.info("⌨️  Sending first Enter (confirm print dialog)...")
            if not self.send_enter():
                return False, "Failed to send first Enter"
            
            # Step 4: Wait for save location dialog to appear
            self.current_automation['stage'] = 'save_dialog_wait'
            logger.info(f"⏳ Waiting {save_delay}s for save location dialog...")
            time.sleep(save_delay)
            
            # Step 5: Send second Enter (confirms save location)
            self.current_automation['stage'] = 'second_enter'
            logger.info("⌨️  Sending second Enter (confirm save location)...")
            if not self.send_enter():
                return False, "Failed to send second Enter"
            
            # Step 6: Final completion
            self.current_automation['stage'] = 'completed'
            completion_time = time.time()
            actual_duration = completion_time - self.automation_start_time
            
            # Store last automation info
            self.stats['last_automation'] = {
                'completed_at': completion_time,
                'duration': actual_duration,
                'print_delay': print_delay,
                'save_delay': save_delay
            }
            
            # Store completed automation for extension polling
            self.last_completed_automation = {
                'success': True,
                'completed_at': completion_time,
                'duration': actual_duration,
                'message': "Double Enter print automation completed",
                'request_info': self.current_automation_request,
                'tab_info': self.current_tab_info
            }
            
            # Add successful automation to history
            completed_automation = {
                'timestamp': completion_time,
                'duration': actual_duration,
                'request_info': self.current_automation_request.copy() if self.current_automation_request else {},
                'success': True,
                'print_delay': print_delay,
                'save_delay': save_delay
            }
            self.add_to_history(completed_automation)
            
            logger.info(f"✅ Double Enter automation completed successfully in {actual_duration:.2f}s")
            self.stats['print_requests'] += 1
            
            # Send completion notification to extension
            self.send_completion_notification(
                success=True, 
                message="Double Enter print automation completed", 
                duration=actual_duration
            )
            
            return True, "Double Enter print automation completed"
            
        except Exception as e:
            error_msg = f"Print automation failed: {e}"
            logger.error(f"❌ {error_msg}")
            self.stats['errors'] += 1
            
            # Store failed automation for extension polling
            self.last_completed_automation = {
                'success': False,
                'completed_at': time.time(),
                'duration': 0,
                'message': error_msg,
                'request_info': self.current_automation_request,
                'tab_info': self.current_tab_info
            }
            
            # Send error notification to extension
            self.send_completion_notification(
                success=False, 
                message=error_msg, 
                duration=0
            )
            
            return False, error_msg
        finally:
            self.is_automating = False  # Always release lock
            self.current_automation = None
            self.current_tab_info = None
            self.current_automation_request = None

class AutomationHTTPHandler(BaseHTTPRequestHandler):
    """HTTP request handler for the automation service"""
    
    def __init__(self, automation_service, *args, **kwargs):
        self.automation_service = automation_service
        super().__init__(*args, **kwargs)
    
    def log_message(self, format, *args):
        """Override to use our logger"""
        logger.info(f"{self.address_string()} - {format % args}")
    
    def _send_cors_headers(self):
        """Send CORS headers for all responses"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def _send_json_response(self, status_code, data):
        """Send a JSON response with proper headers"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_GET(self):
        """Handle GET requests"""
        self.automation_service.stats['total_requests'] += 1
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query_params = parse_qs(parsed_path.query)
        
        if path == '/status':
            self.handle_status()
        elif path == '/print':
            self.handle_print(query_params)
        elif path == '/config':
            self.handle_config(query_params)
        elif path == '/wait':
            self.handle_wait_for_completion(query_params)
        elif path == '/register_callback':
            self.handle_register_callback(query_params)
        elif path == '/next_tab':
            self.handle_next_tab_request(query_params)
        elif path == '/check_completion':
            self.handle_check_completion(query_params)
        elif path == '/health':
            self.handle_health_check(query_params)
        elif path == '/force_recovery':
            self.handle_force_recovery(query_params)
        elif path == '/history':
            self.handle_automation_history(query_params)
        else:
            self.handle_not_found()
    
    def do_POST(self):
        """Handle POST requests"""
        self.automation_service.stats['total_requests'] += 1
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        if path == '/print':
            self.handle_print_post()
        elif path == '/register_callback':
            self.handle_register_callback_post()
        else:
            self.handle_not_found()
    
    def do_OPTIONS(self):
        """Handle OPTIONS requests for CORS"""
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()
    
    def handle_status(self):
        """Handle status endpoint"""
        uptime = time.time() - self.automation_service.stats['started_at']
        # Calculate current automation progress if running
        current_automation_info = None
        if self.automation_service.current_automation:
            elapsed = time.time() - self.automation_service.automation_start_time
            expected = self.automation_service.current_automation['expected_duration']
            progress = min(elapsed / expected * 100, 100)
            
            current_automation_info = {
                'stage': self.automation_service.current_automation['stage'],
                'elapsed_seconds': round(elapsed, 2),
                'expected_duration': expected,
                'progress_percent': round(progress, 1),
                'estimated_remaining': max(0, expected - elapsed)
            }
        
        status_data = {
            'status': 'running',
            'is_automating': self.automation_service.is_automating,
            'current_automation': current_automation_info,
            'uptime_seconds': round(uptime, 2),
            'uptime_human': f"{int(uptime // 3600)}h {int((uptime % 3600) // 60)}m {int(uptime % 60)}s",
            'stats': self.automation_service.stats,
            'config': {
                'print_delay': self.automation_service.print_delay,
                'save_delay': self.automation_service.save_delay,
                'page_wait': self.automation_service.page_wait
            },
            'version': '1.1.0'
        }
        
        self._send_json_response(200, status_data)
    
    def handle_print(self, query_params):
        """Handle print automation endpoint"""
        try:
            # Get custom delays if provided
            custom_print_delay = None
            custom_save_delay = None
            custom_page_load_delay = None
            
            if 'print_delay' in query_params:
                try:
                    custom_print_delay = float(query_params['print_delay'][0])
                except (ValueError, IndexError):
                    pass
            
            if 'save_delay' in query_params:
                try:
                    custom_save_delay = float(query_params['save_delay'][0])
                except (ValueError, IndexError):
                    pass
            
            if 'page_load_delay' in query_params:
                try:
                    custom_page_load_delay = float(query_params['page_load_delay'][0])
                except (ValueError, IndexError):
                    pass
            
            # Legacy support for single 'delay' parameter (maps to print_delay)
            if 'delay' in query_params and custom_print_delay is None:
                try:
                    custom_print_delay = float(query_params['delay'][0])
                except (ValueError, IndexError):
                    pass
            
            # Execute automation
            success, message = self.automation_service.execute_print_automation(
                custom_print_delay, custom_save_delay, custom_page_load_delay
            )
            
            if success:
                response_data = {
                    'success': True,
                    'message': message,
                    'method': 'python-automation',
                    'print_delay_used': custom_print_delay or self.automation_service.print_delay,
                    'save_delay_used': custom_save_delay or self.automation_service.save_delay
                }
                self._send_json_response(200, response_data)
            else:
                response_data = {
                    'success': False,
                    'error': message,
                    'method': 'python-automation'
                }
                self._send_json_response(500, response_data)
            
        except Exception as e:
            error_response = {
                'success': False,
                'error': f"Internal server error: {e}",
                'method': 'python-automation'
            }
            self._send_json_response(500, error_response)
    
    def handle_print_post(self):
        """Handle POST request for print automation"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            if content_length > 0:
                data = json.loads(post_data.decode())
                custom_print_delay = data.get('print_delay') or data.get('delay')  # Legacy support
                custom_save_delay = data.get('save_delay')
                custom_page_load_delay = data.get('page_load_delay')
                
                # Extract request info for tracking
                request_info = {
                    'tab_id': data.get('tab_id'),
                    'link_index': data.get('link_index'),
                    'filename': data.get('filename')
                }
            else:
                custom_print_delay = None
                custom_save_delay = None
                custom_page_load_delay = None
                request_info = None
            
            success, message = self.automation_service.execute_print_automation(
                custom_print_delay, custom_save_delay, custom_page_load_delay, request_info
            )
            
            if success:
                response_data = {
                    'success': True,
                    'message': message,
                    'method': 'python-automation',
                    'print_delay_used': custom_print_delay or self.automation_service.print_delay,
                    'save_delay_used': custom_save_delay or self.automation_service.save_delay
                }
                self._send_json_response(200, response_data)
            else:
                response_data = {
                    'success': False,
                    'error': message,
                    'method': 'python-automation'
                }
                self._send_json_response(500, response_data)
            
        except Exception as e:
            error_response = {
                'success': False,
                'error': f"Internal server error: {e}",
                'method': 'python-automation'
            }
            self._send_json_response(500, error_response)
    
    def handle_config(self, query_params):
        """Handle configuration endpoint"""
        try:
            updated = False
            
            if 'print_delay' in query_params:
                try:
                    new_delay = float(query_params['print_delay'][0])
                    self.automation_service.print_delay = new_delay
                    updated = True
                    logger.info(f"📝 Updated print_delay to {new_delay}s")
                except (ValueError, IndexError):
                    pass
            
            if 'page_wait' in query_params:
                try:
                    new_wait = float(query_params['page_wait'][0])
                    self.automation_service.page_wait = new_wait
                    updated = True
                    logger.info(f"📝 Updated page_wait to {new_wait}s")
                except (ValueError, IndexError):
                    pass
            
            if 'save_delay' in query_params:
                try:
                    new_save_delay = float(query_params['save_delay'][0])
                    self.automation_service.save_delay = new_save_delay
                    updated = True
                    logger.info(f"📝 Updated save_delay to {new_save_delay}s")
                except (ValueError, IndexError):
                    pass
            
            response_data = {
                'success': True,
                'updated': updated,
                'config': {
                    'print_delay': self.automation_service.print_delay,
                    'save_delay': self.automation_service.save_delay,
                    'page_wait': self.automation_service.page_wait
                }
            }
            
            self._send_json_response(200, response_data)
            
        except Exception as e:
            error_response = {
                'success': False,
                'error': f"Configuration error: {e}"
            }
            self._send_json_response(500, error_response)
    
    def handle_check_completion(self, query_params):
        """Handle completion check endpoint - for extension polling"""
        try:
            tab_id = query_params.get('tab_id', [None])[0]
            link_index = query_params.get('link_index', [None])[0]
            
            response_data = {
                'automation_running': self.automation_service.is_automating,
                'has_completion': self.automation_service.last_completed_automation is not None
            }
            
            # If there's a completed automation, check if it matches the request
            if self.automation_service.last_completed_automation:
                completed = self.automation_service.last_completed_automation
                request_info = completed.get('request_info', {})
                
                # Check if this completion matches the requesting tab/link
                if (tab_id and str(request_info.get('tab_id')) == str(tab_id)) or \
                   (link_index and str(request_info.get('link_index')) == str(link_index)):
                    response_data.update({
                        'completed': True,
                        'success': completed['success'],
                        'duration': completed['duration'],
                        'message': completed['message'],
                        'completed_at': completed['completed_at'],
                        'request_info': request_info
                    })
                    
                    # Clear the completion after returning it (consume once)
                    self.automation_service.last_completed_automation = None
                    logger.info(f"✅ Returned completion status for tab {tab_id} / link {link_index}")
                else:
                    response_data['completed'] = False
                    response_data['message'] = 'No matching completion found'
            else:
                response_data['completed'] = False
                response_data['message'] = 'No completion available'
            
            self._send_json_response(200, response_data)
            
        except Exception as e:
            self._send_json_response(500, {'error': f"Completion check failed: {e}"})

    def handle_health_check(self, query_params):
        """Handle health check endpoint"""
        try:
            health_status = self.automation_service.get_service_health()
            self._send_json_response(200, health_status)
        except Exception as e:
            self._send_json_response(500, {'error': f"Health check failed: {e}"})
    
    def handle_force_recovery(self, query_params):
        """Handle force recovery endpoint"""
        try:
            reason = query_params.get('reason', ['manual'])[0]
            
            if not self.automation_service.is_automating:
                self._send_json_response(200, {
                    'success': True,
                    'message': 'No automation in progress - no recovery needed',
                    'was_automating': False
                })
                return
            
            # Force recovery
            self.automation_service.force_automation_recovery(reason)
            
            self._send_json_response(200, {
                'success': True,
                'message': f'Forced recovery completed - reason: {reason}',
                'was_automating': True,
                'recovery_attempts': self.automation_service.recovery_attempts
            })
            
        except Exception as e:
            self._send_json_response(500, {'error': f"Force recovery failed: {e}"})
    
    def handle_automation_history(self, query_params):
        """Handle automation history endpoint"""
        try:
            history_data = {
                'automation_history': self.automation_service.automation_history,
                'history_count': len(self.automation_service.automation_history),
                'recovery_attempts': self.automation_service.recovery_attempts,
                'current_automation': self.automation_service.current_automation,
                'last_completed': self.automation_service.last_completed_automation
            }
            self._send_json_response(200, history_data)
        except Exception as e:
            self._send_json_response(500, {'error': f"History retrieval failed: {e}"})

    def handle_not_found(self):
        """Handle 404 not found"""
        response_data = {
            'error': 'Endpoint not found',
            'available_endpoints': ['/status', '/print', '/config', '/wait', '/register_callback', '/next_tab', '/check_completion', '/health', '/force_recovery', '/history']
        }
        
        self._send_json_response(404, response_data)
    
    def handle_wait_for_completion(self, query_params):
        """Handle wait for completion endpoint - blocks until automation is done"""
        try:
            max_wait = 30  # Maximum wait time in seconds
            timeout = float(query_params.get('timeout', [max_wait])[0]) if 'timeout' in query_params else max_wait
            timeout = min(timeout, max_wait)  # Cap at 30 seconds
            
            start_time = time.time()
            
            # Wait for automation to complete or timeout
            while self.automation_service.is_automating and (time.time() - start_time) < timeout:
                time.sleep(0.1)  # Check every 100ms
            
            elapsed = time.time() - start_time
            
            response_data = {
                'automation_completed': not self.automation_service.is_automating,
                'wait_time': round(elapsed, 2),
                'timeout_reached': elapsed >= timeout,
                'last_automation': self.automation_service.stats.get('last_automation'),
                'status': 'idle' if not self.automation_service.is_automating else 'busy'
            }
            
            self._send_json_response(200, response_data)
            
        except Exception as e:
            error_response = {
                'success': False,
                'error': f"Wait endpoint error: {e}"
            }
            self._send_json_response(500, error_response)
    
    def handle_register_callback(self, query_params):
        """Handle callback registration via GET"""
        try:
            callback_url = query_params.get('url', [None])[0]
            if not callback_url:
                self._send_json_response(400, {'error': 'Missing callback URL'})
                return
            
            # Add callback URL if not already registered
            if callback_url not in self.automation_service.completion_callbacks:
                self.automation_service.completion_callbacks.append(callback_url)
                logger.info(f"📞 Registered callback: {callback_url}")
            
            response_data = {
                'success': True,
                'callback_registered': callback_url,
                'total_callbacks': len(self.automation_service.completion_callbacks)
            }
            self._send_json_response(200, response_data)
            
        except Exception as e:
            self._send_json_response(500, {'error': f"Callback registration failed: {e}"})
    
    def handle_register_callback_post(self):
        """Handle callback registration via POST"""
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode())
                
                callback_url = data.get('callback_url')
                tab_info = data.get('tab_info', {})
                
                if not callback_url:
                    self._send_json_response(400, {'error': 'Missing callback_url'})
                    return
                
                # Store tab info for this automation session
                self.automation_service.current_tab_info = tab_info
                
                # Add callback URL if not already registered
                if callback_url not in self.automation_service.completion_callbacks:
                    self.automation_service.completion_callbacks.append(callback_url)
                    logger.info(f"📞 Registered callback: {callback_url} for tab: {tab_info}")
                
                response_data = {
                    'success': True,
                    'callback_registered': callback_url,
                    'tab_info_stored': tab_info,
                    'total_callbacks': len(self.automation_service.completion_callbacks)
                }
                self._send_json_response(200, response_data)
            else:
                self._send_json_response(400, {'error': 'Empty request body'})
                
        except Exception as e:
            self._send_json_response(500, {'error': f"Callback registration failed: {e}"})
    
    def handle_next_tab_request(self, query_params):
        """Handle request for next tab - signals automation completion"""
        try:
            message = query_params.get('message', ['Automation completed, requesting next tab'])[0]
            
            # Send immediate completion notification
            self.automation_service.send_completion_notification(
                success=True,
                message=message,
                duration=0
            )
            
            response_data = {
                'success': True,
                'message': 'Next tab request sent to extension',
                'callbacks_notified': len(self.automation_service.completion_callbacks)
            }
            self._send_json_response(200, response_data)
            
        except Exception as e:
            self._send_json_response(500, {'error': f"Next tab request failed: {e}"})

def create_handler(automation_service):
    """Create a handler class with access to the automation service"""
    def handler(*args, **kwargs):
        AutomationHTTPHandler(automation_service, *args, **kwargs)
    return handler

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"🛑 Received signal {signum}, shutting down gracefully...")
    sys.exit(0)

def main():
    """Main function"""
    # Set up signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    print("🚀 Bloomberg Extension Automation Service (Fixed)")
    print("=" * 55)
    
    # Create automation service
    automation_service = AutomationService()
    
    # Check accessibility permissions on macOS
    try:
        # Test if we can create a keyboard controller
        test_controller = keyboard.Controller()
        logger.info("✅ Keyboard access verified")
    except Exception as e:
        logger.error("❌ Keyboard access failed!")
        logger.error("💡 On macOS, you need to grant accessibility permissions:")
        logger.error("   1. Go to System Preferences → Security & Privacy → Privacy")
        logger.error("   2. Select 'Accessibility' on the left")
        logger.error("   3. Add Terminal (or your terminal app) to the list")
        logger.error("   4. Restart this service")
        sys.exit(1)
    
    # Create and start HTTP server
    try:
        handler = create_handler(automation_service)
        server = HTTPServer((automation_service.host, automation_service.port), handler)
        automation_service.server = server
        automation_service.is_running = True
        
        logger.info(f"🌐 Server starting on http://{automation_service.host}:{automation_service.port}")
        logger.info("📋 Available endpoints:")
        logger.info("   GET  /status - Service status and stats")
        logger.info("   GET  /print?print_delay=X&save_delay=Y - Execute print automation")
        logger.info("   POST /print - Execute print automation with JSON body")
        logger.info("   GET  /config?print_delay=X&save_delay=Y&page_wait=Z - Update configuration")
        logger.info("🔒 CORS enabled for extension communication")
        logger.info("⏹️  Press Ctrl+C to stop")
        
        print(f"\n✅ Service ready! Extension can now connect to:")
        print(f"   http://localhost:{automation_service.port}")
        print("\n📱 Test the service:")
        print(f"   curl http://localhost:{automation_service.port}/status")
        print(f"   curl http://localhost:{automation_service.port}/print")
        
        server.serve_forever()
        
    except KeyboardInterrupt:
        logger.info("🛑 Keyboard interrupt received")
    except Exception as e:
        logger.error(f"❌ Server error: {e}")
    finally:
        if automation_service.server:
            automation_service.server.shutdown()
            automation_service.server.server_close()
        automation_service.is_running = False
        logger.info("🔚 Service stopped")

if __name__ == "__main__":
    main()