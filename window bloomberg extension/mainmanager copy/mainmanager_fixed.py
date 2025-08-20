#!/usr/bin/env python3
"""
Fixed version of MainManager with emoji-free logging for Windows compatibility
"""

import os
import json
import logging
import time
import re
import threading
import pyodbc
import sys
from pathlib import Path
from datetime import datetime, timezone, time as time_class
from typing import Dict, Any, Optional, Tuple
from logging.handlers import RotatingFileHandler
from dataclasses import dataclass, field

# Fix console encoding for Windows
if os.name == 'nt':
    try:
        # Try to set UTF-8 encoding
        os.system('chcp 65001 > nul')
    except:
        pass

# AI imports
try:
    import google.generativeai as genai
    HAS_GEMINI = True
except ImportError:
    print("WARNING: Google GenerativeAI not installed. Install with: pip install google-generativeai")
    HAS_GEMINI = False

# PDF imports
try:
    import PyPDF2
    HAS_PYPDF2 = True
except ImportError:
    HAS_PYPDF2 = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

@dataclass
class ProcessingStats:
    """Track processing statistics"""
    total_processed: int = 0
    successful: int = 0
    failed: int = 0
    errors: Dict[str, int] = field(default_factory=lambda: {
        'pdf_extraction': 0,
        'content_cleaning': 0,
        'metadata_extraction': 0,
        'database_upload': 0
    })

