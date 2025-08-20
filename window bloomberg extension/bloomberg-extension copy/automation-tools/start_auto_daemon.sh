#!/bin/bash

# Bloomberg Auto-Organizer Daemon Starter
# Automatically starts the file organizer daemon that monitors Chrome extension activity

echo "🚀 Starting Bloomberg Auto-Organizer Daemon..."
echo "================================================"
echo ""

cd "$(dirname "$0")"

# Check if daemon is already running
if python3 auto_organizer_daemon.py status | grep -q "running"; then
    echo "✅ Auto-organizer daemon is already running!"
    echo ""
    python3 auto_organizer_daemon.py status
    echo ""
    echo "💡 Files will automatically organize when you use the Bloomberg extension"
    exit 0
fi

# Start the daemon
echo "🔄 Starting auto-organizer daemon in background..."
python3 auto_organizer_daemon.py start

# Wait a moment and check status
sleep 2

echo ""
echo "📊 Daemon Status:"
python3 auto_organizer_daemon.py status

echo ""
echo "🎯 AUTOMATIC FILE ORGANIZATION IS NOW ACTIVE!"
echo "==============================================="
echo ""
echo "✅ What this does:"
echo "   • Automatically detects when Bloomberg extension is used"
echo "   • Monitors Downloads folder for Bloomberg files"
echo "   • Instantly moves files to Desktop/scrapedatapdf/[date]/"
echo "   • Runs invisibly in the background"
echo "   • Auto-starts when Chrome extension is active"
echo ""
echo "💡 Usage:"
echo "   • Just use your Bloomberg extension normally"
echo "   • Files will automatically organize to the correct folders"
echo "   • No manual file management needed!"
echo ""
echo "🛑 To stop daemon:"
echo "   ./stop_auto_daemon.sh"
echo "   OR: python3 auto_organizer_daemon.py stop"
echo ""
echo "🔍 To check daemon status:"
echo "   python3 auto_organizer_daemon.py status"