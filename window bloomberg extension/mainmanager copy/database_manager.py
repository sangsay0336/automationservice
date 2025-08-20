#!/usr/bin/env python3
"""
Enhanced Database Manager with Automation Tracking
Extends MainManager database functionality with automation and processing tracking
"""

import json
import logging
import pyodbc
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
import threading

@dataclass
class AutomationRecord:
    """Automation tracking record"""
    url: str
    status: str = "pending"  # pending, processing, completed, failed, retry
    attempt_count: int = 0
    last_attempt_time: Optional[datetime] = None
    error_message: Optional[str] = None
    bot_detection_result: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

@dataclass
class ProcessingQueueItem:
    """Processing queue item"""
    url: str
    source_site: str
    priority: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    processed_at: Optional[datetime] = None
    status: str = "pending"

@dataclass
class BotDetectionRecord:
    """Bot detection result record"""
    url: str
    detection_type: str
    confidence_score: float
    analysis_details: str
    detected_at: datetime = field(default_factory=datetime.now)

class EnhancedDatabaseManager:
    """Enhanced database manager with automation tracking"""
    
    def __init__(self, mainmanager_instance):
        self.mainmanager = mainmanager_instance
        self.logger = logging.getLogger(__name__)
        
        # Use existing database connection from mainmanager
        self.connection = mainmanager_instance.db_connection
        
        # Thread safety
        self.db_lock = threading.Lock()
        
        # Statistics
        self.operation_stats = {
            'total_queries': 0,
            'successful_queries': 0,
            'failed_queries': 0,
            'average_query_time': 0.0
        }
        
        # Initialize enhanced tables
        self.create_enhanced_tables()
        
        self.logger.info("🗄️ Enhanced Database Manager initialized")
    
    def create_enhanced_tables(self):
        """Create enhanced tables for automation tracking"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                # Create automation tracking table
                automation_table_sql = """
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='automation_tracking' AND xtype='U')
                CREATE TABLE automation_tracking (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    url NVARCHAR(2000) NOT NULL,
                    status NVARCHAR(50) NOT NULL DEFAULT 'pending',
                    attempt_count INT DEFAULT 0,
                    last_attempt_time DATETIME2 NULL,
                    error_message NVARCHAR(MAX) NULL,
                    bot_detection_result NVARCHAR(MAX) NULL,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    updated_at DATETIME2 DEFAULT GETDATE(),
                    INDEX IX_automation_tracking_url (url),
                    INDEX IX_automation_tracking_status (status),
                    INDEX IX_automation_tracking_created_at (created_at)
                )
                """
                
                # Create processing queue table
                queue_table_sql = """
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='link_processing_queue' AND xtype='U')
                CREATE TABLE link_processing_queue (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    url NVARCHAR(2000) NOT NULL,
                    source_site NVARCHAR(100) NULL,
                    priority INT DEFAULT 0,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    processed_at DATETIME2 NULL,
                    status NVARCHAR(50) DEFAULT 'pending',
                    INDEX IX_queue_status (status),
                    INDEX IX_queue_priority (priority),
                    INDEX IX_queue_created_at (created_at)
                )
                """
                
                # Create bot detection results table
                bot_detection_sql = """
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='bot_detection_results' AND xtype='U')
                CREATE TABLE bot_detection_results (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    url NVARCHAR(2000) NOT NULL,
                    detection_type NVARCHAR(100) NULL,
                    confidence_score FLOAT NULL,
                    analysis_details NVARCHAR(MAX) NULL,
                    detected_at DATETIME2 DEFAULT GETDATE(),
                    INDEX IX_bot_detection_url (url),
                    INDEX IX_bot_detection_type (detection_type),
                    INDEX IX_bot_detection_date (detected_at)
                )
                """
                
                # Create processing statistics table
                stats_table_sql = """
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='processing_statistics' AND xtype='U')
                CREATE TABLE processing_statistics (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    date_processed DATE NOT NULL,
                    total_processed INT DEFAULT 0,
                    successful_processed INT DEFAULT 0,
                    failed_processed INT DEFAULT 0,
                    bot_detections INT DEFAULT 0,
                    average_processing_time FLOAT DEFAULT 0.0,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    updated_at DATETIME2 DEFAULT GETDATE(),
                    INDEX IX_stats_date (date_processed)
                )
                """
                
                # Create retry history table
                retry_history_sql = """
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='retry_history' AND xtype='U')
                CREATE TABLE retry_history (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    url NVARCHAR(2000) NOT NULL,
                    attempt_number INT NOT NULL,
                    retry_reason NVARCHAR(MAX) NULL,
                    retry_result NVARCHAR(50) NULL,
                    wait_time_used FLOAT NULL,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    INDEX IX_retry_url (url),
                    INDEX IX_retry_attempt (attempt_number)
                )
                """
                
                # Execute table creation
                cursor.execute(automation_table_sql)
                cursor.execute(queue_table_sql)
                cursor.execute(bot_detection_sql)
                cursor.execute(stats_table_sql)
                cursor.execute(retry_history_sql)
                
                self.connection.commit()
                
                self.logger.info("✅ Enhanced database tables created successfully")
                
        except Exception as e:
            self.logger.error(f"❌ Error creating enhanced tables: {e}")
            if self.connection:
                self.connection.rollback()
    
    def add_automation_record(self, url: str, status: str = "pending") -> int:
        """Add new automation record"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                INSERT INTO automation_tracking (url, status, attempt_count, created_at, updated_at)
                VALUES (?, ?, 0, GETDATE(), GETDATE())
                """
                
                cursor.execute(sql, (url, status))
                self.connection.commit()
                
                # Get the inserted ID
                cursor.execute("SELECT @@IDENTITY")
                record_id = cursor.fetchone()[0]
                
                self.operation_stats['successful_queries'] += 1
                self.logger.debug(f"✅ Added automation record for: {url}")
                
                return record_id
                
        except Exception as e:
            self.logger.error(f"❌ Error adding automation record: {e}")
            self.operation_stats['failed_queries'] += 1
            if self.connection:
                self.connection.rollback()
            return 0
        finally:
            self.operation_stats['total_queries'] += 1
    
    def update_automation_status(self, url: str, status: str, error_message: str = None, 
                                bot_detection_result: str = None) -> bool:
        """Update automation record status"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                UPDATE automation_tracking 
                SET status = ?, 
                    last_attempt_time = GETDATE(),
                    updated_at = GETDATE(),
                    error_message = ?,
                    bot_detection_result = ?
                WHERE url = ?
                """
                
                cursor.execute(sql, (status, error_message, bot_detection_result, url))
                self.connection.commit()
                
                self.operation_stats['successful_queries'] += 1
                self.logger.debug(f"✅ Updated automation status for {url}: {status}")
                
                return True
                
        except Exception as e:
            self.logger.error(f"❌ Error updating automation status: {e}")
            self.operation_stats['failed_queries'] += 1
            if self.connection:
                self.connection.rollback()
            return False
        finally:
            self.operation_stats['total_queries'] += 1
    
    def increment_attempt_count(self, url: str) -> int:
        """Increment attempt count for automation record"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                UPDATE automation_tracking 
                SET attempt_count = attempt_count + 1,
                    last_attempt_time = GETDATE(),
                    updated_at = GETDATE()
                WHERE url = ?
                """
                
                cursor.execute(sql, (url,))
                self.connection.commit()
                
                # Get updated attempt count
                cursor.execute("SELECT attempt_count FROM automation_tracking WHERE url = ?", (url,))
                result = cursor.fetchone()
                attempt_count = result[0] if result else 0
                
                self.operation_stats['successful_queries'] += 1
                self.logger.debug(f"✅ Incremented attempt count for {url}: {attempt_count}")
                
                return attempt_count
                
        except Exception as e:
            self.logger.error(f"❌ Error incrementing attempt count: {e}")
            self.operation_stats['failed_queries'] += 1
            if self.connection:
                self.connection.rollback()
            return 0
        finally:
            self.operation_stats['total_queries'] += 1
    
    def get_automation_record(self, url: str) -> Optional[Dict]:
        """Get automation record by URL"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                SELECT url, status, attempt_count, last_attempt_time, 
                       error_message, bot_detection_result, created_at, updated_at
                FROM automation_tracking 
                WHERE url = ?
                """
                
                cursor.execute(sql, (url,))
                result = cursor.fetchone()
                
                if result:
                    return {
                        'url': result[0],
                        'status': result[1],
                        'attempt_count': result[2],
                        'last_attempt_time': result[3],
                        'error_message': result[4],
                        'bot_detection_result': result[5],
                        'created_at': result[6],
                        'updated_at': result[7]
                    }
                
                return None
                
        except Exception as e:
            self.logger.error(f"❌ Error getting automation record: {e}")
            return None
        finally:
            self.operation_stats['total_queries'] += 1
    
    def get_automation_records_by_status(self, status: str) -> List[Dict]:
        """Get automation records by status"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                SELECT url, status, attempt_count, last_attempt_time, 
                       error_message, bot_detection_result, created_at, updated_at
                FROM automation_tracking 
                WHERE status = ?
                ORDER BY created_at
                """
                
                cursor.execute(sql, (status,))
                results = cursor.fetchall()
                
                records = []
                for result in results:
                    records.append({
                        'url': result[0],
                        'status': result[1],
                        'attempt_count': result[2],
                        'last_attempt_time': result[3],
                        'error_message': result[4],
                        'bot_detection_result': result[5],
                        'created_at': result[6],
                        'updated_at': result[7]
                    })
                
                return records
                
        except Exception as e:
            self.logger.error(f"❌ Error getting automation records by status: {e}")
            return []
        finally:
            self.operation_stats['total_queries'] += 1
    
    def add_to_processing_queue(self, url: str, source_site: str = None, priority: int = 0) -> int:
        """Add URL to processing queue"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                INSERT INTO link_processing_queue (url, source_site, priority, created_at, status)
                VALUES (?, ?, ?, GETDATE(), 'pending')
                """
                
                cursor.execute(sql, (url, source_site, priority))
                self.connection.commit()
                
                # Get the inserted ID
                cursor.execute("SELECT @@IDENTITY")
                queue_id = cursor.fetchone()[0]
                
                self.operation_stats['successful_queries'] += 1
                self.logger.debug(f"✅ Added to processing queue: {url}")
                
                return queue_id
                
        except Exception as e:
            self.logger.error(f"❌ Error adding to processing queue: {e}")
            self.operation_stats['failed_queries'] += 1
            if self.connection:
                self.connection.rollback()
            return 0
        finally:
            self.operation_stats['total_queries'] += 1
    
    def get_processing_queue(self, limit: int = 100) -> List[Dict]:
        """Get items from processing queue"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                SELECT TOP (?) url, source_site, priority, created_at, status
                FROM link_processing_queue
                WHERE status = 'pending'
                ORDER BY priority DESC, created_at ASC
                """
                
                cursor.execute(sql, (limit,))
                results = cursor.fetchall()
                
                queue_items = []
                for result in results:
                    queue_items.append({
                        'url': result[0],
                        'source_site': result[1],
                        'priority': result[2],
                        'created_at': result[3],
                        'status': result[4]
                    })
                
                return queue_items
                
        except Exception as e:
            self.logger.error(f"❌ Error getting processing queue: {e}")
            return []
        finally:
            self.operation_stats['total_queries'] += 1
    
    def update_queue_item_status(self, url: str, status: str) -> bool:
        """Update processing queue item status"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                processed_at = "GETDATE()" if status == "completed" else "NULL"
                
                sql = f"""
                UPDATE link_processing_queue 
                SET status = ?, processed_at = {processed_at}
                WHERE url = ?
                """
                
                cursor.execute(sql, (status, url))
                self.connection.commit()
                
                self.operation_stats['successful_queries'] += 1
                self.logger.debug(f"✅ Updated queue item status for {url}: {status}")
                
                return True
                
        except Exception as e:
            self.logger.error(f"❌ Error updating queue item status: {e}")
            self.operation_stats['failed_queries'] += 1
            if self.connection:
                self.connection.rollback()
            return False
        finally:
            self.operation_stats['total_queries'] += 1
    
    def add_bot_detection_result(self, url: str, detection_type: str, 
                               confidence_score: float, analysis_details: str) -> int:
        """Add bot detection result"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                INSERT INTO bot_detection_results (url, detection_type, confidence_score, analysis_details, detected_at)
                VALUES (?, ?, ?, ?, GETDATE())
                """
                
                cursor.execute(sql, (url, detection_type, confidence_score, analysis_details))
                self.connection.commit()
                
                # Get the inserted ID
                cursor.execute("SELECT @@IDENTITY")
                result_id = cursor.fetchone()[0]
                
                self.operation_stats['successful_queries'] += 1
                self.logger.debug(f"✅ Added bot detection result for: {url}")
                
                return result_id
                
        except Exception as e:
            self.logger.error(f"❌ Error adding bot detection result: {e}")
            self.operation_stats['failed_queries'] += 1
            if self.connection:
                self.connection.rollback()
            return 0
        finally:
            self.operation_stats['total_queries'] += 1
    
    def get_bot_detection_results(self, url: str = None, limit: int = 100) -> List[Dict]:
        """Get bot detection results"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                if url:
                    sql = """
                    SELECT url, detection_type, confidence_score, analysis_details, detected_at
                    FROM bot_detection_results
                    WHERE url = ?
                    ORDER BY detected_at DESC
                    """
                    cursor.execute(sql, (url,))
                else:
                    sql = """
                    SELECT TOP (?) url, detection_type, confidence_score, analysis_details, detected_at
                    FROM bot_detection_results
                    ORDER BY detected_at DESC
                    """
                    cursor.execute(sql, (limit,))
                
                results = cursor.fetchall()
                
                detection_results = []
                for result in results:
                    detection_results.append({
                        'url': result[0],
                        'detection_type': result[1],
                        'confidence_score': result[2],
                        'analysis_details': result[3],
                        'detected_at': result[4]
                    })
                
                return detection_results
                
        except Exception as e:
            self.logger.error(f"❌ Error getting bot detection results: {e}")
            return []
        finally:
            self.operation_stats['total_queries'] += 1
    
    def add_retry_history(self, url: str, attempt_number: int, retry_reason: str, 
                         retry_result: str, wait_time_used: float) -> int:
        """Add retry history record"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                INSERT INTO retry_history (url, attempt_number, retry_reason, retry_result, wait_time_used, created_at)
                VALUES (?, ?, ?, ?, ?, GETDATE())
                """
                
                cursor.execute(sql, (url, attempt_number, retry_reason, retry_result, wait_time_used))
                self.connection.commit()
                
                # Get the inserted ID
                cursor.execute("SELECT @@IDENTITY")
                history_id = cursor.fetchone()[0]
                
                self.operation_stats['successful_queries'] += 1
                self.logger.debug(f"✅ Added retry history for: {url}")
                
                return history_id
                
        except Exception as e:
            self.logger.error(f"❌ Error adding retry history: {e}")
            self.operation_stats['failed_queries'] += 1
            if self.connection:
                self.connection.rollback()
            return 0
        finally:
            self.operation_stats['total_queries'] += 1
    
    def get_retry_history(self, url: str = None, limit: int = 100) -> List[Dict]:
        """Get retry history"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                if url:
                    sql = """
                    SELECT url, attempt_number, retry_reason, retry_result, wait_time_used, created_at
                    FROM retry_history
                    WHERE url = ?
                    ORDER BY created_at DESC
                    """
                    cursor.execute(sql, (url,))
                else:
                    sql = """
                    SELECT TOP (?) url, attempt_number, retry_reason, retry_result, wait_time_used, created_at
                    FROM retry_history
                    ORDER BY created_at DESC
                    """
                    cursor.execute(sql, (limit,))
                
                results = cursor.fetchall()
                
                history_records = []
                for result in results:
                    history_records.append({
                        'url': result[0],
                        'attempt_number': result[1],
                        'retry_reason': result[2],
                        'retry_result': result[3],
                        'wait_time_used': result[4],
                        'created_at': result[5]
                    })
                
                return history_records
                
        except Exception as e:
            self.logger.error(f"❌ Error getting retry history: {e}")
            return []
        finally:
            self.operation_stats['total_queries'] += 1
    
    def update_daily_statistics(self, total_processed: int, successful_processed: int, 
                              failed_processed: int, bot_detections: int, 
                              average_processing_time: float):
        """Update daily processing statistics"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                today = datetime.now().date()
                
                # Check if record exists for today
                cursor.execute("SELECT id FROM processing_statistics WHERE date_processed = ?", (today,))
                exists = cursor.fetchone()
                
                if exists:
                    # Update existing record
                    sql = """
                    UPDATE processing_statistics 
                    SET total_processed = ?, successful_processed = ?, failed_processed = ?,
                        bot_detections = ?, average_processing_time = ?, updated_at = GETDATE()
                    WHERE date_processed = ?
                    """
                    cursor.execute(sql, (total_processed, successful_processed, failed_processed,
                                       bot_detections, average_processing_time, today))
                else:
                    # Insert new record
                    sql = """
                    INSERT INTO processing_statistics (date_processed, total_processed, successful_processed, 
                                                     failed_processed, bot_detections, average_processing_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """
                    cursor.execute(sql, (today, total_processed, successful_processed, failed_processed,
                                       bot_detections, average_processing_time))
                
                self.connection.commit()
                self.operation_stats['successful_queries'] += 1
                self.logger.debug(f"✅ Updated daily statistics for {today}")
                
        except Exception as e:
            self.logger.error(f"❌ Error updating daily statistics: {e}")
            self.operation_stats['failed_queries'] += 1
            if self.connection:
                self.connection.rollback()
        finally:
            self.operation_stats['total_queries'] += 1
    
    def get_processing_statistics(self, days: int = 30) -> List[Dict]:
        """Get processing statistics for the last N days"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                sql = """
                SELECT TOP (?) date_processed, total_processed, successful_processed, 
                       failed_processed, bot_detections, average_processing_time, updated_at
                FROM processing_statistics
                WHERE date_processed >= DATEADD(day, -?, GETDATE())
                ORDER BY date_processed DESC
                """
                
                cursor.execute(sql, (days, days))
                results = cursor.fetchall()
                
                statistics = []
                for result in results:
                    statistics.append({
                        'date_processed': result[0],
                        'total_processed': result[1],
                        'successful_processed': result[2],
                        'failed_processed': result[3],
                        'bot_detections': result[4],
                        'average_processing_time': result[5],
                        'updated_at': result[6]
                    })
                
                return statistics
                
        except Exception as e:
            self.logger.error(f"❌ Error getting processing statistics: {e}")
            return []
        finally:
            self.operation_stats['total_queries'] += 1
    
    def cleanup_old_records(self, days_to_keep: int = 90):
        """Clean up old records"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                
                # Clean up old automation records
                cursor.execute("DELETE FROM automation_tracking WHERE created_at < DATEADD(day, -?, GETDATE())", (days_to_keep,))
                automation_deleted = cursor.rowcount
                
                # Clean up old bot detection results
                cursor.execute("DELETE FROM bot_detection_results WHERE detected_at < DATEADD(day, -?, GETDATE())", (days_to_keep,))
                bot_deleted = cursor.rowcount
                
                # Clean up old retry history
                cursor.execute("DELETE FROM retry_history WHERE created_at < DATEADD(day, -?, GETDATE())", (days_to_keep,))
                retry_deleted = cursor.rowcount
                
                # Clean up old queue items
                cursor.execute("DELETE FROM link_processing_queue WHERE created_at < DATEADD(day, -?, GETDATE()) AND status != 'pending'", (days_to_keep,))
                queue_deleted = cursor.rowcount
                
                self.connection.commit()
                
                self.logger.info(f"🗑️ Cleaned up old records: {automation_deleted + bot_deleted + retry_deleted + queue_deleted} total")
                
        except Exception as e:
            self.logger.error(f"❌ Error cleaning up old records: {e}")
            if self.connection:
                self.connection.rollback()
    
    def get_operation_stats(self) -> Dict[str, Any]:
        """Get database operation statistics"""
        if self.operation_stats['total_queries'] > 0:
            success_rate = (self.operation_stats['successful_queries'] / self.operation_stats['total_queries']) * 100
        else:
            success_rate = 0.0
        
        return {
            'total_queries': self.operation_stats['total_queries'],
            'successful_queries': self.operation_stats['successful_queries'],
            'failed_queries': self.operation_stats['failed_queries'],
            'success_rate': round(success_rate, 2),
            'average_query_time': round(self.operation_stats['average_query_time'], 3)
        }
    
    def reset_operation_stats(self):
        """Reset operation statistics"""
        self.operation_stats = {
            'total_queries': 0,
            'successful_queries': 0,
            'failed_queries': 0,
            'average_query_time': 0.0
        }
        self.logger.info("📊 Database operation statistics reset")
    
    def test_database_connection(self) -> bool:
        """Test database connection"""
        try:
            with self.db_lock:
                cursor = self.connection.cursor()
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                return result is not None
                
        except Exception as e:
            self.logger.error(f"❌ Database connection test failed: {e}")
            return False
    
    def shutdown(self):
        """Shutdown database manager"""
        self.logger.info("🗄️ Enhanced Database Manager shutdown")