class StreamlinedMainManager:
    """Fixed PDF processing system with emoji-free logging"""
    
    def __init__(self, config_path: str = None):
        # Load .env file if it exists
        self.load_env_file()
        
        self.config = self.load_default_config()
        if config_path and Path(config_path).exists():
            self.load_user_config(config_path)
        
        self.running = False
        self.setup_logging()
        
        # Thread safety
        self.processing_lock = threading.Lock()
        self.currently_processing = set()
        self.processed_files = set()
        
        # Initialize components
        self.db_connection = None
        self.gemini_model = None
        self.stats = ProcessingStats()
        
        # Initialize systems
        self.init_gemini()
        db_success = self.init_database()
        
        if not db_success:
            self.logger.warning("Database connection failed - running in processing-only mode")
            self.logger.info("System will process PDFs and show results without database upload")
        
        self.logger.info("Streamlined MainManager initialized successfully")
    
    def load_env_file(self):
        """Load environment variables from .env file"""
        env_file = Path(__file__).parent / ".env"
        if env_file.exists():
            try:
                with open(env_file, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            os.environ[key.strip()] = value.strip()
            except Exception as e:
                print(f"Warning: Could not load .env file: {e}")
    
    def load_default_config(self):
        """Load default configuration"""
        return {
            "database": {
                "server": os.getenv('DB_SERVER', 'sangsay.database.windows.net'),
                "database": os.getenv('DB_NAME', 'SQL TEST'),
                "username": os.getenv('DB_USERNAME', 'sangsay'),
                "password": os.getenv('DB_PASSWORD', 'coronafranklinorganization168!'),
                "driver": os.getenv('DB_DRIVER', '{ODBC Driver 18 for SQL Server}'),
                "extra_params": os.getenv('DB_EXTRA_PARAMS', 
                    'Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;')
            },
            "directories": {
                "pdf_incoming": os.getenv('PDF_INCOMING', str(Path.home() / "Desktop" / "INCOMING_PDFS")),
                "backup": os.getenv('PDF_BACKUP', str(Path.home() / "Desktop" / "BACKUP"))
            },
            "processing": {
                "scan_interval": int(os.getenv('SCAN_INTERVAL', 10)),
                "max_retries": int(os.getenv('MAX_RETRIES', 3)),
                "retry_delay": int(os.getenv('RETRY_DELAY', 5)),
                "batch_size": int(os.getenv('BATCH_SIZE', 5))
            },
            "gemini_api_key": os.getenv('GEMINI_API_KEY')
        }
    
    def load_user_config(self, config_path: str):
        """Load user configuration and merge with defaults"""
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                user_config = json.load(f)
                # Deep merge
                for key, value in user_config.items():
                    if isinstance(value, dict) and key in self.config:
                        self.config[key].update(value)
                    else:
                        self.config[key] = value
        except Exception as e:
            print(f"Warning: Could not load config from {config_path}: {e}")
    
    def setup_logging(self):
        """Setup logging without emojis for Windows compatibility"""
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        # Clear any existing loggers
        for handler in logging.root.handlers[:]:
            logging.root.removeHandler(handler)
        
        # Create main logger
        self.logger = logging.getLogger('StreamlinedMainManager')
        self.logger.setLevel(logging.DEBUG)
        self.logger.handlers.clear()
        
        # Simple formatter without emojis
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s',
            datefmt='%H:%M:%S'
        )
        
        # File handler
        file_handler = RotatingFileHandler(
            log_dir / "mainmanager_detailed.log",
            maxBytes=10*1024*1024,  # 10MB files
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        self.logger.addHandler(file_handler)
        
        # Console handler with proper encoding
        try:
            console_handler = logging.StreamHandler(sys.stdout)
            console_handler.setLevel(logging.INFO)
            console_handler.setFormatter(formatter)
            self.logger.addHandler(console_handler)
        except Exception as e:
            print(f"Warning: Could not setup console logging: {e}")
    
    def init_gemini(self):
        """Initialize Gemini AI with improved error handling"""
        if not HAS_GEMINI:
            self.logger.warning("Gemini AI library not available - google-generativeai not installed")
            return
        
        api_key = self.config.get('gemini_api_key')
        if not api_key:
            self.logger.warning("Gemini API key not found in config")
            return
        
        try:
            self.logger.debug("Starting Gemini AI initialization")
            genai.configure(api_key=api_key)
            
            # Test the connection
            self.gemini_model = genai.GenerativeModel('gemini-pro')
            self.logger.info("Gemini AI initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Gemini AI: {e}")
    
    def get_db_connection(self):
        """Get database connection with detailed logging"""
        db_config = self.config['database']
        
        connection_string = (
            f"DRIVER={db_config['driver']};"
            f"SERVER={db_config['server']};"
            f"DATABASE={db_config['database']};"
            f"UID={db_config['username']};"
            f"PWD={db_config['password']};"
            f"{db_config['extra_params']}"
        )
        
        # Log connection details (without password)
        safe_string = connection_string.replace(f"PWD={db_config['password']}", "PWD=***")
        self.logger.debug(f"Connection string: {safe_string}")
        
        try:
            return pyodbc.connect(connection_string, timeout=30)
        except Exception as e:
            self.logger.error(f"Database connection failed: {e}")
            raise
    
    def init_database(self):
        """Initialize database connection with Windows compatibility"""
        try:
            max_retries = self.config['processing']['max_retries']
            retry_delay = self.config['processing']['retry_delay']
            
            self.logger.debug("Starting database initialization")
            
            db_config = self.config['database']
            self.logger.debug(f"Database config: max_retries={max_retries}, retry_delay={retry_delay}")
            self.logger.debug(f"Database server: {db_config['server']}")
            self.logger.debug(f"Database name: {db_config['database']}")
            self.logger.debug(f"Username: {db_config['username']}")
            
            for attempt in range(max_retries):
                try:
                    self.logger.debug(f"Database connection attempt {attempt + 1}/{max_retries}")
                    
                    # Check ODBC drivers (skip if command not found)
                    try:
                        import subprocess
                        result = subprocess.run(['odbcinst', '-q', '-d'], 
                                              capture_output=True, text=True, timeout=10)
                        self.logger.debug(f"Available ODBC drivers: {result.stdout}")
                    except Exception as e:
                        self.logger.debug(f"Could not query ODBC drivers: {e}")
                    
                    # Attempt connection
                    self.logger.debug("Starting database connection...")
                    start_time = time.time()
                    self.db_connection = self.get_db_connection()
                    connection_time = time.time() - start_time
                    
                    self.logger.info(f"Database connection established in {connection_time:.2f}s")
                    
                    # Test connection
                    cursor = self.db_connection.cursor()
                    self.logger.debug("Testing database connection with simple query...")
                    cursor.execute("SELECT 1")
                    result = cursor.fetchone()
                    self.logger.debug(f"Test query result: {result}")
                    
                    # Get database version
                    cursor.execute("SELECT @@VERSION")
                    version = cursor.fetchone()[0]
                    self.logger.debug(f"Database version: {version}")
                    
                    # Check if NewsReferences table exists
                    cursor.execute("""
                        SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES 
                        WHERE TABLE_NAME = 'NewsReferences'
                    """)
                    table_exists = cursor.fetchone()[0] > 0
                    self.logger.debug(f"NewsReferences table exists: {table_exists}")
                    
                    if table_exists:
                        cursor.execute("SELECT COUNT(*) FROM NewsReferences")
                        record_count = cursor.fetchone()[0]
                        self.logger.debug(f"Current record count in NewsReferences: {record_count}")
                    
                    cursor.close()
                    return True
                    
                except Exception as e:
                    self.logger.error(f"Database connection attempt {attempt + 1} failed: {e}")
                    if attempt < max_retries - 1:
                        self.logger.info(f"Retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
                    else:
                        self.logger.error("All database connection attempts failed")
                        return False
        
        except Exception as e:
            self.logger.error(f"Database initialization failed: {e}")
            return False
    
    def scan_and_process(self):
        """Scan for PDFs and process them with proper path handling"""
        incoming_dir_str = self.config['directories']['pdf_incoming']
        
        # Convert forward slashes to backslashes on Windows
        if os.name == 'nt':
            incoming_dir_str = incoming_dir_str.replace('/', '\\')
        
        incoming_dir = Path(incoming_dir_str)
        
        self.logger.info(f"Checking directory: {incoming_dir}")
        
        try:
            if not incoming_dir.exists():
                self.logger.info(f"Creating directory: {incoming_dir}")
                incoming_dir.mkdir(parents=True, exist_ok=True)
                self.logger.info("Directory created successfully")
                return
        except Exception as e:
            self.logger.error(f"Failed to create directory {incoming_dir}: {e}")
            raise
        
        pdf_files = list(incoming_dir.glob('*.pdf'))
        if not pdf_files:
            self.logger.debug("No PDF files found")
            return
        
        self.logger.info(f"Found {len(pdf_files)} PDF files")
        
        batch_size = self.config['processing']['batch_size']
        for i in range(0, len(pdf_files), batch_size):
            batch = pdf_files[i:i+batch_size]
            
            for pdf_path in batch:
                if not self.running:
                    break
                
                if pdf_path.name in self.processed_files:
                    continue
                
                self.logger.info(f"Processing: {pdf_path.name}")
                time.sleep(0.5)  # Small delay between files
    
    def run(self):
        """Main processing loop"""
        self.running = True
        
        try:
            self.logger.info("Starting PDF processing")
            incoming_dir = self.config['directories']['pdf_incoming']
            self.logger.info(f"Monitoring: {incoming_dir}")
            
            self.scan_and_process()
            
        except Exception as e:
            self.logger.error(f"Fatal error: {e}")
            raise
        finally:
            self.stop()
    
    def stop(self):
        """Stop the manager and cleanup"""
        self.running = False
        
        if self.db_connection:
            try:
                self.db_connection.close()
                self.logger.info("Database connection closed")
            except Exception as e:
                self.logger.error(f"Error closing database connection: {e}")
        
        # Print statistics
        print(f"\nProcessing Statistics:")
        print(f"   Total: {self.stats.total_processed}")
        print(f"   Successful: {self.stats.successful}")
        print(f"   Failed: {self.stats.failed}")
        
        self.logger.info("Streamlined MainManager stopped")

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Bloomberg Extension PDF Processor')
    parser.add_argument('--config', default='config.json', help='Configuration file path')
    parser.add_argument('--test', action='store_true', help='Run in test mode')
    
    args = parser.parse_args()
    
    try:
        manager = StreamlinedMainManager(args.config)
        
        if args.test:
            print("Test mode - manager initialized successfully")
            manager.stop()
        else:
            manager.run()
            
    except KeyboardInterrupt:
        print("\nStopping...")
        if 'manager' in locals():
            manager.stop()
    except Exception as e:
        print(f"Error: {e}")
        if 'manager' in locals():
            manager.stop()

if __name__ == "__main__":
    main()