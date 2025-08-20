#!/usr/bin/env python3
"""
Sequential Link Processor for MainManager
Handles sequential processing of news links with intelligent retry logic
"""

import time
import logging
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
import queue

class ProcessingStatus(Enum):
    """Processing status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRY = "retry"
    PAUSED = "paused"
    SKIPPED = "skipped"
    MANUAL_INTERVENTION = "manual_intervention"

@dataclass
class LinkProcessingItem:
    """Individual link processing item"""
    url: str
    source_site: str = "unknown"
    priority: int = 0
    status: ProcessingStatus = ProcessingStatus.PENDING
    attempt_count: int = 0
    max_retries: int = 1
    created_at: datetime = field(default_factory=datetime.now)
    last_attempt_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    bot_detection_result: Optional[Dict] = None
    automation_result: Optional[Dict] = None
    processing_duration: float = 0.0

@dataclass
class ProcessingConfig:
    """Configuration for sequential processing"""
    base_wait_time: float = 5.0
    retry_multiplier: float = 2.0
    max_retries: int = 1
    intervention_timeout: int = 300  # 5 minutes
    batch_size: int = 50
    pause_between_links: float = 1.0
    auto_resume_after_error: bool = True
    save_progress_interval: int = 10

class SequentialProcessor:
    """Sequential link processor with intelligent retry logic"""
    
    def __init__(self, mainmanager_instance):
        self.mainmanager = mainmanager_instance
        self.config = ProcessingConfig()
        self.logger = logging.getLogger(__name__)
        
        # Processing queue and state
        self.processing_queue = queue.Queue()
        self.processing_history = []
        self.current_item = None
        
        # Processing control
        self.is_processing = False
        self.is_paused = False
        self.processing_thread = None
        self.processing_lock = threading.Lock()
        
        # Statistics
        self.stats = {
            'total_processed': 0,
            'successful_processed': 0,
            'failed_processed': 0,
            'retries_performed': 0,
            'interventions_requested': 0,
            'processing_start_time': None,
            'last_activity_time': None
        }
        
        # Callbacks
        self.on_item_completed = None
        self.on_batch_completed = None
        self.on_error_occurred = None
        self.on_intervention_required = None
        
        # Component integration
        self.extension_manager = None
        self.automation_service = None
        self.gemini_analyzer = None
        self.telegram_notifier = None
        self.database_manager = None
        
        self.logger.info("🔄 Sequential Processor initialized")
    
    def initialize_components(self, extension_manager, automation_service, gemini_analyzer, 
                            telegram_notifier, database_manager):
        """Initialize component references"""
        self.extension_manager = extension_manager
        self.automation_service = automation_service
        self.gemini_analyzer = gemini_analyzer
        self.telegram_notifier = telegram_notifier
        self.database_manager = database_manager
        self.logger.info("✅ Sequential Processor components initialized")
    
    def configure(self, config: ProcessingConfig):
        """Update processing configuration"""
        self.config = config
        self.logger.info(f"Processing configuration updated: {config}")
    
    def set_callbacks(self, on_item_completed: Optional[Callable] = None,
                     on_batch_completed: Optional[Callable] = None,
                     on_error_occurred: Optional[Callable] = None,
                     on_intervention_required: Optional[Callable] = None):
        """Set callback functions for processing events"""
        self.on_item_completed = on_item_completed
        self.on_batch_completed = on_batch_completed
        self.on_error_occurred = on_error_occurred
        self.on_intervention_required = on_intervention_required
    
    def add_links_to_queue(self, urls: List[str], source_site: str = "unknown", 
                          priority: int = 0) -> int:
        """Add multiple links to processing queue"""
        added_count = 0
        
        for url in urls:
            if url and url.strip():
                item = LinkProcessingItem(
                    url=url.strip(),
                    source_site=source_site,
                    priority=priority,
                    max_retries=self.config.max_retries
                )
                
                self.processing_queue.put(item)
                
                # Add to database queue
                if self.database_manager:
                    self.database_manager.add_to_processing_queue(url, source_site, priority)
                    self.database_manager.add_automation_record(url, "pending")
                
                added_count += 1
        
        self.logger.info(f"📝 Added {added_count} links to processing queue")
        return added_count
    
    def start_processing(self) -> bool:
        """Start sequential processing"""
        with self.processing_lock:
            if self.is_processing:
                self.logger.warning("Processing already in progress")
                return False
            
            if self.processing_queue.empty():
                self.logger.warning("No items in processing queue")
                return False
            
            self.is_processing = True
            self.is_paused = False
            self.stats['processing_start_time'] = datetime.now()
            
            # Start processing thread
            self.processing_thread = threading.Thread(target=self._processing_loop, daemon=True)
            self.processing_thread.start()
            
            self.logger.info("🚀 Sequential processing started")
            return True
    
    def pause_processing(self):
        """Pause processing"""
        with self.processing_lock:
            if self.is_processing:
                self.is_paused = True
                self.logger.info("⏸️ Processing paused")
                
                # Send telegram notification
                if self.telegram_notifier:
                    self.telegram_notifier.send_processing_status(
                        "paused", 
                        self.stats['successful_processed'],
                        self.stats['failed_processed'],
                        self.processing_queue.qsize(),
                        self.current_item.url if self.current_item else None
                    )
    
    def resume_processing(self):
        """Resume processing"""
        with self.processing_lock:
            if self.is_processing and self.is_paused:
                self.is_paused = False
                self.logger.info("▶️ Processing resumed")
                
                # Send telegram notification
                if self.telegram_notifier:
                    self.telegram_notifier.send_processing_status(
                        "resumed",
                        self.stats['successful_processed'],
                        self.stats['failed_processed'],
                        self.processing_queue.qsize()
                    )
    
    def stop_processing(self):
        """Stop processing"""
        with self.processing_lock:
            self.is_processing = False
            self.is_paused = False
            
            if self.current_item:
                self.current_item.status = ProcessingStatus.PAUSED
            
            self.logger.info("🛑 Processing stopped")
    
    def _processing_loop(self):
        """Main processing loop"""
        try:
            while self.is_processing and not self.processing_queue.empty():
                # Check if paused
                while self.is_paused and self.is_processing:
                    time.sleep(1)
                
                if not self.is_processing:
                    break
                
                # Get next item
                try:
                    self.current_item = self.processing_queue.get_nowait()
                except queue.Empty:
                    break
                
                # Process the item
                self._process_single_item(self.current_item)
                
                # Update statistics
                self.stats['total_processed'] += 1
                self.stats['last_activity_time'] = datetime.now()
                
                # Add to history
                self.processing_history.append(self.current_item)
                
                # Call completion callback
                if self.on_item_completed:
                    self.on_item_completed(self.current_item)
                
                # Pause between links
                if self.config.pause_between_links > 0:
                    time.sleep(self.config.pause_between_links)
                
                # Clear current item
                self.current_item = None
            
            # Processing completed
            self._finalize_processing()
            
        except Exception as e:
            self.logger.error(f"❌ Processing loop error: {e}")
            if self.on_error_occurred:
                self.on_error_occurred("processing_loop", str(e))
        finally:
            self.is_processing = False
            self.current_item = None
    
    def _process_single_item(self, item: LinkProcessingItem):
        """Process a single link item"""
        start_time = time.time()
        item.status = ProcessingStatus.PROCESSING
        item.last_attempt_at = datetime.now()
        item.attempt_count += 1
        
        self.logger.info(f"🔗 Processing: {item.url} (attempt {item.attempt_count})")
        
        try:
            # Update database status
            if self.database_manager:
                self.database_manager.update_automation_status(item.url, "processing")
                self.database_manager.increment_attempt_count(item.url)
            
            # Step 1: Send to extension for content extraction
            content_result = self._extract_content_via_extension(item)
            
            if not content_result['success']:
                self._handle_processing_error(item, content_result['error'], "content_extraction")
                return
            
            # Step 2: Analyze content with bot detection
            analysis_result = self._analyze_content(item, content_result['content'])
            
            if analysis_result['bot_detected']:
                self._handle_bot_detection(item, analysis_result)
                return
            
            # Step 3: Execute automation
            automation_result = self._execute_automation(item)
            
            if not automation_result['success']:
                self._handle_automation_error(item, automation_result)
                return
            
            # Step 4: Success
            self._handle_processing_success(item, automation_result)
            
        except Exception as e:
            self.logger.error(f"❌ Processing error for {item.url}: {e}")
            self._handle_processing_error(item, str(e), "unexpected_error")
        finally:
            item.processing_duration = time.time() - start_time
    
    def _extract_content_via_extension(self, item: LinkProcessingItem) -> Dict[str, Any]:
        """Extract content via Chrome extension"""
        try:
            if not self.extension_manager:
                return {'success': False, 'error': 'Extension manager not available'}
            
            # Send URL to extension for processing
            result = self.extension_manager.send_url_for_processing(item.url)
            
            if result and result.get('success'):
                return {
                    'success': True,
                    'content': result.get('content', ''),
                    'metadata': result.get('metadata', {})
                }
            else:
                return {
                    'success': False,
                    'error': result.get('error', 'Extension processing failed')
                }
                
        except Exception as e:
            return {'success': False, 'error': f'Extension communication error: {str(e)}'}
    
    def _analyze_content(self, item: LinkProcessingItem, content: str) -> Dict[str, Any]:
        """Analyze content for bot detection"""
        try:
            if not self.gemini_analyzer:
                return {
                    'bot_detected': False,
                    'analysis': 'Analyzer not available'
                }
            
            # Perform content analysis with bot detection
            analysis = self.gemini_analyzer.analyze_content_with_bot_detection(content, item.url)
            
            # Store bot detection result
            item.bot_detection_result = {
                'is_detected': analysis.bot_detection.is_bot_detected,
                'detection_type': analysis.bot_detection.detection_type,
                'confidence_score': analysis.bot_detection.confidence_score,
                'indicators': analysis.bot_detection.indicators,
                'analysis_details': analysis.bot_detection.analysis_details,
                'recommended_action': analysis.bot_detection.recommended_action
            }
            
            # Store in database
            if self.database_manager and analysis.bot_detection.is_bot_detected:
                self.database_manager.add_bot_detection_result(
                    item.url,
                    analysis.bot_detection.detection_type,
                    analysis.bot_detection.confidence_score,
                    analysis.bot_detection.analysis_details
                )
            
            return {
                'bot_detected': analysis.bot_detection.is_bot_detected,
                'analysis': analysis,
                'confidence': analysis.bot_detection.confidence_score,
                'action': analysis.bot_detection.recommended_action
            }
            
        except Exception as e:
            self.logger.error(f"Content analysis failed: {e}")
            return {
                'bot_detected': False,
                'error': str(e)
            }
    
    def _execute_automation(self, item: LinkProcessingItem) -> Dict[str, Any]:
        """Execute automation for the item"""
        try:
            if not self.automation_service:
                return {'success': False, 'error': 'Automation service not available'}
            
            # Calculate wait times based on attempt
            wait_multiplier = self.config.retry_multiplier ** (item.attempt_count - 1)
            
            custom_config = {
                'base_wait_time': self.config.base_wait_time * wait_multiplier
            }
            
            # Execute automation
            result = self.automation_service.execute_automation(
                item.url, 
                item.attempt_count, 
                custom_config
            )
            
            item.automation_result = result
            return result
            
        except Exception as e:
            return {'success': False, 'error': f'Automation execution error: {str(e)}'}
    
    def _handle_bot_detection(self, item: LinkProcessingItem, analysis_result: Dict[str, Any]):
        """Handle bot detection scenario"""
        self.logger.warning(f"🤖 Bot detected for {item.url}: {analysis_result['analysis'].bot_detection.detection_type}")
        
        action = analysis_result.get('action', 'manual_intervention')
        
        if action == 'manual_intervention':
            self._request_manual_intervention(item, analysis_result)
        elif action == 'retry':
            self._schedule_retry(item, "Bot detection - retry recommended")
        elif action == 'wait':
            # Wait longer and retry
            time.sleep(30)
            self._schedule_retry(item, "Bot detection - wait and retry")
        else:
            self._handle_processing_error(item, "Bot detection - manual intervention required", "bot_detection")
    
    def _request_manual_intervention(self, item: LinkProcessingItem, analysis_result: Dict[str, Any]):
        """Request manual intervention via Telegram"""
        item.status = ProcessingStatus.MANUAL_INTERVENTION
        self.stats['interventions_requested'] += 1
        
        if self.telegram_notifier:
            bot_result = analysis_result['analysis'].bot_detection
            
            intervention_id = self.telegram_notifier.send_intervention_request(
                item.url,
                bot_result.analysis_details,
                bot_result.detection_type,
                bot_result.confidence_score,
                lambda action, intervention: self._handle_intervention_response(item, action, intervention)
            )
            
            if intervention_id:
                # Wait for user response
                self.pause_processing()
                
                # Wait in separate thread to not block processing
                def wait_for_response():
                    response = self.telegram_notifier.wait_for_user_response(
                        intervention_id, 
                        self.config.intervention_timeout
                    )
                    self._process_intervention_response(item, response)
                
                threading.Thread(target=wait_for_response, daemon=True).start()
        else:
            # No telegram notifier - mark as failed
            self._handle_processing_error(item, "Manual intervention required but no notification system", "intervention_required")
    
    def _handle_intervention_response(self, item: LinkProcessingItem, action: str, intervention):
        """Handle intervention response callback"""
        self.logger.info(f"📱 Intervention response for {item.url}: {action}")
        
        if action == 'continue':
            item.status = ProcessingStatus.PENDING
            self.processing_queue.put(item)  # Re-queue for processing
            self.resume_processing()
        elif action == 'skip':
            item.status = ProcessingStatus.SKIPPED
            self.stats['failed_processed'] += 1
            self.resume_processing()
        elif action == 'retry':
            self._schedule_retry(item, "Manual intervention - retry requested")
            self.resume_processing()
        elif action == 'pause':
            self.pause_processing()
        elif action == 'stop':
            self.stop_processing()
    
    def _process_intervention_response(self, item: LinkProcessingItem, response: Dict[str, Any]):
        """Process intervention response"""
        if response['success']:
            action = response['action']
            self._handle_intervention_response(item, action, None)
        else:
            # Timeout or error
            self.logger.warning(f"⏰ Intervention timeout for {item.url}")
            self._handle_processing_error(item, "Intervention timeout", "intervention_timeout")
    
    def _schedule_retry(self, item: LinkProcessingItem, reason: str):
        """Schedule item for retry"""
        if item.attempt_count < item.max_retries:
            item.status = ProcessingStatus.RETRY
            self.processing_queue.put(item)  # Re-queue for retry
            self.stats['retries_performed'] += 1
            
            # Add to retry history
            if self.database_manager:
                wait_time = self.config.base_wait_time * (self.config.retry_multiplier ** item.attempt_count)
                self.database_manager.add_retry_history(
                    item.url,
                    item.attempt_count + 1,
                    reason,
                    "scheduled",
                    wait_time
                )
            
            self.logger.info(f"🔄 Scheduled retry for {item.url}: {reason}")
        else:
            self._handle_processing_error(item, f"Max retries exceeded: {reason}", "max_retries_exceeded")
    
    def _handle_processing_error(self, item: LinkProcessingItem, error_message: str, error_type: str):
        """Handle processing error"""
        item.status = ProcessingStatus.FAILED
        item.error_message = error_message
        self.stats['failed_processed'] += 1
        
        # Update database
        if self.database_manager:
            bot_result = item.bot_detection_result
            bot_result_json = None
            if bot_result:
                bot_result_json = f"{bot_result['detection_type']}:{bot_result['confidence_score']}"
            
            self.database_manager.update_automation_status(
                item.url, 
                "failed", 
                error_message, 
                bot_result_json
            )
        
        # Call error callback
        if self.on_error_occurred:
            self.on_error_occurred(error_type, error_message)
        
        self.logger.error(f"❌ Processing failed for {item.url}: {error_message}")
    
    def _handle_processing_success(self, item: LinkProcessingItem, automation_result: Dict[str, Any]):
        """Handle successful processing"""
        item.status = ProcessingStatus.COMPLETED
        item.completed_at = datetime.now()
        self.stats['successful_processed'] += 1
        
        # Update database
        if self.database_manager:
            self.database_manager.update_automation_status(item.url, "completed")
            self.database_manager.update_queue_item_status(item.url, "completed")
        
        self.logger.info(f"✅ Successfully processed: {item.url}")
    
    def _finalize_processing(self):
        """Finalize processing batch"""
        duration = time.time() - self.stats['processing_start_time'].timestamp()
        
        # Send batch completion notification
        if self.telegram_notifier:
            self.telegram_notifier.send_batch_completion(
                self.stats['successful_processed'],
                self.stats['failed_processed'],
                duration
            )
        
        # Update daily statistics
        if self.database_manager:
            self.database_manager.update_daily_statistics(
                self.stats['total_processed'],
                self.stats['successful_processed'],
                self.stats['failed_processed'],
                self.stats['interventions_requested'],
                duration / self.stats['total_processed'] if self.stats['total_processed'] > 0 else 0
            )
        
        # Call batch completion callback
        if self.on_batch_completed:
            self.on_batch_completed(self.stats.copy())
        
        self.logger.info(f"🎉 Batch processing completed - {self.stats['successful_processed']}/{self.stats['total_processed']} successful")
    
    def get_processing_status(self) -> Dict[str, Any]:
        """Get current processing status"""
        return {
            'is_processing': self.is_processing,
            'is_paused': self.is_paused,
            'queue_size': self.processing_queue.qsize(),
            'current_item': {
                'url': self.current_item.url,
                'status': self.current_item.status.value,
                'attempt_count': self.current_item.attempt_count
            } if self.current_item else None,
            'statistics': self.stats.copy(),
            'config': {
                'base_wait_time': self.config.base_wait_time,
                'retry_multiplier': self.config.retry_multiplier,
                'max_retries': self.config.max_retries,
                'batch_size': self.config.batch_size
            }
        }
    
    def get_processing_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get processing history"""
        history = []
        for item in self.processing_history[-limit:]:
            history.append({
                'url': item.url,
                'status': item.status.value,
                'attempt_count': item.attempt_count,
                'processing_duration': item.processing_duration,
                'created_at': item.created_at.isoformat(),
                'completed_at': item.completed_at.isoformat() if item.completed_at else None,
                'error_message': item.error_message,
                'bot_detection': item.bot_detection_result
            })
        return history
    
    def clear_queue(self):
        """Clear processing queue"""
        while not self.processing_queue.empty():
            try:
                self.processing_queue.get_nowait()
            except queue.Empty:
                break
        self.logger.info("🗑️ Processing queue cleared")
    
    def get_queue_items(self) -> List[Dict[str, Any]]:
        """Get current queue items (non-destructive)"""
        items = []
        temp_items = []
        
        # Extract all items
        while not self.processing_queue.empty():
            try:
                item = self.processing_queue.get_nowait()
                temp_items.append(item)
                items.append({
                    'url': item.url,
                    'source_site': item.source_site,
                    'priority': item.priority,
                    'status': item.status.value,
                    'attempt_count': item.attempt_count,
                    'created_at': item.created_at.isoformat()
                })
            except queue.Empty:
                break
        
        # Put items back
        for item in temp_items:
            self.processing_queue.put(item)
        
        return items

def create_sequential_processor(mainmanager_instance):
    """Factory function to create sequential processor"""
    return SequentialProcessor(mainmanager_instance)