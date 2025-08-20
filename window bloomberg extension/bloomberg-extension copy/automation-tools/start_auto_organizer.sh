#!/bin/bash

# Bloomberg File Auto-Organizer Launcher
# This script automatically moves Bloomberg files from Downloads to Desktop/scrapedatapdf

echo "🚀 Starting Bloomberg File Auto-Organizer..."
echo "📁 This will automatically move Bloomberg files from Downloads to:"
echo "   /Users/sangsay/Desktop/scrapedatapdf/[date-folder]/"
echo ""
echo "💡 Leave this running while you process Bloomberg articles"
echo "🛑 Press Ctrl+C to stop"
echo ""

cd "$(dirname "$0")"
python3 auto_organizer.py --watch --interval 3