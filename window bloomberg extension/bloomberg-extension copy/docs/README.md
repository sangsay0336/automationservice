# Universal News Processor Chrome Extension

A Chrome extension that automates financial news article processing from multiple major news sites with one-click printing and navigation.

## Features

✅ **Multi-Site Support** - Works with Bloomberg, WSJ, CNBC, Barron's, Financial Times, and more  
✅ **Native Chrome Integration** - Uses your current Chrome profile and login sessions  
✅ **One-Click Processing** - Load links, start processing, click through each page  
✅ **Automatic Navigation** - Opens each link automatically after you print the previous one  
✅ **Intelligent PDF Generation** - Site-aware PDF creation with proper formatting  
✅ **Progress Tracking** - Visual progress bar and link counter with site identification  
✅ **Profile Aware** - Works with any Chrome profile you're logged into  
✅ **Smart Batch Processing** - Process multiple articles efficiently with rate limiting  
✅ **No Bot Detection** - Runs as legitimate Chrome extension, not automation  

## How It Works

1. **Login** to your news sites (Bloomberg, WSJ, CNBC, etc.) in your preferred Chrome profile
2. **Load links** from any supported site into the extension popup
3. **Start processing** - extension opens first link
4. **Click "Print & Next"** on each page when ready
5. **Extension automatically** opens next link after printing
6. **Repeat** until all links are processed

## Supported News Sites

- **Bloomberg** (bloomberg.com)
- **Wall Street Journal** (wsj.com)
- **CNBC** (cnbc.com)
- **Barron's** (barrons.com)
- **Financial Times** (ft.com)
- **MarketWatch** (marketwatch.com)
- **Reuters** (reuters.com)
- **Yahoo Finance** (finance.yahoo.com)
- **Investopedia** (investopedia.com)
- **Benzinga** (benzinga.com)
- **Seeking Alpha** (seekingalpha.com)
- **The Motley Fool** (motleyfool.com)
- **Short links** (t.co, bit.ly, etc.) that redirect to supported sites

## Installation Instructions

### Step 1: Enable Developer Mode
1. Open Chrome and go to `chrome://extensions/`
2. Toggle **"Developer mode"** ON (top-right corner)

### Step 2: Load Extension
1. Click **"Load unpacked"** button
2. Navigate to and select the `bloomberg-extension` folder
3. The extension should appear in your extensions list as "Universal News Processor"

### Step 3: Pin Extension (Optional)
1. Click the puzzle piece icon (🧩) in Chrome toolbar
2. Click the pin icon next to "Universal News Processor"
3. Extension icon will appear in toolbar for easy access

## Usage Guide

### Quick Start
1. **Make sure you're logged into your news sites** in your current Chrome profile
2. **Click the extension icon** in Chrome toolbar
3. **Paste your news links** in the text area (one per line)
4. **Click "Load Links"** to validate and load them
5. **Click "Start"** to begin processing
6. **On each news page**, click "Print & Next" when ready
7. **Extension automatically** opens the next link

### Supported Link Types
- **Direct news articles**: `https://www.bloomberg.com/news/articles/...`, `https://www.wsj.com/articles/...`
- **Short links**: `https://t.co/...`, `https://bit.ly/...` (that redirect to supported sites)
- **Social media links**: Twitter/X links containing news content
- **Any URL** that redirects to supported news content

### Smart Link Validation
The extension automatically:
- ✅ **Validates** each URL against supported sites
- ✅ **Shows statistics** by news source (e.g., "3 Bloomberg, 2 WSJ, 1 CNBC")
- ✅ **Filters out** invalid or unsupported links
- ✅ **Provides feedback** on validation results

### Extension Interface

**Popup Window:**
- Profile indicator showing current Chrome profile
- Text area for pasting news links from any supported site
- Link validation with site-specific statistics
- Progress bar and link counter with site identification
- Start/Pause/Stop controls
- Smart Batch Processing mode
- Date-based folder organization
- Usage instructions and supported sites list

**On News Pages:**
- Floating control panel (top-right corner) with site-specific branding
- "Print & Next" button for processing
- "Skip This Page" button to skip without printing
- Minimize button to hide controls
- Automatic PDF generation with site-specific naming

## Tips for Best Results

1. **Use a dedicated Chrome profile** for news processing
2. **Login to all your news sites** before starting the extension
3. **Process links during business hours** for better reliability
4. **Don't close the news tab** while processing
5. **Wait for each page to fully load** before clicking "Print & Next"
6. **Use Smart Batch mode** for large lists to respect site rate limits
7. **Group links by publication** for more efficient processing
8. **Check paywall access** on subscription sites before batch processing

## Troubleshooting

**Extension not working?**
- Check if Developer mode is enabled
- Reload the extension from chrome://extensions/
- Make sure you're on a supported news site

**Links not opening?**
- Verify you're logged into the respective news sites
- Check if links are from supported news sources
- Try refreshing the current page
- Check if the site requires subscription access

**Link validation failing?**
- Ensure URLs are from supported sites (see list above)
- Check for typos in URLs
- Try direct article links instead of short links
- Remove any tracking parameters from URLs

**Print not working?**
- Ensure pop-ups are allowed for news sites
- Check Chrome's print settings
- Try printing manually with Ctrl+P
- Check if the site has print restrictions

**Paywall issues?**
- Make sure you're logged into subscription sites
- Check your subscription status
- Try accessing articles individually first
- Some sites limit automated access

## File Structure

```
bloomberg-extension/
├── manifest.json          # Extension configuration with multi-site permissions
├── popup.html            # Extension popup interface
├── popup.js              # Popup logic with multi-site validation
├── background.js         # Background script for universal tab management
├── content.js            # Injected script for all supported news sites
├── content.css           # Styles for on-page controls
├── site-config.js        # Site-specific configurations
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── docs/                 # Documentation
    ├── README.md         # This file
    └── ...               # Additional documentation
```

## Privacy & Security

- Extension only accesses approved financial news domains (see supported sites list)
- No data is sent to external servers
- All processing happens locally in your browser
- Uses Chrome's built-in storage for state management
- Respects your existing Chrome profile and cookies
- Site-specific authentication detection without storing credentials
- PDF generation and downloads handled locally by Chrome

## Development

To modify the extension:
1. Edit the source files (see File Structure above)
2. Go to chrome://extensions/
3. Click the refresh icon on the Universal News Processor extension
4. Test your changes with different news sites

### Adding New Sites
To add support for additional news sites:
1. Update `site-config.js` with new site configuration
2. Add domain to `manifest.json` host_permissions
3. Update `popup.js` supportedSites configuration
4. Test article detection and PDF generation

## Support

If you encounter issues:
1. Check the browser console for errors (F12 → Console)
2. Verify extension permissions in chrome://extensions/
3. Try reloading the extension
4. Restart Chrome if needed