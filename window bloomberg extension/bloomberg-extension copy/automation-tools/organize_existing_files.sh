#!/bin/bash

# One-time organizer for existing Bloomberg files in Downloads

echo "📦 Organizing existing Bloomberg files..."
echo "🔍 Scanning Downloads folder for Bloomberg files..."

cd "$(dirname "$0")"
python3 auto_organizer.py

echo ""
echo "✅ Done! Check /Users/sangsay/Desktop/scrapedatapdf/ for organized files"