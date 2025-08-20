// Site-specific configuration for Universal News Processor
class SiteConfig {
    constructor() {
        this.configs = {
            'bloomberg.com': {
                name: 'Bloomberg',
                articleSelectors: [
                    'article',
                    '[data-module="ArticleBody"]',
                    '[data-module="StoryBody"]',
                    '.story-body',
                    '.article-body',
                    '.story-content'
                ],
                titleSelectors: [
                    'h1',
                    '.headline',
                    '[data-module="Headline"]',
                    '.lede-text-only__headline'
                ],
                paywall: {
                    selectors: ['.paywall', '.fence-body'],
                    indicators: ['paywall', 'subscribe', 'sign up']
                },
                authIndicators: [
                    '[data-module="UserMenu"]',
                    '.user-menu',
                    '[class*="profile"]',
                    '[class*="account"]'
                ],
                printOptimization: {
                    hideElements: [
                        '.advertisement',
                        '.ad-container',
                        '.social-share',
                        '.newsletter-signup'
                    ],
                    cleanupClasses: ['no-print']
                }
            },
            'wsj.com': {
                name: 'Wall Street Journal',
                articleSelectors: [
                    'article',
                    '.wsj-article-body',
                    '.article-content',
                    '.ArticleBody',
                    '.StoryBody',
                    '.paywall-story'
                ],
                titleSelectors: [
                    'h1',
                    '.headline',
                    '.wsj-article-headline',
                    '.ArticleHeadline'
                ],
                paywall: {
                    selectors: ['.wsj-paywall', '.subscription-required', '.paywall'],
                    indicators: ['subscribe', 'sign in', 'wsj membership']
                },
                authIndicators: [
                    '.user-nav',
                    '.profile-menu',
                    '.account-menu',
                    '[aria-label*="Account"]'
                ],
                printOptimization: {
                    hideElements: [
                        '.wsj-ad',
                        '.advertisement',
                        '.related-coverage',
                        '.social-share-container'
                    ],
                    cleanupClasses: ['no-print']
                }
            },
            'cnbc.com': {
                name: 'CNBC',
                articleSelectors: [
                    'article',
                    '.ArticleBody',
                    '.InlineArticleBody',
                    '.story-body',
                    '.RenderKeyPoints',
                    '.ArticleBodyWrapper'
                ],
                titleSelectors: [
                    'h1',
                    '.ArticleHeader-headline',
                    '.story-headline',
                    '.InlineArticleHeader-headline'
                ],
                paywall: {
                    selectors: ['.paywall', '.premium-content'],
                    indicators: ['cnbc pro', 'subscribe', 'premium']
                },
                authIndicators: [
                    '.user-menu',
                    '.profile-dropdown',
                    '.account-menu'
                ],
                printOptimization: {
                    hideElements: [
                        '.advertisement',
                        '.ad-container',
                        '.social-share',
                        '.related-content'
                    ],
                    cleanupClasses: ['no-print']
                }
            },
            'barrons.com': {
                name: "Barron's",
                articleSelectors: [
                    'article',
                    '.article-body',
                    '.story-body',
                    '.ArticleBody',
                    '.barrons-article-body'
                ],
                titleSelectors: [
                    'h1',
                    '.headline',
                    '.article-headline',
                    '.story-headline'
                ],
                paywall: {
                    selectors: ['.paywall', '.subscription-required'],
                    indicators: ['subscribe', 'barrons subscription']
                },
                authIndicators: [
                    '.user-menu',
                    '.profile-menu',
                    '.account-dropdown'
                ],
                printOptimization: {
                    hideElements: [
                        '.advertisement',
                        '.ad-container',
                        '.social-share',
                        '.newsletter-signup'
                    ],
                    cleanupClasses: ['no-print']
                }
            },
            'ft.com': {
                name: 'Financial Times',
                articleSelectors: [
                    'article',
                    '.article-body',
                    '.n-content-body',
                    '.story-body'
                ],
                titleSelectors: [
                    'h1',
                    '.headline',
                    '.article-headline'
                ],
                paywall: {
                    selectors: ['.subscription-prompt', '.paywall'],
                    indicators: ['subscribe', 'ft subscription']
                },
                authIndicators: [
                    '.user-menu',
                    '.profile-menu'
                ],
                printOptimization: {
                    hideElements: [
                        '.advertisement',
                        '.ad-container',
                        '.social-share'
                    ],
                    cleanupClasses: ['no-print']
                }
            },
            'marketwatch.com': {
                name: 'MarketWatch',
                articleSelectors: [
                    'article',
                    '.article-body',
                    '.story-body',
                    '.ArticleBody'
                ],
                titleSelectors: [
                    'h1',
                    '.headline',
                    '.article-headline'
                ],
                paywall: {
                    selectors: ['.paywall', '.premium-content'],
                    indicators: ['subscribe', 'premium']
                },
                authIndicators: [
                    '.user-menu',
                    '.profile-menu'
                ],
                printOptimization: {
                    hideElements: [
                        '.advertisement',
                        '.ad-container',
                        '.social-share'
                    ],
                    cleanupClasses: ['no-print']
                }
            },
            'reuters.com': {
                name: 'Reuters',
                articleSelectors: [
                    'article',
                    '.story-body',
                    '.article-body',
                    '.StandardArticleBody'
                ],
                titleSelectors: [
                    'h1',
                    '.headline',
                    '.article-headline'
                ],
                paywall: {
                    selectors: ['.paywall', '.subscription-required'],
                    indicators: ['subscribe', 'reuters subscription']
                },
                authIndicators: [
                    '.user-menu',
                    '.profile-menu'
                ],
                printOptimization: {
                    hideElements: [
                        '.advertisement',
                        '.ad-container',
                        '.social-share'
                    ],
                    cleanupClasses: ['no-print']
                }
            },
            'finance.yahoo.com': {
                name: 'Yahoo Finance',
                articleSelectors: [
                    'article',
                    '.story-body',
                    '.article-body',
                    '.caas-body'
                ],
                titleSelectors: [
                    'h1',
                    '.headline',
                    '.article-headline'
                ],
                paywall: {
                    selectors: ['.paywall', '.premium-content'],
                    indicators: ['subscribe', 'premium']
                },
                authIndicators: [
                    '.user-menu',
                    '.profile-menu'
                ],
                printOptimization: {
                    hideElements: [
                        '.advertisement',
                        '.ad-container',
                        '.social-share'
                    ],
                    cleanupClasses: ['no-print']
                }
            }
        };
    }

