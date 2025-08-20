#!/usr/bin/env python3
"""
Extension Communication Manager
Handles communication between MainManager and Chrome extension
"""

import json
import time
import logging
import threading
import requests
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from typing import Dict, List, Any, Optional, Callable
from datetime import datetime
import socket

class ExtensionCommunicationHandler(BaseHTTPRequestHandler):
    """HTTP handler for extension communication"""
    
    def __init__(self, extension_manager, *args, **kwargs):
        self.extension_manager = extension_manager
        super().__init__(*args, **kwargs)
    
    def log_message(self, format, *args):
        """Override to use extension manager's logger"""
        self.extension_manager.logger.debug(f"HTTP: {format % args}")
    
    def _send_cors_headers(self):
        """Send CORS headers for Chrome extension communication"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Access-Control-Max-Age', '86400')
    
    def _send_json_response(self, status_code, data):
        """Send JSON response with proper headers"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def do_OPTIONS(self):
        """Handle CORS preflight requests"""
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        query_params = parse_qs(parsed_path.query)
        
        if path == '/api/extension/status':
            self.handle_status_request()
        elif path == '/api/extension/links':
            self.handle_get_links_request()
        elif path == '/api/extension/next':
            self.handle_next_link_request()
        elif path == '/api/extension/heartbeat':
            self.handle_heartbeat_request()
        else:
            self._send_json_response(404, {'error': 'Endpoint not found'})
    
    def do_POST(self):
        """Handle POST requests"""
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            if content_length > 0:
                data = json.loads(post_data.decode())
            else:
                data = {}
            
            if path == '/api/extension/result':
                self.handle_result_submission(data)
            elif path == '/api/extension/error':
                self.handle_error_report(data)
            elif path == '/api/extension/automation_request':
                self.handle_automation_request(data)
            elif path == '/api/extension/bot_detection':
                self.handle_bot_detection_report(data)
            else:
                self._send_json_response(404, {'error': 'Endpoint not found'})
                
        except json.JSONDecodeError:
            self._send_json_response(400, {'error': 'Invalid JSON'})
        except Exception as e:
            self._send_json_response(500, {'error': str(e)})
    
    def handle_status_request(self):
        """Handle extension status request"""
        status = self.extension_manager.get_extension_status()
        self._send_json_response(200, status)
    
    def handle_get_links_request(self):
        """Handle request for links to process"""
        links = self.extension_manager.get_links_for_extension()
        self._send_json_response(200, {'links': links})
    
    def handle_next_link_request(self):
        """Handle request for next link"""
        next_link = self.extension_manager.get_next_link()
        if next_link:
            self._send_json_response(200, {'link': next_link})
        else:
            self._send_json_response(200, {'link': None, 'message': 'No more links'})
    
    def handle_heartbeat_request(self):
        """Handle extension heartbeat"""
        self.extension_manager.update_extension_heartbeat()
        self._send_json_response(200, {'status': 'ok', 'timestamp': datetime.now().isoformat()})
    
    def handle_result_submission(self, data):
        """Handle processing result from extension"""
        result = self.extension_manager.process_extension_result(data)
        self._send_json_response(200, {'success': True, 'result': result})
    
    def handle_error_report(self, data):
        """Handle error report from extension"""
        self.extension_manager.handle_extension_error(data)
        self._send_json_response(200, {'success': True, 'message': 'Error reported'})
    
    def handle_automation_request(self, data):
        """Handle automation request from extension"""
        result = self.extension_manager.handle_automation_request(data)
        self._send_json_response(200, result)
    
    def handle_bot_detection_report(self, data):
        """Handle bot detection report from extension"""
        result = self.extension_manager.handle_bot_detection_report(data)
        self._send_json_response(200, result)

