// Import PDF generator for automated processing
// Note: In Manifest V3, we need to load this dynamically
async function loadPDFGenerator() {
    try {
        // Load the PDF generator module
        const src = chrome.runtime.getURL('pdf-generator.js');
        await import(src);
        console.log('✅ PDF Generator module loaded');
    } catch (error) {
        console.warn('⚠️ Could not load PDF Generator module:', error);
    }
}

class BackgroundProcessor {
    constructor() {
        this.currentTab = null;
        this.isProcessing = false;
        this.shouldMoveNext = false;
        this.links = [];
        this.currentIndex = 0;
        this.tabClosedListener = null;
        this.tabUpdatedListener = null;
        this.isAuthenticated = false;
        this.saveSettings = {
            saveFolder: 'default',
            basePath: '/Users/sangsay/Desktop/scrapedatapdf'
        };
        this.siteConfig = null;
        this.pdfGenerator = null;
        this.printMethod = 'current'; // Default to current method
        
        // Access prevention and pause mechanism
        this.isPaused = false;
        this.pauseReason = null;
        this.blockedLinks = [];
        this.unprocessedLinks = [];
        this.processingStartTime = null;
        this.lastBlockageTime = null;
        
        // Automation queue system for batch processing
        this.automationQueue = [];
        this.isProcessingQueue = false;
        this.queueRecoveryAttempts = 0;
        this.maxQueueRecoveryAttempts = 3;
        
        // Link processing tracking system
        this.processedLinks = new Set(); // URLs that have been successfully processed
        this.failedLinks = new Set(); // URLs that failed to process
        this.linkProcessingStatus = new Map(); // Detailed status for each link
        this.currentlyProcessingLink = null;
        
        // Heartbeat and health monitoring
        this.lastServiceHeartbeat = null;
        this.serviceHealthStatus = null;
        this.heartbeatInterval = 10000; // Check every 10 seconds
        this.serviceTimeoutThreshold = 30000; // Consider service stuck after 30 seconds
        this.stuckQueueThreshold = 60000; // Queue stuck after 60 seconds
        
        // Enhanced recovery system
        this.lastQueueProgress = Date.now();
        this.queueStallDetection = true;
        this.autoRecoveryEnabled = true;
        
        // Session statistics tracking
        this.sessionStartTime = null;
        this.processingTimes = [];
        
        this.setupMessageListener();
        this.setupTabListeners();
        this.initializeSiteConfig();
        this.checkAuthentication();
        this.initializePDFGenerator();
        this.loadPrintMethodPreference();
        this.loadPausedState();
        this.startHealthMonitoring();
    }
    
    // Helper function to consistently get URL from link object or string
    getLinkUrl(link) {
        return typeof link === 'string' ? link : (link?.url || link);
    }
    
    // Validate and fix state consistency
    validateState() {
        try {
            console.log('🔍 Validating link processing state consistency...');
            
            // Ensure all processed/failed link URLs are consistent
            const allProcessedUrls = Array.from(this.processedLinks);
            const allFailedUrls = Array.from(this.failedLinks);
            const statusKeys = Array.from(this.linkProcessingStatus.keys());
            
            console.log(`📊 State overview: ${allProcessedUrls.length} processed, ${allFailedUrls.length} failed, ${statusKeys.length} status entries`);
            
            // Check for duplicates between processed and failed
            const duplicates = allProcessedUrls.filter(url => allFailedUrls.includes(url));
            if (duplicates.length > 0) {
                console.warn('⚠️ Found duplicates between processed and failed:', duplicates);
                // Remove from failed (prefer processed status)
                duplicates.forEach(url => this.failedLinks.delete(url));
            }
            
            // Clean up orphaned status entries
            let cleanedCount = 0;
            for (const [url, status] of this.linkProcessingStatus.entries()) {
                if (status.status === 'completed' && !this.processedLinks.has(url)) {
                    this.processedLinks.add(url);
                    cleanedCount++;
                } else if (status.status === 'failed' && !this.failedLinks.has(url) && !this.processedLinks.has(url)) {
                    this.failedLinks.add(url);
                    cleanedCount++;
                }
            }
            
            if (cleanedCount > 0) {
                console.log(`🔧 Fixed ${cleanedCount} inconsistent state entries`);
            }
            
            console.log('✅ State validation completed');
        } catch (error) {
            console.error('❌ State validation error:', error);
        }
    }

    // Initialize PDF Generator
    async initializePDFGenerator() {
        try {
            await loadPDFGenerator();
            this.pdfGenerator = new AutoPDFGenerator();
            console.log('✅ PDF Generator initialized');
        } catch (error) {
            console.warn('⚠️ PDF Generator initialization failed:', error);
        }
    }

