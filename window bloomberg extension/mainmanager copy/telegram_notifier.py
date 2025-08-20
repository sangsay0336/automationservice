#!/usr/bin/env python3
"""
Telegram Notification System for MainManager
Handles user notifications and intervention requests via Telegram
"""

import json
import logging
import time
import threading
from datetime import datetime
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass
import urllib.request
import urllib.parse
from urllib.error import HTTPError, URLError

@dataclass
class TelegramConfig:
    """Configuration for Telegram notifications"""
    bot_token: str
    chat_id: str
    base_url: str = "https://api.telegram.org/bot"
    timeout: int = 30
    retry_attempts: int = 3
    retry_delay: int = 5

@dataclass
class InterventionRequest:
    """User intervention request"""
    id: str
    url: str
    error_details: str
    detection_type: str
    confidence_score: float
    timestamp: datetime
    status: str  # 'pending', 'resolved', 'timeout'
    response_received: bool = False
    user_action: Optional[str] = None

class TelegramNotifier:
    """Telegram notification system for user interventions"""
    
    def __init__(self, config: TelegramConfig):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Intervention tracking
        self.pending_interventions: Dict[str, InterventionRequest] = {}
        self.intervention_callbacks: Dict[str, Callable] = {}
        
        # Webhook handling
        self.webhook_active = False
        self.webhook_thread = None
        
        # Message templates
        self.message_templates = self._initialize_message_templates()
        
        # Test connection
        self.is_connected = self._test_connection()
    
    def _initialize_message_templates(self) -> Dict[str, str]:
        """Initialize message templates"""
        return {
            'intervention_request': """
🚨 *Manual Intervention Required*

📄 *URL:* {url}

⚠️ *Issue Detected:* {detection_type}
📊 *Confidence:* {confidence_score:.1%}

🔍 *Details:*
{error_details}

⏰ *Time:* {timestamp}

Please check the website manually and choose an action:
""",
            'processing_paused': """
⏸️ *Processing Paused*

The news processing system has been paused due to issues with: {url}

Current status: {status}
Links remaining: {remaining_links}

The system is waiting for your response to continue.
""",
            'system_resumed': """
▶️ *Processing Resumed*

The news processing system has resumed operation.

✅ Total processed: {processed_count}
❌ Failed: {failed_count}
⏳ Remaining: {remaining_count}

Processing will continue automatically.
""",
            'batch_completed': """
🎉 *Batch Processing Complete*

All news links have been processed successfully!

📊 *Summary:*
✅ Successful: {successful_count}
❌ Failed: {failed_count}
⏱️ Total time: {total_time}

Check the MainManager dashboard for detailed results.
""",
            'error_notification': """
❌ *System Error*

An error occurred in the MainManager system:

🔧 *Component:* {component}
⚠️ *Error:* {error_message}
⏰ *Time:* {timestamp}

The system may require attention.
"""
        }
    
    def _test_connection(self) -> bool:
        """Test Telegram bot connection"""
        try:
            url = f"{self.config.base_url}{self.config.bot_token}/getMe"
            response = self._make_request(url)
            
            if response and response.get('ok'):
                bot_info = response.get('result', {})
                self.logger.info(f"✅ Telegram bot connected: {bot_info.get('username', 'Unknown')}")
                return True
            else:
                self.logger.error("❌ Telegram bot connection failed")
                return False
                
        except Exception as e:
            self.logger.error(f"❌ Telegram connection test failed: {e}")
            return False
    
    def _make_request(self, url: str, data: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """Make HTTP request to Telegram API"""
        for attempt in range(self.config.retry_attempts):
            try:
                if data:
                    data_encoded = urllib.parse.urlencode(data).encode('utf-8')
                    req = urllib.request.Request(url, data=data_encoded, method='POST')
                    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
                else:
                    req = urllib.request.Request(url)
                
                with urllib.request.urlopen(req, timeout=self.config.timeout) as response:
                    return json.loads(response.read().decode('utf-8'))
                    
            except (HTTPError, URLError) as e:
                self.logger.warning(f"Telegram API request failed (attempt {attempt + 1}): {e}")
                if attempt < self.config.retry_attempts - 1:
                    time.sleep(self.config.retry_delay)
                else:
                    self.logger.error(f"Failed to make Telegram request after {self.config.retry_attempts} attempts")
                    return None
                    
            except Exception as e:
                self.logger.error(f"Unexpected error in Telegram request: {e}")
                return None
        
        return None
    
    def send_intervention_request(self, url: str, error_details: str, detection_type: str, 
                                confidence_score: float, callback: Optional[Callable] = None) -> str:
        """Send intervention request to user"""
        try:
            # Create intervention request
            intervention_id = f"intervention_{int(time.time())}_{hash(url) % 10000}"
            intervention = InterventionRequest(
                id=intervention_id,
                url=url,
                error_details=error_details,
                detection_type=detection_type,
                confidence_score=confidence_score,
                timestamp=datetime.now(),
                status='pending'
            )
            
            # Store intervention
            self.pending_interventions[intervention_id] = intervention
            if callback:
                self.intervention_callbacks[intervention_id] = callback
            
            # Prepare message
            message = self.message_templates['intervention_request'].format(
                url=url,
                detection_type=detection_type.replace('_', ' ').title(),
                confidence_score=confidence_score,
                error_details=error_details,
                timestamp=intervention.timestamp.strftime('%Y-%m-%d %H:%M:%S')
            )
            
            # Create inline keyboard
            keyboard = {
                'inline_keyboard': [
                    [
                        {'text': '✅ Continue', 'callback_data': f'continue_{intervention_id}'},
                        {'text': '⏭️ Skip', 'callback_data': f'skip_{intervention_id}'}
                    ],
                    [
                        {'text': '⏸️ Pause', 'callback_data': f'pause_{intervention_id}'},
                        {'text': '🛑 Stop', 'callback_data': f'stop_{intervention_id}'}
                    ],
                    [
                        {'text': '🔄 Retry', 'callback_data': f'retry_{intervention_id}'}
                    ]
                ]
            }
            
            # Send message
            success = self._send_message(message, keyboard)
            
            if success:
                self.logger.info(f"📱 Intervention request sent for {url}")
                return intervention_id
            else:
                self.logger.error(f"❌ Failed to send intervention request for {url}")
                return ""
                
        except Exception as e:
            self.logger.error(f"Error sending intervention request: {e}")
            return ""
    
    def _send_message(self, message: str, keyboard: Optional[Dict[str, Any]] = None) -> bool:
        """Send message to Telegram chat"""
        try:
            url = f"{self.config.base_url}{self.config.bot_token}/sendMessage"
            
            data = {
                'chat_id': self.config.chat_id,
                'text': message,
                'parse_mode': 'Markdown'
            }
            
            if keyboard:
                data['reply_markup'] = json.dumps(keyboard)
            
            response = self._make_request(url, data)
            return response and response.get('ok', False)
            
        except Exception as e:
            self.logger.error(f"Error sending Telegram message: {e}")
            return False
    
    def wait_for_user_response(self, intervention_id: str, timeout: int = 300) -> Dict[str, Any]:
        """Wait for user response to intervention request"""
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            if intervention_id in self.pending_interventions:
                intervention = self.pending_interventions[intervention_id]
                
                if intervention.response_received:
                    # Response received
                    result = {
                        'success': True,
                        'action': intervention.user_action,
                        'intervention_id': intervention_id,
                        'response_time': time.time() - start_time
                    }
                    
                    # Clean up
                    del self.pending_interventions[intervention_id]
                    if intervention_id in self.intervention_callbacks:
                        del self.intervention_callbacks[intervention_id]
                    
                    return result
            
            time.sleep(1)  # Check every second
        
        # Timeout reached
        if intervention_id in self.pending_interventions:
            intervention = self.pending_interventions[intervention_id]
            intervention.status = 'timeout'
            
            # Send timeout notification
            self._send_message(f"⏰ Intervention request timed out for: {intervention.url}")
        
        return {
            'success': False,
            'error': 'timeout',
            'intervention_id': intervention_id,
            'timeout_duration': timeout
        }
    
    def handle_callback_query(self, callback_data: str) -> Dict[str, Any]:
        """Handle callback query from Telegram inline keyboard"""
        try:
            # Parse callback data
            parts = callback_data.split('_', 1)
            if len(parts) != 2:
                return {'success': False, 'error': 'Invalid callback data'}
            
            action, intervention_id = parts
            
            if intervention_id not in self.pending_interventions:
                return {'success': False, 'error': 'Intervention not found'}
            
            intervention = self.pending_interventions[intervention_id]
            intervention.user_action = action
            intervention.response_received = True
            intervention.status = 'resolved'
            
            # Call callback if set
            if intervention_id in self.intervention_callbacks:
                callback = self.intervention_callbacks[intervention_id]
                callback(action, intervention)
            
            # Send confirmation
            action_text = {
                'continue': '✅ Processing will continue',
                'skip': '⏭️ Link will be skipped',
                'pause': '⏸️ Processing will be paused',
                'stop': '🛑 Processing will be stopped',
                'retry': '🔄 Link will be retried'
            }.get(action, f'Action: {action}')
            
            self._send_message(f"Response received: {action_text}")
            
            return {'success': True, 'action': action, 'intervention_id': intervention_id}
            
        except Exception as e:
            self.logger.error(f"Error handling callback query: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_processing_status(self, status: str, processed_count: int, failed_count: int, 
                             remaining_count: int, current_url: Optional[str] = None):
        """Send processing status notification"""
        try:
            if status == 'paused':
                message = self.message_templates['processing_paused'].format(
                    url=current_url or 'Unknown',
                    status=status,
                    remaining_links=remaining_count
                )
            elif status == 'resumed':
                message = self.message_templates['system_resumed'].format(
                    processed_count=processed_count,
                    failed_count=failed_count,
                    remaining_count=remaining_count
                )
            else:
                message = f"📊 *Processing Status Update*\n\n"
                message += f"Status: {status}\n"
                message += f"✅ Processed: {processed_count}\n"
                message += f"❌ Failed: {failed_count}\n"
                message += f"⏳ Remaining: {remaining_count}\n"
                
                if current_url:
                    message += f"🔗 Current: {current_url[:50]}..."
            
            self._send_message(message)
            
        except Exception as e:
            self.logger.error(f"Error sending processing status: {e}")
    
    def send_batch_completion(self, successful_count: int, failed_count: int, total_time: float):
        """Send batch completion notification"""
        try:
            message = self.message_templates['batch_completed'].format(
                successful_count=successful_count,
                failed_count=failed_count,
                total_time=self._format_duration(total_time)
            )
            
            self._send_message(message)
            
        except Exception as e:
            self.logger.error(f"Error sending batch completion: {e}")
    
    def send_error_notification(self, component: str, error_message: str):
        """Send error notification"""
        try:
            message = self.message_templates['error_notification'].format(
                component=component,
                error_message=error_message,
                timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            )
            
            self._send_message(message)
            
        except Exception as e:
            self.logger.error(f"Error sending error notification: {e}")
    
    def _format_duration(self, seconds: float) -> str:
        """Format duration in human-readable format"""
        if seconds < 60:
            return f"{seconds:.1f} seconds"
        elif seconds < 3600:
            return f"{seconds/60:.1f} minutes"
        else:
            return f"{seconds/3600:.1f} hours"
    
    def get_pending_interventions(self) -> List[Dict[str, Any]]:
        """Get list of pending interventions"""
        return [
            {
                'id': intervention.id,
                'url': intervention.url,
                'detection_type': intervention.detection_type,
                'confidence_score': intervention.confidence_score,
                'timestamp': intervention.timestamp.isoformat(),
                'status': intervention.status
            }
            for intervention in self.pending_interventions.values()
        ]
    
    def cancel_intervention(self, intervention_id: str) -> bool:
        """Cancel pending intervention"""
        if intervention_id in self.pending_interventions:
            intervention = self.pending_interventions[intervention_id]
            intervention.status = 'cancelled'
            intervention.user_action = 'cancelled'
            intervention.response_received = True
            
            self._send_message(f"❌ Intervention cancelled for: {intervention.url}")
            return True
        
        return False
    
    def is_available(self) -> bool:
        """Check if Telegram notifications are available"""
        return self.is_connected and bool(self.config.bot_token and self.config.chat_id)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get notification statistics"""
        return {
            'is_connected': self.is_connected,
            'pending_interventions': len(self.pending_interventions),
            'bot_token_set': bool(self.config.bot_token),
            'chat_id_set': bool(self.config.chat_id),
            'base_url': self.config.base_url,
            'timeout': self.config.timeout
        }
    
    def test_notification(self) -> bool:
        """Send test notification"""
        try:
            message = "🧪 *Test Notification*\n\nMainManager Telegram integration is working correctly!"
            return self._send_message(message)
        except Exception as e:
            self.logger.error(f"Test notification failed: {e}")
            return False

def create_telegram_notifier(bot_token: str, chat_id: str) -> TelegramNotifier:
    """Factory function to create Telegram notifier"""
    config = TelegramConfig(bot_token=bot_token, chat_id=chat_id)
    return TelegramNotifier(config)