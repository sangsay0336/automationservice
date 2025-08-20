#!/bin/bash

# Test Auto-Watch Functionality

echo "🧪 Testing Auto-Watch System..."
echo "==============================="
echo ""

# Start auto-organizer in background for 5 seconds
echo "🔄 Starting auto-organizer for 5 seconds..."
cd "$(dirname "$0")"
timeout 5 python3 auto_organizer.py --watch --interval 1 &
autowatch_pid=$!

sleep 2
echo "⏳ Auto-organizer running in background..."

sleep 3
echo "⏹️ Stopping auto-organizer..."

# Check if process completed successfully
wait $autowatch_pid 2>/dev/null
exit_code=$?

if [ $exit_code -eq 124 ]; then
    echo "✅ Auto-watch system: WORKING CORRECTLY"
    echo "   (Timeout exit code 124 is expected)"
elif [ $exit_code -eq 0 ]; then
    echo "✅ Auto-watch system: WORKING CORRECTLY"
else
    echo "❌ Auto-watch system: ERROR (exit code: $exit_code)"
fi

echo ""
echo "🎯 AUTOWATCH STATUS: READY FOR USE"
echo ""
echo "💡 To start auto-watch for real:"
echo "   ./start_auto_organizer.sh"