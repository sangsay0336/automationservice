# Streamlined MainManager

Single-file PDF processing system that delivers the same results with maximum efficiency.

## Features

✅ **All-in-One**: PDF extraction, AI cleaning, metadata extraction, database upload  
✅ **Robust Error Handling**: Self-recovery with retry logic  
✅ **AI-Powered**: Gemini 2.5 Flash for content cleaning and metadata extraction  
✅ **Thread-Safe**: Concurrent processing prevention  
✅ **Comprehensive Logging**: Rotating logs with statistics  

## Quick Start

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set Gemini API Key**:
   ```bash
   export GEMINI_API_KEY="your_api_key_here"
   ```

3. **Run**:
   ```bash
   python mainmanager.py
   ```

## Configuration

Edit `config.json`:

```json
{
    "directories": {
        "pdf_incoming": "/path/to/incoming/pdfs",
        "backup": "/path/to/backup"
    },
    "processing": {
        "scan_interval": 10,
        "batch_size": 5
    }
}
```

## Usage Options

- **Continuous monitoring**: `python mainmanager.py`
- **Process once and exit**: `python mainmanager.py --scan-once`
- **Custom config**: `python mainmanager.py --config /path/to/config.json`

## Workflow

1. **Monitor** `/Users/sangsay/Desktop/INCOMING_PDFS` for new PDFs
2. **Extract** text using PyPDF2/pdfplumber
3. **Clean** content with AI (Gemini) or fallback methods
4. **Extract** metadata from first 100 words using AI
5. **Upload** to NewsReferences database table
6. **Backup** original PDF and delete from incoming

## Database Schema

Uploads to `NewsReferences` table:
- `EntryDate`, `EntryTime` - Processing timestamp
- `Content` - Cleaned article content
- `DateOfData` - Publication date from metadata
- `Sources` - Source publication (bloomberg, wsj, etc.)
- `PublishTime` - Publication time from metadata
- `LastUpdateTime` - Update time (if available)
- `Title` - Derived from filename
- `Formofcontents` - Always 'WEB'

## Error Handling

- **PDF Extraction**: Multiple fallback methods
- **Content Cleaning**: AI → Basic text cleaning
- **Metadata Extraction**: AI → Pattern matching → Current timestamp
- **Database Upload**: Retry with exponential backoff
- **Connection Issues**: Automatic reconnection

## Statistics

Real-time processing statistics including:
- Total processed, successful, failed
- Success rate percentage
- Error breakdown by category

## Logs

- **Location**: `logs/mainmanager.log`
- **Rotation**: 10MB max, 5 backups
- **Level**: INFO with detailed error logging