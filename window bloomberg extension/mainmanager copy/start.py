#!/usr/bin/env python3
"""
Simple startup script for StreamlinedMainManager
Sets environment variables and starts the system
"""

import os
import sys
from pathlib import Path

def load_env_file():
    """Load environment variables from .env file"""
    env_file = Path(__file__).parent / ".env"
    
    if env_file.exists():
        print(f"📄 Loading environment from: {env_file}")
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip()
                    print(f"🔑 Loaded {key.strip()}")
    else:
        print(f"⚠️ .env file not found at: {env_file}")

def main():
    """Start the StreamlinedMainManager with proper environment setup"""
    
    # Load .env file first
    load_env_file()
    
    # Check Gemini API key
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("❌ GEMINI_API_KEY not found in environment or .env file")
        print("Please add it to .env file: GEMINI_API_KEY=your_api_key")
        return 1
    else:
        # Validate API key format (should start with AIza...)
        if not api_key.startswith('AIza'):
            print("⚠️ API key format looks incorrect (should start with 'AIza')")
        else:
            print(f"✅ Gemini API key loaded: {api_key[:10]}...{api_key[-4:]}")
    
    # Check network connectivity to database (quick test)
    print("🔍 Checking database connectivity...")
    import socket
    import threading
    import time
    
    def test_db_connection():
        try:
            sock = socket.create_connection(("webapp-sangsay.database.windows.net", 1433), timeout=5)
            sock.close()
            print("✅ Database server is reachable")
            return True
        except Exception as e:
            print(f"⚠️ Database server connectivity issue: {e}")
            print("This may cause database connection timeouts")
            return False
    
    # Run connectivity test in a separate thread with timeout
    result = [False]
    def connectivity_test():
        result[0] = test_db_connection()
    
    test_thread = threading.Thread(target=connectivity_test)
    test_thread.daemon = True
    test_thread.start()
    test_thread.join(timeout=10)  # Wait max 10 seconds
    
    if test_thread.is_alive():
        print("⚠️ Database connectivity test timed out - proceeding anyway")
    elif not result[0]:
        print("⚠️ Database connection may fail - but continuing to start system")
    
    # Ensure required directories exist
    incoming_dir = Path("/Users/sangsay/Desktop/INCOMING_PDFS")
    backup_dir = Path("/Users/sangsay/Desktop/BACKUP")
    
    incoming_dir.mkdir(exist_ok=True)
    backup_dir.mkdir(exist_ok=True)
    
    print(f"📂 Incoming directory: {incoming_dir}")
    print(f"📂 Backup directory: {backup_dir}")
    
    # Import and start the manager
    try:
        from mainmanager import StreamlinedMainManager
        
        print("🚀 Starting StreamlinedMainManager...")
        manager = StreamlinedMainManager()
        
        # Start the main processing loop
        manager.run()
        
    except KeyboardInterrupt:
        print("\n⏹️ Shutdown requested by user")
        return 0
    except Exception as e:
        print(f"💥 Fatal error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())