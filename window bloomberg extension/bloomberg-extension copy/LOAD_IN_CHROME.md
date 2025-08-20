# 🌐 Load Bloomberg Extension in Chrome

## Quick Start

### 1. Clean Extension Directory ✅
✅ **Already Done!** - The extension directory is now clean and ready for Chrome.

### 2. Load Extension in Chrome

1. **Open Chrome Extensions Page**
   ```
   chrome://extensions/
   ```

2. **Enable Developer Mode**
   - Toggle "Developer mode" switch in top-right corner

3. **Load Extension**
   - Click "Load unpacked" button
   - Select this folder: `/Users/sangsay/Desktop/PROCESS NEWS JUN 2025/bloomberg-extension`
   - Click "Select Folder"

4. **Verify Loading**
   - Extension should appear with Bloomberg icon
   - No error messages should show

### 3. Start Automation (Optional)

To enable automatic file organization:
```bash
./start_automation.sh
```

## 🎯 What's in This Directory

### Core Extension Files:
- `manifest.json` - Extension configuration
- `background.js` - Main extension logic  
- `content.js` - Bloomberg page integration
- `popup.js/popup.html` - Extension interface
- `content.css` - Styling
- `icons/` - Extension icons

### Automation Tools:
- `automation-tools/` - Auto-organizer daemon and scripts
- `docs/` - Documentation and guides
- `start_automation.sh` - Quick launcher for file automation

## 🔧 If Loading Fails

1. **Check for hidden files**: Ensure no `__pycache__` or other hidden files exist
2. **Verify permissions**: Make sure all files are readable
3. **Check manifest**: Verify `manifest.json` is valid JSON

## ✅ Expected Result

After loading, you should see:
- ✅ Bloomberg Link Processor extension in Chrome
- ✅ No error messages
- ✅ Extension icon in toolbar
- ✅ Popup opens when clicked

Ready to process Bloomberg articles! 🎉