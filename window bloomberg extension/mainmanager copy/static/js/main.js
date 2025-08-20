// MainManager Web UI JavaScript
class MainManagerUI {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.initializeSocket();
        this.setupEventListeners();
        this.updateInterval = setInterval(() => this.updateStatus(), 5000);
    }

    initializeSocket() {
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('✅ Connected to server');
                this.isConnected = true;
                this.updateConnectionStatus(true);
            });

            this.socket.on('disconnect', () => {
                console.log('❌ Disconnected from server');
                this.isConnected = false;
                this.updateConnectionStatus(false);
            });

            this.socket.on('processing_update', (data) => {
                this.handleProcessingUpdate(data);
            });

            this.socket.on('status_update', (data) => {
                this.updateDashboard(data);
            });

            this.socket.on('log_message', (data) => {
                this.addLogMessage(data);
            });

            this.socket.on('intervention_required', (data) => {
                this.showInterventionModal(data);
            });

        } catch (error) {
            console.error('Socket initialization failed:', error);
        }
    }

    setupEventListeners() {
        // Add links form
        const addLinksForm = document.getElementById('add-links-form');
        if (addLinksForm) {
            addLinksForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.addLinks();
            });
        }

        // Control buttons
        const startBtn = document.getElementById('start-processing');
        const pauseBtn = document.getElementById('pause-processing');
        const stopBtn = document.getElementById('stop-processing');

        if (startBtn) startBtn.addEventListener('click', () => this.startProcessing());
        if (pauseBtn) pauseBtn.addEventListener('click', () => this.pauseProcessing());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stopProcessing());

        // Clear queue button
        const clearQueueBtn = document.getElementById('clear-queue');
        if (clearQueueBtn) {
            clearQueueBtn.addEventListener('click', () => this.clearQueue());
        }

        // Settings form
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSettings();
            });
        }

        // Test buttons
        document.querySelectorAll('[data-test-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.testAction;
                this.runTest(action);
            });
        });
    }

    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            if (connected) {
                statusElement.innerHTML = '<i class="fas fa-circle text-success"></i> Connected';
                statusElement.className = 'navbar-text connection-status connected';
            } else {
                statusElement.innerHTML = '<i class="fas fa-circle text-danger"></i> Disconnected';
                statusElement.className = 'navbar-text connection-status';
            }
        }
    }

    async addLinks() {
        const textarea = document.getElementById('urls-input');
        const sourceSite = document.getElementById('source-site').value;
        
        if (!textarea || !textarea.value.trim()) {
            this.showAlert('Please enter at least one URL', 'warning');
            return;
        }

        const urls = textarea.value.split('\n')
            .map(url => url.trim())
            .filter(url => url);

        if (urls.length === 0) {
            this.showAlert('No valid URLs found', 'warning');
            return;
        }

        try {
            const response = await fetch('/api/add-links', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    urls: urls,
                    source_site: sourceSite
                })
            });

            const result = await response.json();
            
            if (result.success) {
                this.showAlert(`Added ${result.count} links to queue`, 'success');
                textarea.value = '';
                this.updateStatus();
            } else {
                this.showAlert(`Failed to add links: ${result.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`Error adding links: ${error.message}`, 'danger');
        }
    }

    async startProcessing() {
        try {
            const response = await fetch('/api/start-processing', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Processing started', 'success');
                this.updateProcessingControls(true, false);
            } else {
                this.showAlert(`Failed to start processing: ${result.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`Error starting processing: ${error.message}`, 'danger');
        }
    }

    async pauseProcessing() {
        try {
            const response = await fetch('/api/pause-processing', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Processing paused', 'warning');
                this.updateProcessingControls(false, true);
            } else {
                this.showAlert(`Failed to pause processing: ${result.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`Error pausing processing: ${error.message}`, 'danger');
        }
    }

    async stopProcessing() {
        try {
            const response = await fetch('/api/stop-processing', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Processing stopped', 'info');
                this.updateProcessingControls(false, false);
            } else {
                this.showAlert(`Failed to stop processing: ${result.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`Error stopping processing: ${error.message}`, 'danger');
        }
    }

    async clearQueue() {
        if (!confirm('Are you sure you want to clear the entire queue?')) {
            return;
        }

        try {
            const response = await fetch('/api/clear-queue', {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Queue cleared', 'info');
                this.updateStatus();
            } else {
                this.showAlert(`Failed to clear queue: ${result.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`Error clearing queue: ${error.message}`, 'danger');
        }
    }

    async updateStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            this.updateDashboard(status);
        } catch (error) {
            console.error('Failed to update status:', error);
        }
    }

    updateDashboard(status) {
        // Update statistics
        this.updateElement('total-processed', status.statistics?.total_processed || 0);
        this.updateElement('successful-processed', status.statistics?.successful_processed || 0);
        this.updateElement('failed-processed', status.statistics?.failed_processed || 0);
        this.updateElement('queue-size', status.queue_size || 0);

        // Update processing status
        const isProcessing = status.processing_active;
        const isPaused = status.is_paused;
        
        this.updateProcessingControls(isProcessing, isPaused);
        
        // Update current item
        if (status.current_item) {
            this.updateElement('current-url', status.current_item.url);
            this.updateElement('current-attempt', status.current_item.attempt_count);
        } else {
            this.updateElement('current-url', 'None');
            this.updateElement('current-attempt', '-');
        }

        // Update queue
        this.updateQueue(status.queue_items || []);
        
        // Update system status
        this.updateSystemStatus(status);
    }

    updateProcessingControls(isProcessing, isPaused) {
        const startBtn = document.getElementById('start-processing');
        const pauseBtn = document.getElementById('pause-processing');
        const stopBtn = document.getElementById('stop-processing');

        if (startBtn) {
            startBtn.disabled = isProcessing && !isPaused;
            startBtn.textContent = isPaused ? 'Resume' : 'Start Processing';
        }
        
        if (pauseBtn) {
            pauseBtn.disabled = !isProcessing || isPaused;
        }
        
        if (stopBtn) {
            stopBtn.disabled = !isProcessing;
        }

        // Update status indicator
        const statusIndicator = document.getElementById('processing-status');
        if (statusIndicator) {
            let statusText = 'Idle';
            let statusClass = 'text-secondary';
            
            if (isProcessing && !isPaused) {
                statusText = 'Processing';
                statusClass = 'text-success';
            } else if (isPaused) {
                statusText = 'Paused';
                statusClass = 'text-warning';
            }
            
            statusIndicator.textContent = statusText;
            statusIndicator.className = statusClass;
        }
    }

    updateQueue(queueItems) {
        const container = document.getElementById('queue-container');
        if (!container) return;

        container.innerHTML = '';
        
        if (queueItems.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-4">Queue is empty</div>';
            return;
        }

        queueItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `queue-item ${item.status}`;
            
            itemDiv.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="url-text mb-2">${this.truncateUrl(item.url)}</div>
                        <div class="d-flex gap-2">
                            <span class="badge bg-${this.getStatusColor(item.status)}">${item.status}</span>
                            <span class="badge bg-secondary">${item.source_site}</span>
                            <span class="badge bg-info">Attempt ${item.attempt_count}</span>
                        </div>
                    </div>
                    <div class="text-end">
                        <small class="text-muted">${this.formatDate(item.created_at)}</small>
                    </div>
                </div>
            `;
            
            container.appendChild(itemDiv);
        });
    }

    updateSystemStatus(status) {
        const indicators = {
            'web-ui-status': status.web_ui_active,
            'extension-status': status.extension_manager_active,
            'automation-status': status.automation_service_available,
            'telegram-status': status.telegram_notifications,
            'database-status': true // Assume database is working if we got status
        };

        Object.entries(indicators).forEach(([id, isActive]) => {
            const element = document.getElementById(id);
            if (element) {
                element.className = `status-indicator ${isActive ? 'status-connected' : 'status-disconnected'}`;
            }
        });
    }

    handleProcessingUpdate(data) {
        switch (data.type) {
            case 'link_completed':
                this.addLogMessage({
                    level: 'info',
                    message: `Link completed: ${data.url} (${data.status})`,
                    timestamp: new Date().toISOString()
                });
                break;
                
            case 'batch_completed':
                this.addLogMessage({
                    level: 'success',
                    message: `Batch completed: ${data.stats.successful_processed}/${data.stats.total_processed} successful`,
                    timestamp: new Date().toISOString()
                });
                break;
                
            case 'intervention_required':
                this.showInterventionModal(data);
                break;
        }
        
        this.updateStatus();
    }

    addLogMessage(data) {
        const logContainer = document.getElementById('log-container');
        if (!logContainer) return;

        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        const level = data.level || 'info';
        
        logEntry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span> 
            <span class="log-level-${level}">[${level.toUpperCase()}]</span> 
            ${data.message}
        `;
        
        logContainer.appendChild(logEntry);
        
        // Auto-scroll to bottom
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Limit log entries
        const entries = logContainer.querySelectorAll('.log-entry');
        if (entries.length > 100) {
            entries[0].remove();
        }
    }

    showInterventionModal(data) {
        const modal = document.getElementById('interventionModal');
        const content = document.getElementById('intervention-content');
        
        if (modal && content) {
            content.innerHTML = `
                <h6>URL: ${data.url}</h6>
                <p><strong>Issue:</strong> ${data.details}</p>
                <p class="text-muted">Please manually resolve this issue and choose an action.</p>
            `;
            
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    }

    async saveSettings() {
        const formData = new FormData(document.getElementById('settings-form'));
        const settings = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings)
            });

            const result = await response.json();
            
            if (result.success) {
                this.showAlert('Settings saved successfully', 'success');
            } else {
                this.showAlert(`Failed to save settings: ${result.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`Error saving settings: ${error.message}`, 'danger');
        }
    }

    async runTest(testAction) {
        const btn = document.querySelector(`[data-test-action="${testAction}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Testing...';
        }

        try {
            const response = await fetch(`/api/test/${testAction}`, {
                method: 'POST'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showAlert(`${testAction} test passed`, 'success');
            } else {
                this.showAlert(`${testAction} test failed: ${result.error}`, 'danger');
            }
        } catch (error) {
            this.showAlert(`Test error: ${error.message}`, 'danger');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = btn.dataset.originalText || 'Test';
            }
        }
    }

    showAlert(message, type = 'info') {
        const alertContainer = document.getElementById('alert-container') || document.body;
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        alertContainer.appendChild(alert);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    truncateUrl(url, maxLength = 60) {
        if (url.length <= maxLength) return url;
        return url.substring(0, maxLength - 3) + '...';
    }

    getStatusColor(status) {
        const colors = {
            'pending': 'secondary',
            'processing': 'warning',
            'completed': 'success',
            'failed': 'danger',
            'retry': 'info',
            'paused': 'secondary',
            'skipped': 'dark'
        };
        return colors[status] || 'secondary';
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleString();
    }
}

// Intervention response functions
function resolveIntervention(action) {
    fetch('/api/intervention-response', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: action })
    }).then(response => response.json())
    .then(result => {
        if (result.success) {
            const modal = bootstrap.Modal.getInstance(document.getElementById('interventionModal'));
            modal.hide();
            app.showAlert(`Action "${action}" sent successfully`, 'success');
        } else {
            app.showAlert(`Failed to send action: ${result.error}`, 'danger');
        }
    }).catch(error => {
        app.showAlert(`Error: ${error.message}`, 'danger');
    });
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', function() {
    app = new MainManagerUI();
    
    // Store original button text for test buttons
    document.querySelectorAll('[data-test-action]').forEach(btn => {
        btn.dataset.originalText = btn.textContent;
    });
});

// Handle page visibility change
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && app) {
        app.updateStatus();
    }
});