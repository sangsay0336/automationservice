# Auto-Move Bloomberg Files Setup

## The Issues We Fixed:

### 1. ✅ **Auto-Navigation Between Links**
- Extension now automatically moves to the next link after clicking "Print & Next"
- 2-second delay ensures PDF is saved before moving
- Automatic completion when all links are processed

### 2. ✅ **Organized File Saving**
- Files now save to `Downloads/scrapedatapdf/[your-folder-name]/`
- Folder structure is automatically created
- Each date gets its own subfolder

## File Locations:

### **Where Files Actually Save:**
```
~/Downloads/scrapedatapdf/2025-01-02/
├── bloomberg_2025-01-02_143022_article1.html
├── bloomberg_2025-01-02_143055_article2.html
└── ...
```

### **Where You Want Them:**
```
~/Desktop/scrapedatapdf/2025-01-02/
├── bloomberg_2025-01-02_143022_article1.html
├── bloomberg_2025-01-02_143055_article2.html
└── ...
```

## Quick Move Script:

Run this command to move files from Downloads to Desktop:

```bash
cd "/Users/sangsay/Desktop/PROCESS NEWS JUN 2025/bloomberg-extension"
./move_downloads.sh
```

## How It Works Now:

1. **Start Processing**: Click "Start" - extension opens first link
2. **Auto Print**: Click "Print & Next" on Bloomberg page
3. **Auto Save**: File saves to Downloads/scrapedatapdf/[folder]/
4. **Auto Navigate**: Extension automatically opens next link (2 sec delay)
5. **Repeat**: Continue until all links processed
6. **Move Files**: Run script to move to Desktop folder

## Browser Settings Note:

Chrome will save to your default Downloads folder. To change the save location:
1. Chrome Settings → Advanced → Downloads
2. Change "Location" to `/Users/sangsay/Desktop/scrapedatapdf`
3. Restart Chrome

## Testing the Fixes:

1. **Reload Extension**: 
   - Go to `chrome://extensions/`
   - Find Bloomberg extension
   - Click refresh 🔄

2. **Test Auto-Navigation**:
   - Load 2-3 Bloomberg links
   - Click "Start"
   - Click "Print & Next" on first page
   - Watch it automatically open the next link

3. **Check File Saving**:
   - Look in `Downloads/scrapedatapdf/[your-folder]/`
   - Files should have proper naming with date/time

The extension now provides complete automation - you just click "Print & Next" and it handles everything else!