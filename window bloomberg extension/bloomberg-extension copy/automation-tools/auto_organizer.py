#!/usr/bin/env python3
"""
Bloomberg File Auto-Organizer
Automatically moves downloaded Bloomberg files to organized desktop folders
"""

import os
import shutil
import time
import glob
from datetime import datetime
from pathlib import Path
import argparse

class BloombergFileOrganizer:
    def __init__(self):
        self.downloads_dir = os.path.expanduser("~/Downloads")
        self.target_base_dir = os.path.expanduser("~/Desktop/scrapedatapdf")
        self.processed_files = set()
        
    def ensure_target_directory(self, folder_name):
        """Create target directory if it doesn't exist"""
        target_dir = os.path.join(self.target_base_dir, folder_name)
        os.makedirs(target_dir, exist_ok=True)
        return target_dir
    
    def find_bloomberg_files(self):
        """Find all Bloomberg files in Downloads folder"""
        patterns = [
            "bloomberg_*.html",
            "bloomberg_*.pdf", 
            "*_bloomberg_*.html",
            "*_bloomberg_*.pdf"
        ]
        
        found_files = []
        for pattern in patterns:
            files = glob.glob(os.path.join(self.downloads_dir, pattern))
            found_files.extend(files)
        
        return [f for f in found_files if f not in self.processed_files]
    
    def extract_date_from_filename(self, filename):
        """Extract date from Bloomberg filename to determine folder"""
        basename = os.path.basename(filename)
        
        # Try to find date pattern YYYY-MM-DD in filename
        import re
        date_pattern = r'(\d{4}-\d{2}-\d{2})'
        match = re.search(date_pattern, basename)
        
        if match:
            return match.group(1)
        
        # If no date in filename, use today's date
        return datetime.now().strftime("%Y-%m-%d")
    
    def move_file(self, source_path, folder_name):
        """Move file to organized folder structure"""
        try:
            target_dir = self.ensure_target_directory(folder_name)
            filename = os.path.basename(source_path)
            target_path = os.path.join(target_dir, filename)
            
            # Handle duplicate files
            counter = 1
            base_name, ext = os.path.splitext(filename)
            while os.path.exists(target_path):
                new_filename = f"{base_name}_{counter}{ext}"
                target_path = os.path.join(target_dir, new_filename)
                counter += 1
            
            shutil.move(source_path, target_path)
            self.processed_files.add(source_path)
            
            print(f"✅ Moved: {filename}")
            print(f"   To: {target_path}")
            return True
            
        except Exception as e:
            print(f"❌ Error moving {source_path}: {e}")
            return False
    
    def organize_files(self):
        """Find and organize all Bloomberg files"""
        bloomberg_files = self.find_bloomberg_files()
        
        if not bloomberg_files:
            return 0
        
        moved_count = 0
        for file_path in bloomberg_files:
            folder_name = self.extract_date_from_filename(file_path)
            if self.move_file(file_path, folder_name):
                moved_count += 1
        
        return moved_count
    
    def watch_and_organize(self, check_interval=5):
        """Continuously watch for new Bloomberg files and organize them"""
        print(f"🔍 Watching Downloads folder for Bloomberg files...")
        print(f"📁 Target directory: {self.target_base_dir}")
        print(f"⏱️  Check interval: {check_interval} seconds")
        print("📂 Downloads folder: " + self.downloads_dir)
        print("💡 Processing files with patterns: bloomberg_*.html, bloomberg_*.pdf")
        print("🛑 Press Ctrl+C to stop\n")
        
        # Ensure target directory exists
        os.makedirs(self.target_base_dir, exist_ok=True)
        
        cycle_count = 0
        try:
            while True:
                cycle_count += 1
                moved_count = self.organize_files()
                
                if moved_count > 0:
                    print(f"📦 Organized {moved_count} files (cycle #{cycle_count})")
                    print(f"✅ Files moved to: {self.target_base_dir}")
                elif cycle_count % 20 == 0:  # Show status every 20 cycles (~1 minute with 3s interval)
                    print(f"⏳ Waiting for Bloomberg files... (cycle #{cycle_count})")
                
                time.sleep(check_interval)
                
        except KeyboardInterrupt:
            print(f"\n🛑 Auto-organizer stopped after {cycle_count} cycles")
            print(f"📊 Total files processed in this session: {len(self.processed_files)}")
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}")
            print("🔄 You can restart the auto-organizer")

def main():
    parser = argparse.ArgumentParser(description='Bloomberg File Auto-Organizer')
    parser.add_argument('--watch', action='store_true', 
                       help='Continuously watch for new files')
    parser.add_argument('--interval', type=int, default=5,
                       help='Check interval in seconds (default: 5)')
    
    args = parser.parse_args()
    
    organizer = BloombergFileOrganizer()
    
    if args.watch:
        organizer.watch_and_organize(args.interval)
    else:
        # One-time organization
        moved_count = organizer.organize_files()
        if moved_count > 0:
            print(f"✅ Organized {moved_count} Bloomberg files")
            print(f"📁 Files moved to: {organizer.target_base_dir}")
        else:
            print("📄 No Bloomberg files found in Downloads folder")

if __name__ == "__main__":
    main()