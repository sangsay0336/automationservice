#!/usr/bin/env python3
"""
MainManager Web UI - Flask Web Application
Provides web interface for controlling the integrated news processing system
"""

import os
import json
import logging
import threading
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_socketio import SocketIO, emit, join_room, leave_room
from typing import Dict, List, Any, Optional
import time

class MainManagerWebUI:
    """Flask web application for MainManager control interface"""
    
    def __init__(self, mainmanager_instance):
        self.mainmanager = mainmanager_instance
        self.app = Flask(__name__)
        self.app.config['SECRET_KEY'] = os.urandom(24)
        self.socketio = SocketIO(self.app, cors_allowed_origins="*")
        
        # Application state
        self.processing_status = {
            'is_running': False,
            'current_link': None,
            'processed_count': 0,
            'failed_count': 0,
            'total_links': 0,
            'retry_count': 0,
            'is_paused': False,
            'pause_reason': None,
            'waiting_for_user': False
        }
        
        self.link_queue = []
        self.processing_results = []
        self.error_log = []
        
        # Setup routes
        self.setup_routes()
        self.setup_socket_events()
        
        # Background thread for status updates
        self.status_thread = None
        self.should_stop = False
        
        self.logger = logging.getLogger(__name__)
        
    def setup_routes(self):
        """Setup Flask routes"""
        
        @self.app.route('/')
        def index():
            """Main dashboard page"""
            return render_template('dashboard.html', 
                                 status=self.processing_status,
                                 queue_length=len(self.link_queue))
        
        @self.app.route('/settings')
        def settings():
            """Settings page"""
            return render_template('settings.html')
        
        @self.app.route('/api/status')
        def api_status():
            """API endpoint for current processing status"""
            return jsonify({
                'status': self.processing_status,
                'queue_length': len(self.link_queue),
                'results_count': len(self.processing_results),
                'error_count': len(self.error_log),
                'timestamp': datetime.now().isoformat()
            })
        
        @self.app.route('/api/links', methods=['POST'])
        def api_add_links():
            """API endpoint to add links to processing queue"""
            data = request.get_json()
            if not data or 'links' not in data:
                return jsonify({'error': 'No links provided'}), 400
            
            links = data['links']
            if isinstance(links, str):
                links = [line.strip() for line in links.split('\n') if line.strip()]
            
            added_count = 0
            for link in links:
                if link and link not in [l['url'] for l in self.link_queue]:
                    self.link_queue.append({
                        'url': link,
                        'status': 'pending',
                        'added_at': datetime.now().isoformat(),
                        'attempts': 0
                    })
                    added_count += 1
            
            self.processing_status['total_links'] = len(self.link_queue)
            self.emit_status_update()
            
            return jsonify({
                'success': True,
                'added_count': added_count,
                'total_queue': len(self.link_queue)
            })
        
        @self.app.route('/api/processing/start', methods=['POST'])
        def api_start_processing():
            """Start processing the link queue"""
            if self.processing_status['is_running']:
                return jsonify({'error': 'Processing already running'}), 400
            
            if not self.link_queue:
                return jsonify({'error': 'No links in queue'}), 400
            
            self.start_processing()
            return jsonify({'success': True, 'message': 'Processing started'})
        
        @self.app.route('/api/processing/stop', methods=['POST'])
        def api_stop_processing():
            """Stop processing"""
            self.stop_processing()
            return jsonify({'success': True, 'message': 'Processing stopped'})
        
        @self.app.route('/api/processing/pause', methods=['POST'])
        def api_pause_processing():
            """Pause processing"""
            self.processing_status['is_paused'] = True
            self.emit_status_update()
            return jsonify({'success': True, 'message': 'Processing paused'})
        
        @self.app.route('/api/processing/resume', methods=['POST'])
        def api_resume_processing():
            """Resume processing"""
            self.processing_status['is_paused'] = False
            self.processing_status['waiting_for_user'] = False
            self.emit_status_update()
            return jsonify({'success': True, 'message': 'Processing resumed'})
        
        @self.app.route('/api/queue')
        def api_queue():
            """Get current processing queue"""
            return jsonify({
                'queue': self.link_queue,
                'total': len(self.link_queue),
                'pending': len([l for l in self.link_queue if l['status'] == 'pending'])
            })
        
        @self.app.route('/api/results')
        def api_results():
            """Get processing results"""
            return jsonify({
                'results': self.processing_results,
                'total': len(self.processing_results),
                'successful': len([r for r in self.processing_results if r['success']])
            })
        
        @self.app.route('/api/errors')
        def api_errors():
            """Get error log"""
            return jsonify({
                'errors': self.error_log,
                'total': len(self.error_log)
            })
        
        @self.app.route('/api/clear_queue', methods=['POST'])
        def api_clear_queue():
            """Clear processing queue"""
            if self.processing_status['is_running']:
                return jsonify({'error': 'Cannot clear queue while processing'}), 400
            
            self.link_queue.clear()
            self.processing_status['total_links'] = 0
            self.emit_status_update()
            return jsonify({'success': True, 'message': 'Queue cleared'})
        
        @self.app.route('/api/retry_failed', methods=['POST'])
        def api_retry_failed():
            """Retry failed links"""
            failed_results = [r for r in self.processing_results if not r['success']]
            
            for result in failed_results:
                self.link_queue.append({
                    'url': result['url'],
                    'status': 'pending',
                    'added_at': datetime.now().isoformat(),
                    'attempts': 0
                })
            
            # Remove failed results
            self.processing_results = [r for r in self.processing_results if r['success']]
            
            self.processing_status['total_links'] = len(self.link_queue)
            self.processing_status['failed_count'] = 0
            self.emit_status_update()
            
            return jsonify({
                'success': True,
                'retried_count': len(failed_results),
                'message': f'Added {len(failed_results)} failed links back to queue'
            })
    
    def setup_socket_events(self):
        """Setup Socket.IO events"""
        
        @self.socketio.on('connect')
        def handle_connect():
            """Handle client connection"""
            join_room('status_updates')
            emit('status_update', {
                'status': self.processing_status,
                'queue_length': len(self.link_queue),
                'timestamp': datetime.now().isoformat()
            })
        
        @self.socketio.on('disconnect')
        def handle_disconnect():
            """Handle client disconnection"""
            leave_room('status_updates')
        
        @self.socketio.on('request_status')
        def handle_status_request():
            """Handle status request from client"""
            emit('status_update', {
                'status': self.processing_status,
                'queue_length': len(self.link_queue),
                'results_count': len(self.processing_results),
                'error_count': len(self.error_log),
                'timestamp': datetime.now().isoformat()
            })
    
    def emit_status_update(self):
        """Emit status update to all connected clients"""
        self.socketio.emit('status_update', {
            'status': self.processing_status,
            'queue_length': len(self.link_queue),
            'results_count': len(self.processing_results),
            'error_count': len(self.error_log),
            'timestamp': datetime.now().isoformat()
        }, room='status_updates')
    
    def start_processing(self):
        """Start the processing workflow"""
        self.processing_status['is_running'] = True
        self.processing_status['is_paused'] = False
        self.processing_status['waiting_for_user'] = False
        
        # Start background processing thread
        if self.status_thread is None or not self.status_thread.is_alive():
            self.should_stop = False
            self.status_thread = threading.Thread(target=self.processing_worker)
            self.status_thread.daemon = True
            self.status_thread.start()
        
        self.emit_status_update()
        self.logger.info("🚀 Started processing workflow")
    
    def stop_processing(self):
        """Stop the processing workflow"""
        self.processing_status['is_running'] = False
        self.processing_status['is_paused'] = False
        self.processing_status['waiting_for_user'] = False
        self.should_stop = True
        
        self.emit_status_update()
        self.logger.info("⏹️ Stopped processing workflow")
    
    def processing_worker(self):
        """Background worker for processing links"""
        while not self.should_stop and self.processing_status['is_running']:
            try:
                # Check if paused or waiting for user
                if self.processing_status['is_paused'] or self.processing_status['waiting_for_user']:
                    time.sleep(1)
                    continue
                
                # Get next link to process
                pending_links = [l for l in self.link_queue if l['status'] == 'pending']
                if not pending_links:
                    # No more links to process
                    self.processing_status['is_running'] = False
                    self.emit_status_update()
                    break
                
                current_link = pending_links[0]
                self.processing_status['current_link'] = current_link['url']
                current_link['status'] = 'processing'
                
                self.emit_status_update()
                
                # Process the link (this will be implemented in later steps)
                success = self.process_single_link(current_link)
                
                # Update status based on result
                if success:
                    current_link['status'] = 'completed'
                    self.processing_status['processed_count'] += 1
                    self.processing_results.append({
                        'url': current_link['url'],
                        'success': True,
                        'processed_at': datetime.now().isoformat(),
                        'attempts': current_link['attempts'] + 1
                    })
                else:
                    current_link['status'] = 'failed'
                    self.processing_status['failed_count'] += 1
                    self.processing_results.append({
                        'url': current_link['url'],
                        'success': False,
                        'processed_at': datetime.now().isoformat(),
                        'attempts': current_link['attempts'] + 1,
                        'error': 'Processing failed'
                    })
                
                self.processing_status['current_link'] = None
                self.emit_status_update()
                
                # Small delay between links
                time.sleep(2)
                
            except Exception as e:
                self.logger.error(f"Error in processing worker: {e}")
                self.error_log.append({
                    'error': str(e),
                    'timestamp': datetime.now().isoformat(),
                    'context': 'processing_worker'
                })
                time.sleep(5)  # Wait before retry
    
    def process_single_link(self, link_data):
        """Process a single link (placeholder - will be implemented in later steps)"""
        # This is a placeholder that will be replaced with actual processing logic
        self.logger.info(f"Processing link: {link_data['url']}")
        
        # Simulate processing time
        time.sleep(3)
        
        # For now, return success (will be replaced with actual processing)
        return True
    
    def add_error(self, error_message, context=None):
        """Add error to error log"""
        self.error_log.append({
            'error': error_message,
            'timestamp': datetime.now().isoformat(),
            'context': context or 'unknown'
        })
        self.emit_status_update()
    
    def pause_for_user_intervention(self, reason):
        """Pause processing and wait for user intervention"""
        self.processing_status['is_paused'] = True
        self.processing_status['waiting_for_user'] = True
        self.processing_status['pause_reason'] = reason
        
        self.emit_status_update()
        self.logger.warning(f"Processing paused for user intervention: {reason}")
    
    def run(self, host='localhost', port=5000, debug=False):
        """Run the Flask application"""
        self.logger.info(f"🌐 Starting MainManager Web UI on http://{host}:{port}")
        self.socketio.run(self.app, host=host, port=port, debug=debug)
    
    def shutdown(self):
        """Shutdown the web application"""
        self.should_stop = True
        if self.status_thread and self.status_thread.is_alive():
            self.status_thread.join(timeout=5)
        self.logger.info("🔚 MainManager Web UI stopped")

def create_web_ui(mainmanager_instance):
    """Factory function to create web UI instance"""
    return MainManagerWebUI(mainmanager_instance)