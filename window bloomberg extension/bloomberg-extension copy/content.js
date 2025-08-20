class UniversalNewsPageHandler {
    constructor() {
        this.currentSite = this.detectCurrentSite();
        this.controlsInjected = false;
        this.retryCount = 0;
        this.maxRetries = 10;
        this.observer = null;
        this.siteConfig = null;
        this.accessBlocked = false;
        this.blockageType = null;
        this.detectionAttempts = 0;
        this.maxDetectionAttempts = 5;
        this.accessCheckDisabled = false;
        
        this.initializeSiteConfig().then(() => {
            if (this.isNewsSite()) {
                this.init();
            }
        });
        
        // Listen for messages from background script
        this.setupMessageListener();
    }
    
    // Setup message listener for background script commands
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'disableAccessCheck':
                    this.accessCheckDisabled = true;
                    console.log('🚫 Access check disabled by background script');
                    sendResponse({ success: true });
                    break;
                    
                case 'enableAccessCheck':
                    this.accessCheckDisabled = false;
                    console.log('✅ Access check enabled by background script');
                    sendResponse({ success: true });
                    break;
                    
                case 'resetAccessDetection':
                    this.detectionAttempts = 0;
                    this.accessBlocked = false;
                    this.blockageType = null;
                    console.log('🔄 Access detection reset');
                    sendResponse({ success: true });
                    break;
            }
        });
    }
    
    // Initialize site configuration
    async initializeSiteConfig() {
        try {
            // Create a basic site configuration inline since we can't import modules in content scripts
            this.siteConfig = this.createSiteConfig();
        } catch (error) {
            console.error('Failed to initialize site configuration:', error);
            this.siteConfig = null;
        }
    }

    // Create inline site configuration
    createSiteConfig() {
        const hostname = window.location.hostname.replace(/^www\./, '');
        
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
        
        return configs[hostname] || this.getGenericConfig();
    }

    getGenericConfig() {
        return {
            name: 'News Site',
            articleSelectors: ['article', '.article-body', '.story-body', '.content', '.post-content', '.entry-content', 'main', '.main-content'],
            titleSelectors: ['h1', '.headline', '.title', '.post-title', '.entry-title'],
            paywall: { selectors: ['.paywall', '.subscription-required', '.premium-content'] },
            authIndicators: ['.user-menu', '.profile-menu', '.account-menu', '[class*="user"]', '[class*="profile"]']
        };
    }

    // Passive, stealth-friendly access prevention detection
    detectAccessPrevention() {
        const detectionResults = {
            isBlocked: false,
            blockageType: null,
            needsUserIntervention: false,
            message: null,
            detectedElements: []
        };

        // Use passive, delayed detection to avoid triggering anti-bot systems
        try {
            // 1. Natural page observation - check what's actually visible to users
            const pageMetrics = this.analyzePageNaturally();
            
            // 2. Check for obvious user-facing indicators only
            const userFacingBlocks = this.checkUserFacingBlocks();
            
            // 3. Analyze content availability (what a human would see)
            const contentAnalysis = this.analyzeContentAvailability();
            
            // Combine results using human-like assessment
            if (userFacingBlocks.isBlocked) {
                return userFacingBlocks;
            }
            
            if (contentAnalysis.isBlocked) {
                return contentAnalysis;
            }
            
            if (pageMetrics.isBlocked) {
                return pageMetrics;
            }
            
        } catch (error) {
            // If detection fails, assume page is accessible to avoid false positives
            console.debug('Passive detection error:', error);
        }

        return detectionResults;
    }

    // Analyze page using natural, human-like observation
    analyzePageNaturally() {
        const result = { isBlocked: false, blockageType: null, message: null, needsUserIntervention: false };
        
        // Natural page assessment - what would a human immediately notice?
        const pageTitle = document.title || '';
        const bodyText = document.body ? document.body.textContent : '';
        
        // Check for obvious user-facing messages (case-insensitive, natural language)
        // Made more specific to avoid false positives
        const naturalIndicators = [
            { pattern: /sign.?in.*required.*to.*read/i, type: 'login', message: 'Sign-in required' },
            { pattern: /log.?in.*to.*continue.*reading/i, type: 'login', message: 'Login to continue' },
            { pattern: /subscription.*required.*to.*continue/i, type: 'subscription', message: 'Subscription required' },
            { pattern: /this.*article.*is.*for.*premium.*subscribers/i, type: 'subscription', message: 'Premium content' },
            { pattern: /access.*denied.*to.*this.*content/i, type: 'access-denied', message: 'Access denied' },
            { pattern: /temporarily.*unavailable/i, type: 'maintenance', message: 'Site temporarily unavailable' },
            { pattern: /under.*maintenance/i, type: 'maintenance', message: 'Site under maintenance' }
        ];
        
        // Check title and main content for natural language indicators
        const textToCheck = (pageTitle + ' ' + bodyText.substring(0, 1000)).toLowerCase();
        
        for (const indicator of naturalIndicators) {
            if (indicator.pattern.test(textToCheck)) {
                result.isBlocked = true;
                result.blockageType = indicator.type;
                result.message = indicator.message;
                result.needsUserIntervention = true;
                break;
            }
        }
        
        return result;
    }

    // Check for user-facing blocks that are immediately visible
    checkUserFacingBlocks() {
        const result = { isBlocked: false, blockageType: null, message: null, needsUserIntervention: false };
        
        // Only check for elements that are clearly visible to users
        // Use natural selectors that don't trigger suspicion
        const visibleChecks = [
            // Check for login forms that are prominently displayed
            () => {
                const loginForms = document.querySelectorAll('form');
                for (const form of loginForms) {
                    const formText = form.textContent.toLowerCase();
                    if (formText.includes('sign in') || formText.includes('log in')) {
                        const isVisible = this.isElementVisibleToUser(form);
                        if (isVisible && formText.length < 200) { // Short form suggests login requirement
                            return { type: 'login', message: 'Login form detected' };
                        }
                    }
                }
                return null;
            },
            
            // Check for subscription walls with very specific text (avoid newsletter/promo buttons)
            () => {
                // Only look for very specific paywall-blocking elements
                const paywallSelectors = [
                    '[class*="paywall"]',
                    '[class*="subscription-wall"]', 
                    '[class*="premium-wall"]',
                    '[id*="paywall"]'
                ];
                
                for (const selector of paywallSelectors) {
                    const paywallElement = document.querySelector(selector);
                    if (paywallElement && this.isElementVisibleToUser(paywallElement)) {
                        const elementText = paywallElement.textContent.toLowerCase();
                        // Only trigger if it specifically mentions blocking access
                        if (elementText.includes('continue reading') || 
                            elementText.includes('subscribe to read') ||
                            elementText.includes('premium subscription required')) {
                            return { type: 'subscription', message: 'Subscription required' };
                        }
                    }
                }
                return null;
            }
        ];
        
        // Run visible checks with delay to appear natural
        for (const check of visibleChecks) {
            try {
                const checkResult = check();
                if (checkResult) {
                    result.isBlocked = true;
                    result.blockageType = checkResult.type;
                    result.message = checkResult.message;
                    result.needsUserIntervention = true;
                    break;
                }
            } catch (error) {
                // Continue with other checks if one fails
                continue;
            }
        }
        
        return result;
    }

    // Analyze content availability using natural human-like assessment
    analyzeContentAvailability() {
        const result = { isBlocked: false, blockageType: null, message: null, needsUserIntervention: false };
        
        if (!this.siteConfig) return result;
        
        try {
            // Natural content assessment - what would a human see?
            let hasMainContent = false;
            let hasTitle = false;
            
            // Check for title in a natural way
            for (const selector of this.siteConfig.titleSelectors) {
                const titleElement = document.querySelector(selector);
                if (titleElement && this.isElementVisibleToUser(titleElement)) {
                    const titleText = titleElement.textContent.trim();
                    if (titleText.length > 10) { // Reasonable title length
                        hasTitle = true;
                        break;
                    }
                }
            }
            
            // Check for substantial content in a natural way
            for (const selector of this.siteConfig.articleSelectors) {
                const contentElement = document.querySelector(selector);
                if (contentElement && this.isElementVisibleToUser(contentElement)) {
                    const contentText = contentElement.textContent.trim();
                    if (contentText.length > 200) { // Substantial content
                        hasMainContent = true;
                        break;
                    }
                }
            }
            
            // Natural assessment: if there's a title but no content, likely restricted
            // Made more conservative to avoid false positives on slow-loading pages
            if (hasTitle && !hasMainContent) {
                // Double-check by looking at overall page content
                const bodyText = document.body.textContent.trim();
                // More conservative thresholds to avoid false positives
                if (bodyText.length < 400) { // Very light content suggests restriction
                    // Additional check: make sure this isn't just a slow loading page
                    const hasLoadingIndicators = document.querySelector('[class*="loading"], [class*="spinner"], [class*="skeleton"]');
                    if (!hasLoadingIndicators) {
                        result.isBlocked = true;
                        result.blockageType = 'restricted-content';
                        result.message = 'Content appears to be restricted';
                        result.needsUserIntervention = true;
                    }
                }
            }
            
        } catch (error) {
            // If analysis fails, assume content is available
            console.debug('Content analysis error:', error);
        }
        
        return result;
    }

    // Check if element is actually visible to a human user (stealth-friendly)
    isElementVisibleToUser(element) {
        if (!element) return false;
        
        try {
            // Natural visibility check that doesn't trigger detection
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            
            // Basic visibility checks that a human would naturally observe
            return (
                rect.width > 0 && 
                rect.height > 0 && 
                style.display !== 'none' && 
                style.visibility !== 'hidden' &&
                style.opacity !== '0'
            );
        } catch (error) {
            // If check fails, assume visible to avoid false negatives
            return true;
        }
    }


    // Notify background script about access blockage with natural timing
    async notifyBackgroundOfBlockage(detection) {
        try {
            // Add natural delay to avoid appearing automated
            const notificationDelay = 1000 + Math.random() * 1000; // 1-2 seconds
            
            setTimeout(async () => {
                await chrome.runtime.sendMessage({
                    action: 'accessBlocked',
                    url: window.location.href,
                    blockageType: detection.blockageType,
                    message: detection.message,
                    needsUserIntervention: detection.needsUserIntervention,
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent, // Include for debugging
                    viewport: {
                        width: window.innerWidth,
                        height: window.innerHeight
                    }
                });
            }, notificationDelay);
            
        } catch (error) {
            console.error('Failed to notify background of blockage:', error);
        }
    }
    
    // Human-like reading simulation before detection
    simulateHumanReading() {
        return new Promise(resolve => {
            // Simulate natural reading time based on content length
            const bodyText = document.body ? document.body.textContent : '';
            const wordCount = bodyText.split(/\s+/).length;
            
            // Average reading speed: 200-300 words per minute
            const baseReadingTime = Math.min(wordCount / 4, 3000); // Cap at 3 seconds
            const randomVariation = Math.random() * 1000; // Add some randomness
            
            const readingTime = baseReadingTime + randomVariation;
            
            setTimeout(resolve, readingTime);
        });
    }
    
    detectCurrentSite() {
        const hostname = window.location.hostname;
        return {
            hostname,
            isBloomberg: hostname.includes('bloomberg.com'),
            isWSJ: hostname.includes('wsj.com'),
            isCNBC: hostname.includes('cnbc.com'),
            isBarrons: hostname.includes('barrons.com'),
            isFT: hostname.includes('ft.com'),
            isMarketWatch: hostname.includes('marketwatch.com'),
            isReuters: hostname.includes('reuters.com'),
            isYahooFinance: hostname.includes('finance.yahoo.com')
        };
    }
    
    isNewsSite() {
        const site = this.currentSite;
        return site.isBloomberg || site.isWSJ || site.isCNBC || site.isBarrons || 
               site.isFT || site.isMarketWatch || site.isReuters || site.isYahooFinance;
    }
    
    init() {
        const siteName = this.siteConfig ? this.siteConfig.name : 'Unknown Site';
        console.log(`🔄 Initializing ${siteName} page handler`);
        
        // Use natural, human-like timing for initialization
        const naturalDelay = 2000 + Math.random() * 1000; // 2-3 seconds, randomized
        
        setTimeout(() => {
            // Multiple strategies for page load detection
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupPageWithRetry());
            } else {
                this.setupPageWithRetry();
            }
            
            // Watch for dynamic content changes
            this.setupDynamicContentObserver();
            
            // Fallback retry attempts
            this.scheduleRetryAttempts();
        }, naturalDelay);
    }

    
    setupPage() {
        if (this.controlsInjected) {
            console.log('✅ Controls already injected, skipping');
            return true;
        }
        
        console.log('📄 Setting up page controls');
        
        // Enhanced article page detection
        const isArticlePage = this.detectArticlePage();
        const hasMinimalContent = this.hasMinimalContent();
        
        if (isArticlePage || hasMinimalContent) {
            console.log('✅ Article page detected, injecting controls');
            
            // Perform passive access check after content is detected
            // This mimics natural user behavior - checking content availability after page load
            // Increased delay to allow pages to fully load and avoid false positives
            setTimeout(() => {
                this.performPassiveAccessCheck();
            }, 4000 + Math.random() * 1000); // 4-5 seconds delay, randomized
            
            this.injectControls();
            this.notifyPageLoaded();
            return true;
        } else {
            console.log('⏳ Article content not yet ready, will retry');
            return false;
        }
    }
    
    // Perform passive access check that mimics natural user behavior
    async performPassiveAccessCheck() {
        // Check if access detection is disabled (e.g., during sequential processing)
        if (this.accessCheckDisabled) {
            console.log('⏭️ Access check disabled - skipping detection');
            return;
        }
        
        this.detectionAttempts++;
        
        try {
            // Simulate human reading behavior before checking access
            await this.simulateHumanReading();
            
            // Additional natural delay to avoid appearing automated
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
            
            const detection = this.detectAccessPrevention();
            
            if (detection.isBlocked) {
                console.warn(`🚫 Access restriction detected (attempt ${this.detectionAttempts}): ${detection.message}`);
                
                // Retry mechanism - only report as blocked after multiple attempts to avoid false positives
                if (this.detectionAttempts < this.maxDetectionAttempts) {
                    console.log(`🔄 Retrying access detection in 3 seconds... (${this.detectionAttempts}/${this.maxDetectionAttempts})`);
                    setTimeout(() => {
                        this.performPassiveAccessCheck();
                    }, 3000);
                    return;
                }
                
                console.warn(`🚫 Confirmed access restriction after ${this.detectionAttempts} attempts: ${detection.message}`);
                this.accessBlocked = true;
                this.blockageType = detection.blockageType;
                
                // Notify background script about the blockage
                this.notifyBackgroundOfBlockage(detection);
            } else {
                console.log('✅ Page accessible for processing');
                this.accessBlocked = false;
                this.blockageType = null;
            }
        } catch (error) {
            // If detection fails, assume page is accessible
            console.debug('Access check failed, assuming accessible:', error);
            this.accessBlocked = false;
            this.blockageType = null;
        }
    }
    
    detectArticlePage() {
        // Use site-specific article selectors
        const articleSelectors = this.siteConfig ? 
            this.siteConfig.articleSelectors : 
            ['article', '.article-body', '.story-body', '.content', 'main'];
        
        const hasArticleElement = articleSelectors.some(selector => {
            const element = document.querySelector(selector);
            return element && element.textContent.trim().length > 100;
        });
        
        // Check for site-specific content patterns
        const siteKeywords = this.getSiteKeywords();
        const hasSiteContent = siteKeywords.some(keyword => 
            document.title.toLowerCase().includes(keyword) ||
            document.querySelector(`[class*="${keyword}"]`) ||
            document.querySelector(`[data-module*="${keyword}"]`)
        );
            
        return hasArticleElement || hasSiteContent;
    }

    getSiteKeywords() {
        const site = this.currentSite;
        if (site.isBloomberg) return ['bloomberg', 'story', 'article'];
        if (site.isWSJ) return ['wsj', 'wall street', 'journal'];
        if (site.isCNBC) return ['cnbc', 'article', 'story'];
        if (site.isBarrons) return ['barrons', 'article', 'story'];
        if (site.isFT) return ['ft', 'financial times', 'article'];
        if (site.isMarketWatch) return ['marketwatch', 'article', 'story'];
        if (site.isReuters) return ['reuters', 'article', 'story'];
        if (site.isYahooFinance) return ['yahoo', 'finance', 'article'];
        return ['article', 'story', 'news'];
    }
    
    async injectControls() {
        if (this.controlsInjected) return;
        
        // Check if UI is enabled by user - default is DISABLED
        try {
            const result = await chrome.storage.local.get(['extensionUIEnabled']);
            if (!result.extensionUIEnabled) {
                console.log('🚫 Extension UI disabled - skipping UI injection (enable in extension popup)');
                this.controlsInjected = true; // Prevent future injection attempts
                return;
            }
        } catch (error) {
            // If we can't check storage, default to disabled
            console.log('🚫 Cannot check UI setting - defaulting to disabled');
            this.controlsInjected = true;
            return;
        }
        
        // Create floating control panel
        const controlPanel = this.createControlPanel();
        document.body.appendChild(controlPanel);
        
        this.controlsInjected = true;
        const siteName = this.siteConfig ? this.siteConfig.name : 'news site';
        console.log(`✅ Controls injected into ${siteName} page`);
    }
    
    
    async printAndNext() {
        console.log('🖨️ Auto-printing page and moving to next');
        
        // Update button state
        const button = document.querySelector('#bpc-print-next');
        if (!button) {
            console.error('Print button not found!');
            return;
        }
        
        const originalText = button.innerHTML;
        button.innerHTML = '⏳ Printing...';
        button.disabled = true;
        
        try {
            // Get print method preference from background script
            const printMethod = await this.getPrintMethod();
            console.log('📋 Using print method:', printMethod);
            
            // Hide extension UI before printing
            await this.hideUIForPrinting();
            
            let result;
            if (printMethod === 'simple') {
                // Use simple automation method
                result = await this.simpleAutomationPrint();
            } else if (printMethod === 'python') {
                // Use Python automation method
                result = await this.pythonAutomationPrint();
            } else {
                // Use current method (Chrome native print)
                const saveSettings = await this.sendMessageWithRetry({
                    action: 'getSaveSettings'
                });
                result = await this.autoPrintToPDF(saveSettings);
            }
            
            // Show UI again
            await this.showUIAfterPrinting();
            
            // Handle result and move to next
            await this.handlePrintResult(result, button, originalText);
            
        } catch (error) {
            console.error('Error during auto-print:', error);
            
            // Show UI again in case of error
            await this.showUIAfterPrinting();
            
            button.innerHTML = '❌ Print Error';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 2000);
        }
    }

    // Get print method preference
    async getPrintMethod() {
        try {
            const result = await new Promise(resolve => {
                chrome.storage.local.get(['printMethod'], resolve);
            });
            return result.printMethod || 'current';
        } catch (error) {
            console.warn('Could not get print method preference:', error);
            return 'current';
        }
    }

    // Simple automation print method using window.print()
    async simpleAutomationPrint() {
        console.log('🤖 Starting simple automation (window.print())');
        
        try {
            // Get timing preferences
            const timingPrefs = await this.getTimingPreferences();
            console.log('⏱️ Using timing preferences:', timingPrefs);
            
            // Wait for page to be fully loaded and ready
            await this.waitForPageReady(timingPrefs.pageLoadWait);
            
            // Add print-optimized styles
            const printStyles = document.createElement('style');
            printStyles.id = 'simple-automation-print-styles';
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
            
            console.log('🖨️ Triggering print dialog with window.print()...');
            
            // Use window.print() - this actually works and opens the print dialog
            window.print();
            
            // Clean up styles after a delay
            setTimeout(() => {
                const stylesEl = document.getElementById('simple-automation-print-styles');
                if (stylesEl) {
                    stylesEl.remove();
                }
            }, 2000);
            
            return {
                success: true,
                method: 'simple-automation',
                message: `Simple automation completed - print dialog opened (${timingPrefs.pageLoadWait/1000}s page wait)`
            };
            
        } catch (error) {
            console.error('❌ Simple automation failed:', error);
            return {
                success: false,
                method: 'simple-automation',
                error: error.message
            };
        }
    }

    // Python automation print method with real-time completion notification
    async pythonAutomationPrint() {
        console.log('🐍 Starting Python automation with callback system');
        
        try {
            // Get timing preferences
            const timingPrefs = await this.getTimingPreferences();
            console.log('⏱️ Using timing preferences:', timingPrefs);
            
            // Wait for page to be fully loaded and ready
            await this.waitForPageReady(timingPrefs.pageLoadWait);
            
            // Step 1: Register callback with automation service
            const tabInfo = {
                url: window.location.href,
                title: document.title,
                timestamp: Date.now()
            };
            
            console.log('📞 Registering callback for completion notification...');
            const callbackResponse = await fetch('http://localhost:8888/register_callback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    callback_url: 'chrome-extension://internal/automation-complete',
                    tab_info: tabInfo
                })
            });
            
            if (callbackResponse.ok) {
                console.log('✅ Callback registered successfully');
            }
            
            // Step 2: Set up completion listener
            const automationCompletePromise = new Promise((resolve) => {
                const pollForCompletion = async () => {
                    try {
                        const statusResponse = await fetch('http://localhost:8888/status');
                        if (statusResponse.ok) {
                            const status = await statusResponse.json();
                            
                            // Check if automation completed and was for our tab
                            if (!status.is_automating && status.stats.last_automation) {
                                const lastAutomation = status.stats.last_automation;
                                const timeDiff = Date.now() - (lastAutomation.completed_at * 1000);
                                
                                // If completed within last 5 seconds, consider it our automation
                                if (timeDiff < 5000) {
                                    console.log('✅ Automation completed for our tab');
                                    resolve({
                                        success: true,
                                        duration: lastAutomation.duration,
                                        print_delay: lastAutomation.print_delay,
                                        save_delay: lastAutomation.save_delay
                                    });
                                    return;
                                }
                            }
                        }
                        
                        // Continue polling if automation still running
                        if (status && status.is_automating) {
                            setTimeout(pollForCompletion, 500);
                        } else {
                            // Timeout after reasonable time
                            setTimeout(() => {
                                resolve({
                                    success: true,
                                    duration: 0,
                                    timeout: true
                                });
                            }, 15000);
                        }
                    } catch (error) {
                        console.warn('Polling error:', error);
                        setTimeout(pollForCompletion, 1000);
                    }
                };
                
                // Start polling
                setTimeout(pollForCompletion, 100);
            });
            
            // Step 3: Start automation
            console.log('🌐 Starting Python automation...');
            const response = await fetch('http://localhost:8888/print', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    page_load_delay: timingPrefs.pageLoadWait / 1000,
                    print_delay: timingPrefs.printDialogWait / 1000,
                    save_delay: timingPrefs.saveDialogWait / 1000
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ Python automation started, waiting for completion...');
                
                // Step 4: Wait for completion notification
                const completionResult = await automationCompletePromise;
                
                return {
                    success: true,
                    method: 'python-automation',
                    message: completionResult.timeout ? 
                        'Python automation completed (timeout reached)' :
                        `Python automation completed (${completionResult.duration}s)`,
                    print_delay_used: completionResult.print_delay || result.print_delay_used,
                    save_delay_used: completionResult.save_delay || result.save_delay_used,
                    actual_duration: completionResult.duration || 0
                };
            } else {
                throw new Error(result.error || 'Python automation failed');
            }
            
        } catch (error) {
            console.error('❌ Python automation failed:', error);
            
            if (error.message.includes('fetch')) {
                return {
                    success: false,
                    method: 'python-automation',
                    error: 'Python service not running. Please start the automation service.'
                };
            }
            
            return {
                success: false,
                method: 'python-automation',
                error: error.message
            };
        }
    }

    // Get timing preferences
    async getTimingPreferences() {
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
            console.warn('Could not get timing preferences:', error);
            return {
                pageLoadWait: 2000,
                printDialogWait: 2000,
                saveDialogWait: 1500
            };
        }
    }


    // Wait for page to be fully ready
    async waitForPageReady(additionalWait = 1000) {
        // Wait for document to be ready
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                const checkReady = () => {
                    if (document.readyState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkReady, 100);
                    }
                };
                checkReady();
            });
        }
        
        // Additional wait for any dynamic content (user configurable)
        console.log(`⏳ Waiting additional ${additionalWait/1000}s for page content to load...`);
        await new Promise(resolve => setTimeout(resolve, additionalWait));
        console.log('✅ Page is ready for automation');
    }

    // Handle print result and move to next
    async handlePrintResult(result, button, originalText) {
        if (result && result.success) {
            if (result.method === 'simple-automation') {
                button.innerHTML = '🤖 Automation Complete';
                console.log('✅ Simple automation completed');
                
                // For simple automation, move to next immediately after a short delay
                setTimeout(async () => {
                    console.log('📤 Sending linkCompleted message to background script...');
                    await this.sendMessageWithRetry({
                        action: 'linkCompleted',
                        url: window.location.href
                    });
                }, 2000); // 2 second delay to ensure print processed
                
            } else if (result.method === 'python-automation') {
                button.innerHTML = '🐍 Python Automation Complete';
                console.log('✅ Python automation completed');
                
                // Use minimal delay since automation already waited for completion
                // Just give a small buffer for any final file operations
                const bufferTime = 1000; // 1 second buffer for file system operations
                
                console.log(`⏳ Adding ${bufferTime/1000}s buffer for file operations...`);
                
                setTimeout(async () => {
                    console.log('📤 Sending linkCompleted message to background script...');
                    await this.sendMessageWithRetry({
                        action: 'linkCompleted',
                        url: window.location.href
                    });
                }, bufferTime);
                
            } else if (result.method === 'chrome-print') {
                button.innerHTML = '🖨️ Print Dialog Opened';
                console.log('💡 Save as PDF with filename:', result.filename);
                
                // Wait for user to complete printing before moving to next
                setTimeout(async () => {
                    console.log('📤 Sending linkCompleted message to background script...');
                    await this.sendMessageWithRetry({
                        action: 'linkCompleted',
                        url: window.location.href
                    });
                }, 3000); // Give user time to complete printing
            }
        } else {
            // Fallback handling
            button.innerHTML = '✅ Print Processed';
            
            // Move to next link immediately
            setTimeout(async () => {
                console.log('📤 Sending linkCompleted message to background script...');
                await this.sendMessageWithRetry({
                    action: 'linkCompleted',
                    url: window.location.href
                });
            }, 1000);
        }
        
        // Reset button after delay
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
        }, 4000);
    }
    
    async skipPage() {
        console.log('⏭️ Skipping current page');
        
        // Update button state
        const button = document.querySelector('#bpc-skip');
        if (!button) {
            console.error('Skip button not found!');
            return;
        }
        
        const originalText = button.innerHTML;
        button.innerHTML = '⏭️ Skipping...';
        button.disabled = true;
        
        try {
            // Notify background script to move to next link
            await this.sendMessageWithRetry({
                action: 'linkCompleted',
                url: window.location.href,
                skipped: true
            });
            
            // Update UI
            button.innerHTML = '✅ Skipped';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Error skipping page:', error);
            button.innerHTML = '⚠️ Error';
            setTimeout(() => {
                button.innerHTML = originalText;
                button.disabled = false;
            }, 2000);
        }
    }
    
    toggleMinimize() {
        const content = document.querySelector('#bpc-content');
        const minimizeBtn = document.querySelector('#bpc-minimize');
        
        if (content.style.display === 'none') {
            content.style.display = 'block';
            minimizeBtn.textContent = '−';
        } else {
            content.style.display = 'none';
            minimizeBtn.textContent = '+';
        }
    }

    
    async notifyPageLoaded() {
        try {
            // Tell background script that page is loaded
            await this.sendMessageWithRetry({
                action: 'pageLoaded',
                url: window.location.href
            });
            console.log('✅ Notified background script of page load');
        } catch (error) {
            console.warn('Could not notify background script:', error);
        }
    }

    // Enhanced retry logic for page setup
    setupPageWithRetry() {
        if (this.setupPage()) {
            // Success - stop retrying
            return;
        }
        
        // Retry with exponential backoff
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            const delay = Math.min(1000 * Math.pow(1.5, this.retryCount), 5000);
            console.log(`⏳ Retrying page setup in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
            setTimeout(() => this.setupPageWithRetry(), delay);
        } else {
            console.warn('⚠️ Max retries reached, controls may not be available');
        }
    }

    // Check for minimal content to determine if page is ready
    hasMinimalContent() {
        const bodyText = document.body ? document.body.textContent.trim() : '';
        const hasTitle = document.title && document.title.trim().length > 0;
        const hasHeading = document.querySelector('h1, h2, .headline, .title, [class*="title"]');
        
        return bodyText.length > 200 || (hasTitle && hasHeading);
    }

    // Setup dynamic content observer
    setupDynamicContentObserver() {
        if (!window.MutationObserver) {
            console.warn('MutationObserver not available');
            return;
        }

        this.observer = new MutationObserver((mutations) => {
            if (this.controlsInjected) {
                return; // Already injected, stop observing
            }

            let shouldCheck = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if significant content was added
                    const hasSignificantContent = Array.from(mutation.addedNodes).some(node => {
                        return node.nodeType === Node.ELEMENT_NODE && 
                               node.textContent && 
                               node.textContent.trim().length > 50;
                    });
                    
                    if (hasSignificantContent) {
                        shouldCheck = true;
                    }
                }
            });

            if (shouldCheck) {
                console.log('📄 Dynamic content detected, checking for article page');
                setTimeout(() => this.setupPageWithRetry(), 500);
            }
        });

        // Start observing
        this.observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });

        // Stop observing after 30 seconds to prevent memory leaks
        setTimeout(() => {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
                console.log('🔄 Stopped observing DOM changes');
            }
        }, 30000);
    }

    // Schedule retry attempts at specific intervals
    scheduleRetryAttempts() {
        const retryTimes = [2000, 5000, 10000, 15000];
        
        retryTimes.forEach((delay) => {
            setTimeout(() => {
                if (!this.controlsInjected) {
                    console.log(`🔄 Scheduled retry at ${delay}ms`);
                    this.setupPageWithRetry();
                }
            }, delay);
        });
    }

    // Message passing with retry logic
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
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, i)));
            }
        }
    }

    // Enhanced control creation with better error handling
    createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'bloomberg-processor-controls';
        
        // Sanitize and create safe HTML with site-specific branding
        const siteName = this.siteConfig ? this.siteConfig.name : 'News Site';
        const safeTitle = `${siteName} Processor`;
        const safeStatus = 'Page loaded and ready';
        const safePrintText = 'Print & Next';
        const safeSkipText = 'Skip This Page';
        const safeInfo = 'Click "Print & Next" when you\'re ready to save this page and move to the next link';
        
        panel.innerHTML = `
            <div class="bpc-header">
                <span class="bpc-title">📰 ${safeTitle}</span>
                <button class="bpc-minimize" id="bpc-minimize">−</button>
            </div>
            <div class="bpc-content" id="bpc-content">
                <div class="bpc-status">
                    <span class="bpc-indicator">🟢</span>
                    <span>${safeStatus}</span>
                </div>
                <div class="bpc-actions">
                    <button class="bpc-btn bpc-btn-primary" id="bpc-print-next">
                        📄 ${safePrintText}
                    </button>
                    <button class="bpc-btn bpc-btn-secondary" id="bpc-skip">
                        ⏭️ ${safeSkipText}
                    </button>
                </div>
                <div class="bpc-info">
                    <small>${safeInfo}</small>
                </div>
            </div>
        `;
        
        // Add event listeners with error handling
        try {
            const printBtn = panel.querySelector('#bpc-print-next');
            const skipBtn = panel.querySelector('#bpc-skip');
            const minimizeBtn = panel.querySelector('#bpc-minimize');
            
            if (printBtn) {
                printBtn.addEventListener('click', () => this.printAndNext());
            }
            if (skipBtn) {
                skipBtn.addEventListener('click', () => this.skipPage());
            }
            if (minimizeBtn) {
                minimizeBtn.addEventListener('click', () => this.toggleMinimize());
            }
        } catch (error) {
            console.error('Error adding event listeners:', error);
        }
        
        return panel;
    }

    // Hide extension UI before printing
    async hideUIForPrinting() {
        const controlPanel = document.querySelector('#bloomberg-processor-controls');
        if (controlPanel) {
            controlPanel.style.display = 'none';
            console.log('🙈 Hidden extension UI for printing');
        }
        
        // Wait a moment for UI to hide
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Show extension UI after printing
    async showUIAfterPrinting() {
        const controlPanel = document.querySelector('#bloomberg-processor-controls');
        if (controlPanel) {
            controlPanel.style.display = 'block';
            console.log('👁️ Restored extension UI after printing');
        }
        
        // Wait a moment for UI to show
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Auto-print to PDF using Chrome's native print method (for single page processing)
    async autoPrintToPDF(saveSettings) {
        try {
            // Generate filename with site-specific naming for reference
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
            const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
            const pageTitle = document.title.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 30);
            
            // Get site prefix for filename
            const hostname = window.location.hostname.replace(/^www\./, '');
            const sitePrefix = hostname.split('.')[0]; // e.g., 'bloomberg', 'wsj', 'cnbc'
            
            const suggestedFilename = `${sitePrefix}_${dateStr}_${timeStr}_${pageTitle || 'article'}.pdf`;
            
            console.log('🖨️ Using Chrome native print method for single page');
            console.log('📄 Suggested filename:', suggestedFilename);
            
            // Hide extension UI before printing
            const controlPanel = document.querySelector('#bloomberg-processor-controls');
            if (controlPanel) {
                controlPanel.style.display = 'none';
            }
            
            // Add print-optimized styles temporarily
            const printStyles = document.createElement('style');
            printStyles.id = 'temp-print-styles';
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
                    .article-content,
                    .story-body,
                    main,
                    article {
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                }
            `;
            document.head.appendChild(printStyles);
            
            // Small delay to ensure styles are applied
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Use Chrome's native print dialog
            window.print();
            
            // Clean up after printing
            setTimeout(() => {
                // Remove temporary print styles
                const tempStyles = document.getElementById('temp-print-styles');
                if (tempStyles) {
                    tempStyles.remove();
                }
                
                // Show extension UI again
                if (controlPanel) {
                    controlPanel.style.display = 'block';
                }
            }, 1000);
            
            return {
                success: true,
                method: 'chrome-print',
                filename: suggestedFilename,
                message: 'Chrome print dialog opened - save as PDF with suggested filename'
            };
            
        } catch (error) {
            console.error('❌ Chrome print method failed:', error);
            throw error;
        }
    }
}

// Initialize when content script loads
new UniversalNewsPageHandler();