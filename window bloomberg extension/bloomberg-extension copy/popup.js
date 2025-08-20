class UniversalNewsProcessor {
    constructor() {
        this.links = [];
        this.currentIndex = 0;
        this.isProcessing = false;
        this.isPaused = false;
        this.syncInterval = null;
        this.isCleanedUp = false;
        this.supportedSites = this.initializeSupportedSites();
        
        this.initializeUI();
        this.loadState();
        this.loadSaveSettings();
        this.updateUI();
        
        // Start processing status updates
        this.startStatusUpdates();
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    // Initialize supported sites configuration
    initializeSupportedSites() {
        return {
            'bloomberg.com': { name: 'Bloomberg', patterns: ['/news/', '/articles/', '/opinion/', '/markets/', '/technology/', '/politics/'] },
            'wsj.com': { name: 'Wall Street Journal', patterns: ['/articles/', '/news/', '/opinion/'] },
            'cnbc.com': { name: 'CNBC', patterns: ['/news/', '/investing/', '/markets/', '/video/', '/economy/', '/politics/', '/tech/'] },
            'barrons.com': { name: "Barron's", patterns: ['/articles/', '/news/', '/market-data/'] },
            'ft.com': { name: 'Financial Times', patterns: ['/content/', '/news/', '/markets/'] },
            'marketwatch.com': { name: 'MarketWatch', patterns: ['/story/', '/articles/', '/news/'] },
            'reuters.com': { name: 'Reuters', patterns: ['/article/', '/business/', '/markets/'] },
            'finance.yahoo.com': { name: 'Yahoo Finance', patterns: ['/news/', '/quote/', '/m/'] },
            'yahoo.com': { name: 'Yahoo Finance', patterns: ['/finance/', '/news/'] },
            'investopedia.com': { name: 'Investopedia', patterns: ['/articles/', '/news/'] },
            'benzinga.com': { name: 'Benzinga', patterns: ['/news/', '/trading-ideas/'] },
            'seeking-alpha.com': { name: 'Seeking Alpha', patterns: ['/article/', '/news/'] },
            'seekingalpha.com': { name: 'Seeking Alpha', patterns: ['/article/', '/news/'] },
            'fool.com': { name: 'The Motley Fool', patterns: ['/investing/', '/retirement/'] },
            'motleyfool.com': { name: 'The Motley Fool', patterns: ['/investing/', '/retirement/'] }
        };
    }
    
    initializeUI() {
        // Get profile info
        this.updateProfileInfo();
        
        // Load print method preference
        this.loadPrintMethodPreference();
        
        // Load timing preferences
        this.loadTimingPreferences();
        
        // Check Python service status
        this.checkPythonServiceStatus();
        
        // Load extension UI toggle setting
        this.loadExtensionUIToggle();
        
        // Load sequential processing preferences
        this.loadSequentialPreferences();
        
        // Event listeners
        document.getElementById('setFolder').addEventListener('click', () => this.setSaveFolder());
        document.getElementById('loadLinks').addEventListener('click', () => this.loadLinks());
        document.getElementById('clearLinks').addEventListener('click', () => this.clearLinks());
        
        // Extension UI toggle
        document.getElementById('extensionUIToggle').addEventListener('change', () => this.toggleExtensionUI());
        
        // Processing control buttons
        document.getElementById('pauseProcessing').addEventListener('click', () => this.pauseProcessing());
        document.getElementById('resumeProcessing').addEventListener('click', () => this.resumeProcessing());
        document.getElementById('resetProcessing').addEventListener('click', () => this.resetProcessing());
        document.getElementById('copyUnprocessed').addEventListener('click', () => this.copyUnprocessedLinks());
        
        // Dashboard button
        document.getElementById('openDashboard').addEventListener('click', () => this.openDashboard());
        
        // Print method radio button
        document.getElementById('printMethodPython').addEventListener('change', () => {
            this.savePrintMethodPreference();
            this.updateTimingControlsVisibility();
        });
        
        // Timing controls
        document.getElementById('pageLoadWait').addEventListener('change', () => this.saveTimingPreferences());
        document.getElementById('printDialogWait').addEventListener('change', () => this.saveTimingPreferences());
        document.getElementById('saveDialogWait').addEventListener('change', () => this.saveTimingPreferences());
        document.getElementById('betweenPagesWait').addEventListener('change', () => this.saveTimingPreferences());
        
        // Sequential processing controls
        document.getElementById('useAutoPrint')?.addEventListener('change', () => this.saveSequentialPreferences());
        document.getElementById('autoAdvance')?.addEventListener('change', () => this.saveSequentialPreferences());
        document.getElementById('seqPageLoadWait')?.addEventListener('change', () => this.saveSequentialPreferences());
        document.getElementById('betweenPagesWait')?.addEventListener('change', () => this.saveSequentialPreferences());
        document.getElementById('startProcessing').addEventListener('click', (e) => {
            console.log('🖱️ Start Sequential button clicked!', {
                hasDisabledClass: e.target.classList.contains('disabled'),
                hasDisabledAttr: e.target.disabled,
                linksCount: this.links.length,
                isProcessing: this.isProcessing,
                currentIndex: this.currentIndex
            });
            
            if (e.target.classList.contains('disabled') || e.target.disabled) {
                console.log('❌ Start button is disabled - cannot start processing');
                if (this.links.length === 0) {
                    alert('Please load links first using the "Load Links" button above.');
                }
                return;
            }
            console.log('✅ Starting sequential processing...');
            this.startProcessing();
        });
        
        document.getElementById('batchProcessing').addEventListener('click', (e) => {
            if (e.target.classList.contains('disabled') || e.target.disabled) {
                return;
            }
            this.toggleBatchSettings();
        });
        
        document.getElementById('startBatch').addEventListener('click', () => {
            this.startBatchProcessing();
        });
        
        document.getElementById('pauseProcessing').addEventListener('click', () => this.pauseProcessing());
        document.getElementById('resumeProcessing').addEventListener('click', () => this.resumeProcessing());
        document.getElementById('stopProcessing').addEventListener('click', () => this.stopProcessing());
        
        // Unprocessed links management
        document.getElementById('exportUnprocessed').addEventListener('click', () => this.exportUnprocessedLinks());
        document.getElementById('clearBlocked').addEventListener('click', () => this.clearBlockedLinks());
        
        // Auto-refresh status from background script with proper cleanup
        this.syncInterval = setInterval(() => this.syncWithBackground(), 1000);
    }
    
    async updateProfileInfo() {
        try {
            // Get current tab to show which profile is being used
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const profileName = await this.getCurrentProfileName();
            document.getElementById('profileName').textContent = profileName || 'Unknown Profile';
        } catch (error) {
            document.getElementById('profileName').textContent = 'Could not detect';
        }
    }
    
    async getCurrentProfileName() {
        // Try to detect profile from Chrome's user data
        return new Promise((resolve) => {
            chrome.storage.local.get(['profileName'], (result) => {
                resolve(result.profileName || 'Default Profile');
            });
        });
    }

    // Load print method preference
    async loadPrintMethodPreference() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['printMethod'], resolve);
            });
            
            const printMethod = result.printMethod || 'python';
            
            // Always use Python method (only option available)
            document.getElementById('printMethodPython').checked = true;
            
            // Update timing controls visibility
            this.updateTimingControlsVisibility();
            
            console.log('✅ Loaded print method preference:', printMethod);
        } catch (error) {
            console.warn('Could not load print method preference:', error);
            // Default to Python method
            document.getElementById('printMethodPython').checked = true;
            this.updateTimingControlsVisibility();
        }
    }

    // Save print method preference
    async savePrintMethodPreference() {
        const printMethod = 'python'; // Always use Python method
        
        try {
            await chrome.storage.local.set({ printMethod: printMethod });
            console.log('✅ Saved print method preference:', printMethod);
            
            // Also send to background script for immediate use
            this.sendMessageWithRetry({
                action: 'setPrintMethod',
                printMethod: printMethod
            }).catch(err => console.warn('Could not notify background of print method change:', err));
            
        } catch (error) {
            console.error('Error saving print method preference:', error);
        }
    }

    // Get current print method
    getCurrentPrintMethod() {
        return 'python'; // Always return Python method
    }

    // Update timing controls visibility
    updateTimingControlsVisibility() {
        const timingControls = document.getElementById('timingControls');
        // Always show timing controls for Python method
        timingControls.style.display = 'block';
    }

    // Check Python service status
    async checkPythonServiceStatus() {
        const statusElement = document.getElementById('pythonStatus');
        const pythonRadio = document.getElementById('printMethodPython');
        
        try {
            statusElement.textContent = '⏳';
            statusElement.style.color = '#ffa500';
            
            const response = await fetch('http://localhost:8888/status', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'running') {
                    statusElement.textContent = '✅';
                    statusElement.style.color = '#28a745';
                    pythonRadio.disabled = false;
                    console.log('✅ Python automation service is running');
                } else {
                    throw new Error('Service not running');
                }
            } else {
                throw new Error('Service not responding');
            }
        } catch (error) {
            statusElement.textContent = '❌';
            statusElement.style.color = '#dc3545';
            pythonRadio.disabled = true;
            console.warn('⚠️ Python automation service not available:', error.message);
        }
    }

    // Load timing preferences
    async loadTimingPreferences() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['pageLoadWait', 'printDialogWait', 'saveDialogWait', 'betweenPagesWait'], resolve);
            });
            
            // Set default values
            const pageLoadWait = result.pageLoadWait || '2000';
            const printDialogWait = result.printDialogWait || '2000';
            const saveDialogWait = result.saveDialogWait || '1500';
            const betweenPagesWait = result.betweenPagesWait || '2000';
            
            document.getElementById('pageLoadWait').value = pageLoadWait;
            document.getElementById('printDialogWait').value = printDialogWait;
            document.getElementById('saveDialogWait').value = saveDialogWait;
            document.getElementById('betweenPagesWait').value = betweenPagesWait;
            
            console.log('✅ Loaded timing preferences:', { pageLoadWait, printDialogWait, saveDialogWait, betweenPagesWait });
        } catch (error) {
            console.warn('Could not load timing preferences:', error);
        }
    }

    // Save timing preferences
    async saveTimingPreferences() {
        const pageLoadWait = document.getElementById('pageLoadWait').value;
        const printDialogWait = document.getElementById('printDialogWait').value;
        const saveDialogWait = document.getElementById('saveDialogWait').value;
        const betweenPagesWait = document.getElementById('betweenPagesWait').value;
        
        try {
            await chrome.storage.local.set({
                pageLoadWait: pageLoadWait,
                printDialogWait: printDialogWait,
                saveDialogWait: saveDialogWait,
                betweenPagesWait: betweenPagesWait
            });
            
            console.log('✅ Saved timing preferences:', { pageLoadWait, printDialogWait, saveDialogWait, betweenPagesWait });
            
            // Also send to background script for immediate use
            this.sendMessageWithRetry({
                action: 'setTimingPreferences',
                pageLoadWait: parseInt(pageLoadWait),
                printDialogWait: parseInt(printDialogWait),
                saveDialogWait: parseInt(saveDialogWait),
                betweenPagesWait: parseInt(betweenPagesWait)
            }).catch(err => console.warn('Could not notify background of timing changes:', err));
            
        } catch (error) {
            console.error('Error saving timing preferences:', error);
        }
    }
    
    loadLinks() {
        const input = document.getElementById('linksInput').value.trim();
        if (!input) {
            this.showStatus('⚠️ Please paste some links first', 'idle');
            return;
        }
        
        // Parse links - fix string parsing bug
        const rawLinks = input.split('\n').map(line => line.trim()).filter(line => line);
        const linkValidation = this.validateLinks(rawLinks);
        
        if (linkValidation.valid.length === 0) {
            this.showStatus(`❌ No valid news links found. Supported sites: ${Object.keys(this.supportedSites).join(', ')}`, 'idle');
            if (linkValidation.invalid.length > 0) {
                console.log('Invalid links:', linkValidation.invalid);
            }
            return;
        }
        
        // Show validation summary if there were invalid links
        if (linkValidation.invalid.length > 0) {
            console.log(`⚠️ ${linkValidation.invalid.length} invalid links filtered out:`, linkValidation.invalid);
        }
        
        this.links = linkValidation.valid.map((linkData, index) => ({
            id: Date.now() + index,
            url: linkData.url,
            siteName: linkData.siteName,
            status: 'pending',
            timestamp: new Date().toISOString()
        }));
        
        this.currentIndex = 0;
        this.saveState();
        this.updateUI();
        
        const siteStats = this.getValidationStats(linkValidation.valid);
        this.showStatus(`✅ Loaded ${this.links.length} valid links from ${siteStats}`, 'idle');
        
        // Force update UI after a short delay to ensure button is enabled
        setTimeout(() => {
            this.resetProcessingState(); // Reset any stuck state
            this.updateUI();
            console.log('✅ Force UI update after loading links');
        }, 100);
        
        // Clear the input
        document.getElementById('linksInput').value = '';
    }
    
    // Enhanced link validation for multiple news sites
    validateLinks(rawLinks) {
        const valid = [];
        const invalid = [];
        
        for (const url of rawLinks) {
            const validation = this.validateSingleLink(url);
            if (validation.isValid) {
                valid.push({
                    url: url,
                    siteName: validation.siteName,
                    hostname: validation.hostname
                });
            } else {
                invalid.push({
                    url: url,
                    reason: validation.reason
                });
            }
        }
        
        return { valid, invalid };
    }

    validateSingleLink(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.replace(/^www\./, '');
            
            // Check if domain is supported
            const siteConfig = this.supportedSites[hostname];
            if (siteConfig) {
                // Check for news article patterns
                const hasValidPattern = siteConfig.patterns.some(pattern => 
                    urlObj.pathname.includes(pattern)
                );
                
                // Also check for date-based article patterns (common for news sites)
                const datePattern = /\/\d{4}\/\d{2}\/\d{2}\//; // Matches /YYYY/MM/DD/
                const hasDatePattern = datePattern.test(urlObj.pathname);
                
                // Also allow direct domain matches (home pages, etc.)
                const isDirectMatch = urlObj.pathname === '/' || urlObj.pathname === '';
                
                // Check for common article indicators in the path
                const articleIndicators = ['article', 'story', 'post', 'news'];
                const hasArticleIndicator = articleIndicators.some(indicator => 
                    urlObj.pathname.toLowerCase().includes(indicator)
                );
                
                if (hasValidPattern || isDirectMatch || hasDatePattern || hasArticleIndicator) {
                    return {
                        isValid: true,
                        siteName: siteConfig.name,
                        hostname: hostname
                    };
                } else {
                    console.log(`❌ URL validation failed for ${siteConfig.name}:`, {
                        url: urlObj.pathname,
                        patterns: siteConfig.patterns,
                        hasValidPattern,
                        hasDatePattern,
                        hasArticleIndicator
                    });
                    return {
                        isValid: false,
                        reason: `URL doesn't match expected ${siteConfig.name} article patterns`
                    };
                }
            }
            
            // Check for short links that might redirect to supported sites
            const shortLinkDomains = ['t.co', 'bit.ly', 'tinyurl.com'];
            if (shortLinkDomains.includes(hostname)) {
                return {
                    isValid: true,
                    siteName: 'Short Link (may redirect)',
                    hostname: hostname
                };
            }
            
            // Check for social media links that might contain news content
            if (hostname === 'twitter.com' || hostname === 'x.com') {
                const containsNewsKeywords = Object.keys(this.supportedSites).some(domain => 
                    url.toLowerCase().includes(domain.split('.')[0])
                );
                
                if (containsNewsKeywords) {
                    return {
                        isValid: true,
                        siteName: 'Social Media Link',
                        hostname: hostname
                    };
                }
            }
            
            return {
                isValid: false,
                reason: `Domain ${hostname} is not supported`
            };
            
        } catch (error) {
            return {
                isValid: false,
                reason: `Invalid URL format: ${error.message}`
            };
        }
    }

    // Get statistics about validated links
    getValidationStats(validLinks) {
        const siteStats = {};
        validLinks.forEach(link => {
            siteStats[link.siteName] = (siteStats[link.siteName] || 0) + 1;
        });
        
        const statsStr = Object.entries(siteStats)
            .map(([site, count]) => `${count} ${site}`)
            .join(', ');
        
        return statsStr;
    }
    
    clearLinks() {
        this.links = [];
        this.currentIndex = 0;
        this.isProcessing = false;
        this.isPaused = false;
        this.saveState();
        this.updateUI();
        this.showStatus('🗑️ All links cleared', 'idle');
        document.getElementById('linksInput').value = '';
    }
    
    // Reset processing state to fix stuck conditions
    resetProcessingState() {
        if (this.links.length > 0 && this.currentIndex === 0) {
            console.log('🔄 Resetting stuck processing state');
            this.isProcessing = false;
            this.isPaused = false;
            this.saveState();
        }
    }
    
    
    
    pauseProcessing() {
        this.isPaused = true;
        this.saveState();
        this.updateUI();
        
        // Show pause status section
        const pauseStatus = document.getElementById('pauseStatus');
        pauseStatus.style.display = 'block';
        document.getElementById('pauseMessage').textContent = '⏸️ Processing paused by user';
        document.getElementById('pauseReason').textContent = 'Reason: Manual pause';
        
        // Populate resume position selector
        this.populateResumePositionSelector();
        
        this.showStatus('⏸️ Processing paused', 'paused');
    }
    
    
    async moveToNextLink() {
        this.currentIndex++;
        this.saveState();
        
        if (this.currentIndex >= this.links.length) {
            // All done!
            this.isProcessing = false;
            this.saveState();
            this.updateUI();
            this.showStatus('🎉 All links processed!', 'idle');
            return;
        }
        
        // Process next link
        setTimeout(() => this.processCurrentLink(), 1000);
    }
    
    
    updateUI() {
        const hasLinks = this.links.length > 0;
        const canStart = hasLinks && !this.isProcessing;
        const isActive = this.isProcessing && !this.isPaused;
        
        // Force reset if we're in an inconsistent state
        if (hasLinks && this.currentIndex === 0 && !this.isProcessing) {
            // We have links but haven't started - ensure we can start
            this.isProcessing = false;
            this.isPaused = false;
        }
        
        // Button states
        const startBtn = document.getElementById('startProcessing');
        const pauseBtn = document.getElementById('pauseProcessing');
        const stopBtn = document.getElementById('stopProcessing');
        
        // Properly enable/disable buttons with full control
        const batchBtn = document.getElementById('batchProcessing');
        
        if (canStart) {
            startBtn.classList.remove('disabled');
            startBtn.disabled = false;
            batchBtn.classList.remove('disabled');
            batchBtn.disabled = false;
        } else {
            startBtn.classList.add('disabled');
            startBtn.disabled = true;
            batchBtn.classList.add('disabled');
            batchBtn.disabled = true;
        }
        
        if (isActive) {
            pauseBtn.classList.remove('disabled');
            pauseBtn.disabled = false;
        } else {
            pauseBtn.classList.add('disabled');
            pauseBtn.disabled = true;
        }
        
        if (this.isProcessing) {
            stopBtn.classList.remove('disabled');
            stopBtn.disabled = false;
        } else {
            stopBtn.classList.add('disabled');
            stopBtn.disabled = true;
        }
        
        // Debug logging
        console.log('UI Update:', {
            hasLinks,
            canStart,
            isProcessing: this.isProcessing,
            startBtnDisabled: startBtn.classList.contains('disabled')
        });
        
        // Progress
        const progress = this.links.length > 0 ? (this.currentIndex / this.links.length) * 100 : 0;
        document.getElementById('progressBar').style.width = `${progress}%`;
        
        // Link count
        document.getElementById('linkCount').textContent = 
            `${this.currentIndex}/${this.links.length} links processed`;
            
        // Current link - only show if actually processing
        const currentLinkEl = document.getElementById('currentLink');
        if (this.isProcessing && this.currentIndex < this.links.length) {
            const currentLink = this.links[this.currentIndex];
            const linkInfo = `${currentLink.siteName || 'Unknown Site'}: ${this.truncateUrl(currentLink.url)}`;
            currentLinkEl.textContent = `Current: ${linkInfo}`;
            currentLinkEl.style.display = 'block';
        } else if (hasLinks && this.currentIndex < this.links.length && !this.isProcessing) {
            // Show next link to be processed but don't say "Current"
            const nextLink = this.links[this.currentIndex];
            const linkInfo = `${nextLink.siteName || 'Unknown Site'}: ${this.truncateUrl(nextLink.url)}`;
            currentLinkEl.textContent = `Next: ${linkInfo}`;
            currentLinkEl.style.display = 'block';
        } else {
            currentLinkEl.style.display = 'none';
        }
    }
    
    showStatus(message, type = 'idle') {
        const statusEl = document.getElementById('status');
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
    }
    
    truncateUrl(url, maxLength = 50) {
        return url.length > maxLength ? url.substring(0, maxLength) + '...' : url;
    }
    
    
    async loadState() {
        try {
            return new Promise((resolve, reject) => {
                chrome.storage.local.get(['processorState'], (result) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                        return;
                    }
                    
                    if (result.processorState) {
                        const state = result.processorState;
                        this.links = state.links || [];
                        this.currentIndex = state.currentIndex || 0;
                        this.isProcessing = state.isProcessing || false;
                        this.isPaused = state.isPaused || false;
                    }
                    resolve();
                });
            });
        } catch (error) {
            console.error('Error loading state:', error);
        }
    }

    // Message passing with retry logic and service worker wake-up
    async sendMessageWithRetry(message, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await chrome.runtime.sendMessage(message);
                return response;
            } catch (error) {
                console.warn(`Message send attempt ${i + 1} failed:`, error);
                
                if (i === retries - 1) {
                    throw new Error(`Failed to send message after ${retries} attempts: ${error.message}`);
                }
                
                // Wait before retry, with exponential backoff
                await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, i)));
            }
        }
    }

    // Cleanup method to prevent memory leaks
    cleanup() {
        this.isCleanedUp = true;
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    // Enhanced sync with background script
    async syncWithBackground() {
        if (this.isCleanedUp) return;
        
        try {
            const response = await this.sendMessageWithRetry({ action: 'getStatus' }, 1);
            if (response) {
                if (response.shouldMoveNext) {
                    this.moveToNextLink();
                }
                // Sync background state with popup state
                if (response.currentIndex !== undefined) {
                    this.currentIndex = Math.max(this.currentIndex, response.currentIndex);
                }
            }
            
            // Check for unprocessed links and pause state
            await this.syncUnprocessedLinks();
            
        } catch (error) {
            // Background script might not be ready - this is normal
            console.debug('Background sync failed:', error.message);
        }
    }

    async syncUnprocessedLinks() {
        try {
            const response = await this.sendMessageWithRetry({ action: 'getUnprocessedLinks' }, 1);
            if (response && response.success) {
                this.updateUnprocessedLinksDisplay(response);
            }
        } catch (error) {
            console.debug('Unprocessed links sync failed:', error.message);
        }
    }

    // Enhanced start processing with error handling
    async startProcessing() {
        console.log('🚀 startProcessing called with:', {
            linksCount: this.links.length,
            currentIndex: this.currentIndex,
            isProcessing: this.isProcessing,
            isPaused: this.isPaused,
            links: this.links
        });
        
        if (this.links.length === 0) {
            console.log('❌ No links to process');
            this.showStatus('❌ No links to process - please load links first', 'idle');
            alert('Please load links first using the "Load Links" button above.');
            return;
        }
        
        try {
            this.isProcessing = true;
            this.isPaused = false;
            this.saveState();
            this.updateUI();
            
            // Get sequential processing options
            const sequentialOptions = this.getSequentialOptions();
            
            console.log('🔄 Starting enhanced sequential processing with options:', sequentialOptions);
            
            // Tell background script to start sequential processing with custom options
            console.log('📤 Sending startSequentialProcessing message to background...');
            const response = await this.sendMessageWithRetry({
                action: 'startSequentialProcessing',
                links: this.links,
                currentIndex: this.currentIndex,
                printMethod: this.getCurrentPrintMethod(),
                autoAdvance: sequentialOptions.autoAdvance,
                useAutoPrint: sequentialOptions.useAutoPrint,
                customDelays: sequentialOptions.customDelays,
                options: sequentialOptions
            });
            
            console.log('📥 Background response:', response);
            
            const modeDescription = sequentialOptions.useAutoPrint ? 
                `🤖 Auto-print (${this.getCurrentPrintMethod()})` : 
                '👆 Manual';
            const advanceDescription = sequentialOptions.autoAdvance ? 
                '⏭️ Auto-advance' : 
                '👆 Manual advance';
                
            this.showStatus(`🚀 Sequential processing started: ${modeDescription}, ${advanceDescription}`, 'processing');
            
            // The background script will handle everything automatically
            // No need to call processCurrentLink for sequential mode
        } catch (error) {
            console.error('Error starting sequential processing:', error);
            this.showStatus('❌ Failed to start sequential processing', 'idle');
            this.isProcessing = false;
            this.updateUI();
        }
    }
    
    // Get sequential processing options from UI
    getSequentialOptions() {
        const useAutoPrint = document.getElementById('useAutoPrint')?.checked !== false;
        const autoAdvance = document.getElementById('autoAdvance')?.checked !== false;
        
        // Get sequential timing preferences
        const seqPageLoadWait = parseInt(document.getElementById('seqPageLoadWait')?.value) || 3000;
        const betweenPagesWait = parseInt(document.getElementById('betweenPagesWait')?.value) || 2000;
        
        // Get regular timing preferences for automation methods
        const pageLoadWait = parseInt(document.getElementById('pageLoadWait')?.value) || 2000;
        const printDialogWait = parseInt(document.getElementById('printDialogWait')?.value) || 2000;
        const saveDialogWait = parseInt(document.getElementById('saveDialogWait')?.value) || 1500;
        
        const customDelays = {
            // Sequential-specific delays
            pageLoadWait: seqPageLoadWait,
            betweenPagesWait: betweenPagesWait,
            
            // Automation method delays (for Python/Simple automation)
            printDialogWait: printDialogWait,
            saveDialogWait: saveDialogWait
        };
        
        const options = {
            autoAdvance,
            useAutoPrint,
            customDelays,
            printMethod: this.getCurrentPrintMethod()
        };
        
        console.log('📋 Sequential options collected:', options);
        return options;
    }
    
    // Save sequential processing preferences
    async saveSequentialPreferences() {
        try {
            const preferences = {
                useAutoPrint: document.getElementById('useAutoPrint')?.checked !== false,
                autoAdvance: document.getElementById('autoAdvance')?.checked !== false,
                seqPageLoadWait: parseInt(document.getElementById('seqPageLoadWait')?.value) || 3000,
                betweenPagesWait: parseInt(document.getElementById('betweenPagesWait')?.value) || 2000
            };
            
            await chrome.storage.local.set({ sequentialPreferences: preferences });
            console.log('✅ Sequential preferences saved:', preferences);
        } catch (error) {
            console.error('❌ Error saving sequential preferences:', error);
        }
    }
    
    // Load sequential processing preferences
    async loadSequentialPreferences() {
        try {
            const result = await chrome.storage.local.get(['sequentialPreferences']);
            const prefs = result.sequentialPreferences || {
                useAutoPrint: true,
                autoAdvance: true,
                seqPageLoadWait: 3000,
                betweenPagesWait: 2000
            };
            
            // Apply preferences to UI
            const useAutoPrintEl = document.getElementById('useAutoPrint');
            if (useAutoPrintEl) useAutoPrintEl.checked = prefs.useAutoPrint;
            
            const autoAdvanceEl = document.getElementById('autoAdvance');
            if (autoAdvanceEl) autoAdvanceEl.checked = prefs.autoAdvance;
            
            const seqPageLoadWaitEl = document.getElementById('seqPageLoadWait');
            if (seqPageLoadWaitEl) seqPageLoadWaitEl.value = prefs.seqPageLoadWait;
            
            const betweenPagesWaitEl = document.getElementById('betweenPagesWait');
            if (betweenPagesWaitEl) betweenPagesWaitEl.value = prefs.betweenPagesWait;
            
            console.log('✅ Sequential preferences loaded:', prefs);
        } catch (error) {
            console.error('❌ Error loading sequential preferences:', error);
        }
    }

    // Enhanced process current link with error handling
    async processCurrentLink() {
        if (!this.isProcessing || this.isPaused || this.currentIndex >= this.links.length) {
            return;
        }
        
        // Check if processing was paused
        if (this.isPaused) {
            console.log('⏸️ Processing is paused');
            return;
        }
        
        try {
            const currentLink = this.links[this.currentIndex];
            const siteName = currentLink.siteName || 'Unknown Site';
            this.showStatus(`📄 Opening ${siteName}: ${this.truncateUrl(currentLink.url)}`, 'processing');
            
            // Tell background script to open this link with retry logic
            await this.sendMessageWithRetry({
                action: 'openLink',
                link: currentLink,
                index: this.currentIndex
            });
            
            this.updateUI();
        } catch (error) {
            console.error('Error processing current link:', error);
            this.showStatus('❌ Failed to open link', 'idle');
            // Try to continue with next link
            setTimeout(() => this.moveToNextLink(), 2000);
        }
    }

    // Enhanced stop processing with error handling  
    async stopProcessing() {
        this.isProcessing = false;
        this.isPaused = false;
        this.currentIndex = 0;
        this.isBatchMode = false;
        this.saveState();
        this.updateUI();
        this.showStatus('⏹️ Processing stopped', 'idle');
        
        try {
            // Tell background script to stop
            await this.sendMessageWithRetry({ action: 'stopProcessing' });
        } catch (error) {
            console.error('Error stopping processing:', error);
        }
    }
    
    // Toggle batch settings visibility
    toggleBatchSettings() {
        const settings = document.getElementById('batchSettings');
        if (settings.style.display === 'none') {
            settings.style.display = 'block';
        } else {
            settings.style.display = 'none';
        }
    }
    
    // Start smart batch processing
    async startBatchProcessing() {
        if (this.links.length === 0) {
            this.showStatus('❌ No links to process', 'idle');
            return;
        }
        
        const batchSize = parseInt(document.getElementById('batchSize').value);
        const delay = parseInt(document.getElementById('batchDelay').value) * 1000;
        
        // Hide batch settings
        document.getElementById('batchSettings').style.display = 'none';
        
        console.log(`🚀 Starting smart batch processing: ${batchSize} articles with ${delay/1000}s delay`);
        
        try {
            this.isProcessing = true;
            this.isBatchMode = true;
            this.batchSize = batchSize;
            this.batchDelay = delay;
            this.saveState();
            this.updateUI();
            
            // Tell background script to start batch processing
            await this.sendMessageWithRetry({
                action: 'startBatchProcessing',
                links: this.links,
                currentIndex: this.currentIndex,
                batchSize: batchSize,
                delay: delay,
                printMethod: this.getCurrentPrintMethod()
            });
            
            this.showStatus(`🤖 Smart batch processing started (${batchSize} at a time)`, 'processing');
            
        } catch (error) {
            console.error('Error starting batch processing:', error);
            this.showStatus('❌ Failed to start batch processing', 'idle');
            this.isProcessing = false;
            this.isBatchMode = false;
            this.updateUI();
        }
    }

    // Enhanced save state with error handling
    saveState() {
        const state = {
            links: this.links,
            currentIndex: this.currentIndex,
            isProcessing: this.isProcessing,
            isPaused: this.isPaused
        };
        chrome.storage.local.set({ processorState: state }).catch(error => {
            console.error('Error saving state:', error);
        });
    }

    // Load save settings and populate folder input
    async loadSaveSettings() {
        try {
            // First try to get from local storage for persistence
            const localData = await new Promise(resolve => {
                chrome.storage.local.get(['lastSaveFolder', 'folderSetTime'], resolve);
            });
            
            let saveFolder = this.getTodayFolder(); // Default to today
            
            // If we have a recent folder setting (within 24 hours), use it
            if (localData.lastSaveFolder && localData.folderSetTime) {
                const hoursSinceSet = (Date.now() - localData.folderSetTime) / (1000 * 60 * 60);
                if (hoursSinceSet < 24) {
                    saveFolder = localData.lastSaveFolder;
                }
            }
            
            // Try to get from background script as well
            try {
                const response = await this.sendMessageWithRetry({ action: 'getSaveSettings' });
                if (response.success && response.saveSettings && response.saveSettings.saveFolder !== 'default') {
                    saveFolder = response.saveSettings.saveFolder;
                }
            } catch (bgError) {
                console.warn('Background settings not available, using local storage:', bgError);
            }
            
            // Update UI
            document.getElementById('saveFolder').value = saveFolder;
            document.getElementById('currentFolder').textContent = saveFolder;
            
            // Ensure background is synced
            if (saveFolder !== 'default') {
                this.sendMessageWithRetry({
                    action: 'setSaveSettings',
                    settings: { saveFolder: saveFolder }
                }).catch(err => console.warn('Failed to sync folder to background:', err));
            }
            
        } catch (error) {
            console.error('Error loading save settings:', error);
            // Fallback to today's date
            const todayFolder = this.getTodayFolder();
            document.getElementById('saveFolder').value = todayFolder;
            document.getElementById('currentFolder').textContent = 'default';
        }
    }

    // Get today's date in YYYY-MM-DD format
    getTodayFolder() {
        const today = new Date();
        return today.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    // Set save folder
    async setSaveFolder() {
        const folderInput = document.getElementById('saveFolder');
        const folderName = folderInput.value.trim();
        
        if (!folderName) {
            this.showStatus('⚠️ Please enter a folder name', 'idle');
            return;
        }

        // Validate folder name (allow dates and safe characters)
        if (!/^[a-zA-Z0-9_.-]+$/.test(folderName)) {
            this.showStatus('⚠️ Folder name can only contain letters, numbers, hyphens, dots, and underscores', 'idle');
            return;
        }

        try {
            const response = await this.sendMessageWithRetry({
                action: 'setSaveSettings',
                settings: { saveFolder: folderName }
            });

            if (response.success) {
                document.getElementById('currentFolder').textContent = folderName;
                this.showStatus(`📁 Save folder set to: ${folderName}`, 'idle');
                console.log('✅ Save folder updated:', folderName);
                
                // Also save to local storage for persistence across sessions
                chrome.storage.local.set({ 
                    lastSaveFolder: folderName,
                    folderSetTime: Date.now()
                });
            } else {
                this.showStatus('❌ Failed to set save folder', 'idle');
            }
        } catch (error) {
            console.error('Error setting save folder:', error);
            this.showStatus('❌ Error setting save folder', 'idle');
        }
    }

    // Populate resume position selector with available links
    populateResumePositionSelector() {
        const selector = document.getElementById('resumeFromIndex');
        if (!selector || this.links.length === 0) return;
        
        // Clear existing options
        selector.innerHTML = '';
        
        // Add current position option
        const currentOption = document.createElement('option');
        currentOption.value = 'current';
        currentOption.textContent = `Continue from current position (${this.currentIndex + 1})`;
        selector.appendChild(currentOption);
        
        // Add individual link options for unprocessed links
        for (let i = this.currentIndex; i < this.links.length; i++) {
            const link = this.links[i];
            const option = document.createElement('option');
            option.value = i;
            const linkText = `${i + 1}. ${link.siteName || 'Unknown'}: ${this.truncateUrl(link.url, 30)}`;
            option.textContent = linkText;
            selector.appendChild(option);
        }
    }
    
    // Pause/Resume and Unprocessed Links Management Methods
    async resumeProcessing() {
        try {
            console.log('▶️ Resuming processing...');
            
            // Get selected resume position
            const resumeSelector = document.getElementById('resumeFromIndex');
            const selectedValue = resumeSelector?.value || 'current';
            
            let resumeFromIndex = this.currentIndex;
            if (selectedValue !== 'current' && !isNaN(parseInt(selectedValue))) {
                resumeFromIndex = parseInt(selectedValue);
                console.log(`📍 User selected resume from index: ${resumeFromIndex}`);
            }
            
            // Update current index to selected position
            this.currentIndex = resumeFromIndex;
            this.saveState();
            
            const response = await this.sendMessageWithRetry({ 
                action: 'resumeProcessing',
                currentIndex: resumeFromIndex
            });
            
            if (response && response.success) {
                this.isPaused = false;
                this.isProcessing = false; // User must manually start
                this.showStatus(`▶️ Ready to resume from link ${resumeFromIndex + 1}. Click Start to continue.`, 'idle');
                this.updateUI();
            } else {
                throw new Error('Failed to resume processing');
            }
        } catch (error) {
            console.error('Error resuming processing:', error);
            this.showStatus('❌ Error resuming processing', 'idle');
        }
    }

    updateUnprocessedLinksDisplay(data) {
        const unprocessedSection = document.getElementById('unprocessedSection');
        const pauseStatus = document.getElementById('pauseStatus');
        const resumeButton = document.getElementById('resumeProcessing');
        const startButton = document.getElementById('startProcessing');
        
        // Update counts
        document.getElementById('unprocessedCount').textContent = data.unprocessedLinks.length;
        document.getElementById('blockedCount').textContent = data.blockedLinks.length;
        
        // Show/hide sections based on state
        if (data.isPaused || data.unprocessedLinks.length > 0 || data.blockedLinks.length > 0) {
            unprocessedSection.style.display = 'block';
            
            if (data.isPaused) {
                pauseStatus.style.display = 'block';
                document.getElementById('pauseMessage').textContent = '⏸️ Processing paused';
                document.getElementById('pauseReason').textContent = `Reason: ${this.formatPauseReason(data.pauseReason)}`;
                
                // Populate resume position selector
                this.populateResumePositionSelector();
                
                resumeButton.style.display = 'inline-block';
                startButton.style.display = 'none';
                this.isPaused = true;
            } else {
                pauseStatus.style.display = 'none';
                resumeButton.style.display = 'none';
                startButton.style.display = 'inline-block';
            }
        } else {
            unprocessedSection.style.display = 'none';
            pauseStatus.style.display = 'none';
        }
        
        // Update blocked links display
        if (data.blockedLinks.length > 0) {
            document.getElementById('blockedLinks').style.display = 'block';
            this.displayBlockedLinks(data.blockedLinks);
        } else {
            document.getElementById('blockedLinks').style.display = 'none';
        }
    }

    displayBlockedLinks(blockedLinks) {
        const container = document.getElementById('blockedLinksList');
        
        let html = '';
        for (const link of blockedLinks) {
            const shortUrl = link.url.length > 50 ? link.url.substring(0, 50) + '...' : link.url;
            html += `
                <div style="margin-bottom: 8px; padding: 4px; background: rgba(255, 255, 255, 0.1); border-radius: 3px;">
                    <div style="font-weight: bold;">${link.index + 1}. ${shortUrl}</div>
                    <div style="opacity: 0.8; font-size: 9px;">
                        ${link.blockageType}: ${link.blockageMessage}
                    </div>
                    <div style="opacity: 0.6; font-size: 8px;">
                        ${new Date(link.timestamp).toLocaleTimeString()}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }

    formatPauseReason(reason) {
        const reasonMap = {
            'cloudflare': 'Cloudflare protection detected',
            'recaptcha': 'reCAPTCHA challenge required',
            'hcaptcha': 'hCaptcha challenge required',
            'login': 'Login required',
            'subscription': 'Subscription/paywall detected',
            'bot-challenge': 'Bot verification required',
            'rate-limit': 'Rate limiting detected',
            'access-denied': 'Access denied',
            'security': 'Security check required',
            'maintenance': 'Site under maintenance',
            'error': 'Error page encountered',
            'paywall': 'Content behind paywall'
        };
        
        return reasonMap[reason] || reason || 'Unknown reason';
    }

    async exportUnprocessedLinks() {
        try {
            console.log('📋 Exporting unprocessed links...');
            
            const response = await this.sendMessageWithRetry({ action: 'exportUnprocessedLinks' });
            
            if (response && response.success) {
                // Create a temporary textarea and copy to clipboard
                const textarea = document.createElement('textarea');
                textarea.value = response.linksText;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                
                this.showStatus(`📋 ${response.count} links copied to clipboard`, 'idle');
                
                // Also download as file
                const blob = new Blob([response.linksText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `unprocessed-links-${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
            } else {
                throw new Error('Failed to export links');
            }
        } catch (error) {
            console.error('Error exporting unprocessed links:', error);
            this.showStatus('❌ Error exporting links', 'idle');
        }
    }

    async clearBlockedLinks() {
        try {
            console.log('🗑️ Clearing blocked links...');
            
            const response = await this.sendMessageWithRetry({ action: 'clearBlockedLinks' });
            
            if (response && response.success) {
                this.showStatus('🗑️ Blocked links cleared', 'idle');
                // Refresh the display
                await this.syncUnprocessedLinks();
            } else {
                throw new Error('Failed to clear blocked links');
            }
        } catch (error) {
            console.error('Error clearing blocked links:', error);
            this.showStatus('❌ Error clearing blocked links', 'idle');
        }
    }

    // Load extension UI toggle setting
    async loadExtensionUIToggle() {
        try {
            const result = await chrome.storage.local.get(['extensionUIEnabled']);
            const toggle = document.getElementById('extensionUIToggle');
            // Default to false (disabled) for clean batch processing
            toggle.checked = result.extensionUIEnabled || false;
            console.log('✅ Extension UI toggle loaded:', toggle.checked);
        } catch (error) {
            console.error('Error loading extension UI toggle:', error);
            // Default to disabled
            document.getElementById('extensionUIToggle').checked = false;
        }
    }

    // Toggle extension UI on/off
    async toggleExtensionUI() {
        try {
            const toggle = document.getElementById('extensionUIToggle');
            const enabled = toggle.checked;
            
            await chrome.storage.local.set({ extensionUIEnabled: enabled });
            
            console.log('🔄 Extension UI toggled:', enabled ? 'enabled' : 'disabled');
            
            // Show feedback to user
            if (enabled) {
                this.showStatus('👁️ Extension UI enabled - will show on news pages', 'idle');
            } else {
                this.showStatus('🚫 Extension UI disabled - clean pages for batch processing', 'idle');
            }
        } catch (error) {
            console.error('Error toggling extension UI:', error);
            this.showStatus('❌ Error saving UI setting', 'idle');
        }
    }

    // Start periodic status updates
    startStatusUpdates() {
        // Update every 2 seconds when processing
        this.statusUpdateInterval = setInterval(async () => {
            await this.updateProcessingStatus();
        }, 2000);
    }

    // Update processing status display
    async updateProcessingStatus() {
        try {
            const response = await this.sendMessageWithRetry({ action: 'getProcessingStatus' });
            
            if (response) {
                this.updateStatusDisplay(response);
            }
        } catch (error) {
            console.error('Error updating processing status:', error);
        }
    }

    // Update status display in UI
    updateStatusDisplay(status) {
        const statusSection = document.getElementById('processingStatusSection');
        const processedCount = document.getElementById('processedCount');
        const failedCount = document.getElementById('failedCount');
        const unprocessedCount = document.getElementById('unprocessedCount');
        const queueCount = document.getElementById('queueCount');
        const currentlyProcessing = document.getElementById('currentlyProcessing');
        const currentProcessingLink = document.getElementById('currentProcessingLink');
        
        // Show/hide status section
        if (status.totalLinks > 0) {
            statusSection.style.display = 'block';
            
            // Update counts
            processedCount.textContent = status.processedCount;
            failedCount.textContent = status.failedCount;
            unprocessedCount.textContent = status.unprocessedCount;
            queueCount.textContent = status.queueLength;
            
            // Update currently processing
            if (status.currentlyProcessingLink) {
                currentlyProcessing.style.display = 'block';
                currentProcessingLink.textContent = status.currentlyProcessingLink;
            } else {
                currentlyProcessing.style.display = 'none';
            }
            
            // Update button states
            this.updateButtonStates(status);
            
            // Show control buttons if processing has started
            if (status.processedCount > 0 || status.failedCount > 0 || status.isProcessing) {
                document.getElementById('resetProcessing').style.display = 'inline-block';
                document.getElementById('copyUnprocessed').style.display = 'inline-block';
            }
        } else {
            statusSection.style.display = 'none';
        }
    }

    // Update button states based on processing status
    updateButtonStates(status) {
        const startBtn = document.getElementById('startProcessing');
        const resumeBtn = document.getElementById('resumeProcessing');
        const pauseBtn = document.getElementById('pauseProcessing');
        const batchBtn = document.getElementById('batchProcessing');
        
        if (status.isPaused) {
            // Paused state
            startBtn.style.display = 'none';
            resumeBtn.style.display = 'inline-block';
            resumeBtn.classList.remove('disabled');
            pauseBtn.classList.add('disabled');
            batchBtn.classList.add('disabled');
        } else if (status.isProcessing) {
            // Processing state
            startBtn.classList.add('disabled');
            resumeBtn.style.display = 'none';
            pauseBtn.classList.remove('disabled');
            batchBtn.classList.add('disabled');
        } else {
            // Idle state
            startBtn.style.display = 'inline-block';
            startBtn.classList.remove('disabled');
            resumeBtn.style.display = 'none';
            pauseBtn.classList.add('disabled');
            batchBtn.classList.remove('disabled');
        }
    }

    // Pause processing
    async pauseProcessing() {
        try {
            const response = await this.sendMessageWithRetry({ action: 'pauseProcessing' });
            
            if (response && response.success) {
                this.showStatus('⏸️ Processing paused', 'idle');
            }
        } catch (error) {
            console.error('Error pausing processing:', error);
            this.showStatus('❌ Error pausing processing', 'idle');
        }
    }


    // Reset processing
    async resetProcessing() {
        try {
            if (!confirm('Reset all processing state? This will clear processed/failed link tracking.')) {
                return;
            }
            
            const response = await this.sendMessageWithRetry({ action: 'resetProcessing' });
            
            if (response && response.success) {
                this.showStatus('🔄 Processing state reset', 'idle');
                // Hide control buttons
                document.getElementById('resetProcessing').style.display = 'none';
                document.getElementById('copyUnprocessed').style.display = 'none';
                document.getElementById('processingStatusSection').style.display = 'none';
            }
        } catch (error) {
            console.error('Error resetting processing:', error);
            this.showStatus('❌ Error resetting processing', 'idle');
        }
    }

    // Copy unprocessed links to clipboard
    async copyUnprocessedLinks() {
        try {
            const response = await this.sendMessageWithRetry({ action: 'getUnprocessedLinks' });
            
            if (response && response.unprocessedLinks) {
                const unprocessedText = response.unprocessedLinks.join('\n');
                
                if (unprocessedText) {
                    // Copy to clipboard
                    await navigator.clipboard.writeText(unprocessedText);
                    this.showStatus(`📋 Copied ${response.unprocessedLinks.length} unprocessed links`, 'idle');
                } else {
                    this.showStatus('✅ No unprocessed links to copy', 'idle');
                }
            }
        } catch (error) {
            console.error('Error copying unprocessed links:', error);
            this.showStatus('❌ Error copying unprocessed links', 'idle');
        }
    }




    // Open dashboard in a new tab
    openDashboard() {
        chrome.tabs.create({
            url: chrome.runtime.getURL('dashboard.html')
        });
    }

    // Cleanup
    cleanup() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
    }
}

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', () => {
    new UniversalNewsProcessor();
});