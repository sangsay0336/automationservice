#!/bin/bash

# Stop Bloomberg Auto-Organizer Daemon

echo "🛑 Stopping Bloomberg Auto-Organizer Daemon..."
echo "=============================================="
echo ""

cd "$(dirname "$0")"

# Stop the daemon
python3 auto_organizer_daemon.py stop

echo ""
echo "📊 Final Status:"
python3 auto_organizer_daemon.py status

echo ""
echo "💤 Auto-organizer daemon has been stopped"
echo "💡 Files will no longer automatically organize"
echo ""
echo "🚀 To restart:"
echo "   ./start_auto_daemon.sh"