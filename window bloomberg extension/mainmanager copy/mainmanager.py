#!/usr/bin/env python3
"""
Streamlined MainManager - Single-File PDF-to-Database Processing System
All functionality integrated: PDF extraction, AI cleaning, metadata extraction, database upload
"""

import os
import json
import logging
import time
import re
import threading
import pyodbc
from pathlib import Path
from datetime import datetime, timezone, time as time_class
from typing import Dict, Any, Optional, Tuple
from logging.handlers import RotatingFileHandler
from dataclasses import dataclass, field

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
    """Single-file PDF processing system with all functionality integrated"""
    
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
            self.logger.warning("WARNING: Database connection failed - running in processing-only mode")
            self.logger.info("INFO: System will process PDFs and show results without database upload")
        
        # Integrated automation components (initialized but not started)
        self.web_ui = None
        self.extension_manager = None
        self.automation_service = None
        self.enhanced_gemini_analyzer = None
        self.telegram_notifier = None
        self.database_manager = None
        self.sequential_processor = None
        self.automation_enabled = False
        
        self.logger.info("INFO: Streamlined MainManager initialized")
    
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
        
    def load_default_config(self) -> Dict[str, Any]:
        """Load default configuration"""
        return {
            "database": {
                "server": "sangsay.database.windows.net",
                "database": "SQL TEST",
                "username": "sangsay",
                "password": "coronafranklinorganization168!",
                "driver": "{ODBC Driver 18 for SQL Server}",
                "extra_params": "Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
            },
            "directories": {
                "pdf_incoming": "C:\\Users\\sangs\\Desktop\\Mainmanger processor",
                "backup": "C:\\Users\\sangs\\Desktop\\Mainmanger processor\\BACKUP"
            },
            "processing": {
                "scan_interval": 10,
                "max_retries": 3,
                "retry_delay": 5,
                "batch_size": 5
            },
            "gemini_api_key": os.getenv('GEMINI_API_KEY')
        }
    
    def load_user_config(self, config_path: str):
        """Load user configuration and merge with defaults"""
        try:
            with open(config_path, 'r') as f:
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
        """Setup comprehensive detailed logging"""
        log_dir = Path("logs")
        log_dir.mkdir(exist_ok=True)
        
        # Clear any existing loggers
        for handler in logging.root.handlers[:]:
            logging.root.removeHandler(handler)
        
        # Create main logger
        self.logger = logging.getLogger('StreamlinedMainManager')
        self.logger.setLevel(logging.DEBUG)  # Set to DEBUG for maximum detail
        self.logger.handlers.clear()
        
        # Create detailed formatter with more context
        detailed_formatter = logging.Formatter(
            '%(asctime)s.%(msecs)03d - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # File handler with rotation for detailed logs
        file_handler = RotatingFileHandler(
            log_dir / "mainmanager_detailed.log",
            maxBytes=20*1024*1024,  # 20MB files
            backupCount=10
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(detailed_formatter)
        
        # Console handler for important messages only
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        console_formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s',
            datefmt='%H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)
        
        # Error file handler for errors only
        error_handler = RotatingFileHandler(
            log_dir / "mainmanager_errors.log",
            maxBytes=5*1024*1024,
            backupCount=5
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(detailed_formatter)
        
        # Add all handlers
        self.logger.addHandler(file_handler)
        self.logger.addHandler(console_handler)
        self.logger.addHandler(error_handler)
        
        # Also capture warnings and other loggers
        logging.captureWarnings(True)
        
        # Set up additional loggers for external libraries
        for logger_name in ['pyodbc', 'google.generativeai', 'urllib3']:
            ext_logger = logging.getLogger(logger_name)
            ext_logger.setLevel(logging.DEBUG)
            ext_logger.addHandler(file_handler)
    
    def init_gemini(self):
        """Initialize Gemini AI"""
        self.logger.debug("DEBUG: Starting Gemini AI initialization")
        
        if not HAS_GEMINI:
            self.logger.warning("WARNING: Gemini AI library not available - google-generativeai not installed")
            return
        
        api_key = self.config.get('gemini_api_key')
        self.logger.debug(f"DEBUG: API key check: {'Found' if api_key else 'Not found'}")
        
        if not api_key:
            env_key = os.getenv('GEMINI_API_KEY')
            if env_key:
                api_key = env_key
                self.logger.debug("DEBUG: Using API key from environment variable")
            else:
                self.logger.warning("WARNING: No Gemini API key found in config or environment")
                return
        
        try:
            self.logger.debug("DEBUG: Configuring Gemini with API key...")
            self.logger.debug(f"DEBUG: API key format: {api_key[:10]}...{api_key[-4:]}")
            genai.configure(api_key=api_key)
            
            self.logger.debug("DEBUG: Creating GenerativeModel instance...")
            self.gemini_model = genai.GenerativeModel('gemini-2.5-flash')
            
            # Test the model with a simple request
            self.logger.debug("DEBUG: Testing Gemini model with simple request...")
            test_response = self.gemini_model.generate_content("Reply with 'TEST_OK'")
            
            if test_response and test_response.text and 'TEST_OK' in test_response.text:
                self.logger.info("INFO: Gemini AI initialized and tested successfully")
                self.logger.debug(f"DEBUG: Test response: {test_response.text}")
            else:
                self.logger.warning("WARNING: Gemini initialized but test failed")
                self.logger.debug(f"DEBUG: Test response: {test_response.text if test_response else 'None'}")
                
        except Exception as e:
            self.logger.error(f"ERROR: Failed to initialize Gemini: {e}")
            self.logger.debug(f"ERROR: Gemini initialization error details:", exc_info=True)
            self.gemini_model = None
    
    def get_db_connection(self):
        """
        Establish and return a database connection using the exact working configuration.
        """
        db_config = self.config['database']
        
        conn_str = (
            f"DRIVER={db_config['driver']};"
            f"SERVER={db_config['server']};"
            f"DATABASE={db_config['database']};"
            f"UID={db_config['username']};"
            f"PWD={db_config['password']};"
            f"{db_config['extra_params']}"
        )
        
        self.logger.debug(f"DEBUG: Connection string: DRIVER={db_config['driver']};SERVER={db_config['server']};DATABASE={db_config['database']};UID={db_config['username']};PWD=***;{db_config['extra_params']}")
        
        try:
            return pyodbc.connect(conn_str)
        except Exception as e:
            self.logger.error(f"Database connection error: {str(e)}")
            raise

    def init_database(self):
        """Initialize database connection with retry and detailed logging"""
        self.logger.debug("DEBUG: Starting database initialization")
        
        max_retries = self.config['processing']['max_retries']
        retry_delay = self.config['processing']['retry_delay']
        
        self.logger.debug(f"DEBUG: Database config: max_retries={max_retries}, retry_delay={retry_delay}")
        
        db_config = self.config['database']
        self.logger.debug(f"DEBUG: Database server: {db_config['server']}")
        self.logger.debug(f"DEBUG: Database name: {db_config['database']}")
        self.logger.debug(f"DEBUG: Username: {db_config['username']}")
        
        for attempt in range(max_retries):
            self.logger.debug(f"DEBUG: Database connection attempt {attempt + 1}/{max_retries}")
            
            try:
                # Log available ODBC drivers
                if attempt == 0:  # Only on first attempt
                    try:
                        import subprocess
                        result = subprocess.run(['odbcinst', '-q', '-d'], capture_output=True, text=True)
                        self.logger.debug(f"DEBUG: Available ODBC drivers: {result.stdout.strip()}")
                    except Exception as e:
                        self.logger.debug(f"WARNING: Could not query ODBC drivers: {e}")
                
                # Measure connection time
                start_time = time.time()
                self.logger.debug("DEBUG: Starting database connection...")
                
                # Use the exact working connection method
                self.db_connection = self.get_db_connection()
                
                connection_time = time.time() - start_time
                self.logger.info(f"INFO: Database connection established in {connection_time:.2f}s")
                
                # Test the connection with a simple query
                try:
                    cursor = self.db_connection.cursor()
                    self.logger.debug("DEBUG: Testing database connection with simple query...")
                    cursor.execute("SELECT 1 as test_value")
                    result = cursor.fetchone()
                    self.logger.debug(f"DEBUG: Test query result: {result}")
                    
                    # Get database info
                    cursor.execute("SELECT @@VERSION")
                    version = cursor.fetchone()[0]
                    self.logger.debug(f"DEBUG: Database version: {version}")
                    
                    # Check NewsReferences table exists
                    cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'NewsReferences'")
                    table_exists = cursor.fetchone()[0] > 0
                    self.logger.debug(f"DEBUG: NewsReferences table exists: {table_exists}")
                    
                    if table_exists:
                        cursor.execute("SELECT COUNT(*) FROM NewsReferences")
                        record_count = cursor.fetchone()[0]
                        self.logger.debug(f"DEBUG: Current record count in NewsReferences: {record_count}")
                    
                except Exception as test_e:
                    self.logger.warning(f"WARNING: Database connection test failed: {test_e}")
                
                return True
                
            except Exception as e:
                error_details = {
                    'attempt': attempt + 1,
                    'error_type': type(e).__name__,
                    'error_message': str(e),
                    'server': db_config['server'],
                    'database': db_config['database']
                }
                
                self.logger.warning(f"Database attempt {attempt + 1} failed: {e}")
                self.logger.debug(f"ERROR: Database error details: {error_details}")
                
                if attempt < max_retries - 1:
                    self.logger.debug(f"⏳ Waiting {retry_delay}s before retry...")
                    time.sleep(retry_delay)
        
        self.logger.error("ERROR: Failed to establish database connection after all retries")
        return False
    
    def extract_pdf_text(self, pdf_path: Path) -> Optional[str]:
        """Extract text from PDF using multiple methods with detailed logging"""
        self.logger.debug(f"📄 Starting PDF text extraction for: {pdf_path.name}")
        self.logger.debug(f"📊 File size: {pdf_path.stat().st_size} bytes")
        
        # Check if file exists and is readable
        if not pdf_path.exists():
            self.logger.error(f"ERROR: PDF file does not exist: {pdf_path}")
            return None
        
        if not pdf_path.is_file():
            self.logger.error(f"ERROR: Path is not a file: {pdf_path}")
            return None
        
        text = None
        
        # Try PyPDF2 first
        self.logger.debug(f"🔧 Attempting PyPDF2 extraction (available: {HAS_PYPDF2})")
        if HAS_PYPDF2:
            try:
                start_time = time.time()
                with open(pdf_path, 'rb') as file:
                    self.logger.debug("📖 Opening PDF file with PyPDF2...")
                    reader = PyPDF2.PdfReader(file)
                    
                    page_count = len(reader.pages)
                    self.logger.debug(f"📊 PDF has {page_count} pages")
                    
                    text = ""
                    for i, page in enumerate(reader.pages):
                        self.logger.debug(f"📄 Processing page {i+1}/{page_count}")
                        page_text = page.extract_text()
                        text += page_text + "\n"
                        self.logger.debug(f"📊 Page {i+1} extracted {len(page_text)} characters")
                    
                    extraction_time = time.time() - start_time
                    
                    if text.strip():
                        self.logger.info(f"✅ PyPDF2 extracted {len(text)} chars in {extraction_time:.2f}s")
                        self.logger.debug(f"📝 Text preview (first 200 chars): {text[:200]}")
                        return text
                    else:
                        self.logger.warning("⚠️ PyPDF2 extracted empty text")
                        
            except Exception as e:
                self.logger.warning(f"⚠️ PyPDF2 extraction failed: {e}")
                self.logger.debug("💥 PyPDF2 error details:", exc_info=True)
        else:
            self.logger.debug("⚠️ PyPDF2 not available")
        
        # Try pdfplumber as fallback
        self.logger.debug(f"🔧 Attempting pdfplumber extraction (available: {HAS_PDFPLUMBER})")
        if HAS_PDFPLUMBER:
            try:
                start_time = time.time()
                text = ""
                with pdfplumber.open(pdf_path) as pdf:
                    page_count = len(pdf.pages)
                    self.logger.debug(f"📊 PDF has {page_count} pages (pdfplumber)")
                    
                    for i, page in enumerate(pdf.pages):
                        self.logger.debug(f"📄 Processing page {i+1}/{page_count} with pdfplumber")
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                            self.logger.debug(f"📊 Page {i+1} extracted {len(page_text)} characters")
                        else:
                            self.logger.debug(f"⚠️ Page {i+1} returned empty text")
                
                extraction_time = time.time() - start_time
                
                if text.strip():
                    self.logger.info(f"✅ pdfplumber extracted {len(text)} chars in {extraction_time:.2f}s")
                    self.logger.debug(f"📝 Text preview (first 200 chars): {text[:200]}")
                    return text
                else:
                    self.logger.warning("⚠️ pdfplumber extracted empty text")
                    
            except Exception as e:
                self.logger.warning(f"⚠️ pdfplumber extraction failed: {e}")
                self.logger.debug("💥 pdfplumber error details:", exc_info=True)
        else:
            self.logger.debug("⚠️ pdfplumber not available")
        
        # Try reading as text file (fallback for test files)
        self.logger.debug("🔧 Attempting to read as text file (fallback)")
        try:
            with open(pdf_path, 'r', encoding='utf-8') as f:
                text = f.read()
                if text.strip():
                    self.logger.info(f"✅ Text file fallback extracted {len(text)} chars")
                    self.logger.debug(f"📝 Text preview (first 200 chars): {text[:200]}")
                    return text
        except Exception as e:
            self.logger.debug(f"⚠️ Text file fallback failed: {e}")
        
        self.logger.error(f"ERROR: All PDF extraction methods failed for {pdf_path.name}")
        self.stats.errors['pdf_extraction'] += 1
        return None
    
    def clean_content_with_ai(self, text: str) -> str:
        """Clean content using AI or fallback methods with detailed logging"""
        self.logger.debug(f"🧹 Starting content cleaning")
        self.logger.debug(f"📊 Input text length: {len(text)} characters")
        
        if not text or not text.strip():
            self.logger.warning("⚠️ Empty or whitespace-only text provided")
            return ""
        
        # Log text characteristics
        lines = text.split('\n')
        self.logger.debug(f"📊 Input text has {len(lines)} lines")
        self.logger.debug(f"📝 First 300 chars: {text[:300]}")
        
        # Try AI cleaning if available
        if self.gemini_model:
            try:
                self.logger.info("🤖 Using AI for content cleaning")
                start_time = time.time()
                
                # Prepare text for AI (limit to avoid token limits)
                text_for_ai = text[:5000] if len(text) > 5000 else text
                self.logger.debug(f"📊 Sending {len(text_for_ai)} chars to AI for cleaning")
                
                prompt = f"""
                Clean this news article text by removing noise, advertisements, and navigation elements.
                Keep only the main article content, headlines, and publication information.
                
                Remove:
                - Navigation menus, buttons, links
                - Advertisement text
                - Subscription prompts
                - Social media elements
                - Copyright notices
                - Page numbers
                - Website footers/headers
                
                Keep:
                - Article headline and content
                - Publication date/time information
                - Author bylines
                - News content paragraphs
                
                Return only the cleaned article text:
                
                {text_for_ai}
                """
                
                self.logger.debug("🔄 Sending request to Gemini...")
                response = self.gemini_model.generate_content(prompt)
                
                ai_time = time.time() - start_time
                self.logger.debug(f"⏱️ AI cleaning took {ai_time:.2f}s")
                
                if response and response.text:
                    cleaned_text = response.text.strip()
                    self.logger.debug(f"📊 AI response length: {len(cleaned_text)} characters")
                    self.logger.debug(f"📝 AI response preview: {cleaned_text[:200]}")
                    
                    if len(cleaned_text) > 100:
                        reduction = ((len(text) - len(cleaned_text)) / len(text)) * 100
                        self.logger.info(f"✅ AI cleaned: {len(text)} → {len(cleaned_text)} chars ({reduction:.1f}% reduction)")
                        return cleaned_text
                    else:
                        self.logger.warning(f"⚠️ AI cleaning resulted in very short text ({len(cleaned_text)} chars)")
                else:
                    self.logger.warning("⚠️ AI cleaning returned empty response")
                    
            except Exception as e:
                self.logger.warning(f"⚠️ AI cleaning failed: {e}")
                self.logger.debug("💥 AI cleaning error details:", exc_info=True)
                self.stats.errors['content_cleaning'] += 1
        else:
            self.logger.debug("⚠️ Gemini model not available, skipping AI cleaning")
        
        # Fallback to basic cleaning
        self.logger.info("🔧 Using basic text cleaning")
        return self.basic_text_cleaning(text)
    
    def basic_text_cleaning(self, text: str) -> str:
        """Basic text cleaning methods"""
        # Normalize whitespace
        text = re.sub(r'\r\n', '\n', text)
        text = re.sub(r'\r', '\n', text)
        text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)
        text = re.sub(r'[ \t]+', ' ', text)
        
        # Remove common noise phrases
        noise_phrases = [
            "Gift this article", "FollowFollow", "Contact us:",
            "Bloomberg Terminal", "Most Read", "Subscribe to",
            "Sign up for", "Follow us on", "© Bloomberg",
            "Terms of Service", "Privacy Policy", "Advertisement",
            "Sponsored Content", "Related Articles", "Continue reading"
        ]
        
        lines = text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Skip noise lines
            is_noise = any(phrase.lower() in line.lower() for phrase in noise_phrases)
            
            # Skip lines that are mostly punctuation/numbers
            if not is_noise and len(line) > 10:
                if not re.match(r'^[^\w]*\d*[^\w]*$', line):
                    cleaned_lines.append(line)
        
        cleaned = '\n'.join(cleaned_lines)
        
        # Final cleanup
        cleaned = re.sub(r'\n\s*\n\s*\n+', '\n\n', cleaned)
        cleaned = re.sub(r'([.!?])\s*([A-Z])', r'\1 \2', cleaned)
        
        return cleaned.strip()
    
    def extract_metadata_from_content(self, content: str) -> Dict[str, Any]:
        """Extract metadata from content using first 100 words with detailed logging"""
        self.logger.debug("🔍 Starting metadata extraction from content")
        self.logger.debug(f"📊 Content length: {len(content)} characters")
        
        try:
            # Get first 100 words
            words = content.split()
            self.logger.debug(f"📊 Total words in content: {len(words)}")
            
            first_100_words = ' '.join(words[:100])
            self.logger.debug(f"📊 First 100 words length: {len(first_100_words)} characters")
            self.logger.debug(f"📝 First 100 words preview: {first_100_words[:200]}...")
            
            if not first_100_words.strip():
                self.logger.warning("⚠️ First 100 words are empty, using fallback metadata")
                return self.fallback_metadata()
            
            # Try AI extraction
            if self.gemini_model:
                self.logger.info("🔍 Extracting metadata using AI")
                return self.extract_metadata_with_ai(first_100_words)
            else:
                self.logger.debug("⚠️ Gemini model not available, using pattern extraction")
                return self.extract_metadata_with_patterns(first_100_words)
                
        except Exception as e:
            self.logger.error(f"💥 Metadata extraction error: {e}")
            self.logger.debug("💥 Metadata extraction error details:", exc_info=True)
            self.stats.errors['metadata_extraction'] += 1
            return self.fallback_metadata()
    
    def extract_metadata_with_ai(self, text_snippet: str) -> Dict[str, Any]:
        """Extract metadata using AI with detailed logging"""
        self.logger.debug("🤖 Starting AI metadata extraction")
        self.logger.debug(f"📊 Text snippet length: {len(text_snippet)} characters")
        
        try:
            start_time = time.time()
            
            prompt = f"""
            Extract publication metadata from this news article excerpt. DO NOT convert times - extract the original time and timezone.
            
            Find and return in JSON format:
            1. publication_date (YYYY-MM-DD format)
            2. publication_time_raw (original time as found, e.g. "6:48 PM")
            3. publication_timezone (timezone as found, e.g. "GMT+7", "EDT", "EST", "PT", "UTC")
            4. last_update_date (YYYY-MM-DD format, null if not mentioned)
            5. last_update_time_raw (original time as found, null if not mentioned)
            6. last_update_timezone (timezone as found, null if not mentioned)
            7. source (bloomberg, wsj, cnbc, barrons, reuters, etc.)
            
            Look for patterns like:
            - "July 15, 2025 at 6:48 PM GMT+7" → time: "6:48 PM", timezone: "GMT+7"
            - "Updated on July 15, 2025 at 8:44 PM GMT+7" → time: "8:44 PM", timezone: "GMT+7"
            - "3:45 PM EDT" → time: "3:45 PM", timezone: "EDT"
            - "8 PM ET" → time: "8:00 PM", timezone: "ET"
            - "Published at 2:30 PM" → time: "2:30 PM", timezone: null (if no timezone found)
            
            IMPORTANT: Extract exactly as written, do NOT convert:
            - "6:48 PM GMT+7" → time: "6:48 PM", timezone: "GMT+7"
            - "8:44 PM GMT+7" → time: "8:44 PM", timezone: "GMT+7"
            
            Return ONLY valid JSON:
            {{
                "publication_date": "YYYY-MM-DD",
                "publication_time_raw": "H:MM AM/PM",
                "publication_timezone": "timezone or null",
                "last_update_date": "YYYY-MM-DD or null",
                "last_update_time_raw": "H:MM AM/PM or null",
                "last_update_timezone": "timezone or null",
                "source": "source_name"
            }}
            
            Text: {text_snippet}
            """
            
            self.logger.debug("🔄 Sending metadata extraction request to Gemini...")
            response = self.gemini_model.generate_content(prompt)
            
            ai_time = time.time() - start_time
            self.logger.debug(f"⏱️ AI metadata extraction took {ai_time:.2f}s")
            
            if response and response.text:
                self.logger.debug(f"📊 AI response length: {len(response.text)} characters")
                self.logger.debug(f"📝 AI response: {response.text}")
                
                # Extract JSON from response
                json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
                if json_match:
                    json_str = json_match.group()
                    self.logger.debug(f"📋 Extracted JSON string: {json_str}")
                    
                    try:
                        metadata = json.loads(json_str)
                        self.logger.debug(f"📋 Parsed metadata: {metadata}")
                        
                        # Convert raw times to UTC using our conversion function
                        converted_metadata = self.convert_raw_times_to_utc(metadata)
                        
                        if self.validate_metadata(converted_metadata):
                            self.logger.info(f"✅ AI extracted and converted metadata: {converted_metadata}")
                            return converted_metadata
                        else:
                            self.logger.warning("⚠️ AI extracted metadata failed validation")
                    except json.JSONDecodeError as je:
                        self.logger.warning(f"⚠️ Failed to parse AI response as JSON: {je}")
                else:
                    self.logger.warning("⚠️ No JSON found in AI response")
            else:
                self.logger.warning("⚠️ Empty or no response from AI")
            
            self.logger.debug("🔄 Falling back to pattern extraction")
            return self.extract_metadata_with_patterns(text_snippet)
            
        except Exception as e:
            self.logger.warning(f"⚠️ AI metadata extraction failed: {e}")
            self.logger.debug("💥 AI metadata extraction error details:", exc_info=True)
            return self.extract_metadata_with_patterns(text_snippet)
    
    def extract_metadata_with_patterns(self, text: str) -> Dict[str, Any]:
        """Extract metadata using regex patterns with timezone handling"""
        metadata = self.fallback_metadata()
        self.logger.debug("🔍 Starting pattern-based metadata extraction")
        
        # Extract source
        text_lower = text.lower()
        if 'bloomberg' in text_lower:
            metadata['source'] = 'bloomberg'
        elif 'wall street journal' in text_lower or 'wsj' in text_lower:
            metadata['source'] = 'wsj'
        elif 'cnbc' in text_lower:
            metadata['source'] = 'cnbc'
        elif 'barron' in text_lower:
            metadata['source'] = 'barrons'
        elif 'reuters' in text_lower:
            metadata['source'] = 'reuters'
        
        # Extract dates and times with timezone support
        datetime_patterns = [
            # "July 15, 2025 at 6:48 PM GMT+7"
            r'(\w+ \d{1,2}, \d{4}).*?at\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(GMT[+-]\d{1,2}|ET|EDT|EST|PT|PDT|PST|UTC|GMT)',
            # "Updated on July 15, 2025 at 8:44 PM GMT+7"  
            r'updated.*?(\w+ \d{1,2}, \d{4}).*?at\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(GMT[+-]\d{1,2}|ET|EDT|EST|PT|PDT|PST|UTC|GMT)',
            # Basic date patterns
            r'(?:published|posted).*?(\w+ \d{1,2}, \d{4})',
            r'(\w+ \d{1,2}, \d{4})',
            r'(\d{1,2}/\d{1,2}/\d{4})',
            r'(\d{4}-\d{2}-\d{2})'
        ]
        
        for pattern in datetime_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    groups = match.groups()
                    date_str = groups[0]
                    
                    # Parse date
                    if '/' in date_str:
                        dt = datetime.strptime(date_str, '%m/%d/%Y')
                    elif '-' in date_str:
                        dt = datetime.strptime(date_str, '%Y-%m-%d')
                    else:
                        dt = datetime.strptime(date_str, '%B %d, %Y')
                    
                    metadata['publication_date'] = dt.strftime('%Y-%m-%d')
                    
                    # Extract and convert time if present
                    if len(groups) >= 4 and groups[1] and groups[3]:
                        time_str = groups[1]  # "6:48"
                        ampm = groups[2] if groups[2] else ""  # "PM"
                        timezone_str = groups[3]  # "GMT+7"
                        
                        # Convert to 24-hour format
                        hour, minute = map(int, time_str.split(':'))
                        if ampm.upper() == 'PM' and hour != 12:
                            hour += 12
                        elif ampm.upper() == 'AM' and hour == 12:
                            hour = 0
                        
                        # Convert timezone to UTC
                        utc_hour = self.convert_timezone_to_utc(hour, timezone_str)
                        if utc_hour is not None:
                            # Handle day overflow/underflow
                            if utc_hour >= 24:
                                utc_hour -= 24
                            elif utc_hour < 0:
                                utc_hour += 24
                            
                            metadata['publication_time'] = f"{utc_hour:02d}:{minute:02d}"
                            self.logger.debug(f"🕒 Extracted time: {time_str} {ampm} {timezone_str} → {metadata['publication_time']} UTC")
                    
                    break
                except ValueError as e:
                    self.logger.debug(f"⚠️ Date parsing failed for pattern: {e}")
                    continue
        
        # Extract update times separately
        update_patterns = [
            r'updated.*?(?:on\s+)?(\w+ \d{1,2}, \d{4}).*?at\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(GMT[+-]\d{1,2}|ET|EDT|EST|PT|PDT|PST|UTC|GMT)',
            r'updated.*?at\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(GMT[+-]\d{1,2}|ET|EDT|EST|PT|PDT|PST|UTC|GMT)'
        ]
        
        for pattern in update_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                try:
                    groups = match.groups()
                    if len(groups) >= 3:  # At least time, AM/PM, timezone
                        if len(groups) >= 4 and groups[0]:  # Has date
                            update_date_str = groups[0]
                            time_str = groups[1]
                            ampm = groups[2] if groups[2] else ""
                            timezone_str = groups[3]
                        else:  # No date, use publication date
                            update_date_str = metadata.get('publication_date')
                            time_str = groups[0]
                            ampm = groups[1] if groups[1] else ""
                            timezone_str = groups[2]
                        
                        if update_date_str and time_str and timezone_str:
                            # Convert to UTC using the same logic as publication time
                            hour, minute = map(int, time_str.split(':'))
                            if ampm.upper() == 'PM' and hour != 12:
                                hour += 12
                            elif ampm.upper() == 'AM' and hour == 12:
                                hour = 0
                            
                            utc_hour = self.convert_timezone_to_utc(hour, timezone_str)
                            if utc_hour is not None:
                                # Handle day overflow/underflow
                                if utc_hour >= 24:
                                    utc_hour -= 24
                                elif utc_hour < 0:
                                    utc_hour += 24
                                
                                metadata['last_update_time'] = f"{utc_hour:02d}:{minute:02d}"
                                self.logger.debug(f"🕒 Extracted update time: {time_str} {ampm} {timezone_str} → {metadata['last_update_time']} UTC")
                            break
                except (ValueError, IndexError) as e:
                    self.logger.debug(f"⚠️ Update time parsing failed: {e}")
                    continue
        
        self.logger.debug(f"📋 Pattern extraction result: {metadata}")
        return metadata
    
    def convert_raw_times_to_utc(self, raw_metadata: dict) -> dict:
        """Convert AI-extracted raw times to UTC and calculate correct UTC date"""
        converted = raw_metadata.copy()
        
        # Convert publication time and calculate UTC date
        if (raw_metadata.get('publication_time_raw') and 
            raw_metadata.get('publication_timezone') and 
            raw_metadata.get('publication_date')):
            
            utc_datetime = self.convert_datetime_to_utc(
                raw_metadata['publication_date'],
                raw_metadata['publication_time_raw'], 
                raw_metadata['publication_timezone']
            )
            if utc_datetime:
                converted['publication_date'] = utc_datetime.strftime('%Y-%m-%d')
                converted['publication_time'] = utc_datetime.strftime('%H:%M')
                self.logger.debug(f"🕒 Converted publication: {raw_metadata['publication_date']} {raw_metadata['publication_time_raw']} {raw_metadata['publication_timezone']} → {converted['publication_date']} {converted['publication_time']} UTC")
        
        # Convert last update time and calculate UTC date if present
        if (raw_metadata.get('last_update_time_raw') and 
            raw_metadata.get('last_update_timezone')):
            
            # Use update date if provided, otherwise use publication date
            update_date = raw_metadata.get('last_update_date') or raw_metadata.get('publication_date')
            
            if update_date:
                utc_datetime = self.convert_datetime_to_utc(
                    update_date,
                    raw_metadata['last_update_time_raw'],
                    raw_metadata['last_update_timezone']
                )
                if utc_datetime:
                    converted['last_update_date'] = utc_datetime.strftime('%Y-%m-%d')
                    converted['last_update_time'] = utc_datetime.strftime('%H:%M')
                    self.logger.debug(f"🕒 Converted last update: {update_date} {raw_metadata['last_update_time_raw']} {raw_metadata['last_update_timezone']} → {converted['last_update_date']} {converted['last_update_time']} UTC")
        
        # Remove raw time fields and keep only converted ones
        for key in ['publication_time_raw', 'publication_timezone', 'last_update_time_raw', 'last_update_timezone']:
            converted.pop(key, None)
        
        return converted
    
    def convert_datetime_to_utc(self, date_str: str, time_str: str, timezone_str: str) -> Optional[datetime]:
        """Convert date and time with timezone to UTC datetime object"""
        try:
            # Parse the date
            if '/' in date_str:
                local_date = datetime.strptime(date_str, '%m/%d/%Y').date()
            elif '-' in date_str:
                local_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            else:
                local_date = datetime.strptime(date_str, '%B %d, %Y').date()
            
            # Parse the time
            time_str = time_str.strip()
            if 'AM' in time_str.upper() or 'PM' in time_str.upper():
                # 12-hour format
                time_part = time_str.upper().replace('AM', '').replace('PM', '').strip()
                is_pm = 'PM' in time_str.upper()
                
                hour, minute = map(int, time_part.split(':'))
                
                # Convert to 24-hour format
                if is_pm and hour != 12:
                    hour += 12
                elif not is_pm and hour == 12:
                    hour = 0
            else:
                # Assume 24-hour format
                if ':' in time_str:
                    hour, minute = map(int, time_str.split(':'))
                else:
                    hour = int(time_str)
                    minute = 0
            
            # Create local datetime
            local_datetime = datetime.combine(local_date, time_class(hour, minute))
            
            # Convert to UTC based on timezone
            timezone_str = timezone_str.upper()
            utc_offset_hours = 0
            
            if timezone_str.startswith('GMT+'):
                utc_offset_hours = -int(timezone_str[4:])  # GMT+7 means subtract 7 for UTC
            elif timezone_str.startswith('GMT-'):
                utc_offset_hours = int(timezone_str[4:])   # GMT-5 means add 5 for UTC
            elif timezone_str in ['EDT']:
                utc_offset_hours = 4   # EDT is UTC-4, so add 4
            elif timezone_str in ['EST']:
                utc_offset_hours = 5   # EST is UTC-5, so add 5
            elif timezone_str in ['ET']:
                utc_offset_hours = 4   # Assume EDT during summer
            elif timezone_str in ['PDT']:
                utc_offset_hours = 7   # PDT is UTC-7, so add 7
            elif timezone_str in ['PST']:
                utc_offset_hours = 8   # PST is UTC-8, so add 8
            elif timezone_str in ['PT']:
                utc_offset_hours = 7   # Assume PDT during summer
            elif timezone_str in ['UTC', 'GMT']:
                utc_offset_hours = 0   # Already UTC
            else:
                self.logger.debug(f"⚠️ Unknown timezone: {timezone_str}")
                return None
            
            # Apply timezone offset to get UTC datetime
            from datetime import timedelta
            utc_datetime = local_datetime + timedelta(hours=utc_offset_hours)
            
            self.logger.debug(f"🌍 Timezone conversion: {local_datetime} ({timezone_str}) → {utc_datetime} UTC")
            return utc_datetime
            
        except (ValueError, AttributeError) as e:
            self.logger.debug(f"⚠️ Failed to convert datetime {date_str} {time_str} {timezone_str}: {e}")
            return None
    
    def convert_time_to_utc(self, time_str: str, timezone_str: str) -> Optional[str]:
        """Convert time string with timezone to UTC 24-hour format"""
        try:
            # Parse the time string (e.g., "6:48 PM", "8:44 PM")
            time_str = time_str.strip()
            
            # Handle different time formats
            if 'AM' in time_str.upper() or 'PM' in time_str.upper():
                # 12-hour format
                time_part = time_str.upper().replace('AM', '').replace('PM', '').strip()
                is_pm = 'PM' in time_str.upper()
                
                hour, minute = map(int, time_part.split(':'))
                
                # Convert to 24-hour format
                if is_pm and hour != 12:
                    hour += 12
                elif not is_pm and hour == 12:
                    hour = 0
            else:
                # Assume 24-hour format or plain hour
                if ':' in time_str:
                    hour, minute = map(int, time_str.split(':'))
                else:
                    hour = int(time_str)
                    minute = 0
            
            # Convert timezone to UTC
            utc_hour = self.convert_timezone_to_utc(hour, timezone_str)
            if utc_hour is None:
                return None
            
            # Handle day overflow/underflow
            if utc_hour >= 24:
                utc_hour -= 24
            elif utc_hour < 0:
                utc_hour += 24
            
            return f"{utc_hour:02d}:{minute:02d}"
            
        except (ValueError, AttributeError) as e:
            self.logger.debug(f"⚠️ Failed to convert time {time_str} {timezone_str}: {e}")
            return None
    
    def convert_timezone_to_utc(self, hour: int, timezone_str: str) -> Optional[int]:
        """Convert hour from given timezone to UTC"""
        timezone_str = timezone_str.upper()
        
        if timezone_str.startswith('GMT+'):
            offset = int(timezone_str[4:])
            return hour - offset  # GMT+7 means subtract 7 for UTC
        elif timezone_str.startswith('GMT-'):
            offset = int(timezone_str[4:])
            return hour + offset  # GMT-5 means add 5 for UTC
        elif timezone_str in ['EDT']:
            return hour + 4  # EDT is UTC-4, so add 4
        elif timezone_str in ['EST']:
            return hour + 5  # EST is UTC-5, so add 5
        elif timezone_str in ['ET']:
            return hour + 4  # Assume EDT during summer
        elif timezone_str in ['PDT']:
            return hour + 7  # PDT is UTC-7, so add 7
        elif timezone_str in ['PST']:
            return hour + 8  # PST is UTC-8, so add 8
        elif timezone_str in ['PT']:
            return hour + 7  # Assume PDT during summer
        elif timezone_str in ['UTC', 'GMT']:
            return hour  # Already UTC
        else:
            self.logger.debug(f"⚠️ Unknown timezone: {timezone_str}")
            return None
    
    def convert_time_string_to_time_object(self, time_str: str) -> Optional[time_class]:
        """Convert time string (HH:MM) to datetime.time object"""
        try:
            if not time_str:
                return None
                
            # Parse HH:MM format
            hour, minute = map(int, time_str.split(':'))
            return time_class(hour, minute)
            
        except (ValueError, AttributeError) as e:
            self.logger.debug(f"⚠️ Failed to convert time string to time object: {time_str} - {e}")
            return None
    
    def validate_metadata(self, metadata: dict) -> bool:
        """Validate extracted metadata"""
        required_fields = ['publication_date', 'publication_time']
        
        # Source is optional but preferred
        if not metadata.get('source') or metadata.get('source') is None:
            metadata['source'] = 'unknown'
            self.logger.debug("⚠️ No source detected, using 'unknown'")
        
        for field in required_fields:
            if field not in metadata or not metadata[field]:
                self.logger.debug(f"❌ Missing required field: {field}")
                return False
        
        # Validate date format
        try:
            datetime.strptime(metadata['publication_date'], '%Y-%m-%d')
        except ValueError:
            self.logger.debug(f"❌ Invalid date format: {metadata['publication_date']}")
            return False
        
        # Validate time format (24-hour HH:MM)
        try:
            time_parts = metadata['publication_time'].split(':')
            if len(time_parts) != 2:
                raise ValueError("Invalid time format")
            hour, minute = int(time_parts[0]), int(time_parts[1])
            if not (0 <= hour <= 23) or not (0 <= minute <= 59):
                raise ValueError("Invalid time values")
        except (ValueError, AttributeError):
            self.logger.debug(f"❌ Invalid time format: {metadata['publication_time']}")
            return False
        
        # Validate optional last_update_time if present
        if metadata.get('last_update_time') and metadata['last_update_time'] is not None:
            try:
                time_parts = metadata['last_update_time'].split(':')
                if len(time_parts) != 2:
                    raise ValueError("Invalid update time format")
                hour, minute = int(time_parts[0]), int(time_parts[1])
                if not (0 <= hour <= 23) or not (0 <= minute <= 59):
                    raise ValueError("Invalid update time values")
            except (ValueError, AttributeError):
                self.logger.debug(f"❌ Invalid last_update_time format: {metadata['last_update_time']}")
                return False
        
        self.logger.debug("✅ Metadata validation passed")
        return True
    
    def fallback_metadata(self) -> Dict[str, Any]:
        """Fallback metadata when extraction fails"""
        now = datetime.now(timezone.utc)
        return {
            'publication_date': now.strftime('%Y-%m-%d'),
            'publication_time': now.strftime('%H:%M'),  # 24-hour format
            'last_update_date': None,
            'last_update_time': None,
            'source': 'unknown'
        }
    
    def upload_to_database(self, content: str, metadata: Dict[str, Any], filename: str) -> bool:
        """Upload to database with retry logic or mock if no connection"""
        
        # If no database connection, simulate upload and show data
        if not self.db_connection:
            self.logger.info("💾 MOCK DATABASE UPLOAD (No connection available)")
            
            # Prepare the database record that would be inserted
            now_utc = datetime.now(timezone.utc)
            title = filename.replace('.pdf', '').replace('_', ' ')
            if len(title) > 200:
                title = title[:197] + "..."
            
            mock_record = {
                'EntryDate': now_utc.date().strftime('%Y-%m-%d'),
                'EntryTime': now_utc.time().strftime('%H:%M:%S'),
                'Content_Length': len(content),
                'Content_Preview': content[:500] + "..." if len(content) > 500 else content,
                'DateOfData': metadata['publication_date'],
                'Sources': metadata['source'],
                'Formofcontents': 'WEB',
                'Title': title,
                'LastUpdateDate': metadata.get('last_update_date'),
                'LastUpdateTime': metadata.get('last_update_time'),
                'PublishTime': metadata['publication_time']
            }
            
            self.logger.info("📋 MOCK DATABASE RECORD:")
            for key, value in mock_record.items():
                if key == 'Content_Preview':
                    self.logger.info(f"   📝 {key}: {value}")
                else:
                    self.logger.info(f"   📊 {key}: {value}")
            
            self.logger.info("✅ Mock database upload completed (would succeed in real database)")
            return True
        
        # Real database upload logic
        max_retries = self.config['processing']['max_retries']
        retry_delay = self.config['processing']['retry_delay']
        
        for attempt in range(max_retries):
            try:
                cursor = self.db_connection.cursor()
                
                # Debug: Verify LastUpdateDate column exists
                cursor.execute("""
                    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'NewsReferences' AND COLUMN_NAME = 'LastUpdateDate'
                """)
                column_exists = cursor.fetchone()[0] > 0
                self.logger.debug(f"🔍 LastUpdateDate column exists: {column_exists}")
                
                # Insert query for NewsReferences table
                insert_query = """
                INSERT INTO NewsReferences (
                    EntryDate, EntryTime, Content, DateOfData, Sources,
                    Formofcontents, Title, LastUpdateDate, LastUpdateTime, PublishTime
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                
                # Prepare values
                now_utc = datetime.now(timezone.utc)
                title = filename.replace('.pdf', '').replace('_', ' ')
                if len(title) > 200:
                    title = title[:197] + "..."
                
                # Convert time strings to time objects for database
                publish_time_obj = self.convert_time_string_to_time_object(metadata['publication_time'])
                last_update_time_obj = None
                last_update_date = None
                if metadata.get('last_update_time'):
                    last_update_time_obj = self.convert_time_string_to_time_object(metadata['last_update_time'])
                    # Use last_update_date if available, otherwise use publication_date
                    last_update_date = metadata.get('last_update_date') or metadata['publication_date']
                
                values = (
                    now_utc.date(),
                    now_utc.time(),
                    content,
                    metadata['publication_date'],
                    metadata['source'],
                    'WEB',
                    title,
                    last_update_date,
                    last_update_time_obj,
                    publish_time_obj
                )
                
                # Debug: Log the values being inserted
                self.logger.debug(f"🔍 Inserting values: {values}")
                
                cursor.execute(insert_query, values)
                
                # Debug: Check if insert was successful before commit
                self.logger.debug(f"🔍 Rows affected: {cursor.rowcount}")
                
                self.db_connection.commit()
                self.logger.debug("🔍 Transaction committed")
                
                # Get record ID
                cursor.execute("SELECT @@IDENTITY")
                record_id = cursor.fetchone()[0]
                
                # Debug: Verify the record exists
                cursor.execute("SELECT COUNT(*) FROM NewsReferences WHERE ID = ?", (record_id,))
                count = cursor.fetchone()[0]
                self.logger.debug(f"🔍 Record verification: ID {record_id} exists: {count > 0}")
                
                self.logger.info(f"✅ Database upload successful: ID {record_id}")
                return True
                
            except Exception as e:
                self.logger.warning(f"Database upload attempt {attempt + 1} failed: {e}")
                if "connection" in str(e).lower():
                    self.db_connection = None
                
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                else:
                    self.logger.error(f"ERROR: Database upload failed: {filename}")
                    self.stats.errors['database_upload'] += 1
                    return False
    
    def backup_file(self, pdf_path: Path) -> bool:
        """Backup processed PDF"""
        try:
            backup_dir = Path(self.config['directories']['backup'])
            backup_dir.mkdir(exist_ok=True)
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_name = f"{timestamp}_{pdf_path.name}"
            backup_path = backup_dir / backup_name
            
            import shutil
            shutil.copy2(pdf_path, backup_path)
            return True
            
        except Exception as e:
            self.logger.warning(f"Backup failed: {e}")
            return False
    
    def process_single_pdf(self, pdf_path: Path) -> bool:
        """Process a single PDF file"""
        filename = pdf_path.name
        
        # Prevent concurrent processing
        with self.processing_lock:
            if filename in self.currently_processing:
                return False
            self.currently_processing.add(filename)
        
        try:
            self.logger.info(f"INFO: Processing: {filename}")
            self.stats.total_processed += 1
            
            # Step 1: Extract text
            text = self.extract_pdf_text(pdf_path)
            if not text:
                return False
            
            # Step 2: Clean content
            cleaned_content = self.clean_content_with_ai(text)
            if not cleaned_content or len(cleaned_content) < 50:
                self.logger.error(f"ERROR: Content cleaning failed: {filename}")
                self.stats.errors['content_cleaning'] += 1
                return False
            
            # Step 3: Extract metadata
            metadata = self.extract_metadata_from_content(cleaned_content)
            
            # Step 4: Upload to database
            if not self.upload_to_database(cleaned_content, metadata, filename):
                return False
            
            # Step 5: Backup and cleanup
            self.backup_file(pdf_path)
            pdf_path.unlink()
            
            self.logger.info(f"INFO: Successfully processed: {filename}")
            self.stats.successful += 1
            self.processed_files.add(filename)
            return True
            
        except Exception as e:
            self.logger.error(f"ERROR: Processing error {filename}: {e}")
            self.stats.failed += 1
            return False
            
        finally:
            with self.processing_lock:
                self.currently_processing.discard(filename)
    
    def scan_and_process(self):
        """Scan for PDFs and process them"""
        incoming_dir = Path(self.config['directories']['pdf_incoming'])
        
        if not incoming_dir.exists():
            incoming_dir.mkdir(parents=True, exist_ok=True)
            return
        
        pdf_files = list(incoming_dir.glob('*.pdf'))
        if not pdf_files:
            return
        
        self.logger.info(f"INFO: Found {len(pdf_files)} PDF files")
        
        batch_size = self.config['processing']['batch_size']
        for i in range(0, len(pdf_files), batch_size):
            batch = pdf_files[i:i+batch_size]
            
            for pdf_path in batch:
                if not self.running:
                    break
                
                if pdf_path.name in self.processed_files:
                    continue
                
                self.process_single_pdf(pdf_path)
                time.sleep(0.5)  # Small delay between files
    
    def print_statistics(self):
        """Print processing statistics"""
        print(f"\nProcessing Statistics:")
        print(f"   Total: {self.stats.total_processed}")
        print(f"   Successful: {self.stats.successful}")
        print(f"   Failed: {self.stats.failed}")
        if self.stats.total_processed > 0:
            success_rate = (self.stats.successful / self.stats.total_processed) * 100
            print(f"   Success Rate: {success_rate:.1f}%")
        
        if any(self.stats.errors.values()):
            print(f"\nErrors:")
            for error_type, count in self.stats.errors.items():
                if count > 0:
                    print(f"   {error_type.replace('_', ' ').title()}: {count}")
    
    def run(self):
        """Main processing loop"""
        self.running = True
        scan_interval = self.config['processing']['scan_interval']
        
        self.logger.info("INFO: Starting streamlined PDF processing")
        self.logger.info(f"INFO: Monitoring: {self.config['directories']['pdf_incoming']}")
        
        try:
            while self.running:
                self.scan_and_process()
                
                if self.stats.total_processed > 0 and self.stats.total_processed % 10 == 0:
                    self.print_statistics()
                
                time.sleep(scan_interval)
                
        except KeyboardInterrupt:
            self.logger.info("INFO: Shutdown requested")
        except Exception as e:
            self.logger.error(f"ERROR: Fatal error: {e}")
        finally:
            self.stop()
    
    def start_integrated_automation(self, web_port: int = 5000, extension_port: int = 8889, 
                                   telegram_bot_token: str = None, telegram_chat_id: str = None):
        """
        Start integrated automation system with web UI, extension communication, 
        automation service, AI analysis, and Telegram notifications
        """
        try:
            self.logger.info("🚀 Starting integrated automation system...")
            
            # Import components
            from web_ui import MainManagerWebUI
            from extension_manager import ExtensionManager
            from automation_service import AutomationService
            from gemini_analyzer import GeminiAnalyzer
            from telegram_notifier import TelegramNotifier, TelegramConfig
            from database_manager import EnhancedDatabaseManager
            from sequential_processor import SequentialProcessor
            
            # Initialize enhanced database manager
            self.database_manager = EnhancedDatabaseManager(self)
            self.logger.info("✅ Enhanced database manager initialized")
            
            # Initialize Gemini analyzer with bot detection
            self.enhanced_gemini_analyzer = GeminiAnalyzer(self)
            self.logger.info("✅ Enhanced Gemini analyzer initialized")
            
            # Initialize automation service
            self.automation_service = AutomationService(self)
            self.logger.info("✅ Automation service initialized")
            
            # Initialize extension manager
            self.extension_manager = ExtensionManager(self, port=extension_port)
            self.logger.info(f"✅ Extension manager initialized on port {extension_port}")
            
            # Initialize Telegram notifier if credentials provided
            if telegram_bot_token and telegram_chat_id:
                config = TelegramConfig(bot_token=telegram_bot_token, chat_id=telegram_chat_id)
                self.telegram_notifier = TelegramNotifier(config)
                self.logger.info("✅ Telegram notifier initialized")
            else:
                self.logger.warning("⚠️ Telegram credentials not provided - notifications disabled")
            
            # Initialize sequential processor
            self.sequential_processor = SequentialProcessor(self)
            self.sequential_processor.initialize_components(
                self.extension_manager,
                self.automation_service,
                self.enhanced_gemini_analyzer,
                self.telegram_notifier,
                self.database_manager
            )
            self.logger.info("✅ Sequential processor initialized")
            
            # Initialize web UI (starts Flask server)
            self.web_ui = MainManagerWebUI(self)
            
            # Set up component callbacks
            self._setup_automation_callbacks()
            
            # Start extension manager server in background
            self.extension_manager.start_server()
            
            # Start web UI server in background
            web_thread = threading.Thread(target=self._start_web_ui, args=(web_port,), daemon=True)
            web_thread.start()
            
            self.automation_enabled = True
            
            self.logger.info(f"🎉 Integrated automation system started successfully!")
            self.logger.info(f"🌐 Web UI: http://localhost:{web_port}")
            self.logger.info(f"🔌 Extension API: http://localhost:{extension_port}")
            
            return True
            
        except Exception as e:
            self.logger.error(f"ERROR: Failed to start integrated automation: {e}")
            return False
    
    def _start_web_ui(self, port: int):
        """Start web UI in background thread"""
        try:
            self.web_ui.run(host='0.0.0.0', port=port, debug=False)
        except Exception as e:
            self.logger.error(f"Web UI error: {e}")
    
    def _setup_automation_callbacks(self):
        """Set up callbacks between components"""
        if self.sequential_processor:
            # Set up processing callbacks
            self.sequential_processor.set_callbacks(
                on_item_completed=self._on_link_processed,
                on_batch_completed=self._on_batch_completed,
                on_error_occurred=self._on_automation_error,
                on_intervention_required=self._on_intervention_required
            )
        
        if self.automation_service:
            # Set up automation callbacks
            self.automation_service.set_callbacks(
                on_complete=self._on_automation_complete,
                on_error=self._on_automation_error
            )
    
    def _on_link_processed(self, item):
        """Callback when a link is processed"""
        self.logger.info(f"📄 Link processed: {item.url} - Status: {item.status.value}")
        
        # Update web UI via websocket if available
        if self.web_ui:
            self.web_ui.broadcast_processing_update({
                'type': 'link_completed',
                'url': item.url,
                'status': item.status.value,
                'duration': item.processing_duration
            })
    
    def _on_batch_completed(self, stats):
        """Callback when batch processing is completed"""
        self.logger.info(f"✅ Batch completed - {stats['successful_processed']}/{stats['total_processed']} successful")
        
        # Update web UI
        if self.web_ui:
            self.web_ui.broadcast_processing_update({
                'type': 'batch_completed',
                'stats': stats
            })
    
    def _on_automation_complete(self, url, result):
        """Callback when automation completes"""
        self.logger.debug(f"🤖 Automation completed for {url}: {result['success']}")
    
    def _on_automation_error(self, component, error):
        """Callback when automation error occurs"""
        self.logger.error(f"ERROR: Automation error in {component}: {error}")
        
        # Send error notification if telegram is available
        if self.telegram_notifier:
            self.telegram_notifier.send_error_notification(component, error)
    
    def _on_intervention_required(self, url, details):
        """Callback when manual intervention is required"""
        self.logger.warning(f"🚨 Manual intervention required for {url}: {details}")
        
        # Update web UI
        if self.web_ui:
            self.web_ui.broadcast_processing_update({
                'type': 'intervention_required',
                'url': url,
                'details': details
            })
    
    def add_links_for_automation(self, urls: list, source_site: str = "manual") -> bool:
        """Add links to automation processing queue"""
        if not self.automation_enabled:
            self.logger.error("ERROR: Automation system not started")
            return False
        
        if not self.sequential_processor:
            self.logger.error("ERROR: Sequential processor not available")
            return False
        
        try:
            count = self.sequential_processor.add_links_to_queue(urls, source_site)
            self.logger.info(f"📝 Added {count} links to automation queue")
            return True
        except Exception as e:
            self.logger.error(f"ERROR: Failed to add links: {e}")
            return False
    
    def start_automation_processing(self) -> bool:
        """Start processing automation queue"""
        if not self.automation_enabled:
            self.logger.error("ERROR: Automation system not started")
            return False
        
        if not self.sequential_processor:
            self.logger.error("ERROR: Sequential processor not available")
            return False
        
        return self.sequential_processor.start_processing()
    
    def get_automation_status(self) -> dict:
        """Get current automation system status"""
        if not self.automation_enabled:
            return {'enabled': False, 'message': 'Automation system not started'}
        
        status = {
            'enabled': True,
            'web_ui_active': self.web_ui is not None,
            'extension_manager_active': self.extension_manager is not None,
            'automation_service_available': self.automation_service is not None,
            'telegram_notifications': self.telegram_notifier is not None and self.telegram_notifier.is_available(),
            'processing_active': False,
            'queue_size': 0
        }
        
        if self.sequential_processor:
            proc_status = self.sequential_processor.get_processing_status()
            status['processing_active'] = proc_status['is_processing']
            status['queue_size'] = proc_status['queue_size']
            status['current_item'] = proc_status['current_item']
            status['statistics'] = proc_status['statistics']
        
        return status
    
    def stop_automation(self):
        """Stop automation system gracefully"""
        if not self.automation_enabled:
            return
        
        self.logger.info("🛑 Stopping automation system...")
        
        # Stop sequential processor
        if self.sequential_processor:
            self.sequential_processor.stop_processing()
        
        # Stop extension manager
        if self.extension_manager:
            self.extension_manager.stop_server()
        
        # Stop automation service
        if self.automation_service:
            self.automation_service.force_stop_automation()
        
        self.automation_enabled = False
        self.logger.info("✅ Automation system stopped")
    
    def stop(self):
        """Stop processing gracefully"""
        self.running = False
        
        # Stop automation system if running
        if self.automation_enabled:
            self.stop_automation()
        
        while self.currently_processing:
            self.logger.info(f"⏳ Waiting for {len(self.currently_processing)} files...")
            time.sleep(1)
        
        if self.db_connection:
            try:
                self.db_connection.close()
                self.logger.info("INFO: Database connection closed")
            except:
                pass
        
        self.print_statistics()
        self.logger.info("INFO: Streamlined MainManager stopped")

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Streamlined PDF Processing System')
    parser.add_argument('--config', help='Configuration file path')
    parser.add_argument('--scan-once', action='store_true',
                       help='Process all files once and exit')
    
    args = parser.parse_args()
    
    # Create manager
    manager = StreamlinedMainManager(args.config)
    
    if args.scan_once:
        print("Processing all PDF files once...")
        manager.running = True
        manager.scan_and_process()
        manager.stop()
    else:
        try:
            manager.run()
        except KeyboardInterrupt:
            print("\nStopping...")
            manager.stop()

if __name__ == "__main__":
    main()