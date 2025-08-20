# 🗂️ Automatic Bloomberg File Organization Setup

## 🎯 **The Problem & Solution**

**Problem**: Chrome extensions cannot directly save files to custom desktop locations due to security restrictions.

**Solution**: Two-part system:
1. **Extension**: Downloads files to Downloads folder with clear naming
2. **Auto-Organizer**: Automatically moves files to your desired desktop location

## 📋 **Complete Setup Instructions**

### **Step 1: Reload Extension**
```bash
1. Go to chrome://extensions/
2. Find "Bloomberg Link Processor"  
3. Click refresh button 🔄
```

### **Step 2: Start Auto-Organizer (Choose One)**

#### **Option A: Auto-Watch Mode (Recommended)**
```bash
# Double-click this file or run in Terminal:
./start_auto_organizer.sh
```
- **Benefits**: Automatically organizes files as they download
- **Usage**: Leave running while processing Bloomberg articles
- **Stop**: Press Ctrl+C

#### **Option B: Manual Organization**
```bash
# Run this after downloading files:
./organize_existing_files.sh
```
- **Benefits**: Organize files on-demand
- **Usage**: Run after each Bloomberg session

### **Step 3: Process Bloomberg Articles**
1. Load Bloomberg links in extension
2. Click "Start"
3. Click "Print & Next" on each article
4. Files automatically save and organize!

## 📁 **File Organization Structure**

### **Before (Downloads folder):**
```
~/Downloads/
├── bloomberg_2025-01-02_bloomberg_2025-01-02_143022_How-10-000-Fared.html
├── bloomberg_2025-01-02_bloomberg_2025-01-02_143055_Investment-Guide.html
└── ...
```

### **After (Desktop organized):**
```
~/Desktop/scrapedatapdf/
├── 2025-01-02/
│   ├── bloomberg_2025-01-02_143022_How-10-000-Fared.html
│   ├── bloomberg_2025-01-02_143055_Investment-Guide.html
│   └── ...
├── 2025-01-03/
│   ├── bloomberg_2025-01-03_090015_Market-Update.html
│   └── ...
└── ...
```

## 🚀 **How It Works**

1. **Extension Processing**:
   ```
   User clicks "Print & Next"
   → Extension saves to Downloads/bloomberg_[date]_[filename].html
   → Extension auto-opens next Bloomberg link
   ```

2. **Auto-Organizer Processing** (if running):
   ```
   Detects new Bloomberg file in Downloads
   → Extracts date from filename  
   → Creates Desktop/scrapedatapdf/[date]/ folder
   → Moves file to organized location
   ```

## 🔧 **Workflow Options**

### **Recommended: Auto-Watch Workflow**
1. Open Terminal and run: `./start_auto_organizer.sh`
2. Process Bloomberg articles normally
3. Files automatically organize to desktop folders
4. Stop auto-organizer when done (Ctrl+C)

### **Manual Workflow**  
1. Process all Bloomberg articles (files go to Downloads)
2. Run: `./organize_existing_files.sh`
3. All files move to organized desktop folders

## 📊 **Console Output Examples**

### **Extension Success:**
```
✅ PDF generated successfully: bloomberg_2025-01-02_143022_article.html
📁 Save method: auto-download
💾 Save location: Downloads/
📂 Auto-moving to next link 2/3: https://...
```

### **Auto-Organizer Success:**
```
✅ Moved: bloomberg_2025-01-02_143022_How-10-000-Fared.html
   To: /Users/sangsay/Desktop/scrapedatapdf/2025-01-02/bloomberg_2025-01-02_143022_How-10-000-Fared.html
📦 Organized 1 files
```

## 🎯 **End Result**

- ✅ **Automatic Navigation**: Extension moves between links automatically
- ✅ **Automatic Saving**: Files save without dialogs or manual intervention
- ✅ **Automatic Organization**: Files organize to `/Users/sangsay/Desktop/scrapedatapdf/[date]/`
- ✅ **Date-Based Folders**: Each processing session gets its own folder
- ✅ **Clean Filenames**: Clear, searchable file naming

## 🚨 **Troubleshooting**

**Extension not working?**
- Reload extension at chrome://extensions/
- Check browser console for error messages

**Files not organizing?**
- Make sure auto-organizer is running
- Check that files have "bloomberg_" prefix in Downloads
- Run `./organize_existing_files.sh` manually

**Permission errors?**
- Make sure scripts are executable: `chmod +x *.sh`
- Run from Terminal if double-clicking doesn't work

**Your complete Bloomberg processing workflow is now 100% automated!** 🎉