    // Get configuration for a specific site
    getConfig(hostname) {
        // Remove www. prefix and find matching configuration
        const cleanHostname = hostname.replace(/^www\./, '');
        
        // Direct match
        if (this.configs[cleanHostname]) {
            return this.configs[cleanHostname];
        }
        
        // Check for subdomain matches
        for (const [domain, config] of Object.entries(this.configs)) {
            if (cleanHostname.endsWith(domain)) {
                return config;
            }
        }
        
        // Return generic configuration if no match found
        return this.getGenericConfig();
    }

    // Generic configuration for unknown sites
    getGenericConfig() {
        return {
            name: 'Unknown Site',
            articleSelectors: [
                'article',
                '.article-body',
                '.story-body',
                '.content',
                '.post-content',
                '.entry-content',
                'main',
                '.main-content'
            ],
            titleSelectors: [
                'h1',
                '.headline',
                '.title',
                '.post-title',
                '.entry-title'
            ],
            paywall: {
                selectors: ['.paywall', '.subscription-required', '.premium-content'],
                indicators: ['subscribe', 'sign up', 'premium', 'membership']
            },
            authIndicators: [
                '.user-menu',
                '.profile-menu',
                '.account-menu',
                '[class*="user"]',
                '[class*="profile"]',
                '[class*="account"]'
            ],
            printOptimization: {
                hideElements: [
                    '.advertisement',
                    '.ad-container',
                    '.social-share',
                    '.newsletter-signup',
                    '.related-content'
                ],
                cleanupClasses: ['no-print']
            }
        };
    }

    // Check if site is supported
    isSupported(hostname) {
        const cleanHostname = hostname.replace(/^www\./, '');
        return this.configs.hasOwnProperty(cleanHostname) || 
               Object.keys(this.configs).some(domain => cleanHostname.endsWith(domain));
    }

    // Get all supported domains
    getSupportedDomains() {
        return Object.keys(this.configs);
    }

    // Get site name for display
    getSiteName(hostname) {
        const config = this.getConfig(hostname);
        return config.name;
    }

    // Check if URL is a valid news article
    isValidNewsUrl(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            
            // Check if domain is supported
            if (!this.isSupported(hostname)) {
                return false;
            }
            
            // Check for news article patterns
            const newsPatterns = [
                /\/news\//,
                /\/articles?\//,
                /\/story\//,
                /\/post\//,
                /\/\d{4}\/\d{2}\/\d{2}\//,  // Date pattern
                /\/opinion\//,
                /\/markets\//,
                /\/finance\//,
                /\/business\//,
                /\/investing\//,
                /\/companies\//,
                /\/economy\//
            ];
            
            return newsPatterns.some(pattern => pattern.test(urlObj.pathname));
        } catch (error) {
            return false;
        }
    }
}

// Make available globally
window.SiteConfig = SiteConfig;