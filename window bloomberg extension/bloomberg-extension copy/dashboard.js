class ProcessingDashboard {
    constructor() {
        this.refreshInterval = null;
        this.countdownInterval = null;
        this.refreshCountdown = 5;
        
        this.initializeEventListeners();
        this.startAutoRefresh();
        this.updateStatus(); // Initial load
    }

    initializeEventListeners() {
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseProcessing());
        document.getElementById('resumeBtn').addEventListener('click', () => this.resumeProcessing());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetProcessing());
        document.getElementById('copyUnprocessedBtn').addEventListener('click', () => this.copyUnprocessedLinks());
        document.getElementById('refreshBtn').addEventListener('click', () => this.updateStatus());
        document.getElementById('openPopupBtn').addEventListener('click', () => this.openPopup());
        
        // Enhanced monitoring controls
        document.getElementById('triggerServiceRecoveryBtn').addEventListener('click', () => this.triggerServiceRecovery());
        document.getElementById('recoverStuckQueueBtn').addEventListener('click', () => this.recoverStuckQueue());
        document.getElementById('toggleAutoRecoveryBtn').addEventListener('click', () => this.toggleAutoRecovery());
    }

    async sendMessage(message) {
        try {
            return await chrome.runtime.sendMessage(message);
        } catch (error) {
            console.error('Error sending message:', error);
            return { error: error.message };
        }
    }

    async updateStatus() {
        try {
            // Get both processing status and system status
            const [processingResponse, systemResponse] = await Promise.all([
                this.sendMessage({ action: 'getProcessingStatus' }),
                this.sendMessage({ action: 'getSystemStatus' })
            ]);
            
            if (processingResponse && !processingResponse.error) {
                this.updateUI(processingResponse);
            } else {
                console.error('Error getting processing status:', processingResponse?.error);
            }
            
            if (systemResponse && !systemResponse.error) {
                this.updateSystemHealthUI(systemResponse.status);
            } else {
                console.error('Error getting system status:', systemResponse?.error);
            }
            
            document.getElementById('lastUpdated').textContent = 
                `Last updated: ${new Date().toLocaleTimeString()}`;
                
        } catch (error) {
            console.error('Error updating status:', error);
        }
    }

    updateUI(status) {
        // Calculate proper totals
        const processedCount = status.processedCount || 0;
        const failedCount = status.failedCount || 0;
        const queueLength = status.queueLength || 0;
        const totalLinks = Math.max(processedCount + failedCount + queueLength, status.totalLinks || 0);
        const unprocessedCount = Math.max(0, totalLinks - processedCount - failedCount);
        
        // Update counters
        document.getElementById('totalLinks').textContent = totalLinks;
        document.getElementById('processedCount').textContent = processedCount;
        document.getElementById('failedCount').textContent = failedCount;
        document.getElementById('unprocessedCount').textContent = unprocessedCount;
        document.getElementById('queueLength').textContent = queueLength;
        
        // Update status indicators
        document.getElementById('isProcessing').textContent = status.isProcessing ? 'Yes' : 'No';
        document.getElementById('isPaused').textContent = status.isPaused ? 'Yes' : 'No';
        
        // Processing mode will be updated by updateSystemHealthUI
        
        // Update progress bar
        const progressPercent = totalLinks > 0 ? Math.round((processedCount / totalLinks) * 100) : 0;
        
        document.getElementById('progressBar').style.width = `${progressPercent}%`;
        document.getElementById('progressText').textContent = `${progressPercent}% Complete (${processedCount}/${totalLinks})`;
        
        // Update currently processing section
        const currentProcessingSection = document.getElementById('currentProcessingSection');
        const currentProcessingLink = document.getElementById('currentProcessingLink');
        
        if (status.currentlyProcessingLink) {
            currentProcessingSection.style.display = 'block';
            currentProcessingLink.textContent = status.currentlyProcessingLink;
        } else {
            currentProcessingSection.style.display = 'none';
        }
        
        // Update button states
        this.updateButtonStates(status);
        
        // Update link lists
        this.updateLinkLists(status);
    }

    updateButtonStates(status) {
        const pauseBtn = document.getElementById('pauseBtn');
        const resumeBtn = document.getElementById('resumeBtn');
        const resetBtn = document.getElementById('resetBtn');
        const copyBtn = document.getElementById('copyUnprocessedBtn');
        
        if (status.isPaused) {
            pauseBtn.style.display = 'none';
            pauseBtn.disabled = true;
            resumeBtn.style.display = 'inline-block';
            resumeBtn.disabled = false;
        } else if (status.isProcessing) {
            pauseBtn.style.display = 'inline-block';
            pauseBtn.disabled = false;
            resumeBtn.style.display = 'none';
            resumeBtn.disabled = true;
        } else {
            pauseBtn.disabled = true;
            resumeBtn.style.display = 'none';
            resumeBtn.disabled = true;
        }
        
        // Enable reset and copy if there's any processing history
        const hasHistory = (status.processedCount || 0) > 0 || (status.failedCount || 0) > 0;
        resetBtn.disabled = !hasHistory;
        copyBtn.disabled = (status.unprocessedCount || 0) === 0;
    }

    updateLinkLists(status) {
        // Update processed links
        const processedLinksDiv = document.getElementById('processedLinks');
        const processedCountDisplay = document.getElementById('processedCountDisplay');
        
        processedCountDisplay.textContent = status.processedCount || 0;
        
        if (status.processedLinks && status.processedLinks.length > 0) {
            // Enhanced processed links display with processing details
            processedLinksDiv.innerHTML = status.processedLinks
                .map(link => {
                    const linkStatus = status.linkProcessingStatus?.[link];
                    let statusInfo = '';
                    
                    if (linkStatus) {
                        const method = linkStatus.method || 'Unknown';
                        const timestamp = linkStatus.timestamp ? new Date(linkStatus.timestamp).toLocaleTimeString() : '';
                        const duration = linkStatus.startTime && linkStatus.timestamp ? 
                            Math.round((linkStatus.timestamp - linkStatus.startTime) / 1000) : '';
                        
                        statusInfo = `<div style="font-size: 10px; opacity: 0.8; margin-top: 2px;">
                            <span style="color: #28a745;">Method: ${method}</span>
                            ${timestamp ? `<br><span>Completed: ${timestamp}</span>` : ''}
                            ${duration ? `<br><span>Duration: ${duration}s</span>` : ''}
                        </div>`;
                    }
                    
                    return `<div class="link-item">
                        <div>✅ ${this.truncateUrl(link)}</div>
                        ${statusInfo}
                    </div>`;
                })
                .join('');
        } else {
            processedLinksDiv.innerHTML = '<div style="text-align: center; opacity: 0.5; padding: 20px;">No processed links yet</div>';
        }
        
        // Update failed links
        const failedLinksDiv = document.getElementById('failedLinks');
        const failedCountDisplay = document.getElementById('failedCountDisplay');
        
        failedCountDisplay.textContent = status.failedCount || 0;
        
        if (status.failedLinks && status.failedLinks.length > 0) {
            // Enhanced failed links display with detailed status information
            failedLinksDiv.innerHTML = status.failedLinks
                .map(link => {
                    const linkStatus = status.linkProcessingStatus?.[link];
                    let statusInfo = '';
                    
                    if (linkStatus) {
                        const reason = linkStatus.reason || linkStatus.blockageType || 'Unknown';
                        const message = linkStatus.message || '';
                        const timestamp = linkStatus.timestamp ? new Date(linkStatus.timestamp).toLocaleTimeString() : '';
                        
                        statusInfo = `<div style="font-size: 10px; opacity: 0.8; margin-top: 2px;">
                            <span style="color: #ff6b6b;">Reason: ${reason}</span>
                            ${message ? `<br><span>Details: ${message}</span>` : ''}
                            ${timestamp ? `<br><span>Time: ${timestamp}</span>` : ''}
                        </div>`;
                    }
                    
                    return `<div class="link-item">
                        <div>❌ ${this.truncateUrl(link)}</div>
                        ${statusInfo}
                    </div>`;
                })
                .join('');
        } else {
            failedLinksDiv.innerHTML = '<div style="text-align: center; opacity: 0.5; padding: 20px;">No failed links</div>';
        }
        
        // Update blocked links (separate from failed links)
        this.updateBlockedLinks(status);
    }
    
    updateBlockedLinks(status) {
        const blockedLinksDiv = document.getElementById('blockedLinks');
        const blockedCountDisplay = document.getElementById('blockedCountDisplay');
        
        // Get blocked links from the background script's blocked links array
        // We'll request this information from the background script
        chrome.runtime.sendMessage({ action: 'getBlockedLinks' }, (response) => {
            if (response && response.blockedLinks) {
                const blockedLinks = response.blockedLinks;
                blockedCountDisplay.textContent = blockedLinks.length;
                
                if (blockedLinks.length > 0) {
                    blockedLinksDiv.innerHTML = blockedLinks
                        .map(blockedLink => {
                            const url = blockedLink.url || blockedLink;
                            const blockageType = blockedLink.blockageType || 'Unknown';
                            const message = blockedLink.blockageMessage || '';
                            const timestamp = blockedLink.timestamp ? new Date(blockedLink.timestamp).toLocaleTimeString() : '';
                            
                            return `<div class="link-item">
                                <div>🚫 ${this.truncateUrl(url)}</div>
                                <div style="font-size: 10px; opacity: 0.8; margin-top: 2px;">
                                    <span style="color: #ffa500;">Type: ${blockageType}</span>
                                    ${message ? `<br><span>Details: ${message}</span>` : ''}
                                    ${timestamp ? `<br><span>Time: ${timestamp}</span>` : ''}
                                </div>
                            </div>`;
                        })
                        .join('');
                } else {
                    blockedLinksDiv.innerHTML = '<div style="text-align: center; opacity: 0.5; padding: 20px;">No blocked links</div>';
                }
            } else {
                blockedCountDisplay.textContent = '0';
                blockedLinksDiv.innerHTML = '<div style="text-align: center; opacity: 0.5; padding: 20px;">No blocked links</div>';
            }
        });
    }

    truncateUrl(url, maxLength = 60) {
        return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
    }
    
    formatDuration(ms) {
        if (ms === 0) return '--';
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    startAutoRefresh() {
        // Update every 5 seconds
        this.refreshInterval = setInterval(() => {
            this.updateStatus();
            this.refreshCountdown = 5;
        }, 5000);
        
        // Countdown timer
        this.countdownInterval = setInterval(() => {
            this.refreshCountdown--;
            document.getElementById('refreshCountdown').textContent = this.refreshCountdown;
            
            if (this.refreshCountdown <= 0) {
                this.refreshCountdown = 5;
            }
        }, 1000);
    }

    async pauseProcessing() {
        try {
            const response = await this.sendMessage({ action: 'pauseProcessing' });
            if (response && response.success) {
                this.showNotification('⏸️ Processing paused', 'warning');
                this.updateStatus();
            }
        } catch (error) {
            console.error('Error pausing:', error);
            this.showNotification('❌ Error pausing processing', 'danger');
        }
    }

    async resumeProcessing() {
        try {
            console.log('▶️ Dashboard resuming processing...');
            
            const response = await this.sendMessage({ action: 'resumeProcessing' });
            if (response && response.success) {
                this.showNotification('▶️ Processing resumed successfully', 'success');
                this.updateStatus();
            } else {
                this.showNotification('❌ Failed to resume processing', 'danger');
            }
        } catch (error) {
            console.error('Error resuming:', error);
            this.showNotification('❌ Error resuming processing', 'danger');
        }
    }

    async resetProcessing() {
        if (!confirm('Reset all processing state? This will clear processed/failed link tracking.')) {
            return;
        }
        
        try {
            const response = await this.sendMessage({ action: 'resetProcessing' });
            if (response && response.success) {
                this.showNotification('🔄 Processing state reset', 'success');
                this.updateStatus();
            }
        } catch (error) {
            console.error('Error resetting:', error);
            this.showNotification('❌ Error resetting processing', 'danger');
        }
    }

    async copyUnprocessedLinks() {
        try {
            const response = await this.sendMessage({ action: 'getUnprocessedLinks' });
            
            if (response && response.unprocessedLinks) {
                const unprocessedText = response.unprocessedLinks.join('\n');
                
                if (unprocessedText) {
                    await navigator.clipboard.writeText(unprocessedText);
                    this.showNotification(`📋 Copied ${response.unprocessedLinks.length} unprocessed links`, 'success');
                } else {
                    this.showNotification('✅ No unprocessed links to copy', 'info');
                }
            }
        } catch (error) {
            console.error('Error copying links:', error);
            this.showNotification('❌ Error copying unprocessed links', 'danger');
        }
    }

    openPopup() {
        // Open the extension popup in a new tab
        chrome.tabs.create({
            url: chrome.runtime.getURL('popup.html')
        });
    }

    showNotification(message, type = 'info') {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${this.getNotificationColor(type)};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 1000;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    getNotificationColor(type) {
        const colors = {
            success: '#28a745',
            warning: '#ffc107',
            danger: '#dc3545',
            info: '#17a2b8'
        };
        return colors[type] || colors.info;
    }

    // Update system health UI
    updateSystemHealthUI(systemStatus) {
        // Service health status
        const serviceHealth = systemStatus.serviceHealth;
        const healthIndicator = document.getElementById('serviceHealthIndicator');
        const healthStatus = document.getElementById('serviceHealthStatus');
        const healthScore = document.getElementById('serviceHealthScore');
        
        if (serviceHealth) {
            const statusClass = `health-${serviceHealth.status || 'unreachable'}`;
            healthIndicator.className = `health-indicator ${statusClass}`;
            healthStatus.textContent = serviceHealth.status || 'Unreachable';
            healthScore.textContent = serviceHealth.health_score ? `${serviceHealth.health_score}/100` : '--';
        } else {
            healthIndicator.className = 'health-indicator health-unreachable';
            healthStatus.textContent = 'Unreachable';
            healthScore.textContent = '--';
        }
        
        // Last heartbeat
        const lastHeartbeat = document.getElementById('lastHeartbeat');
        if (systemStatus.lastServiceHeartbeat) {
            const heartbeatAge = Math.round(systemStatus.serviceHeartbeatAge / 1000);
            lastHeartbeat.textContent = `${heartbeatAge}s ago`;
        } else {
            lastHeartbeat.textContent = 'No data';
        }
        
        // Queue stall time
        const queueStallTime = document.getElementById('queueStallTime');
        if (systemStatus.queueStallTime) {
            const stallSeconds = Math.round(systemStatus.queueStallTime / 1000);
            queueStallTime.textContent = `${stallSeconds}s`;
        } else {
            queueStallTime.textContent = '0s';
        }
        
        // Recovery attempts and auto-recovery status
        document.getElementById('recoveryAttempts').textContent = systemStatus.queueRecoveryAttempts || 0;
        document.getElementById('autoRecoveryStatus').textContent = systemStatus.autoRecoveryEnabled ? 'Enabled' : 'Disabled';
        
        // Update auto-recovery button text
        const autoRecoveryBtn = document.getElementById('toggleAutoRecoveryBtn');
        autoRecoveryBtn.textContent = systemStatus.autoRecoveryEnabled ? '⚙️ Disable Auto-Recovery' : '⚙️ Enable Auto-Recovery';
        
        // Update processing mode
        let processingMode = 'Inactive';
        if (systemStatus.isProcessing) {
            processingMode = systemStatus.isBatchMode ? 'Batch Processing' : 'Sequential Processing';
        } else if (systemStatus.isPaused) {
            processingMode = 'Paused';
        }
        document.getElementById('processingMode').textContent = processingMode;
        
        // Update session statistics
        const sessionDuration = systemStatus.sessionDuration || 0;
        const sessionDurationFormatted = this.formatDuration(sessionDuration);
        document.getElementById('sessionDuration').textContent = sessionDurationFormatted;
        
        // Calculate average processing time
        const processingTimes = systemStatus.processingTimes || [];
        let avgProcessingTime = '--';
        if (processingTimes.length > 0) {
            const avgMs = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
            avgProcessingTime = `${Math.round(avgMs / 1000)}s`;
        }
        document.getElementById('avgProcessingTime').textContent = avgProcessingTime;
        
        // Calculate success rate
        const processedCount = systemStatus.processedCount || 0;
        const failedCount = systemStatus.failedCount || 0;
        const totalAttempted = processedCount + failedCount;
        let successRate = '--';
        if (totalAttempted > 0) {
            const rate = Math.round((processedCount / totalAttempted) * 100);
            successRate = `${rate}%`;
        }
        document.getElementById('successRate').textContent = successRate;
        
        // Update current print method
        const printMethod = systemStatus.printMethod || 'Not set';
        document.getElementById('currentPrintMethod').textContent = printMethod;
    }

    // Enhanced control methods
    async triggerServiceRecovery() {
        const btn = document.getElementById('triggerServiceRecoveryBtn');
        const originalText = btn.textContent;
        
        try {
            btn.disabled = true;
            btn.textContent = '🔧 Triggering Recovery...';
            
            const response = await this.sendMessage({ 
                action: 'triggerServiceRecovery',
                reason: 'manual_dashboard'
            });
            
            if (response && response.success) {
                btn.textContent = '✅ Recovery Triggered';
                this.showNotification('🔧 Service recovery triggered successfully', 'success');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                    this.updateStatus(); // Refresh status
                }, 2000);
            } else {
                throw new Error(response?.error || 'Recovery failed');
            }
        } catch (error) {
            console.error('Service recovery failed:', error);
            btn.textContent = '❌ Recovery Failed';
            this.showNotification('❌ Service recovery failed', 'danger');
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        }
    }

    async recoverStuckQueue() {
        const btn = document.getElementById('recoverStuckQueueBtn');
        const originalText = btn.textContent;
        
        try {
            btn.disabled = true;
            btn.textContent = '🔄 Recovering Queue...';
            
            const response = await this.sendMessage({ 
                action: 'recoverStuckQueue',
                reason: 'manual_dashboard'
            });
            
            if (response && response.success) {
                btn.textContent = '✅ Queue Recovered';
                this.showNotification('🔄 Queue recovery completed successfully', 'success');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.disabled = false;
                    this.updateStatus(); // Refresh status
                }, 2000);
            } else {
                throw new Error(response?.error || 'Queue recovery failed');
            }
        } catch (error) {
            console.error('Queue recovery failed:', error);
            btn.textContent = '❌ Recovery Failed';
            this.showNotification('❌ Queue recovery failed', 'danger');
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        }
    }

    async toggleAutoRecovery() {
        const btn = document.getElementById('toggleAutoRecoveryBtn');
        const originalText = btn.textContent;
        
        try {
            btn.disabled = true;
            btn.textContent = '⚙️ Toggling...';
            
            const response = await this.sendMessage({ action: 'toggleAutoRecovery' });
            
            if (response && response.success) {
                btn.textContent = response.autoRecoveryEnabled ? '✅ Auto-Recovery Enabled' : '✅ Auto-Recovery Disabled';
                this.showNotification(
                    `⚙️ Auto-recovery ${response.autoRecoveryEnabled ? 'enabled' : 'disabled'}`, 
                    'success'
                );
                setTimeout(() => {
                    btn.disabled = false;
                    this.updateStatus(); // Refresh status to update button text
                }, 1500);
            } else {
                throw new Error(response?.error || 'Toggle failed');
            }
        } catch (error) {
            console.error('Auto-recovery toggle failed:', error);
            btn.textContent = '❌ Toggle Failed';
            this.showNotification('❌ Auto-recovery toggle failed', 'danger');
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        }
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ProcessingDashboard();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboard) {
        window.dashboard.destroy();
    }
});