    // Load print method preference
    async loadPrintMethodPreference() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['printMethod'], resolve);
            });
            this.printMethod = result.printMethod || 'python'; // Default to Python automation
            console.log('✅ Loaded print method preference:', this.printMethod);
        } catch (error) {
            console.warn('Could not load print method preference:', error);
            this.printMethod = 'python'; // Default to Python automation
        }
    }

    // Start health monitoring system
    startHealthMonitoring() {
        console.log('🔄 Starting health monitoring system...');
        
        // Service heartbeat monitoring
        setInterval(() => {
            this.checkServiceHealth();
        }, this.heartbeatInterval);
        
        // Queue stall detection
        setInterval(() => {
            this.checkQueueStall();
        }, 15000); // Check every 15 seconds
        
        console.log('✅ Health monitoring system started');
    }

    // Check automation service health
    async checkServiceHealth() {
        try {
            const response = await fetch('http://localhost:8888/health');
            if (response.ok) {
                this.serviceHealthStatus = await response.json();
                this.lastServiceHeartbeat = Date.now();
                
                // Check if service needs recovery
                if (this.serviceHealthStatus.status === 'critical' || 
                    this.serviceHealthStatus.health_score < 50) {
                    console.warn('⚠️ Service health critical:', this.serviceHealthStatus);
                    
                    if (this.autoRecoveryEnabled && this.serviceHealthStatus.automation_duration > 45) {
                        console.log('🔧 Triggering service recovery due to critical health');
                        await this.triggerServiceRecovery('critical_health');
                    }
                }
            } else {
                this.serviceHealthStatus = { status: 'unreachable', error: 'Service not responding' };
            }
        } catch (error) {
            this.serviceHealthStatus = { status: 'unreachable', error: error.message };
            console.warn('⚠️ Service health check failed:', error.message);
        }
    }

    // Check for queue stalls
    async checkQueueStall() {
        if (!this.isProcessingQueue || this.automationQueue.length === 0) {
            this.lastQueueProgress = Date.now();
            return;
        }
        
        const queueStallTime = Date.now() - this.lastQueueProgress;
        
        if (queueStallTime > this.stuckQueueThreshold) {
            console.warn(`⚠️ Queue appears stalled for ${queueStallTime/1000}s`);
            
            if (this.autoRecoveryEnabled && this.queueRecoveryAttempts < this.maxQueueRecoveryAttempts) {
                console.log('🔧 Triggering queue recovery due to stall');
                await this.recoverStuckQueue('stall_detected');
            }
        }
    }

    // Trigger service recovery
    async triggerServiceRecovery(reason = 'manual') {
        try {
            console.log(`🔧 Triggering service recovery - reason: ${reason}`);
            
            const response = await fetch(`http://localhost:8888/force_recovery?reason=${reason}`);
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Service recovery completed:', result);
                
                // Reset local state if needed
                if (this.isProcessingQueue) {
                    console.log('🔄 Restarting queue processing after service recovery');
                    setTimeout(() => {
                        this.processAutomationQueue();
                    }, 2000);
                }
                
                return result;
            } else {
                throw new Error(`Recovery request failed: ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Service recovery failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Trigger service recovery
    async triggerServiceRecovery(reason = 'manual') {
        try {
            console.log(`🔧 Triggering service recovery - reason: ${reason}`);
            
            const response = await fetch(`http://localhost:8888/force_recovery?reason=${reason}`);
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Service recovery completed:', result);
                
                // Reset local state if needed
                if (this.isProcessingQueue) {
                    console.log('🔄 Restarting queue processing after service recovery');
                    setTimeout(() => {
                        this.processAutomationQueue();
                    }, 2000);
                }
                
                return result;
            } else {
                throw new Error(`Recovery request failed: ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Service recovery failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Recover stuck queue
    async recoverStuckQueue(reason = 'manual') {
        try {
            this.queueRecoveryAttempts++;
            console.log(`🔧 Queue recovery attempt ${this.queueRecoveryAttempts}/${this.maxQueueRecoveryAttempts} - reason: ${reason}`);
            
            // First try service recovery
            await this.triggerServiceRecovery(`queue_${reason}`);
            
            // Reset queue processing state
            this.isProcessingQueue = false;
            
            // Wait a moment then restart queue processing
            setTimeout(() => {
                if (this.automationQueue.length > 0) {
                    console.log('🔄 Restarting queue processing after recovery');
                    this.lastQueueProgress = Date.now();
                    this.processAutomationQueue();
                }
            }, 3000);
            
            return { success: true, recoveryAttempt: this.queueRecoveryAttempts };
            
        } catch (error) {
            console.error('❌ Queue recovery failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Get comprehensive system status
    getSystemStatus() {
        return {
            // Extension state
            isProcessing: this.isProcessing,
            isPaused: this.isPaused,
            isBatchMode: this.isBatchMode,
            isProcessingQueue: this.isProcessingQueue,
            queueLength: this.automationQueue.length,
            currentlyProcessingLink: this.currentlyProcessingLink,
            
            // Service health
            serviceHealth: this.serviceHealthStatus,
            lastServiceHeartbeat: this.lastServiceHeartbeat,
            serviceHeartbeatAge: this.lastServiceHeartbeat ? Date.now() - this.lastServiceHeartbeat : null,
            
            // Recovery status
            queueRecoveryAttempts: this.queueRecoveryAttempts,
            autoRecoveryEnabled: this.autoRecoveryEnabled,
            lastQueueProgress: this.lastQueueProgress,
            queueStallTime: Date.now() - this.lastQueueProgress,
            
            // Processing stats
            processedCount: this.processedLinks.size,
            failedCount: this.failedLinks.size,
            totalLinksCount: this.links.length,
            
            // Session statistics
            sessionStartTime: this.sessionStartTime,
            sessionDuration: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
            processingTimes: this.processingTimes,
            printMethod: this.printMethod
        };
    }

    // Initialize site configuration system
    initializeSiteConfig() {
        try {
            // Create inline site configuration (can't use imports in service workers)
            this.siteConfig = this.createInlineSiteConfig();
            console.log('✅ Site configuration initialized');
        } catch (error) {
            console.error('❌ Failed to initialize site configuration:', error);
            // Fallback to basic configuration
            this.siteConfig = {
                isSupported: () => true,
                getSiteName: (hostname) => hostname,
                getConfig: () => ({
                    name: 'Generic Site',
                    articleSelectors: ['article', '.article-body', '.story-body'],
                    titleSelectors: ['h1', '.headline', '.title']
                })
            };
        }
    }

    // Create inline site configuration for service worker compatibility
    createInlineSiteConfig() {
        const configs = {
            'bloomberg.com': {
                name: 'Bloomberg',
                articleSelectors: ['article', '[data-module="ArticleBody"]', '[data-module="StoryBody"]', '.story-body', '.article-body', '.story-content'],
                titleSelectors: ['h1', '.headline', '[data-module="Headline"]', '.lede-text-only__headline'],
                paywall: { selectors: ['.paywall', '.fence-body'] },
                authIndicators: ['[data-module="UserMenu"]', '.user-menu', '[class*="profile"]']
            },
            'wsj.com': {
                name: 'Wall Street Journal',
                articleSelectors: ['article', '.wsj-article-body', '.article-content', '.ArticleBody', '.StoryBody', '.paywall-story'],
                titleSelectors: ['h1', '.headline', '.wsj-article-headline', '.ArticleHeadline'],
                paywall: { selectors: ['.wsj-paywall', '.subscription-required', '.paywall'] },
                authIndicators: ['.user-nav', '.profile-menu', '.account-menu']
            },
            'cnbc.com': {
                name: 'CNBC',
                articleSelectors: ['article', '.ArticleBody', '.InlineArticleBody', '.story-body', '.RenderKeyPoints', '.ArticleBodyWrapper'],
                titleSelectors: ['h1', '.ArticleHeader-headline', '.story-headline', '.InlineArticleHeader-headline'],
                paywall: { selectors: ['.paywall', '.premium-content'] },
                authIndicators: ['.user-menu', '.profile-dropdown', '.account-menu']
            },
            'barrons.com': {
                name: "Barron's",
                articleSelectors: ['article', '.article-body', '.story-body', '.ArticleBody', '.barrons-article-body'],
                titleSelectors: ['h1', '.headline', '.article-headline', '.story-headline'],
                paywall: { selectors: ['.paywall', '.subscription-required'] },
                authIndicators: ['.user-menu', '.profile-menu', '.account-dropdown']
            },
            'ft.com': {
                name: 'Financial Times',
                articleSelectors: ['article', '.article-body', '.n-content-body', '.story-body'],
                titleSelectors: ['h1', '.headline', '.article-headline'],
                paywall: { selectors: ['.subscription-prompt', '.paywall'] },
                authIndicators: ['.user-menu', '.profile-menu']
            },
            'marketwatch.com': {
                name: 'MarketWatch',
                articleSelectors: ['article', '.article-body', '.story-body', '.ArticleBody'],
                titleSelectors: ['h1', '.headline', '.article-headline'],
                paywall: { selectors: ['.paywall', '.premium-content'] },
                authIndicators: ['.user-menu', '.profile-menu']
            },
            'reuters.com': {
                name: 'Reuters',
                articleSelectors: ['article', '.story-body', '.article-body', '.StandardArticleBody'],
                titleSelectors: ['h1', '.headline', '.article-headline'],
                paywall: { selectors: ['.paywall', '.subscription-required'] },
                authIndicators: ['.user-menu', '.profile-menu']
            },
            'finance.yahoo.com': {
                name: 'Yahoo Finance',
                articleSelectors: ['article', '.story-body', '.article-body', '.caas-body'],
                titleSelectors: ['h1', '.headline', '.article-headline'],
                paywall: { selectors: ['.paywall', '.premium-content'] },
                authIndicators: ['.user-menu', '.profile-menu']
            }
        };

        const siteConfigObj = {
            // Get configuration for a specific site
            getConfig: (hostname) => {
                const cleanHostname = hostname.replace(/^www\./, '');
                
                if (configs[cleanHostname]) {
                    return configs[cleanHostname];
                }
                
                // Check for subdomain matches
                for (const [domain, config] of Object.entries(configs)) {
                    if (cleanHostname.endsWith(domain)) {
                        return config;
                    }
                }
                
                // Return generic configuration
                return {
                    name: 'News Site',
                    articleSelectors: ['article', '.article-body', '.story-body', '.content', '.main-content'],
                    titleSelectors: ['h1', '.headline', '.title'],
                    paywall: { selectors: ['.paywall', '.subscription-required', '.premium-content'] },
                    authIndicators: ['.user-menu', '.profile-menu', '.account-menu']
                };
            },

            // Check if site is supported
            isSupported: (hostname) => {
                const cleanHostname = hostname.replace(/^www\./, '');
                return configs.hasOwnProperty(cleanHostname) || 
                       Object.keys(configs).some(domain => cleanHostname.endsWith(domain));
            },

            // Get site name for display
            getSiteName: (hostname) => {
                const config = siteConfigObj.getConfig(hostname);
                return config.name;
            }
        };

        return siteConfigObj;
    }
    
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse)
                .then(response => sendResponse(response))
                .catch(error => {
                    console.error('Message handling error:', error);
                    sendResponse({ error: error.message });
                });
            return true; // Keep channel open for async response
        });
    }
    
    async handleMessage(message, sender, sendResponse) {
        switch (message.action) {
            case 'startProcessing':
                await this.startProcessing(message.links, message.currentIndex, message.printMethod, message.options);
                return { success: true };
                
            case 'startSequentialProcessing':
                // Enhanced sequential processing with auto-print and custom delays
                const sequentialOptions = {
                    autoAdvance: message.autoAdvance !== false,
                    useAutoPrint: message.useAutoPrint !== false,
                    customDelays: message.customDelays || {},
                    ...message.options
                };
                await this.startProcessing(message.links, message.currentIndex, message.printMethod, sequentialOptions);
                return { success: true, sequentialOptions };
                
            case 'openLink':
                await this.openLink(message.link, message.index);
                return { success: true };
                
            case 'stopProcessing':
                this.stopProcessing();
                return { success: true };
                
            case 'getStatus':
                return {
                    isProcessing: this.isProcessing,
                    shouldMoveNext: this.shouldMoveNext,
                    currentIndex: this.currentIndex,
                    isAuthenticated: this.isAuthenticated
                };
                
            case 'linkCompleted':
                // Called from content script when user clicks "Print & Next"
                this.handleLinkCompleted();
                return { success: true };
                
            case 'pageLoaded':
                // Called from content script when any supported news page loads
                try {
                    const siteName = this.siteConfig ? this.siteConfig.getSiteName(new URL(message.url).hostname) : 'Unknown Site';
                    console.log(`📄 ${siteName} page loaded:`, message.url);
                } catch (urlError) {
                    console.log('📄 Page loaded:', message.url);
                }
                await this.detectAuthentication(sender.tab);
                return { success: true };

            case 'setSaveSettings':
                // Set save folder and path settings
                this.saveSettings = { ...this.saveSettings, ...message.settings };
                await this.createSaveFolder();
                return { success: true, settings: this.saveSettings };

            case 'getSaveSettings':
                // Return current save settings
                return { success: true, saveSettings: this.saveSettings };

            case 'generatePDF':
                // Generate PDF and save to specified folder
                // Check if this is batch mode or single page mode
                if (this.isBatchMode) {
                    // Use automatic download method for batch processing
                    const pdfResult = await this.generateAndSavePDF(message, sender.tab);
                    return pdfResult;
                } else {
                    // For single page, content script handles Chrome print method
                    return { 
                        success: true, 
                        method: 'chrome-print-delegated',
                        message: 'Single page processing uses Chrome print method'
                    };
                }
                
            case 'startBatchProcessing':
                // Start smart batch processing with safety controls
                await this.startBatchProcessing(message.links, message.currentIndex, message.batchSize, message.delay, message.printMethod);
                return { success: true };
                
            case 'pauseProcessing':
                this.pauseProcessing();
                return { success: true };
                
            case 'resumeProcessing':
                // Resume processing after user intervention
                if (message.currentIndex !== undefined) {
                    this.currentIndex = message.currentIndex;
                    console.log(`📍 Resume processing from user-selected index: ${this.currentIndex}`);
                }
                await this.resumeProcessing();
                return { success: true };
                
            case 'resetProcessing':
                this.resetProcessing();
                return { success: true };
                
            case 'getProcessingStatus':
                return this.getProcessingStatus();
                
            case 'getUnprocessedLinks':
                return { unprocessedLinks: this.getUnprocessedLinks() };
                
            case 'copyUnprocessedLinks':
                return { unprocessedLinks: this.getUnprocessedLinks() };

            case 'setPrintMethod':
                // Set print method preference
                this.printMethod = message.printMethod;
                await chrome.storage.local.set({ printMethod: message.printMethod });
                console.log('✅ Print method updated to:', this.printMethod);
                return { success: true };

            case 'setTimingPreferences':
                // Set timing preferences
                await chrome.storage.local.set({
                    pageLoadWait: message.pageLoadWait,
                    printDialogWait: message.printDialogWait,
                    saveDialogWait: message.saveDialogWait,
                    betweenPagesWait: message.betweenPagesWait
                });
                console.log('✅ Timing preferences updated:', {
                    pageLoadWait: message.pageLoadWait,
                    printDialogWait: message.printDialogWait,
                    saveDialogWait: message.saveDialogWait,
                    betweenPagesWait: message.betweenPagesWait
                });
                return { success: true };

                
            case 'getUnprocessedLinks':
                // Get list of unprocessed links
                return { 
                    success: true, 
                    unprocessedLinks: this.unprocessedLinks,
                    blockedLinks: this.blockedLinks,
                    isPaused: this.isPaused,
                    pauseReason: this.pauseReason
                };
                
            case 'exportUnprocessedLinks':
                // Export unprocessed links as text
                return { 
                    success: true, 
                    linksText: this.exportUnprocessedLinksAsText(),
                    count: this.unprocessedLinks.length
                };
                
            case 'clearBlockedLinks':
                // Clear blocked links list
                this.blockedLinks = [];
                await this.savePausedState();
                return { success: true };
                
            case 'getBlockedLinks':
                // Get blocked links for dashboard
                return { 
                    success: true, 
                    blockedLinks: this.blockedLinks 
                };
                
            case 'automationCompleted':
                // Handle automation completion notification from service
                await this.handleAutomationCompleted(message);
                return { success: true };
                
            case 'getSystemStatus':
                // Get comprehensive system status
                return { success: true, status: this.getSystemStatus() };
                
            case 'triggerServiceRecovery':
                // Manually trigger service recovery
                const recoveryResult = await this.triggerServiceRecovery(message.reason || 'manual');
                return { success: recoveryResult.success, result: recoveryResult };
                
            case 'recoverStuckQueue':
                // Manually recover stuck queue
                const queueRecoveryResult = await this.recoverStuckQueue(message.reason || 'manual');
                return { success: queueRecoveryResult.success, result: queueRecoveryResult };
                
            case 'toggleAutoRecovery':
                // Toggle automatic recovery
                this.autoRecoveryEnabled = !this.autoRecoveryEnabled;
                console.log(`🔧 Auto-recovery ${this.autoRecoveryEnabled ? 'enabled' : 'disabled'}`);
                return { success: true, autoRecoveryEnabled: this.autoRecoveryEnabled };
                
            default:
                return { error: 'Unknown action' };
        }
    }
    
    async startProcessing(links, currentIndex, printMethod = null, options = {}) {
        this.links = links;
        this.currentIndex = currentIndex;
        this.isProcessing = true;
        this.isBatchMode = false; // Sequential mode
        this.shouldMoveNext = false;
        this.sequentialOptions = {
            autoAdvance: options.autoAdvance !== false, // Default to true
            useAutoPrint: options.useAutoPrint !== false, // Default to true
            customDelays: options.customDelays || {},
            ...options
        };
        
        // Update print method if provided
        if (printMethod) {
            this.printMethod = printMethod;
        }
        
        console.log(`🚀 Starting SEQUENTIAL processing of ${links.length} links from index ${currentIndex}`);
        console.log(`📋 Using print method: ${this.printMethod}`);
        console.log(`⚙️ Sequential options:`, this.sequentialOptions);
        
        // Start session tracking
        this.sessionStartTime = Date.now();
        
        // Validate state consistency
        this.validateState();
        
        // Start with the first link immediately
        if (this.currentIndex < this.links.length) {
            const firstLink = this.links[this.currentIndex];
            await this.openLink(firstLink, this.currentIndex);
            
            // Disable access checks in content script for smoother sequential processing
            try {
                await chrome.tabs.sendMessage(this.currentTab.id, { action: 'disableAccessCheck' });
                console.log('🚫 Disabled access checks for sequential processing');
            } catch (error) {
                console.warn('Could not disable access checks:', error);
            }
            
            // If auto-print is enabled, start the auto-print cycle
            if (this.sequentialOptions.useAutoPrint) {
                setTimeout(() => {
                    this.executeSequentialAutoPrint();
                }, this.sequentialOptions.customDelays.pageLoadWait || 3000); // Wait for page load
            }
        }
    }
    
    async startBatchProcessing(links, currentIndex, batchSize, delay, printMethod = null) {
        this.links = links;
        this.currentIndex = currentIndex;
        this.isProcessing = true;
        this.isBatchMode = true;
        this.batchSize = batchSize;
        this.batchDelay = delay;
        this.shouldMoveNext = false;
        
        // Set batch processing flag to prevent UI injection in content scripts
        chrome.storage.local.set({ batchProcessingActive: true });
        
        // Update print method if provided
        if (printMethod) {
            this.printMethod = printMethod;
            console.log(`🔧 Print method updated to: ${this.printMethod}`);
        }
        
        console.log(`🤖 Starting SMART BATCH processing:`);
        console.log(`   📊 Total links: ${links.length}`);
        
        // Start session tracking
        this.sessionStartTime = Date.now();
        
        // Validate state consistency
        this.validateState();
        
        console.log(`   📦 Batch size: ${batchSize} tabs at once`);
        console.log(`   ⏱️  Delay: ${delay/1000} seconds between batches`);
        console.log(`   🛡️  Robot detection: MINIMIZED`);
        console.log(`   📋 Print method: ${this.printMethod}`);
        
        // Start the first batch
        this.processBatch();
    }
    
    async openLink(link, index) {
        console.log(`📂 Opening link ${index + 1}: ${link.url}`);
        
        try {
            // Validate tab still exists before updating
            if (this.currentTab) {
                try {
                    await chrome.tabs.get(this.currentTab.id);
                    // Tab exists, update it
                    await chrome.tabs.update(this.currentTab.id, {
                        url: link.url,
                        active: true
                    });
                } catch (tabError) {
                    // Tab doesn't exist, create new one
                    console.log('Previous tab no longer exists, creating new one');
                    this.currentTab = await chrome.tabs.create({
                        url: link.url,
                        active: true
                    });
                }
            } else {
                // Create new tab
                this.currentTab = await chrome.tabs.create({
                    url: link.url,
                    active: true
                });
            }
            
            // Update current index
            this.currentIndex = index;
            
            // Reset the move next flag
            this.shouldMoveNext = false;
            
        } catch (error) {
            console.error('Error opening link:', error);
            throw new Error(`Failed to open link: ${error.message}`);
        }
    }
    
    async handleLinkCompleted() {
        console.log('✅ Link completed by user');
        console.log('📊 Current state:', {
            isProcessing: this.isProcessing,
            linksCount: this.links.length,
            currentIndex: this.currentIndex,
            shouldMoveNext: this.shouldMoveNext
        });
        
        this.shouldMoveNext = true;
        
        // Auto-move to next link after a short delay
        setTimeout(async () => {
            console.log('⏰ Auto-navigation timer triggered');
            
            if (!this.isProcessing) {
                console.log('⚠️ Not processing anymore, skipping auto-navigation');
                return;
            }
            
            if (this.links.length === 0) {
                console.log('⚠️ No links available, skipping auto-navigation');
                return;
            }
            
            this.currentIndex++;
            console.log(`📈 Incremented index to: ${this.currentIndex}`);
            
            if (this.currentIndex >= this.links.length) {
                // All links completed
                console.log('🎉 All links processed! Stopping...');
                this.stopProcessing();
            } else {
                // Move to next link
                const nextLink = this.links[this.currentIndex];
                console.log(`📂 Auto-moving to next link ${this.currentIndex + 1}/${this.links.length}`);
                console.log(`🔗 Next URL: ${nextLink.url}`);
                
                try {
                    await this.openLink(nextLink, this.currentIndex);
                    console.log('✅ Successfully opened next link');
                } catch (error) {
                    console.error('❌ Error auto-opening next link:', error);
                }
            }
        }, 3000); // Increased to 3 seconds for more reliable PDF saving
    }
    
    stopProcessing() {
        this.isProcessing = false;
        this.isBatchMode = false;
        this.shouldMoveNext = false;
        this.links = [];
        this.currentIndex = 0;
        
        // Clear batch processing flag to allow UI injection again
        chrome.storage.local.set({ batchProcessingActive: false });
        
        // Re-enable access checks when processing stops
        if (this.currentTab) {
            try {
                chrome.tabs.sendMessage(this.currentTab.id, { action: 'enableAccessCheck' });
                console.log('✅ Re-enabled access checks after processing');
            } catch (error) {
                console.warn('Could not re-enable access checks:', error);
            }
        }
        
        this.cleanupTabListeners();
        console.log('⏹️ Processing stopped');
    }
    
    // Execute automatic printing for sequential processing
    async executeSequentialAutoPrint() {
        if (!this.isProcessing || this.isBatchMode || this.currentIndex >= this.links.length) {
            console.log('⚠️ Sequential auto-print cancelled - not in sequential mode or processing ended');
            return;
        }
        
        // 🚨 CHECK FOR BARRIERS BEFORE PROCESSING EACH LINK
        // Skip barrier check - removed for standalone operation
        if (false) { // Barrier detection removed
            console.log(`🚨 BARRIER DETECTED - Pausing at link ${this.currentIndex + 1}`);
            console.log(`📄 Barrier file: ${barrierStatus.file}`);
            console.log(`🚫 Barrier type: ${barrierStatus.barrier_type}`);
            console.log(`📊 Confidence: ${barrierStatus.confidence}%`);
            
            // PAUSE processing and wait for user intervention
            this.isPaused = true;
            this.pauseReason = `Barrier detected: ${barrierStatus.barrier_type}`;
            this.isProcessing = false; // Stop the processing loop
            
            console.log('⏸️ Processing PAUSED due to barrier. User must click Resume to continue.');
            return; // Exit processing loop
        }
        
        const currentLink = this.links[this.currentIndex];
        const currentUrl = this.getLinkUrl(currentLink);
        console.log(`🤖 Executing sequential auto-print for link ${this.currentIndex + 1}: ${this.truncateUrl(currentUrl)}`);
        
        try {
            // Mark as currently processing for tracking
            this.currentlyProcessingLink = currentUrl;
            this.linkProcessingStatus.set(currentUrl, {
                status: 'processing',
                tabId: this.currentTab?.id,
                index: this.currentIndex,
                startTime: Date.now(),
                method: 'sequential-auto'
            });
            
            // Generate filename for this page
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
            const pageTitle = currentUrl.split('/').pop() || 'article';
            const hostname = new URL(currentUrl).hostname.replace(/^www\./, '');
            const sitePrefix = hostname.split('.')[0];
            const filename = `${sitePrefix}_${dateStr}_${timeStr}_${pageTitle}.pdf`;
            
            let result;
            
            // Use the selected print method
            if (this.printMethod === 'python') {
                console.log('🐍 Using Python automation for sequential processing...');
                result = await this.executeSequentialPythonAutomation(filename);
            } else if (this.printMethod === 'simple') {
                console.log('🤖 Using Simple automation for sequential processing...');
                result = await this.executeSequentialSimpleAutomation(filename);
            } else {
                console.log('🖨️ Using Chrome print for sequential processing...');
                result = await this.executeSequentialChromePrint(filename);
            }
            
            // Handle result
            if (result && result.success) {
                console.log(`✅ Sequential auto-print completed: ${filename}`);
                
                // Update processing status
                const startTime = this.linkProcessingStatus.get(currentUrl)?.startTime || Date.now();
                const completedTime = Date.now();
                const processingTime = completedTime - startTime;
                
                this.linkProcessingStatus.set(currentUrl, {
                    status: 'completed',
                    tabId: this.currentTab?.id,
                    index: this.currentIndex,
                    startTime: startTime,
                    completedTime: completedTime,
                    processingTime: processingTime,
                    filename: filename,
                    method: result.method
                });
                
                // Track processing time for statistics
                this.processingTimes.push(processingTime);
                
                this.processedLinks.add(currentUrl);
                this.currentlyProcessingLink = null;
                
                // Auto-advance to next link if enabled
                if (this.sequentialOptions.autoAdvance) {
                    const advanceDelay = this.sequentialOptions.customDelays.betweenPagesWait || 2000;
                    console.log(`⏳ Auto-advancing to next link in ${advanceDelay/1000}s...`);
                    
                    setTimeout(() => {
                        this.moveToNextSequentialLink();
                    }, advanceDelay);
                }
            } else {
                // Handle failure
                console.warn(`❌ Sequential auto-print failed: ${result?.error || 'Unknown error'}`);
                
                this.linkProcessingStatus.set(currentUrl, {
                    status: 'failed',
                    tabId: this.currentTab?.id,
                    index: this.currentIndex,
                    startTime: this.linkProcessingStatus.get(currentUrl)?.startTime || Date.now(),
                    failedTime: Date.now(),
                    error: result?.error || 'Auto-print failed'
                });
                
                this.failedLinks.add(currentUrl);
                this.currentlyProcessingLink = null;
                
                // Still advance to next link after a shorter delay
                if (this.sequentialOptions.autoAdvance) {
                    const errorAdvanceDelay = 1000; // Shorter delay for errors
                    setTimeout(() => {
                        this.moveToNextSequentialLink();
                    }, errorAdvanceDelay);
                }
            }
            
        } catch (error) {
            console.error('❌ Sequential auto-print error:', error);
            
            // Mark as failed and continue
            this.linkProcessingStatus.set(currentUrl, {
                status: 'failed',
                tabId: this.currentTab?.id,
                index: this.currentIndex,
                startTime: this.linkProcessingStatus.get(currentUrl)?.startTime || Date.now(),
                failedTime: Date.now(),
                error: error.message
            });
            
            this.failedLinks.add(currentUrl);
            this.currentlyProcessingLink = null;
            
            // Continue to next link
            if (this.sequentialOptions.autoAdvance) {
                setTimeout(() => {
                    this.moveToNextSequentialLink();
                }, 1000);
            }
        }
    }
    
    // Move to next link in sequential processing
    async moveToNextSequentialLink() {
        if (!this.isProcessing || this.isBatchMode) {
            return;
        }
        
        this.currentIndex++;
        
        if (this.currentIndex >= this.links.length) {
            console.log('🎉 Sequential processing completed! All links processed.');
            this.stopProcessing();
            return;
        }
        
        const nextLink = this.links[this.currentIndex];
        const nextUrl = this.getLinkUrl(nextLink);
        console.log(`📂 Moving to next link ${this.currentIndex + 1}/${this.links.length}: ${this.truncateUrl(nextUrl)}`);
        
        try {
            await this.openLink(nextLink, this.currentIndex);
            
            // Disable access checks for this new page
            setTimeout(async () => {
                try {
                    await chrome.tabs.sendMessage(this.currentTab.id, { action: 'disableAccessCheck' });
                    console.log('🚫 Disabled access checks for new page');
                } catch (error) {
                    console.warn('Could not disable access checks for new page:', error);
                }
            }, 1000);
            
            // Wait for page load, then execute auto-print
            const pageLoadWait = this.sequentialOptions.customDelays.pageLoadWait || 3000;
            setTimeout(() => {
                if (this.isProcessing && !this.isBatchMode) {
                    this.executeSequentialAutoPrint();
                }
            }, pageLoadWait);
            
        } catch (error) {
            console.error('❌ Error moving to next link:', error);
            
            // Mark current link as failed and continue
            this.failedLinks.add(nextUrl);
            
            // Try next link after short delay
            setTimeout(() => {
                this.moveToNextSequentialLink();
            }, 1000);
        }
    }
    
    // Sequential Python automation
    async executeSequentialPythonAutomation(filename) {
        try {
            // Get timing preferences
            const timingResult = await chrome.storage.local.get(['pageLoadWait', 'printDialogWait', 'saveDialogWait']);
            const timingPrefs = {
                pageLoadWait: parseInt(timingResult.pageLoadWait) || 2000,
                printDialogWait: parseInt(timingResult.printDialogWait) || 2000,
                saveDialogWait: parseInt(timingResult.saveDialogWait) || 1500
            };
            
            // Apply any custom delays from sequential options
            if (this.sequentialOptions.customDelays) {
                Object.assign(timingPrefs, this.sequentialOptions.customDelays);
            }
            
            console.log('⏱️ Using timing preferences for sequential:', timingPrefs);
            
            // Check service health before starting
            const healthResponse = await fetch('http://localhost:8888/health');
            if (healthResponse.ok) {
                const health = await healthResponse.json();
                if (health.status === 'critical') {
                    console.warn('⚠️ Service health critical, triggering recovery');
                    await this.triggerServiceRecovery('critical_before_sequential');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for recovery
                }
            }
            
            // Hide extension UI before automation
            await chrome.scripting.executeScript({
                target: { tabId: this.currentTab.id },
                func: () => {
                    const extensionElements = document.querySelectorAll('[id*="bloomberg"], [id*="processor"], [class*="processor"]');
                    extensionElements.forEach(el => el.style.display = 'none');
                }
            });
            
            // Call Python automation service
            const response = await fetch('http://localhost:8888/print', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page_load_delay: timingPrefs.pageLoadWait / 1000,
                    print_delay: timingPrefs.printDialogWait / 1000,
                    save_delay: timingPrefs.saveDialogWait / 1000,
                    tab_id: this.currentTab.id,
                    link_index: this.currentIndex,
                    filename: filename,
                    mode: 'sequential'
                })
            });
            
            if (!response.ok) {
                throw new Error(`Service responded with ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                // Wait for automation to complete
                await this.waitForSequentialAutomationCompletion(this.currentTab.id, this.currentIndex, filename);
                
                return {
                    success: true,
                    method: 'python-automation-sequential',
                    filename: filename,
                    message: 'Python automation completed for sequential processing'
                };
            } else {
                throw new Error(result.error || 'Python automation failed');
            }
            
        } catch (error) {
            console.error('❌ Sequential Python automation failed:', error);
            return {
                success: false,
                method: 'python-automation-sequential',
                error: error.message
            };
        }
    }
    
    // Sequential Simple automation
    async executeSequentialSimpleAutomation(filename) {
        try {
            // Get timing preferences
            const timingResult = await chrome.storage.local.get(['pageLoadWait', 'printDialogWait', 'saveDialogWait']);
            const timingPrefs = {
                pageLoadWait: parseInt(timingResult.pageLoadWait) || 2000,
                printDialogWait: parseInt(timingResult.printDialogWait) || 2000,
                saveDialogWait: parseInt(timingResult.saveDialogWait) || 1500
            };
            
            // Apply any custom delays
            if (this.sequentialOptions.customDelays) {
                Object.assign(timingPrefs, this.sequentialOptions.customDelays);
            }
            
            // Execute simple automation directly in the tab
            const result = await chrome.scripting.executeScript({
                target: { tabId: this.currentTab.id },
                func: (fname, timing) => {
                    try {
                        // Hide extension UI
                        const extensionElements = document.querySelectorAll('[id*="bloomberg"], [id*="processor"], [class*="processor"]');
                        extensionElements.forEach(el => el.style.display = 'none');
                        
                        // Add print styles
                        const printStyles = document.createElement('style');
                        printStyles.innerHTML = `
                            @media print {
                                * { -webkit-print-color-adjust: exact !important; }
                                body { margin: 0 !important; padding: 15mm !important; }
                                .no-print, nav, header, footer { display: none !important; }
                            }
                        `;
                        document.head.appendChild(printStyles);
                        
                        // Trigger print dialog
                        window.print();
                        
                        // Cleanup
                        setTimeout(() => {
                            if (printStyles.parentNode) {
                                printStyles.parentNode.removeChild(printStyles);
                            }
                        }, 2000);
                        
                        return {
                            success: true,
                            method: 'simple-automation-sequential',
                            filename: fname
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        };
                    }
                },
                args: [filename, timingPrefs]
            });
            
            return result[0]?.result || { success: false, error: 'Script execution failed' };
            
        } catch (error) {
            console.error('❌ Sequential Simple automation failed:', error);
            return {
                success: false,
                method: 'simple-automation-sequential',
                error: error.message
            };
        }
    }
    
    // Sequential Chrome print
    async executeSequentialChromePrint(filename) {
        try {
            // Execute Chrome print in the tab
            const result = await chrome.scripting.executeScript({
                target: { tabId: this.currentTab.id },
                func: (fname) => {
                    try {
                        // Hide extension UI
                        const extensionElements = document.querySelectorAll('[id*="bloomberg"], [id*="processor"], [class*="processor"]');
                        extensionElements.forEach(el => el.style.display = 'none');
                        
                        // Add comprehensive print styles
                        const printStyles = document.createElement('style');
                        printStyles.innerHTML = `
                            @media print {
                                * { 
                                    -webkit-print-color-adjust: exact !important;
                                    color-adjust: exact !important;
                                }
                                body { 
                                    margin: 0 !important; 
                                    padding: 15mm !important;
                                    font-size: 12pt !important;
                                }
                                .no-print, nav, header, footer, .advertisement { 
                                    display: none !important; 
                                }
                                img { max-width: 100% !important; height: auto !important; }
                                a { color: inherit !important; text-decoration: none !important; }
                            }
                        `;
                        document.head.appendChild(printStyles);
                        
                        // Small delay then trigger print
                        setTimeout(() => {
                            window.print();
                        }, 500);
                        
                        // Cleanup after delay
                        setTimeout(() => {
                            if (printStyles.parentNode) {
                                printStyles.parentNode.removeChild(printStyles);
                            }
                        }, 3000);
                        
                        return {
                            success: true,
                            method: 'chrome-print-sequential',
                            filename: fname,
                            message: 'Chrome print dialog opened for sequential processing'
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message
                        };
                    }
                },
                args: [filename]
            });
            
            return result[0]?.result || { success: false, error: 'Script execution failed' };
            
        } catch (error) {
            console.error('❌ Sequential Chrome print failed:', error);
            return {
                success: false,
                method: 'chrome-print-sequential',
                error: error.message
            };
        }
    }
    
    // Wait for sequential automation completion (simplified version)
    async waitForSequentialAutomationCompletion(tabId, linkIndex, filename) {
        return new Promise((resolve, reject) => {
            const maxPolls = 60; // 60 seconds for sequential
            const pollInterval = 1000;
            let pollCount = 0;
            
            console.log(`🔄 Waiting for sequential automation completion: ${filename}`);
            
            const poll = async () => {
                try {
                    pollCount++;
                    
                    if (pollCount > maxPolls) {
                        console.warn(`⏰ Sequential automation timeout: ${filename}`);
                        resolve({ completed: true, timeout: true });
                        return;
                    }
                    
                    const response = await fetch(`http://localhost:8888/check_completion?tab_id=${tabId}&link_index=${linkIndex}`);
                    
                    if (response.ok) {
                        const result = await response.json();
                        
                        if (result.completed) {
                            console.log(`✅ Sequential automation completed: ${filename}`);
                            resolve(result);
                            return;
                        }
                    }
                    
                    // Continue polling
                    setTimeout(poll, pollInterval);
                    
                } catch (error) {
                    if (pollCount < 5) {
                        setTimeout(poll, pollInterval);
                    } else {
                        console.warn('⚠️ Sequential polling failed, assuming completion');
                        resolve({ completed: true, assumed: true });
                    }
                }
            };
            
            setTimeout(poll, 1000);
        });
    }
    
    // Process links in controlled batches to avoid robot detection
    async processBatch() {
        if (!this.isProcessing || !this.isBatchMode) {
            return;
        }
        
        // 🚨 CHECK FOR BARRIERS BEFORE PROCESSING EACH BATCH
        // Skip barrier check - removed for standalone operation
        if (false) { // Barrier detection removed
            console.log(`🚨 BARRIER DETECTED - Pausing batch processing`);
            console.log(`📄 Barrier file: ${barrierStatus.file}`);
            console.log(`🚫 Barrier type: ${barrierStatus.barrier_type}`);
            console.log(`📊 Confidence: ${barrierStatus.confidence}%`);
            
            // PAUSE processing and wait for user intervention
            this.isPaused = true;
            this.pauseReason = `Barrier detected: ${barrierStatus.barrier_type}`;
            this.isProcessing = false; // Stop the processing loop
            
            console.log('⏸️ Batch processing PAUSED due to barrier. User must click Resume to continue.');
            return; // Exit processing loop
        }
        
        const remainingLinks = this.links.length - this.currentIndex;
        if (remainingLinks <= 0) {
            console.log('🎉 All batch processing completed!');
            this.stopProcessing();
            return;
        }
        
        const currentBatchSize = Math.min(this.batchSize, remainingLinks);
        console.log(`📦 Processing batch: ${this.currentIndex + 1}-${this.currentIndex + currentBatchSize} of ${this.links.length}`);
        
        // Queue is already initialized in constructor
        
        // Open tabs for current batch and add to queue
        const batchTabs = [];
        for (let i = 0; i < currentBatchSize; i++) {
            const linkIndex = this.currentIndex + i;
            const link = this.links[linkIndex];
            
            try {
                // Add random delay between tab openings (0.5-2 seconds)
                const randomDelay = 500 + Math.random() * 1500;
                await new Promise(resolve => setTimeout(resolve, randomDelay));
                
                const tab = await chrome.tabs.create({
                    url: link.url,
                    active: false // Don't activate tabs to avoid flickering
                });
                
                // Immediately inject extension hiding script into new tab
                setTimeout(() => {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            // Set up aggressive extension hiding
                            const hideExtensionElements = () => {
                                const extensionSelectors = [
                                    '#bloomberg-processor-controls',
                                    '[id*="processor"]',
                                    '[class*="processor"]',
                                    '[id*="bloomberg-extension"]',
                                    '[class*="bloomberg-extension"]',
                                    '[id*="universal-news"]',
                                    '[class*="universal-news"]',
                                    '.extension-control-panel',
                                    '.news-processor-controls'
                                ];
                                
                                extensionSelectors.forEach(selector => {
                                    const elements = document.querySelectorAll(selector);
                                    elements.forEach(element => {
                                        element.style.display = 'none !important';
                                        element.style.visibility = 'hidden !important';
                                        element.style.opacity = '0 !important';
                                        element.style.position = 'absolute !important';
                                        element.style.left = '-9999px !important';
                                        element.style.top = '-9999px !important';
                                        element.style.zIndex = '-9999 !important';
                                    });
                                });
                            };
                            
                            // Hide immediately
                            hideExtensionElements();
                            
                            // Set up mutation observer to hide any new extension elements
                            const observer = new MutationObserver(() => {
                                hideExtensionElements();
                            });
                            
                            observer.observe(document.body, {
                                childList: true,
                                subtree: true
                            });
                            
                            // Also hide on DOM ready
                            if (document.readyState === 'loading') {
                                document.addEventListener('DOMContentLoaded', hideExtensionElements);
                            }
                            
                            console.log('🚫 Extension hiding script injected - UI will be hidden aggressively');
                        }
                    }).catch(() => {
                        // Tab might not be ready yet, will be handled by the load listener
                    });
                }, 100);
                
                batchTabs.push({ tab, link, index: linkIndex });
                console.log(`📂 Opened tab ${linkIndex + 1}: ${this.truncateUrl(link.url)}`);
                
            } catch (error) {
                console.error(`❌ Failed to open link ${linkIndex + 1}:`, error);
            }
        }
        
        // Add tabs to automation queue after they load
        console.log(`⏳ Adding ${batchTabs.length} tabs to automation queue...`);
        
        for (const { tab, link, index } of batchTabs) {
            this.queueTabForAutomation(tab, link, index);
        }
        
        // Start processing queue if not already started
        if (!this.isProcessingQueue) {
            this.processAutomationQueue();
        }
        
        // Move to next batch after delay
        this.currentIndex += currentBatchSize;
        
        setTimeout(() => {
            console.log(`⏱️  Batch delay completed, starting next batch...`);
            this.processBatch();
        }, this.batchDelay);
    }
    
    // Queue a tab for automation (wait for it to load first)
    async queueTabForAutomation(tab, link, index) {
        // Wait for tab to load before adding to queue
        const checkTabLoaded = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(checkTabLoaded);
                
                // Hide extension UI immediately when tab loads
                console.log(`🙈 Hiding extension UI immediately for tab ${tabId}`);
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: () => {
                        // Hide all extension elements immediately
                        const extensionSelectors = [
                            '#bloomberg-processor-controls',
                            '[id*="processor"]',
                            '[class*="processor"]',
                            '[id*="bloomberg-extension"]',
                            '[class*="bloomberg-extension"]',
                            '[id*="universal-news"]',
                            '[class*="universal-news"]',
                            '.extension-control-panel',
                            '.news-processor-controls'
                        ];
                        
                        extensionSelectors.forEach(selector => {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(element => {
                                element.style.display = 'none !important';
                                element.style.visibility = 'hidden !important';
                                element.style.opacity = '0 !important';
                                element.style.position = 'absolute !important';
                                element.style.left = '-9999px !important';
                                element.style.top = '-9999px !important';
                                element.style.zIndex = '-9999 !important';
                            });
                        });
                        
                        console.log('✅ Extension UI hidden immediately on page load');
                    }
                }).catch(error => {
                    console.warn('Could not hide extension UI:', error);
                });
                
                // Add to automation queue
                this.automationQueue.push({
                    tab: tab,
                    link: link,
                    index: index,
                    queuedAt: Date.now()
                });
                
                console.log(`📋 Added tab ${index + 1} to automation queue (queue size: ${this.automationQueue.length})`);
                console.log(`🔧 Debug: Print method is "${this.printMethod}"`);
                
                // Trigger queue processing if needed
                if (!this.isProcessingQueue) {
                    console.log(`🚀 Starting queue processing from tab load handler`);
                    this.processAutomationQueue();
                }
            }
        };
        
        chrome.tabs.onUpdated.addListener(checkTabLoaded);
    }
    
    // Process automation queue sequentially
    async processAutomationQueue() {
        console.log(`🔍 processAutomationQueue called: isProcessingQueue=${this.isProcessingQueue}, queueLength=${this.automationQueue.length}, printMethod=${this.printMethod}`);
        
        if (this.isProcessingQueue || this.automationQueue.length === 0) {
            console.log(`⏸️ Queue processing skipped: isProcessingQueue=${this.isProcessingQueue}, queueEmpty=${this.automationQueue.length === 0}`);
            return;
        }
        
        this.isProcessingQueue = true;
        console.log(`🔄 Starting automation queue processing (${this.automationQueue.length} items)`);
        
        while (this.automationQueue.length > 0) {
            const queueItem = this.automationQueue.shift();
            const { tab, link, index } = queueItem;
            
            try {
                console.log(`🤖 Processing tab ${index + 1} from queue: ${this.truncateUrl(link.url)}`);
                console.log(`📋 Using print method: ${this.printMethod} | Queue remaining: ${this.automationQueue.length}`);
                
                // Mark link as currently processing
                const linkUrl = this.getLinkUrl(link);
                this.currentlyProcessingLink = linkUrl;
                this.linkProcessingStatus.set(linkUrl, {
                    status: 'processing',
                    tabId: tab.id,
                    index: index,
                    startTime: Date.now(),
                    filename: null
                });
                
                // Generate filename
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0];
                const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
                const pageTitle = link.url.split('/').pop() || 'article';
                const filename = `bloomberg_${dateStr}_${timeStr}_${pageTitle}.pdf`;
                
                // Process this tab with automation service
                const result = await this.generateAndSavePDFWithIndex({
                    filename: filename,
                    saveFolder: this.saveSettings.saveFolder,
                    url: link.url,
                    linkIndex: index
                }, tab);
                
                if (result && result.success) {
                    console.log(`✅ Queue item ${index + 1} processed: ${filename} using ${result.method}`);
                    
                    // Update processing status to success
                    const linkUrl = this.getLinkUrl(link);
                    this.linkProcessingStatus.set(linkUrl, {
                        status: 'completed',
                        tabId: tab.id,
                        index: index,
                        startTime: this.linkProcessingStatus.get(linkUrl)?.startTime || Date.now(),
                        completedTime: Date.now(),
                        filename: filename,
                        method: result.method
                    });
                    
                    // Add to processed links set
                    this.processedLinks.add(linkUrl);
                    this.currentlyProcessingLink = null;
                    
                    // Update queue progress tracking
                    this.lastQueueProgress = Date.now();
                    this.queueRecoveryAttempts = 0; // Reset recovery attempts on successful processing
                    
                    // For Python automation, we need to wait for completion before processing next item
                    if (this.printMethod === 'python') {
                        console.log(`🔄 Waiting for Python automation to complete for tab ${tab.id}...`);
                        
                        // Wait for automation to complete before processing next queue item
                        await this.waitForAutomationCompletion(tab.id, index, filename);
                        
                        // Tab will be closed by the waitForAutomationCompletion method
                    } else {
                        // For non-Python methods, close after a delay
                        const closeDelay = this.printMethod === 'simple' ? 3000 : 1000;
                        setTimeout(() => {
                            chrome.tabs.remove(tab.id).catch(() => {
                                console.log(`📝 Tab ${index + 1} closed after ${closeDelay/1000}s delay`);
                            });
                        }, closeDelay);
                    }
                } else {
                    console.warn(`⚠️ Queue item ${index + 1} failed:`, result?.error || 'Unknown error');
                    
                    // Update processing status to failed
                    const linkUrl = this.getLinkUrl(link);
                    this.linkProcessingStatus.set(linkUrl, {
                        status: 'failed',
                        tabId: tab.id,
                        index: index,
                        startTime: this.linkProcessingStatus.get(linkUrl)?.startTime || Date.now(),
                        failedTime: Date.now(),
                        error: result?.error || 'Unknown error'
                    });
                    
                    // Add to failed links set
                    this.failedLinks.add(linkUrl);
                    this.currentlyProcessingLink = null;
                    
                    // Close failed tabs quickly
                    setTimeout(() => {
                        chrome.tabs.remove(tab.id).catch(() => {});
                    }, 1000);
                }
                
                // Add delay between queue items to prevent overwhelming the automation service
                if (this.automationQueue.length > 0) {
                    const queueDelay = this.printMethod === 'python' ? 2000 : 1000;
                    console.log(`⏱️  Waiting ${queueDelay/1000}s before next queue item...`);
                    await new Promise(resolve => setTimeout(resolve, queueDelay));
                }
                
            } catch (error) {
                console.error(`❌ Queue processing failed for tab ${index + 1}:`, error);
                
                // Update processing status to failed
                const linkUrl = this.getLinkUrl(link);
                this.linkProcessingStatus.set(linkUrl, {
                    status: 'failed',
                    tabId: tab.id,
                    index: index,
                    startTime: this.linkProcessingStatus.get(linkUrl)?.startTime || Date.now(),
                    failedTime: Date.now(),
                    error: error.message
                });
                
                // Add to failed links set
                this.failedLinks.add(linkUrl);
                this.currentlyProcessingLink = null;
                
                // Still close the tab
                chrome.tabs.remove(tab.id).catch(() => {});
            }
        }
        
        console.log(`✅ Automation queue processing completed`);
        this.isProcessingQueue = false;
        
        // Clear batch processing flag when queue is empty
        if (this.automationQueue.length === 0) {
            chrome.storage.local.set({ batchProcessingActive: false });
        }
    }
    
    // Pause processing
    pauseProcessing() {
        this.isProcessing = false;
        this.isProcessingQueue = false;
        this.isPaused = true;
        this.currentlyProcessingLink = null;
        
        console.log('⏸️ Processing paused');
    }
    
    
    // Reset all processing state
    resetProcessing() {
        this.stopProcessing();
        this.isPaused = false;
        this.processedLinks.clear();
        this.failedLinks.clear();
        this.linkProcessingStatus.clear();
        this.currentlyProcessingLink = null;
        this.automationQueue = [];
        this.isProcessingQueue = false;
        
        console.log('🔄 Processing state reset');
    }
    
    // Get current processing status
    getProcessingStatus() {
        const totalLinks = this.links.length;
        const processedCount = this.processedLinks.size;
        const failedCount = this.failedLinks.size;
        const unprocessedCount = totalLinks - processedCount - failedCount;
        
        return {
            isProcessing: this.isProcessing,
            isPaused: this.isPaused,
            currentlyProcessingLink: this.currentlyProcessingLink,
            totalLinks: totalLinks,
            processedCount: processedCount,
            failedCount: failedCount,
            unprocessedCount: unprocessedCount,
            queueLength: this.automationQueue.length,
            processedLinks: Array.from(this.processedLinks),
            failedLinks: Array.from(this.failedLinks),
            linkProcessingStatus: Object.fromEntries(this.linkProcessingStatus)
        };
    }
    
    // Get unprocessed links
    getUnprocessedLinks() {
        const allLinks = this.links.map(link => this.getLinkUrl(link));
        const unprocessed = allLinks.filter(url => 
            !this.processedLinks.has(url) && !this.failedLinks.has(url)
        );
        
        return unprocessed;
    }
    
    // Wait for automation completion (returns a Promise) - Enhanced with better error handling
    async waitForAutomationCompletion(tabId, linkIndex, filename) {
        return new Promise((resolve, reject) => {
            const maxPolls = 90; // Extended to 90 seconds for complex pages
            const pollInterval = 1000; // 1 second intervals
            const maxRetries = 5; // Max retries for network errors
            let pollCount = 0;
            let consecutiveErrors = 0;
            
            console.log(`🔄 Starting enhanced completion wait for tab ${tabId}, link ${linkIndex}`);
            
            const poll = async () => {
                try {
                    pollCount++;
                    
                    if (pollCount > maxPolls) {
                        console.warn(`⏰ Wait timeout for tab ${tabId}, link ${linkIndex} after ${maxPolls}s`);
                        
                        // Try to trigger service recovery before giving up
                        try {
                            await this.triggerServiceRecovery('polling_timeout');
                            console.log('🔧 Service recovery triggered due to polling timeout');
                        } catch (recoveryError) {
                            console.warn('⚠️ Service recovery failed:', recoveryError);
                        }
                        
                        // Close tab on timeout
                        try {
                            await chrome.tabs.remove(tabId);
                        } catch (e) {}
                        reject(new Error(`Automation timeout after ${maxPolls} seconds`));
                        return;
                    }
                    
                    // Check service health before polling
                    if (consecutiveErrors > 2) {
                        console.log('🔍 Checking service health due to consecutive errors...');
                        try {
                            const healthResponse = await fetch('http://localhost:8888/health');
                            if (!healthResponse.ok) {
                                throw new Error('Service health check failed');
                            }
                            const health = await healthResponse.json();
                            if (health.status === 'critical') {
                                console.warn('⚠️ Service in critical state, triggering recovery');
                                await this.triggerServiceRecovery('critical_during_polling');
                                // Reset error count after recovery attempt
                                consecutiveErrors = 0;
                            }
                        } catch (healthError) {
                            console.warn('⚠️ Health check failed:', healthError);
                        }
                    }
                    
                    const response = await fetch(`http://localhost:8888/check_completion?tab_id=${tabId}&link_index=${linkIndex}`, {
                        method: 'GET',
                        headers: {
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        }
                    });
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const result = await response.json();
                    
                    // Reset consecutive errors on successful response
                    consecutiveErrors = 0;
                    
                    if (result.completed) {
                        console.log(`✅ Automation completed for tab ${tabId}: ${result.message}`);
                        console.log(`📊 Completion details:`, result);
                        
                        // Update queue progress
                        this.lastQueueProgress = Date.now();
                        
                        // Close the tab
                        try {
                            await chrome.tabs.remove(tabId);
                            console.log(`📝 Tab ${tabId} closed after automation completion`);
                        } catch (error) {
                            console.warn(`⚠️ Could not close tab ${tabId}:`, error);
                        }
                        
                        resolve({
                            ...result,
                            pollCount,
                            duration: result.duration || 0
                        });
                        return;
                    }
                    
                    if (!result.automation_running && !result.has_completion) {
                        console.warn(`⚠️ No automation running and no completion for tab ${tabId}, link ${linkIndex}`);
                        
                        // Check if this might be a service restart situation
                        if (pollCount < 10) {
                            console.log('🔄 Early in polling, might be service restart - continuing...');
                            setTimeout(poll, pollInterval * 2); // Double interval for early polls
                            return;
                        }
                        
                        // Close tab and reject
                        try {
                            await chrome.tabs.remove(tabId);
                        } catch (e) {}
                        reject(new Error('No automation found - service may have restarted'));
                        return;
                    }
                    
                    // Continue polling with dynamic interval
                    const dynamicInterval = pollCount > 30 ? pollInterval * 2 : pollInterval; // Slower polling after 30 seconds
                    console.log(`🔄 Wait ${pollCount}/${maxPolls}: Automation still running... (next check in ${dynamicInterval/1000}s)`);
                    setTimeout(poll, dynamicInterval);
                    
                } catch (error) {
                    consecutiveErrors++;
                    console.error(`❌ Wait polling error for tab ${tabId} (attempt ${pollCount}, error ${consecutiveErrors}):`, error);
                    
                    // Exponential backoff for retries
                    const retryDelay = Math.min(pollInterval * Math.pow(2, consecutiveErrors - 1), 10000);
                    
                    // Retry with exponential backoff if not too many consecutive errors
                    if (consecutiveErrors <= maxRetries && pollCount <= maxPolls) {
                        console.log(`🔄 Retrying in ${retryDelay/1000}s... (consecutive errors: ${consecutiveErrors}/${maxRetries})`);
                        setTimeout(poll, retryDelay);
                    } else {
                        console.error(`❌ Giving up wait for tab ${tabId} after ${consecutiveErrors} consecutive errors`);
                        
                        // Try one last service recovery
                        try {
                            await this.triggerServiceRecovery('polling_failure');
                        } catch (recoveryError) {
                            console.warn('⚠️ Final recovery attempt failed:', recoveryError);
                        }
                        
                        // Close tab and reject
                        try {
                            await chrome.tabs.remove(tabId);
                        } catch (e) {}
                        reject(new Error(`Polling failed after ${consecutiveErrors} consecutive errors: ${error.message}`));
                    }
                }
            };
            
            // Start polling after a brief delay
            setTimeout(poll, 1000);
        });
    }
    
    // Utility method
    truncateUrl(url) {
        return url.length > 50 ? url.substring(0, 50) + '...' : url;
    }

    // Setup tab lifecycle listeners
    setupTabListeners() {
        // Listen for tab updates (page loads, navigation)
        this.tabUpdatedListener = (tabId, changeInfo, tab) => {
            if (this.currentTab && tabId === this.currentTab.id) {
                if (changeInfo.status === 'complete' && tab.url) {
                    console.log('📄 Current tab updated:', tab.url);
                    
                    // Check if still on a supported news site
                    try {
                        const tabHostname = new URL(tab.url).hostname;
                        const isSupported = this.siteConfig ? this.siteConfig.isSupported(tabHostname) : false;
                        if (!isSupported) {
                            const siteName = this.siteConfig ? this.siteConfig.getSiteName(tabHostname) : tabHostname;
                            console.warn(`⚠️ User navigated away from supported site to: ${siteName}`);
                        }
                    } catch (urlError) {
                        console.warn('Could not parse tab URL:', tab.url);
                    }
                }
            }
        };
        
        // Listen for tab removal
        this.tabClosedListener = (tabId) => {
            if (this.currentTab && tabId === this.currentTab.id) {
                console.log('❌ Current tab was closed');
                this.currentTab = null;
                
                // If processing, try to continue with new tab
                if (this.isProcessing && this.currentIndex < this.links.length) {
                    console.log('🔄 Continuing processing in new tab');
                    setTimeout(() => {
                        const currentLink = this.links[this.currentIndex];
                        this.openLink(currentLink, this.currentIndex);
                    }, 1000);
                }
            }
        };
        
        chrome.tabs.onUpdated.addListener(this.tabUpdatedListener);
        chrome.tabs.onRemoved.addListener(this.tabClosedListener);
    }

    // Cleanup tab listeners
    cleanupTabListeners() {
        if (this.tabUpdatedListener) {
            chrome.tabs.onUpdated.removeListener(this.tabUpdatedListener);
            this.tabUpdatedListener = null;
        }
        if (this.tabClosedListener) {
            chrome.tabs.onRemoved.removeListener(this.tabClosedListener);
            this.tabClosedListener = null;
        }
    }

    // Check if user is authenticated on current news site
    async checkAuthentication() {
        try {
            // Check authentication for current tab
            if (this.currentTab && this.currentTab.url) {
                const tabHostname = new URL(this.currentTab.url).hostname;
                await this.checkSiteAuthentication(tabHostname);
            } else {
                // Default to checking Bloomberg as fallback
                await this.checkSiteAuthentication('bloomberg.com');
            }
        } catch (error) {
            console.warn('Could not check authentication status:', error);
            this.isAuthenticated = false;
        }
    }

    // Check authentication for specific site
    async checkSiteAuthentication(hostname) {
        try {
            const domain = '.' + hostname.replace(/^www\./, '');
            const cookies = await chrome.cookies.getAll({ domain });
            
            // Look for session cookies that indicate authentication
            this.isAuthenticated = cookies.some(cookie => 
                cookie.name.toLowerCase().includes('session') ||
                cookie.name.toLowerCase().includes('auth') ||
                cookie.name.toLowerCase().includes('login') ||
                cookie.name.toLowerCase().includes('user') ||
                cookie.name.toLowerCase().includes('token')
            );
            
            const siteName = this.siteConfig ? this.siteConfig.getSiteName(hostname) : hostname;
            console.log(`🔐 ${siteName} authentication status:`, this.isAuthenticated);
        } catch (error) {
            console.warn(`Could not check authentication for ${hostname}:`, error);
            this.isAuthenticated = false;
        }
    }

    // Detect authentication status from tab content
    async detectAuthentication(tab) {
        if (!tab || !tab.url) {
            return;
        }

        // Check if this is a supported news site
        let hostname;
        try {
            hostname = new URL(tab.url).hostname;
            const isSupported = this.siteConfig ? this.siteConfig.isSupported(hostname) : false;
            if (!isSupported) {
                return;
            }
        } catch (urlError) {
            console.warn('Could not parse URL for authentication detection:', tab.url);
            return;
        }

        try {
            // Get site-specific configuration
            const siteConfig = this.siteConfig ? this.siteConfig.getConfig(hostname) : null;
            
            // Inject script to check for authentication indicators
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (config) => {
                    // Use site-specific authentication indicators
                    const authSelectors = config?.authIndicators || [
                        '.user-menu',
                        '.profile-menu',
                        '.account-menu',
                        '[class*="profile"]',
                        '[class*="account"]',
                        '[class*="user"]'
                    ];
                    
                    const paywallSelectors = config?.paywall?.selectors || [
                        '.paywall',
                        '.subscription-required',
                        '.premium-content'
                    ];
                    
                    // Check for authentication indicators
                    const indicators = authSelectors.map(selector => 
                        document.querySelector(selector)
                    );
                    
                    const isLoggedIn = indicators.some(el => el !== null);
                    const hasPaywallBlock = paywallSelectors.some(selector => 
                        document.querySelector(selector) !== null
                    );
                    
                    return {
                        isLoggedIn,
                        hasPaywallBlock,
                        title: document.title,
                        url: window.location.href,
                        siteName: config?.name || 'Unknown Site'
                    };
                },
                args: [siteConfig]
            });

            if (results && results[0] && results[0].result) {
                const authInfo = results[0].result;
                this.isAuthenticated = authInfo.isLoggedIn && !authInfo.hasPaywallBlock;
                
                if (authInfo.hasPaywallBlock) {
                    console.warn(`⚠️ Paywall detected on ${authInfo.siteName} - user may not be authenticated`);
                }
                
                console.log(`🔐 ${authInfo.siteName} authentication detected:`, this.isAuthenticated);
            }
        } catch (error) {
            console.warn('Could not detect authentication:', error);
        }
    }

    // Create save folder if it doesn't exist
    async createSaveFolder() {
        try {
            const fullPath = `${this.saveSettings.basePath}/${this.saveSettings.saveFolder}`;
            console.log('📁 Ensuring save folder exists:', fullPath);
            
            // Note: Chrome extensions can't directly create filesystem folders
            // This will be handled by the PDF download process
            return { success: true, path: fullPath };
        } catch (error) {
            console.error('Error creating save folder:', error);
            return { success: false, error: error.message };
        }
    }

    // Generate PDF and save to specified folder using multiple methods (with specific index)
    async generateAndSavePDFWithIndex(message, tab) {
        const { linkIndex } = message;
        
        console.log(`🔧 generateAndSavePDFWithIndex called: printMethod=${this.printMethod}, linkIndex=${linkIndex}, tabId=${tab.id}`);
        
        // For Python automation in batch mode, use the specific index
        if (this.printMethod === 'python') {
            console.log(`🐍 Using Python Automation method for tab ${tab.id} with index ${linkIndex}...`);
            return await this.executePythonAutomationOnTabWithIndex(tab, message.filename, message.saveFolder, linkIndex);
        }
        
        console.log(`🔄 Using regular generateAndSavePDF for print method: ${this.printMethod}`);
        // For other methods, use the regular generateAndSavePDF
        return await this.generateAndSavePDF(message, tab);
    }

    // Generate PDF and save to specified folder using multiple methods
    async generateAndSavePDF(message, tab) {
        try {
            const { filename, saveFolder, url } = message;
            
            console.log('🖨️ Starting PDF generation:', filename);
            console.log('📁 Target folder:', saveFolder);
            console.log('📋 Print method:', this.printMethod);

            // Check user's print method preference
            if (this.printMethod === 'simple') {
                // Use Simple Automation method for batch processing
                console.log('🤖 Using Simple Automation method for batch tab...');
                return await this.executeSimpleAutomationOnTab(tab, filename, saveFolder);
            } else if (this.printMethod === 'python') {
                // Use Python Automation method for batch processing
                console.log('🐍 Using Python Automation method for batch tab...');
                return await this.executePythonAutomationOnTab(tab, filename, saveFolder);
            }

            // For 'current' method, use the advanced PDF generators
            // NEW: Try using the AutoPDFGenerator class first (FULLY AUTOMATED - NO USER INTERACTION)
            if (this.pdfGenerator) {
                try {
                    console.log('🤖 Using advanced PDF Generator (Zero User Interaction)...');
                    const pdfResult = await this.pdfGenerator.generatePDF(tab, filename, saveFolder);
                    
                    if (pdfResult && pdfResult.success) {
                        console.log('🎉 Advanced PDF Generator method successful!');
                        console.log('📋 Method used:', pdfResult.method);
                        return pdfResult;
                    }
                } catch (pdfGenError) {
                    console.warn('Advanced PDF Generator failed, trying fallback methods:', pdfGenError);
                }
            } else {
                console.warn('⚠️ PDF Generator not initialized, using fallback methods');
            }

            // FALLBACK METHOD: Direct content capture and auto-download (bypasses ALL dialogs)
            console.log('🚀 Using fallback auto-download method...');
            
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (fname, folder) => {
                    try {
                        console.log('📄 Starting direct content capture...');
                        
                        // Hide ALL extension elements completely
                        console.log('🙈 Hiding extension UI elements for clean PDF...');
                        const extensionSelectors = [
                            '#bloomberg-processor-controls',
                            '[id*="processor"]',
                            '[class*="processor"]',
                            '[id*="bloomberg-extension"]',
                            '[class*="bloomberg-extension"]',
                            '[id*="universal-news"]',
                            '[class*="universal-news"]',
                            '.extension-control-panel',
                            '.news-processor-controls'
                        ];
                        
                        extensionSelectors.forEach(selector => {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(element => {
                                element.style.display = 'none !important';
                                element.style.visibility = 'hidden !important';
                                element.style.opacity = '0 !important';
                                element.style.position = 'absolute !important';
                                element.style.left = '-9999px !important';
                                element.style.top = '-9999px !important';
                                element.style.zIndex = '-9999 !important';
                                element.remove(); // Completely remove from DOM
                            });
                        });
                        console.log('✅ Extension UI elements hidden and removed for PDF');

                        // Clean up the page content
                        const cleanHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${document.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: white;
        }
        img { max-width: 100%; height: auto; }
        h1, h2, h3 { color: #2c3e50; }
        p { margin-bottom: 1em; }
        a { color: #3498db; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .article-content, .story-body, main, article {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
        }
        @media print {
            body { margin: 0; padding: 15mm; }
            * { -webkit-print-color-adjust: exact !important; }
        }
    </style>
</head>
<body>
    <h1>${document.title}</h1>
    <div class="article-content">
        ${document.body.innerHTML
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<!--.*?-->/g, '')
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
        }
    </div>
    <p><em>Saved on: ${new Date().toLocaleString()}</em></p>
</body>
</html>`;

                        // Create blob and trigger automatic download using simple link method
                        const blob = new Blob([cleanHTML], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        
                        // Create download link and click it with clear naming pattern
                        const downloadLink = document.createElement('a');
                        downloadLink.href = url;
                        
                        // Determine site name for file naming
                        const hostname = window.location.hostname.replace(/^www\./, '');
                        const siteName = hostname.split('.')[0]; // e.g., 'bloomberg', 'wsj', 'cnbc'
                        
                        // Use site-specific naming pattern for auto-organizer detection
                        downloadLink.download = `${siteName}_${folder}_${fname.replace('.pdf', '.html')}`;
                        downloadLink.style.display = 'none';
                        downloadLink.style.position = 'absolute';
                        downloadLink.style.left = '-9999px';
                        
                        document.body.appendChild(downloadLink);
                        downloadLink.click();
                        document.body.removeChild(downloadLink);
                        
                        // Clean up blob URL
                        setTimeout(() => URL.revokeObjectURL(url), 2000);
                        
                        console.log('✅ Auto-download triggered for:', fname);
                        console.log('📁 File will be saved to Downloads folder');
                        return {
                            success: true,
                            method: 'auto-download',
                            filename: `${siteName}_${folder}_${fname.replace('.pdf', '.html')}`,
                            savePath: 'Downloads/',
                            message: `File saved to Downloads - Auto-organizer will move to Desktop/scrapedatapdf/${folder}/`
                        };
                    } catch (error) {
                        console.error('❌ Content script error:', error);
                        return {
                            success: false,
                            error: error.message || 'Content script failed'
                        };
                    }
                },
                args: [filename, saveFolder]
            });

            // Check the result structure from chrome.scripting.executeScript
            console.log('🔍 Checking script execution result:', result);
            
            if (result && result[0]) {
                const scriptResult = result[0].result;
                console.log('📋 Script result:', scriptResult);
                
                if (scriptResult && scriptResult.success) {
                    console.log('🎉 COMPLETELY AUTOMATIC download successful!');
                    
                    // Update activity timestamp for daemon monitoring
                    chrome.storage.local.set({
                        lastActivity: Date.now(),
                        lastFile: scriptResult.filename
                    });
                    
                    return scriptResult; // Return the successful result
                }
                
                if (scriptResult && scriptResult.error) {
                    console.error('❌ Content script reported error:', scriptResult.error);
                    throw new Error(`Content script error: ${scriptResult.error}`);
                }
            }

            // Only use fallback if primary method truly failed
            console.log('⚠️ Primary method failed, using fallback print method...');
            
            const fallbackResult = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (fname, folder) => {
                    try {
                        // Hide extension UI completely
                        const controlPanel = document.querySelector('#bloomberg-processor-controls');
                        if (controlPanel) {
                            controlPanel.remove();
                        }
                        
                        // Add print-optimized styles
                        const style = document.createElement('style');
                        style.innerHTML = `
                            @media print {
                                * { -webkit-print-color-adjust: exact !important; }
                                body { margin: 0 !important; padding: 15mm !important; }
                                .no-print { display: none !important; }
                            }
                        `;
                        document.head.appendChild(style);
                        
                        // Trigger print dialog (user will need to save manually)
                        setTimeout(() => {
                            window.print();
                        }, 500);
                        
                        return {
                            success: true,
                            method: 'fallback-print',
                            filename: fname,
                            message: 'Print dialog opened - please save as PDF manually'
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error.message || 'Fallback method failed'
                        };
                    }
                },
                args: [filename, saveFolder]
            });

            if (fallbackResult && fallbackResult[0] && fallbackResult[0].success) {
                console.log('✅ Fallback print method successful');
                return fallbackResult[0];
            }

            throw new Error('All PDF generation methods failed');

        } catch (error) {
            console.error('❌ PDF generation failed:', error);
            return { success: false, error: `PDF generation failed: ${error.message}` };
        }
    }

    // Execute Simple Automation method on a specific tab
    async executeSimpleAutomationOnTab(tab, filename, saveFolder) {
        try {
            console.log(`🤖 Executing Simple Automation on tab: ${tab.id}`);
            
            // Focus the tab first
            await chrome.tabs.update(tab.id, { active: true });
            
            // Wait a moment for tab to become active
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Execute the simple automation script
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: async (fname, folder) => {
                    try {
                        console.log('🤖 Starting Simple Automation in content script...');
                        
                        // Get timing preferences
                        const getTimingPreferences = async () => {
                            try {
                                const result = await new Promise(resolve => {
                                    chrome.storage.local.get(['pageLoadWait', 'printDialogWait', 'saveDialogWait'], resolve);
                                });
                                return {
                                    pageLoadWait: parseInt(result.pageLoadWait) || 2000,
                                    printDialogWait: parseInt(result.printDialogWait) || 2000,
                                    saveDialogWait: parseInt(result.saveDialogWait) || 1500
                                };
                            } catch (error) {
                                return { pageLoadWait: 2000, printDialogWait: 2000, saveDialogWait: 1500 };
                            }
                        };
                        
                        const timingPrefs = await getTimingPreferences();
                        console.log('⏱️ Using timing preferences:', timingPrefs);
                        
                        // Hide all extension UI elements for clean PDF
                        console.log('🙈 Hiding extension UI elements for clean PDF...');
                        const extensionSelectors = [
                            '#bloomberg-processor-controls',
                            '[id*="processor"]',
                            '[class*="processor"]',
                            '[id*="bloomberg-extension"]',
                            '[class*="bloomberg-extension"]',
                            '[id*="universal-news"]',
                            '[class*="universal-news"]',
                            '.extension-control-panel',
                            '.news-processor-controls'
                        ];
                        
                        extensionSelectors.forEach(selector => {
                            const elements = document.querySelectorAll(selector);
                            elements.forEach(element => {
                                element.style.display = 'none !important';
                                element.style.visibility = 'hidden !important';
                                element.style.opacity = '0 !important';
                                element.style.position = 'absolute !important';
                                element.style.left = '-9999px !important';
                                element.style.top = '-9999px !important';
                                element.style.zIndex = '-9999 !important';
                            });
                        });
                        console.log('✅ Extension UI elements hidden for printing');
                        
                        // Wait for page to be ready
                        console.log(`⏳ Waiting ${timingPrefs.pageLoadWait/1000}s for page to be ready...`);
                        await new Promise(resolve => setTimeout(resolve, timingPrefs.pageLoadWait));
                        
                        // Add print-optimized styles
                        const printStyles = document.createElement('style');
                        printStyles.id = 'batch-automation-print-styles';
                        printStyles.innerHTML = `
                            @media print {
                                * { 
                                    -webkit-print-color-adjust: exact !important;
                                    color-adjust: exact !important;
                                }
                                body { 
                                    margin: 0 !important; 
                                    padding: 15mm !important; 
                                    font-size: 12pt !important;
                                    line-height: 1.5 !important;
                                }
                                .no-print, 
                                nav, 
                                header, 
                                footer, 
                                .advertisement, 
                                .social-share,
                                .newsletter-signup,
                                [class*="ad-"],
                                [id*="ad-"] { 
                                    display: none !important; 
                                }
                                img { 
                                    max-width: 100% !important; 
                                    height: auto !important; 
                                }
                                a {
                                    color: inherit !important;
                                    text-decoration: none !important;
                                }
                            }
                        `;
                        document.head.appendChild(printStyles);
                        
                        console.log('🖨️ Opening print dialog with window.print()...');
                        
                        // Use window.print() - this actually works!
                        window.print();
                        
                        // Clean up styles after a delay
                        setTimeout(() => {
                            const stylesEl = document.getElementById('batch-automation-print-styles');
                            if (stylesEl) {
                                stylesEl.remove();
                            }
                        }, 2000);
                        
                        // Restore extension UI
                        if (extensionUI) {
                            extensionUI.style.display = 'block';
                        }
                        
                        return {
                            success: true,
                            method: 'simple-automation-batch',
                            filename: fname,
                            message: `Simple automation completed in batch mode`
                        };
                        
                    } catch (error) {
                        console.error('❌ Simple automation script error:', error);
                        return {
                            success: false,
                            method: 'simple-automation-batch',
                            error: error.message
                        };
                    }
                },
                args: [filename, saveFolder]
            });
            
            if (result && result[0] && result[0].result) {
                const scriptResult = result[0].result;
                if (scriptResult.success) {
                    console.log('✅ Simple Automation successful on batch tab');
                    return scriptResult;
                } else {
                    throw new Error(scriptResult.error || 'Simple automation script failed');
                }
            }
            
            throw new Error('Simple automation script execution failed');
            
        } catch (error) {
            console.error('❌ Simple Automation failed on tab:', error);
            return {
                success: false,
                method: 'simple-automation-batch',
                error: `Simple automation failed: ${error.message}`
            };
        }
    }

    // Execute Python Automation method on a specific tab
    // Version with specific index for batch processing
    async executePythonAutomationOnTabWithIndex(tab, filename, saveFolder, linkIndex) {
        try {
            console.log(`🐍 Executing Python Automation on tab: ${tab.id} with index: ${linkIndex}`);
            
            // Use the provided link index instead of this.currentIndex
            const currentIndex = linkIndex;
            
            // Check if automation is already tracked for this link (prevent duplicates)
            const canTrack = await this.trackAutomationForLink(currentIndex, tab.id);
            if (!canTrack) {
                console.warn(`⚠️ Automation already in progress for link ${currentIndex}, skipping`);
                return {
                    success: false,
                    method: 'python-automation-batch',
                    error: 'Automation already in progress for this link'
                };
            }
            
            // Focus the tab first
            await chrome.tabs.update(tab.id, { active: true });
            
            // Wait a moment for tab to become active
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Get timing preferences
            const timingResult = await chrome.storage.local.get(['pageLoadWait', 'printDialogWait', 'saveDialogWait']);
            const timingPrefs = {
                pageLoadWait: parseInt(timingResult.pageLoadWait) || 2000,
                printDialogWait: parseInt(timingResult.printDialogWait) || 2000,
                saveDialogWait: parseInt(timingResult.saveDialogWait) || 1500
            };
            
            console.log('⏱️ Using timing preferences:', timingPrefs);
            
            // Wait for page to be ready
            console.log(`⏳ Waiting ${timingPrefs.pageLoadWait/1000}s for page to be ready...`);
            await new Promise(resolve => setTimeout(resolve, timingPrefs.pageLoadWait));
            
            // Hide extension UI elements before printing
            console.log('🙈 Hiding extension UI elements for clean PDF...');
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Hide all extension elements
                    const extensionSelectors = [
                        '#bloomberg-processor-controls',
                        '[id*="processor"]',
                        '[class*="processor"]',
                        '[id*="bloomberg-extension"]',
                        '[class*="bloomberg-extension"]',
                        '[id*="universal-news"]',
                        '[class*="universal-news"]',
                        '.extension-control-panel',
                        '.news-processor-controls'
                    ];
                    
                    extensionSelectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(element => {
                            element.style.display = 'none !important';
                            element.style.visibility = 'hidden !important';
                            element.style.opacity = '0 !important';
                            element.style.position = 'absolute !important';
                            element.style.left = '-9999px !important';
                            element.style.top = '-9999px !important';
                            element.style.zIndex = '-9999 !important';
                        });
                    });
                    
                    console.log('✅ Extension UI elements hidden for printing');
                }
            });
            
            // Small delay to ensure elements are hidden
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Check if automation service is busy
            console.log('🔍 Checking automation service status...');
            const statusResponse = await fetch('http://localhost:8888/status');
            if (statusResponse.ok) {
                const status = await statusResponse.json();
                if (status.is_automating) {
                    console.log('⏳ Automation service is busy, waiting for completion...');
                    const waitResponse = await fetch('http://localhost:8888/wait?timeout=15');
                    if (waitResponse.ok) {
                        const waitResult = await waitResponse.json();
                        if (!waitResult.automation_completed) {
                            throw new Error('Previous automation did not complete in time');
                        }
                    }
                }
            }
            
            console.log('🌐 Sending request to Python automation service...');
            
            // Call the Python automation service directly from background script
            const response = await fetch('http://localhost:8888/print', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    page_load_delay: timingPrefs.pageLoadWait / 1000, // Convert to seconds
                    print_delay: timingPrefs.printDialogWait / 1000, // Convert to seconds
                    save_delay: timingPrefs.saveDialogWait / 1000,     // Convert to seconds
                    tab_id: tab.id,
                    link_index: currentIndex,
                    filename: filename
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const serviceResult = await response.json();
            console.log('🔧 Automation service response:', serviceResult);
            
            if (serviceResult.success) {
                // Use actual automation duration if available
                const actualDuration = serviceResult.actual_duration || 
                    (serviceResult.print_delay_used + serviceResult.save_delay_used + 2);
                
                // Mark automation as completed
                this.markAutomationCompleted(currentIndex);
                
                // Don't start polling here - the queue will handle it
                
                return {
                    success: true,
                    method: 'python-automation-batch',
                    filename: filename,
                    message: `Python automation started in batch mode`,
                    automation_time: actualDuration,
                    print_delay_used: serviceResult.print_delay_used,
                    save_delay_used: serviceResult.save_delay_used,
                    wait_completed: serviceResult.wait_completed,
                    tab_id: tab.id,
                    link_index: currentIndex,
                    polling: true
                };
            } else {
                throw new Error(serviceResult.error || 'Python automation service failed');
            }
            
        } catch (error) {
            console.error('❌ Python Automation failed on tab:', error);
            return {
                success: false,
                method: 'python-automation-batch',
                error: `Python automation failed: ${error.message}`
            };
        }
    }

    async executePythonAutomationOnTab(tab, filename, saveFolder) {
        try {
            console.log(`🐍 Executing Python Automation on tab: ${tab.id}`);
            
            // Find the current link index for this tab
            const currentIndex = this.currentIndex;
            
            // Check if automation is already tracked for this link (prevent duplicates)
            const canTrack = await this.trackAutomationForLink(currentIndex, tab.id);
            if (!canTrack) {
                console.warn(`⚠️ Automation already in progress for link ${currentIndex}, skipping`);
                return {
                    success: false,
                    method: 'python-automation-batch',
                    error: 'Automation already in progress for this link'
                };
            }
            
            // Focus the tab first
            await chrome.tabs.update(tab.id, { active: true });
            
            // Wait a moment for tab to become active
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Get timing preferences
            const timingResult = await chrome.storage.local.get(['pageLoadWait', 'printDialogWait', 'saveDialogWait']);
            const timingPrefs = {
                pageLoadWait: parseInt(timingResult.pageLoadWait) || 2000,
                printDialogWait: parseInt(timingResult.printDialogWait) || 2000,
                saveDialogWait: parseInt(timingResult.saveDialogWait) || 1500
            };
            
            console.log('⏱️ Using timing preferences:', timingPrefs);
            
            // Wait for page to be ready
            console.log(`⏳ Waiting ${timingPrefs.pageLoadWait/1000}s for page to be ready...`);
            await new Promise(resolve => setTimeout(resolve, timingPrefs.pageLoadWait));
            
            // Hide extension UI elements before printing
            console.log('🙈 Hiding extension UI elements for clean PDF...');
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    // Hide all extension elements
                    const extensionSelectors = [
                        '#bloomberg-processor-controls',
                        '[id*="processor"]',
                        '[class*="processor"]',
                        '[id*="bloomberg-extension"]',
                        '[class*="bloomberg-extension"]',
                        '[id*="universal-news"]',
                        '[class*="universal-news"]',
                        '.extension-control-panel',
                        '.news-processor-controls'
                    ];
                    
                    extensionSelectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(element => {
                            element.style.display = 'none !important';
                            element.style.visibility = 'hidden !important';
                            element.style.opacity = '0 !important';
                            element.style.position = 'absolute !important';
                            element.style.left = '-9999px !important';
                            element.style.top = '-9999px !important';
                            element.style.zIndex = '-9999 !important';
                        });
                    });
                    
                    console.log('✅ Extension UI elements hidden for printing');
                }
            });
            
            // Small delay to ensure elements are hidden
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Check if automation service is busy
            console.log('🔍 Checking automation service status...');
            const statusResponse = await fetch('http://localhost:8888/status');
            if (statusResponse.ok) {
                const status = await statusResponse.json();
                if (status.is_automating) {
                    console.log('⏳ Automation service is busy, waiting for completion...');
                    const waitResponse = await fetch('http://localhost:8888/wait?timeout=15');
                    if (waitResponse.ok) {
                        const waitResult = await waitResponse.json();
                        if (!waitResult.automation_completed) {
                            throw new Error('Previous automation did not complete in time');
                        }
                    }
                }
            }
            
            console.log('🌐 Sending request to Python automation service...');
            
            // Call the Python automation service directly from background script
            const response = await fetch('http://localhost:8888/print', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    page_load_delay: timingPrefs.pageLoadWait / 1000, // Convert to seconds
                    print_delay: timingPrefs.printDialogWait / 1000, // Convert to seconds
                    save_delay: timingPrefs.saveDialogWait / 1000,     // Convert to seconds
                    tab_id: tab.id,
                    link_index: currentIndex,
                    filename: filename
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const serviceResult = await response.json();
            console.log('🔧 Automation service response:', serviceResult);
            
            if (serviceResult.success) {
                // Use actual automation duration if available
                const actualDuration = serviceResult.actual_duration || 
                    (serviceResult.print_delay_used + serviceResult.save_delay_used + 2);
                
                // Mark automation as completed
                this.markAutomationCompleted(currentIndex);
                
                // Start polling for completion instead of relying on callbacks
                this.pollForAutomationCompletion(tab.id, currentIndex, filename);
                
                return {
                    success: true,
                    method: 'python-automation-batch',
                    filename: filename,
                    message: `Python automation started in batch mode`,
                    automation_time: actualDuration,
                    print_delay_used: serviceResult.print_delay_used,
                    save_delay_used: serviceResult.save_delay_used,
                    wait_completed: serviceResult.wait_completed,
                    tab_id: tab.id,
                    link_index: currentIndex,
                    polling: true
                };
            } else {
                throw new Error(serviceResult.error || 'Python automation service failed');
            }
            
        } catch (error) {
            console.error('❌ Python Automation failed on tab:', error);
            return {
                success: false,
                method: 'python-automation-batch',
                error: `Python automation failed: ${error.message}`
            };
        }
    }

    // Convert base64 to blob
    base64ToBlob(base64, contentType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: contentType });
    }

    // Access prevention and pause mechanism methods
    
    async resumeProcessing() {
        console.log('▶️ Resuming processing...');
        
        if (!this.isPaused) {
            console.log('⚠️ Processing is not paused - nothing to resume');
            return;
        }
        
        this.isPaused = false;
        this.pauseReason = null;
        this.isProcessing = true;
        
        // Resume queue processing if there are items in the automation queue
        if (this.automationQueue.length > 0 && !this.isProcessingQueue) {
            console.log(`🔄 Resuming automation queue with ${this.automationQueue.length} items`);
            this.processAutomationQueue();
            await this.savePausedState();
            return;
        }
        
        // Resume sequential processing automatically
        if (this.currentIndex < this.links.length) {
            // Skip blocked links
            while (this.currentIndex < this.links.length && 
                   this.blockedLinks.some(bl => bl.index === this.currentIndex)) {
                this.currentIndex++;
            }
            
            if (this.currentIndex < this.links.length) {
                const currentLink = this.links[this.currentIndex];
                console.log(`✅ Resuming sequential processing from link ${this.currentIndex + 1}: ${this.getLinkUrl(currentLink)}`);
                
                // Keep processing = true and restart the sequential automation
                this.isProcessing = true;
                
                // Open the current link and continue processing
                await this.openLink(currentLink, this.currentIndex);
                
                // Start auto-print cycle if enabled
                if (this.sequentialOptions?.useAutoPrint) {
                    const pageLoadWait = this.sequentialOptions?.customDelays?.pageLoadWait || 3000;
                    setTimeout(() => {
                        this.executeSequentialAutoPrint();
                    }, pageLoadWait);
                }
            } else {
                console.log('✅ No more unprocessed links available');
                this.isProcessing = false;
            }
        } else {
            console.log('✅ All links processed - nothing to resume');
            this.isProcessing = false;
        }
        
        await this.savePausedState();
    }
    
    updateUnprocessedLinks() {
        this.unprocessedLinks = [];
        
        for (let i = this.currentIndex; i < this.links.length; i++) {
            const isBlocked = this.blockedLinks.some(bl => bl.index === i);
            if (!isBlocked) {
                this.unprocessedLinks.push({
                    url: this.links[i],
                    index: i,
                    originalIndex: i
                });
            }
        }
        
        console.log(`📊 Updated unprocessed links: ${this.unprocessedLinks.length} remaining`);
    }
    
    exportUnprocessedLinksAsText() {
        const allUnprocessed = [...this.unprocessedLinks];
        
        // Add blocked links that need user intervention
        const blockedNeedingIntervention = this.blockedLinks.filter(bl => bl.needsUserIntervention);
        allUnprocessed.push(...blockedNeedingIntervention.map(bl => ({
            url: bl.url,
            index: bl.index,
            originalIndex: bl.index,
            blocked: true,
            blockageType: bl.blockageType,
            blockageMessage: bl.blockageMessage
        })));
        
        // Sort by original index
        allUnprocessed.sort((a, b) => a.originalIndex - b.originalIndex);
        
        let exportText = '# Unprocessed Links\n\n';
        exportText += `Generated on: ${new Date().toLocaleString()}\n`;
        exportText += `Total unprocessed: ${allUnprocessed.length}\n\n`;
        
        if (this.blockedLinks.length > 0) {
            exportText += `## Blocked Links (${this.blockedLinks.length})\n`;
            exportText += 'These links were blocked and need user intervention:\n\n';
            
            for (const link of this.blockedLinks) {
                exportText += `${link.index + 1}. ${link.url}\n`;
                exportText += `   - Block type: ${link.blockageType}\n`;
                exportText += `   - Reason: ${link.blockageMessage}\n`;
                exportText += `   - Time: ${new Date(link.timestamp).toLocaleString()}\n\n`;
            }
        }
        
        if (this.unprocessedLinks.length > 0) {
            exportText += `## Unprocessed Links (${this.unprocessedLinks.length})\n`;
            exportText += 'These links were not yet processed:\n\n';
            
            for (const link of this.unprocessedLinks) {
                exportText += `${link.index + 1}. ${link.url}\n`;
            }
        }
        
        exportText += '\n## Usage Instructions\n';
        exportText += '1. Copy the URLs you want to process\n';
        exportText += '2. Paste them into the extension popup\n';
        exportText += '3. Click "Load Links" to reload them\n';
        exportText += '4. Resolve any login/captcha issues manually\n';
        exportText += '5. Click "Start Processing" to continue\n';
        
        return exportText;
    }
    
    async savePausedState() {
        const state = {
            isPaused: this.isPaused,
            pauseReason: this.pauseReason,
            blockedLinks: this.blockedLinks,
            unprocessedLinks: this.unprocessedLinks,
            currentIndex: this.currentIndex,
            processingStartTime: this.processingStartTime,
            lastBlockageTime: this.lastBlockageTime,
            savedAt: new Date().toISOString()
        };
        
        try {
            await chrome.storage.local.set({ pausedState: state });
            console.log('💾 Saved paused state');
        } catch (error) {
            console.error('❌ Failed to save paused state:', error);
        }
    }
    
    async loadPausedState() {
        try {
            const result = await chrome.storage.local.get(['pausedState']);
            if (result.pausedState) {
                const state = result.pausedState;
                this.isPaused = state.isPaused || false;
                this.pauseReason = state.pauseReason || null;
                this.blockedLinks = state.blockedLinks || [];
                this.unprocessedLinks = state.unprocessedLinks || [];
                this.processingStartTime = state.processingStartTime || null;
                this.lastBlockageTime = state.lastBlockageTime || null;
                
                console.log('📂 Loaded paused state:', {
                    isPaused: this.isPaused,
                    blockedLinks: this.blockedLinks.length,
                    unprocessedLinks: this.unprocessedLinks.length
                });
            }
        } catch (error) {
            console.warn('Could not load paused state:', error);
        }
    }
    
    async notifyPopupOfPause() {
        // This will be handled by the popup polling for status
        console.log('📢 Pause notification ready for popup');
    }

    // 🚨 NEW: Check for barrier status from MainManager via automation service

    // Handle automation completion notification from service
    async handleAutomationCompleted(message) {
        console.log('✅ Received automation completion notification:', message);
        
        const { success, tab_info, duration } = message;
        
        if (success && tab_info) {
            console.log(`🎯 Automation completed for tab ${tab_info.id} (${tab_info.filename}) in ${duration}s`);
            
            // Mark this link as completed
            if (tab_info.index === this.currentIndex) {
                console.log('📋 Moving to next link after automation completion');
                this.currentIndex++;
                
                // Close the current tab after a brief delay
                setTimeout(async () => {
                    try {
                        await chrome.tabs.remove(tab_info.id);
                        console.log(`📝 Closed tab ${tab_info.id} after automation completion`);
                        
                        // Continue processing if there are more links
                        if (this.currentIndex < this.links.length && this.isProcessing) {
                            const nextLink = this.links[this.currentIndex];
                            console.log(`🔄 Continuing with next link: ${nextLink}`);
                            await this.openLink(nextLink, this.currentIndex);
                        } else {
                            console.log('✅ All links processed');
                            this.isProcessing = false;
                        }
                    } catch (error) {
                        console.error('❌ Error handling automation completion:', error);
                    }
                }, 2000); // 2 second delay for file operations to complete
            }
        } else {
            console.error('❌ Automation failed:', message);
        }
    }

    // Enhanced automation tracking to prevent multiple prints per link
    async trackAutomationForLink(linkIndex, tabId) {
        if (!this.automationTracker) {
            this.automationTracker = new Map();
        }
        
        const linkKey = `${linkIndex}-${this.links[linkIndex]}`;
        
        if (this.automationTracker.has(linkKey)) {
            console.warn(`⚠️ Automation already tracked for link ${linkIndex}, skipping duplicate`);
            return false;
        }
        
        this.automationTracker.set(linkKey, {
            linkIndex,
            tabId,
            startTime: Date.now(),
            status: 'in_progress'
        });
        
        return true;
    }

    // Mark automation as completed for a link
    markAutomationCompleted(linkIndex) {
        if (!this.automationTracker) return;
        
        const linkKey = `${linkIndex}-${this.links[linkIndex]}`;
        const tracking = this.automationTracker.get(linkKey);
        
        if (tracking) {
            tracking.status = 'completed';
            tracking.endTime = Date.now();
            tracking.duration = tracking.endTime - tracking.startTime;
            console.log(`✅ Marked automation completed for link ${linkIndex} (duration: ${tracking.duration}ms)`);
        }
    }

    // Poll automation service for completion status
    async pollForAutomationCompletion(tabId, linkIndex, filename) {
        const maxPolls = 30; // 30 seconds max
        const pollInterval = 1000; // 1 second intervals
        let pollCount = 0;
        
        console.log(`🔄 Starting completion polling for tab ${tabId}, link ${linkIndex}`);
        
        const poll = async () => {
            try {
                pollCount++;
                
                if (pollCount > maxPolls) {
                    console.warn(`⏰ Polling timeout for tab ${tabId}, link ${linkIndex}`);
                    return;
                }
                
                const response = await fetch(`http://localhost:8888/check_completion?tab_id=${tabId}&link_index=${linkIndex}`);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const result = await response.json();
                
                if (result.completed) {
                    console.log(`✅ Automation completed for tab ${tabId}: ${result.message}`);
                    
                    // For batch processing, just close the tab - don't use handleAutomationCompleted
                    // which is for sequential processing
                    try {
                        await chrome.tabs.remove(tabId);
                        console.log(`📝 Tab ${tabId} closed after automation completion`);
                    } catch (error) {
                        console.warn(`⚠️ Could not close tab ${tabId}:`, error);
                    }
                    
                    return; // Stop polling
                }
                
                if (!result.automation_running && !result.has_completion) {
                    console.warn(`⚠️ No automation running and no completion for tab ${tabId}, link ${linkIndex}`);
                    return; // Stop polling
                }
                
                // Continue polling
                console.log(`🔄 Poll ${pollCount}/${maxPolls}: Automation still running...`);
                setTimeout(poll, pollInterval);
                
            } catch (error) {
                console.error(`❌ Polling error for tab ${tabId}:`, error);
                
                // Retry a few times before giving up
                if (pollCount < 5) {
                    setTimeout(poll, pollInterval);
                } else {
                    console.error(`❌ Giving up polling for tab ${tabId} after ${pollCount} attempts`);
                }
            }
        };
        
        // Start polling after a brief delay
        setTimeout(poll, 1000);
    }
}

// Initialize background processor
const backgroundProcessor = new BackgroundProcessor();

// Auto-start file organizer daemon when extension loads
(async function startAutoOrganizer() {
    try {
        // Check if we're on macOS and can run the daemon
        const extensionPath = chrome.runtime.getURL('').replace('chrome-extension://', '').replace('/', '');
        console.log('🔄 Attempting to start auto-organizer daemon...');
        
        // Store a flag that the extension is active
        chrome.storage.local.set({
            extensionActive: true,
            extensionStartTime: Date.now(),
            lastActivity: Date.now()
        });
        
        console.log('✅ Universal News Processor extension is now active - auto-organizer will monitor for files');
        
    } catch (error) {
        console.log('⚠️ Could not auto-start daemon:', error.message);
        console.log('💡 Please run: ./start_auto_daemon.sh manually');
    }
})();

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('📰 Universal News Processor installed');
        // Set default profile name
        chrome.storage.local.set({
            profileName: 'Default Profile'
        });
    }
});

// Handle tab updates (when user navigates)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        try {
            // Check if this is a supported news site
            const pageHostname = new URL(tab.url).hostname;
            const processor = backgroundProcessor;
            const isSupported = processor.siteConfig ? processor.siteConfig.isSupported(pageHostname) : false;
            
            if (isSupported) {
                const siteName = processor.siteConfig ? processor.siteConfig.getSiteName(pageHostname) : pageHostname;
                console.log(`📄 ${siteName} page loaded:`, tab.url);
            }
        } catch (urlError) {
            console.warn('Could not parse tab URL in global listener:', tab.url);
        }
    }
});

// Detect profile information
chrome.runtime.onStartup.addListener(() => {
    // Try to detect current Chrome profile
    chrome.storage.local.set({
        profileName: 'Current Profile',
        sessionStart: Date.now()
    });
});