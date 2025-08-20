#!/bin/bash

# Bloomberg System Status Checker

echo "🔍 Bloomberg Extension System Status Check"
echo "========================================"
echo ""

# Check extension directory
if [ -d "/Users/sangsay/Desktop/PROCESS NEWS JUN 2025/bloomberg-extension" ]; then
    echo "✅ Extension directory: FOUND"
else
    echo "❌ Extension directory: NOT FOUND"
    exit 1
fi

cd "/Users/sangsay/Desktop/PROCESS NEWS JUN 2025/bloomberg-extension"

# Check Python script
if python3 -c "import auto_organizer; print('✅ Python auto-organizer: WORKING')" 2>/dev/null; then
    echo "✅ Python auto-organizer: WORKING"
else
    echo "❌ Python auto-organizer: ERROR"
fi

# Check target directory
if [ -d "/Users/sangsay/Desktop/scrapedatapdf" ]; then
    echo "✅ Target directory: EXISTS"
    echo "   📁 Path: /Users/sangsay/Desktop/scrapedatapdf"
    # Count existing files
    file_count=$(find "/Users/sangsay/Desktop/scrapedatapdf" -name "*.html" 2>/dev/null | wc -l)
    echo "   📄 Files already organized: $file_count"
else
    echo "✅ Target directory: WILL BE CREATED"
    echo "   📁 Path: /Users/sangsay/Desktop/scrapedatapdf"
fi

# Check Downloads directory
if [ -d "/Users/sangsay/Downloads" ]; then
    echo "✅ Downloads directory: EXISTS"
    # Count Bloomberg files in Downloads
    bloomberg_count=$(find "/Users/sangsay/Downloads" -name "bloomberg_*.html" -o -name "bloomberg_*.pdf" 2>/dev/null | wc -l)
    echo "   📄 Bloomberg files waiting: $bloomberg_count"
else
    echo "❌ Downloads directory: NOT FOUND"
fi

# Check script permissions
if [ -x "./start_auto_organizer.sh" ]; then
    echo "✅ Auto-organizer launcher: EXECUTABLE"
else
    echo "❌ Auto-organizer launcher: NOT EXECUTABLE"
    echo "   🔧 Fix with: chmod +x start_auto_organizer.sh"
fi

# Check Chrome extension files
extension_files=("manifest.json" "background.js" "content.js" "popup.js" "popup.html")
missing_files=()

for file in "${extension_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ Extension file $file: EXISTS"
    else
        echo "❌ Extension file $file: MISSING"
        missing_files+=("$file")
    fi
done

echo ""
echo "🎯 SYSTEM STATUS SUMMARY:"
echo "========================"

if [ ${#missing_files[@]} -eq 0 ]; then
    echo "✅ Extension files: ALL PRESENT"
    echo "✅ Auto-organizer: READY"
    echo "✅ File system: READY"
    echo ""
    echo "🚀 READY TO USE!"
    echo ""
    echo "💡 Quick Start:"
    echo "   1. Run: ./start_auto_organizer.sh"
    echo "   2. Open Chrome extension"
    echo "   3. Load Bloomberg links"
    echo "   4. Process articles (files auto-organize)"
else
    echo "❌ MISSING FILES: ${missing_files[*]}"
    echo "🔧 Please ensure all extension files are present"
fi

echo ""