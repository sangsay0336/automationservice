#!/usr/bin/env python3
"""
Fast startup script for StreamlinedMainManager
Skips connectivity tests and starts immediately
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
    """Start the StreamlinedMainManager with minimal checks"""
    
    # Load .env file first
    load_env_file()
    
    # Quick API key check
    api_key = os.getenv('GEMINI_API_KEY')
    if api_key:
        print(f"✅ Gemini API key loaded: {api_key[:10]}...{api_key[-4:]}")
    else:
        print("⚠️ No Gemini API key found")
    
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
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())