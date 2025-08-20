#!/bin/bash

# Bloomberg Extension Automation Launcher
# Starts the auto-organizer daemon for automatic file management

echo "🤖 BLOOMBERG EXTENSION AUTOMATION"
echo "=================================="
echo ""

cd "$(dirname "$0")"

# Check if automation tools exist
if [ ! -d "automation-tools" ]; then
    echo "❌ Automation tools directory not found"
    exit 1
fi

cd automation-tools

echo "🚀 Starting Bloomberg Auto-Organizer Daemon..."
echo "📁 Files will automatically organize when extension is used"
echo ""

# Start the daemon
./start_auto_daemon.sh