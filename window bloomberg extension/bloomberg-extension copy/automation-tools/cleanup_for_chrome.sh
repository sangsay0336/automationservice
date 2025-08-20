#!/bin/bash

# Cleanup script to prepare extension for Chrome loading

echo "🧹 Cleaning up extension directory for Chrome..."

cd "$(dirname "$0")"

# Remove Python cache directories
if [ -d "__pycache__" ]; then
    rm -rf __pycache__
    echo "✅ Removed __pycache__ directory"
fi

# Remove Python bytecode files
find . -name "*.pyc" -delete 2>/dev/null
find . -name "*.pyo" -delete 2>/dev/null
find . -name "*.pyd" -delete 2>/dev/null

# Remove system files
find . -name ".DS_Store" -delete 2>/dev/null
find . -name "._*" -delete 2>/dev/null

# Remove temporary files
find . -name "*.tmp" -delete 2>/dev/null
find . -name "*~" -delete 2>/dev/null

echo "✅ Extension directory cleaned for Chrome"
echo ""
echo "📋 Core extension files:"
ls -la *.json *.js *.html *.css 2>/dev/null | grep -v "^d"
echo ""
echo "🚀 Ready to load in Chrome!"
echo ""
echo "💡 To load extension:"
echo "   1. Go to chrome://extensions/"
echo "   2. Enable 'Developer mode'"
echo "   3. Click 'Load unpacked'"
echo "   4. Select this folder: $(pwd)"