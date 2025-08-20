#!/usr/bin/env python3
"""
Bloomberg Auto-Organizer Daemon
Automatically starts when Chrome extension is active and organizes files in real-time
"""

import os
import time
import signal
import sys
import subprocess
from pathlib import Path
import json
from datetime import datetime

# Try to import psutil, but work without it if not available
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

class AutoOrganizerDaemon:
    def __init__(self):
        self.downloads_dir = os.path.expanduser("~/Downloads")
        self.target_base_dir = os.path.expanduser("~/Desktop/scrapedatapdf")
        self.processed_files = set()
        self.running = False
        self.pid_file = os.path.join(os.path.dirname(__file__), '.auto_organizer.pid')
        self.log_file = os.path.join(os.path.dirname(__file__), 'auto_organizer.log')
        
    def log(self, message):
        """Log message with timestamp"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_message = f"[{timestamp}] {message}"
        print(log_message)
        
        # Also write to log file
        try:
            with open(self.log_file, 'a') as f:
                f.write(log_message + '\n')
        except:
            pass
    
    def is_chrome_running(self):
        """Check if Chrome is running"""
        if HAS_PSUTIL:
            try:
                for proc in psutil.process_iter(['pid', 'name']):
                    try:
                        if 'chrome' in proc.info['name'].lower():
                            return True
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        continue
                return False
            except:
                pass
        
        # Fallback method using ps command on macOS/Linux
        try:
            result = subprocess.run(['ps', 'aux'], capture_output=True, text=True)
            return 'Google Chrome' in result.stdout or 'chrome' in result.stdout.lower()
        except:
            # If ps fails, assume Chrome might be running
            return True
    
    def is_extension_active(self):
        """Check if Bloomberg extension is likely active"""
        try:
            # Method 1: Check for recent Bloomberg files in Downloads
            bloomberg_files = list(Path(self.downloads_dir).glob("bloomberg_*.html"))
            bloomberg_files.extend(list(Path(self.downloads_dir).glob("bloomberg_*.pdf")))
            
            current_time = time.time()
            recent_files = False
            
            for file_path in bloomberg_files:
                if current_time - file_path.stat().st_mtime < 600:  # 10 minutes
                    recent_files = True
                    break
            
            # Method 2: Check Chrome extension storage (if accessible)
            # This would require Chrome to be running with the extension
            
            # Method 3: Simple heuristic - if Chrome is running and Bloomberg files exist
            if recent_files:
                return True
                
            # If no recent files but some Bloomberg files exist, might still be active
            return len(bloomberg_files) > 0
            
        except Exception as e:
            self.log(f"Extension check error: {e}")
            return False
    
    def start_daemon(self):
        """Start the daemon process"""
        if self.is_running():
            self.log("Auto-organizer daemon is already running")
            return
        
        # Write PID file
        with open(self.pid_file, 'w') as f:
            f.write(str(os.getpid()))
        
        self.log("🚀 Starting Bloomberg Auto-Organizer Daemon")
        self.log(f"📁 Monitoring: {self.downloads_dir}")
        self.log(f"📁 Target: {self.target_base_dir}")
        self.log("🔄 Daemon will auto-activate when extension is used")
        
        self.running = True
        
        # Setup signal handlers
        signal.signal(signal.SIGTERM, self.signal_handler)
        signal.signal(signal.SIGINT, self.signal_handler)
        
        self.run_daemon_loop()
    
    def run_daemon_loop(self):
        """Main daemon loop"""
        inactive_count = 0
        
        while self.running:
            try:
                chrome_running = self.is_chrome_running()
                extension_active = self.is_extension_active()
                
                if chrome_running and extension_active:
                    # Extension is active, organize files
                    moved_count = self.organize_files()
                    if moved_count > 0:
                        self.log(f"📦 Organized {moved_count} files")
                        inactive_count = 0
                    else:
                        inactive_count += 1
                        
                    # Check every 2 seconds when active
                    time.sleep(2)
                    
                elif chrome_running:
                    # Chrome running but extension not active
                    inactive_count += 1
                    if inactive_count % 30 == 0:  # Every minute
                        self.log("⏳ Chrome running, waiting for Bloomberg extension activity...")
                    time.sleep(2)
                    
                else:
                    # Chrome not running
                    inactive_count += 1
                    if inactive_count % 60 == 0:  # Every 2 minutes
                        self.log("💤 Chrome not running, daemon sleeping...")
                    time.sleep(5)
                    
                # Auto-shutdown if inactive for too long (4 hours)
                if inactive_count > 7200:  # 4 hours of inactivity
                    self.log("😴 Long inactivity detected, shutting down daemon")
                    break
                    
            except Exception as e:
                self.log(f"❌ Daemon error: {e}")
                time.sleep(5)
        
        self.stop_daemon()
    
    def organize_files(self):
        """Organize Bloomberg files"""
        from auto_organizer import BloombergFileOrganizer
        
        organizer = BloombergFileOrganizer()
        moved_count = organizer.organize_files()
        
        # Update our processed files set
        self.processed_files.update(organizer.processed_files)
        
        return moved_count
    
    def is_running(self):
        """Check if daemon is already running"""
        if not os.path.exists(self.pid_file):
            return False
        
        try:
            with open(self.pid_file, 'r') as f:
                pid = int(f.read().strip())
            
            # Check if process with this PID exists
            os.kill(pid, 0)  # Sends signal 0 (no-op)
            return True
        except (OSError, ValueError):
            # PID doesn't exist or invalid
            try:
                os.remove(self.pid_file)
            except:
                pass
            return False
    
    def stop_daemon(self):
        """Stop the daemon"""
        self.running = False
        
        # Remove PID file
        try:
            os.remove(self.pid_file)
        except:
            pass
        
        self.log("🛑 Auto-organizer daemon stopped")
    
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        self.log(f"📡 Received signal {signum}, shutting down...")
        self.stop_daemon()
        sys.exit(0)
    
    def get_status(self):
        """Get daemon status"""
        if self.is_running():
            return {
                'status': 'running',
                'chrome_running': self.is_chrome_running(),
                'extension_active': self.is_extension_active(),
                'processed_files': len(self.processed_files)
            }
        else:
            return {
                'status': 'stopped',
                'chrome_running': self.is_chrome_running(),
                'extension_active': False,
                'processed_files': 0
            }

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Bloomberg Auto-Organizer Daemon')
    parser.add_argument('action', choices=['start', 'stop', 'status', 'restart'], 
                       help='Daemon action')
    parser.add_argument('--foreground', action='store_true',
                       help='Run in foreground (for debugging)')
    
    args = parser.parse_args()
    daemon = AutoOrganizerDaemon()
    
    if args.action == 'start':
        if args.foreground:
            daemon.start_daemon()
        else:
            # Start in background
            if daemon.is_running():
                print("Auto-organizer daemon is already running")
            else:
                # Fork to background
                pid = os.fork()
                if pid == 0:
                    # Child process
                    daemon.start_daemon()
                else:
                    # Parent process
                    print(f"🚀 Auto-organizer daemon started (PID: {pid})")
                    print("📁 Files will automatically organize when Bloomberg extension is used")
    
    elif args.action == 'stop':
        if daemon.is_running():
            try:
                with open(daemon.pid_file, 'r') as f:
                    pid = int(f.read().strip())
                os.kill(pid, signal.SIGTERM)
                print("🛑 Auto-organizer daemon stopped")
            except:
                print("❌ Error stopping daemon")
        else:
            print("Auto-organizer daemon is not running")
    
    elif args.action == 'status':
        status = daemon.get_status()
        print(f"📊 Daemon Status: {status['status']}")
        print(f"🌐 Chrome Running: {status['chrome_running']}")
        print(f"📰 Extension Active: {status['extension_active']}")
        print(f"📄 Files Processed: {status['processed_files']}")
        
        if status['status'] == 'running':
            print("✅ Auto-organizer is actively monitoring")
        else:
            print("💤 Auto-organizer is not running")
    
    elif args.action == 'restart':
        # Stop if running
        if daemon.is_running():
            try:
                with open(daemon.pid_file, 'r') as f:
                    pid = int(f.read().strip())
                os.kill(pid, signal.SIGTERM)
                time.sleep(2)
            except:
                pass
        
        # Start again
        if args.foreground:
            daemon.start_daemon()
        else:
            pid = os.fork()
            if pid == 0:
                daemon.start_daemon()
            else:
                print(f"🔄 Auto-organizer daemon restarted (PID: {pid})")

if __name__ == "__main__":
    main()