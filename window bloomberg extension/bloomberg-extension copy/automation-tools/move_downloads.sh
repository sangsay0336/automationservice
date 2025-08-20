#!/bin/bash

# Script to move downloaded files from Downloads/scrapedatapdf to Desktop/scrapedatapdf
# Usage: ./move_downloads.sh

SOURCE_DIR="$HOME/Downloads/scrapedatapdf"
DEST_DIR="$HOME/Desktop/scrapedatapdf"

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ No files found in $SOURCE_DIR"
    echo "📁 Files will be downloaded to Downloads/scrapedatapdf/ folder"
    exit 1
fi

# Move all folders and files
echo "📂 Moving files from Downloads to Desktop..."
echo "Source: $SOURCE_DIR"
echo "Destination: $DEST_DIR"

# Copy all subdirectories and files
cp -r "$SOURCE_DIR"/* "$DEST_DIR/" 2>/dev/null

if [ $? -eq 0 ]; then
    echo "✅ Files successfully moved to Desktop/scrapedatapdf/"
    
    # Clean up source directory
    read -p "🗑️ Remove files from Downloads folder? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$SOURCE_DIR"
        echo "✅ Downloads folder cleaned up"
    fi
else
    echo "⚠️ No new files to move"
fi

echo "📁 Your files are now in: $DEST_DIR"