class ExtensionManager:
    """Manager for Chrome extension communication"""
    
    def __init__(self, mainmanager_instance, port=8889):
        self.mainmanager = mainmanager_instance
        self.port = port
        self.host = 'localhost'
        self.server = None
        self.is_running = False
        
        # Extension state
        self.extension_connected = False
        self.last_heartbeat = None
        self.extension_info = {}
        
        # Link management
        self.pending_links = []
        self.current_link = None
        self.processed_links = []
        self.failed_links = []
        
        # Callbacks
        self.on_result_callback = None
        self.on_error_callback = None
        self.on_automation_request_callback = None
        self.on_bot_detection_callback = None
        
        # Threading
        self.server_thread = None
        self.heartbeat_thread = None
        self.should_stop = False
        
        self.logger = logging.getLogger(__name__)
        
    def start(self):
        """Start the extension communication server"""
        if self.is_running:
            self.logger.warning("Extension manager already running")
            return
        
        try:
            # Create handler factory
            def handler_factory(*args, **kwargs):
                return ExtensionCommunicationHandler(self, *args, **kwargs)
            
            # Create and start server
            self.server = HTTPServer((self.host, self.port), handler_factory)
            self.is_running = True
            self.should_stop = False
            
            # Start server thread
            self.server_thread = threading.Thread(target=self._run_server)
            self.server_thread.daemon = True
            self.server_thread.start()
            
            # Start heartbeat monitor
            self.heartbeat_thread = threading.Thread(target=self._monitor_heartbeat)
            self.heartbeat_thread.daemon = True
            self.heartbeat_thread.start()
            
            self.logger.info(f"🌐 Extension communication server started on http://{self.host}:{self.port}")
            
        except Exception as e:
            self.logger.error(f"Failed to start extension communication server: {e}")
            self.is_running = False
            raise
    
    def stop(self):
        """Stop the extension communication server"""
        if not self.is_running:
            return
        
        self.should_stop = True
        self.is_running = False
        
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        
        if self.server_thread and self.server_thread.is_alive():
            self.server_thread.join(timeout=5)
        
        if self.heartbeat_thread and self.heartbeat_thread.is_alive():
            self.heartbeat_thread.join(timeout=5)
        
        self.logger.info("🔚 Extension communication server stopped")
    
    def _run_server(self):
        """Run the HTTP server"""
        try:
            self.server.serve_forever()
        except Exception as e:
            if not self.should_stop:
                self.logger.error(f"Server error: {e}")
    
    def _monitor_heartbeat(self):
        """Monitor extension heartbeat"""
        while not self.should_stop:
            try:
                current_time = datetime.now()
                
                if self.last_heartbeat:
                    time_diff = (current_time - self.last_heartbeat).total_seconds()
                    
                    if time_diff > 30:  # 30 seconds timeout
                        if self.extension_connected:
                            self.logger.warning("Extension heartbeat timeout - marking as disconnected")
                            self.extension_connected = False
                            self.extension_info = {}
                    elif time_diff < 30 and not self.extension_connected:
                        self.logger.info("Extension reconnected")
                        self.extension_connected = True
                
                time.sleep(10)  # Check every 10 seconds
                
            except Exception as e:
                self.logger.error(f"Heartbeat monitor error: {e}")
                time.sleep(5)
    
    def send_links_to_extension(self, links: List[str]) -> bool:
        """Send links to extension for processing"""
        try:
            # Add links to pending queue
            for link in links:
                if link not in [l['url'] for l in self.pending_links]:
                    self.pending_links.append({
                        'url': link,
                        'added_at': datetime.now().isoformat(),
                        'status': 'pending'
                    })
            
            self.logger.info(f"Added {len(links)} links to extension queue")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to send links to extension: {e}")
            return False
    
    def get_extension_status(self) -> Dict[str, Any]:
        """Get current extension status"""
        return {
            'connected': self.extension_connected,
            'last_heartbeat': self.last_heartbeat.isoformat() if self.last_heartbeat else None,
            'pending_links': len(self.pending_links),
            'processed_links': len(self.processed_links),
            'failed_links': len(self.failed_links),
            'current_link': self.current_link,
            'extension_info': self.extension_info
        }
    
    def get_links_for_extension(self) -> List[Dict[str, Any]]:
        """Get links for extension to process"""
        return [link for link in self.pending_links if link['status'] == 'pending']
    
    def get_next_link(self) -> Optional[Dict[str, Any]]:
        """Get next link for processing"""
        pending_links = [l for l in self.pending_links if l['status'] == 'pending']
        
        if pending_links:
            next_link = pending_links[0]
            next_link['status'] = 'processing'
            self.current_link = next_link
            return next_link
        
        return None
    
    def update_extension_heartbeat(self):
        """Update extension heartbeat timestamp"""
        self.last_heartbeat = datetime.now()
        if not self.extension_connected:
            self.extension_connected = True
            self.logger.info("Extension connected")
    
    def process_extension_result(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process result from extension"""
        try:
            url = data.get('url')
            success = data.get('success', False)
            content = data.get('content', '')
            error = data.get('error', '')
            
            # Find the link in pending queue
            link_found = False
            for link in self.pending_links:
                if link['url'] == url:
                    link['status'] = 'completed' if success else 'failed'
                    link['processed_at'] = datetime.now().isoformat()
                    link['error'] = error if not success else None
                    link_found = True
                    break
            
            if not link_found:
                self.logger.warning(f"Received result for unknown link: {url}")
                return {'success': False, 'error': 'Link not found'}
            
            # Move to appropriate list
            if success:
                self.processed_links.append({
                    'url': url,
                    'content': content,
                    'processed_at': datetime.now().isoformat()
                })
                self.logger.info(f"Successfully processed: {url}")
            else:
                self.failed_links.append({
                    'url': url,
                    'error': error,
                    'failed_at': datetime.now().isoformat()
                })
                self.logger.error(f"Failed to process: {url} - {error}")
            
            # Clear current link
            self.current_link = None
            
            # Call callback if set
            if self.on_result_callback:
                self.on_result_callback(url, success, content, error)
            
            return {'success': True, 'next_action': 'continue'}
            
        except Exception as e:
            self.logger.error(f"Error processing extension result: {e}")
            return {'success': False, 'error': str(e)}
    
    def handle_extension_error(self, data: Dict[str, Any]):
        """Handle error report from extension"""
        try:
            url = data.get('url')
            error = data.get('error', 'Unknown error')
            error_type = data.get('error_type', 'general')
            
            self.logger.error(f"Extension error for {url}: {error} (type: {error_type})")
            
            # Call callback if set
            if self.on_error_callback:
                self.on_error_callback(url, error, error_type)
                
        except Exception as e:
            self.logger.error(f"Error handling extension error: {e}")
    
    def handle_automation_request(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle automation request from extension"""
        try:
            url = data.get('url')
            action = data.get('action', 'print')
            
            self.logger.info(f"Automation request for {url}: {action}")
            
            # Call callback if set
            if self.on_automation_request_callback:
                result = self.on_automation_request_callback(url, action, data)
                return result
            
            return {'success': True, 'message': 'Automation request received'}
            
        except Exception as e:
            self.logger.error(f"Error handling automation request: {e}")
            return {'success': False, 'error': str(e)}
    
    def handle_bot_detection_report(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle bot detection report from extension"""
        try:
            url = data.get('url')
            detection_results = data.get('detection_results', {})
            
            self.logger.info(f"Bot detection report for {url}: {detection_results}")
            
            # Call callback if set
            if self.on_bot_detection_callback:
                result = self.on_bot_detection_callback(url, detection_results)
                return result
            
            return {'success': True, 'message': 'Bot detection report received'}
            
        except Exception as e:
            self.logger.error(f"Error handling bot detection report: {e}")
            return {'success': False, 'error': str(e)}
    
    def set_callbacks(self, 
                     on_result: Optional[Callable] = None,
                     on_error: Optional[Callable] = None,
                     on_automation_request: Optional[Callable] = None,
                     on_bot_detection: Optional[Callable] = None):
        """Set callback functions for extension events"""
        self.on_result_callback = on_result
        self.on_error_callback = on_error
        self.on_automation_request_callback = on_automation_request
        self.on_bot_detection_callback = on_bot_detection
    
    def is_extension_connected(self) -> bool:
        """Check if extension is currently connected"""
        return self.extension_connected
    
    def get_processing_statistics(self) -> Dict[str, Any]:
        """Get processing statistics"""
        return {
            'total_links': len(self.pending_links),
            'processed': len(self.processed_links),
            'failed': len(self.failed_links),
            'pending': len([l for l in self.pending_links if l['status'] == 'pending']),
            'processing': len([l for l in self.pending_links if l['status'] == 'processing']),
            'success_rate': (len(self.processed_links) / max(1, len(self.processed_links) + len(self.failed_links))) * 100
        }
    
    def clear_processed_links(self):
        """Clear processed links"""
        self.processed_links.clear()
        self.logger.info("Cleared processed links")
    
    def clear_failed_links(self):
        """Clear failed links"""
        self.failed_links.clear()
        self.logger.info("Cleared failed links")
    
    def retry_failed_links(self):
        """Retry failed links"""
        for failed_link in self.failed_links:
            self.pending_links.append({
                'url': failed_link['url'],
                'added_at': datetime.now().isoformat(),
                'status': 'pending'
            })
        
        self.failed_links.clear()
        self.logger.info("Retried failed links")

def create_extension_manager(mainmanager_instance, port=8889):
    """Factory function to create extension manager"""
    return ExtensionManager(mainmanager_instance, port)