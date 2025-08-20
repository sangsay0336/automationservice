#!/bin/bash

# Complete Bloomberg Automation Setup
# Sets up automatic file repathing that's always active

echo "🚀 BLOOMBERG COMPLETE AUTOMATION SETUP"
echo "====================================="
echo ""

cd "$(dirname "$0")"

echo "🔍 Checking system requirements..."

# Check if Chrome extension files exist
if [ ! -f "manifest.json" ] || [ ! -f "background.js" ]; then
    echo "❌ Chrome extension files missing"
    echo "   Please ensure all extension files are in this directory"
    exit 1
fi

echo "✅ Chrome extension files: FOUND"

# Check Python availability
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found"
    echo "   Please install Python 3"
    exit 1
fi

echo "✅ Python 3: FOUND"

# Test auto-organizer
if python3 -c "import auto_organizer" 2>/dev/null; then
    echo "✅ Auto-organizer: WORKING"
else
    echo "❌ Auto-organizer: ERROR"
    exit 1
fi

# Test daemon
if python3 -c "import auto_organizer_daemon" 2>/dev/null; then
    echo "✅ Auto-organizer daemon: WORKING"
else
    echo "❌ Auto-organizer daemon: ERROR"
    exit 1
fi

echo ""
echo "🎯 SETTING UP COMPLETE AUTOMATION..."
echo ""

# Clean extension for Chrome loading
echo "🧹 Cleaning extension directory for Chrome..."
./cleanup_for_chrome.sh > /dev/null 2>&1

# Check if daemon is already running
if python3 auto_organizer_daemon.py status | grep -q "running"; then
    echo "✅ Auto-organizer daemon: ALREADY RUNNING"
else
    echo "🚀 Starting auto-organizer daemon..."
    python3 auto_organizer_daemon.py start
    sleep 2
fi

echo ""
echo "📊 SYSTEM STATUS:"
echo "==============="
python3 auto_organizer_daemon.py status

echo ""
echo "🎉 COMPLETE AUTOMATION IS NOW ACTIVE!"
echo "===================================="
echo ""
echo "✅ What's been set up:"
echo "   🤖 Smart auto-organizer daemon is running"
echo "   📁 Monitoring Downloads folder for Bloomberg files"
echo "   🎯 Will automatically organize files to Desktop/scrapedatapdf/[date]/"
echo "   🔄 Activates when Bloomberg extension is used"
echo "   💤 Sleeps when not needed to save resources"
echo ""
echo "📋 NEXT STEPS:"
echo "============="
echo ""
echo "1. 🌐 Load Chrome Extension:"
echo "   • Go to chrome://extensions/"
echo "   • Enable 'Developer mode'"
echo "   • Click 'Load unpacked'"
echo "   • Select this folder: $(pwd)"
echo ""
echo "2. 🚀 Use Bloomberg Extension:"
echo "   • Load Bloomberg links"
echo "   • Process articles (manual or smart batch mode)"
echo "   • Files will AUTOMATICALLY organize to desktop folders"
echo ""
echo "3. 📊 Monitor Status (optional):"
echo "   • Check daemon: python3 auto_organizer_daemon.py status"
echo "   • View logs: tail -f auto_organizer.log"
echo ""
echo "🛑 To stop automation:"
echo "   ./stop_auto_daemon.sh"
echo ""
echo "🔄 To restart automation:"
echo "   ./start_auto_daemon.sh"
echo ""
echo "🎯 YOUR BLOOMBERG WORKFLOW IS NOW 100% AUTOMATED!"
echo "   Start using the extension - files will organize automatically! 🎉"