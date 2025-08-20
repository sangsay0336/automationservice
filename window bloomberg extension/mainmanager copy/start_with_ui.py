#!/usr/bin/env python3
"""
Startup script that shows directory selection UI before running main application
"""

import sys
import os
from pathlib import Path

# Add current directory to Python path
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

def main():
    """Main startup function"""
    print("Bloomberg Extension - Starting Directory Setup...")
    
    try:
        # Import and run the directory selector UI
        from directory_selector_ui import DirectorySelectorUI
        
        app = DirectorySelectorUI()
        result = app.run()
        
        if result == "start":
            print("\n" + "="*50)
            print("Starting main application with selected directories...")
            print("="*50 + "\n")
            
            # Import and run the main application
            try:
                # Set UTF-8 encoding for console to handle emojis
                if os.name == 'nt':  # Windows
                    os.system('chcp 65001 > nul')
                
                from mainmanager_fixed import StreamlinedMainManager
                import argparse
                
                # Create argument parser
                parser = argparse.ArgumentParser(description='Bloomberg Extension PDF Processor')
                parser.add_argument('--config', default='config.json', help='Configuration file path')
                
                # Use the config file we just created/updated
                args = parser.parse_args(['--config', str(current_dir / 'config.json')])
                
                # Run the main application
                manager = StreamlinedMainManager(args.config)
                manager.run()
                
            except ImportError as e:
                print(f"Error importing main application: {e}")
                print("Please ensure mainmanager.py is in the same directory")
                input("Press Enter to exit...")
            except Exception as e:
                print(f"Error running main application: {e}")
                input("Press Enter to exit...")
        else:
            print("Setup cancelled by user.")
            
    except ImportError as e:
        print(f"Error importing directory selector UI: {e}")
        print("Please ensure all required packages are installed:")
        print("pip install tkinter")
        input("Press Enter to exit...")
    except Exception as e:
        print(f"Unexpected error: {e}")
        input("Press Enter to exit...")

if __name__ == "__main__":
    main()