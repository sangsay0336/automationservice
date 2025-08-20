#!/usr/bin/env python3
"""
Enhanced Gemini Analyzer with Bot Detection
Provides AI-powered content analysis and bot detection capabilities
"""

import json
import logging
import time
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass
import re

try:
    import google.generativeai as genai
    HAS_GEMINI = True
except ImportError:
    print("⚠️ Google GenerativeAI not installed. Install with: pip install google-generativeai")
    HAS_GEMINI = False

@dataclass
class BotDetectionResult:
    """Result of bot detection analysis"""
    is_bot_detected: bool
    detection_type: str  # 'captcha', 'firewall', 'bot_challenge', 'access_denied', 'none'
    confidence_score: float  # 0.0 to 1.0
    indicators: List[str]
    analysis_details: str
    recommended_action: str

@dataclass
class ContentAnalysisResult:
    """Result of content analysis"""
    is_valid_content: bool
    content_type: str  # 'article', 'error_page', 'loading_page', 'paywall', 'unknown'
    content_length: int
    cleaned_content: str
    metadata: Dict[str, Any]
    bot_detection: BotDetectionResult

class GeminiAnalyzer:
    """Enhanced Gemini analyzer with bot detection capabilities"""
    
    def __init__(self, mainmanager_instance):
        self.mainmanager = mainmanager_instance
        self.logger = logging.getLogger(__name__)
        
        # Gemini configuration
        self.model = None
        self.is_initialized = False
        
        # Bot detection patterns
        self.bot_detection_patterns = self._initialize_bot_detection_patterns()
        
        # Analysis cache
        self.analysis_cache = {}
        self.cache_max_size = 100
        
        if HAS_GEMINI:
            self._initialize_gemini()
    
    def _initialize_gemini(self):
        """Initialize Gemini model"""
        try:
            # Get API key from environment or mainmanager config
            api_key = self.mainmanager.config.get('gemini_api_key') or \
                     self.mainmanager.config.get('GEMINI_API_KEY')
            
            if not api_key:
                self.logger.warning("Gemini API key not found in configuration")
                return
            
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
            self.is_initialized = True
            self.logger.info("✅ Gemini analyzer initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize Gemini: {e}")
            self.is_initialized = False
    
    def _initialize_bot_detection_patterns(self) -> Dict[str, List[str]]:
        """Initialize bot detection patterns"""
        return {
            'captcha': [
                r'captcha',
                r'recaptcha',
                r'hcaptcha',
                r'verify you\'?re human',
                r'prove you\'?re not a robot',
                r'security check required',
                r'please verify',
                r'i\'?m not a robot',
                r'click.*verify',
                r'solve.*puzzle'
            ],
            'firewall': [
                r'cloudflare',
                r'ddos protection',
                r'security service',
                r'checking your browser',
                r'just a moment',
                r'please wait.*checking',
                r'firewall.*blocked',
                r'security check.*progress',
                r'ray id:',
                r'performance.*security.*cloudflare'
            ],
            'bot_challenge': [
                r'unusual traffic',
                r'automated requests',
                r'bot.*detected',
                r'suspicious activity',
                r'rate limit.*exceeded',
                r'too many requests',
                r'access temporarily restricted',
                r'please slow down',
                r'retry after',
                r'temporarily blocked'
            ],
            'access_denied': [
                r'access denied',
                r'permission denied',
                r'unauthorized access',
                r'forbidden',
                r'you don\'?t have permission',
                r'access restricted',
                r'login required',
                r'subscription required',
                r'premium content',
                r'paywall'
            ],
            'maintenance': [
                r'under maintenance',
                r'temporarily unavailable',
                r'service unavailable',
                r'down for maintenance',
                r'scheduled maintenance',
                r'please try again later',
                r'system maintenance'
            ]
        }
    
    def analyze_content_with_bot_detection(self, content: str, url: str) -> ContentAnalysisResult:
        """Analyze content with bot detection"""
        start_time = time.time()
        
        try:
            # Check cache first
            cache_key = f"{url}_{hash(content[:1000])}"
            if cache_key in self.analysis_cache:
                self.logger.debug(f"Using cached analysis for {url}")
                return self.analysis_cache[cache_key]
            
            # Perform bot detection
            bot_detection = self._analyze_bot_detection(content, url)
            
            # Analyze content type and validity
            content_type = self._determine_content_type(content, bot_detection)
            is_valid_content = content_type == 'article' and not bot_detection.is_bot_detected
            
            # Clean content if it's valid
            cleaned_content = ""
            metadata = {}
            
            if is_valid_content and self.is_initialized:
                cleaned_content = self._clean_content_with_ai(content)
                metadata = self._extract_metadata_with_ai(content)
            elif is_valid_content:
                cleaned_content = self._clean_content_basic(content)
                metadata = self._extract_metadata_basic(content)
            
            # Create result
            result = ContentAnalysisResult(
                is_valid_content=is_valid_content,
                content_type=content_type,
                content_length=len(content),
                cleaned_content=cleaned_content,
                metadata=metadata,
                bot_detection=bot_detection
            )
            
            # Cache result
            self._cache_result(cache_key, result)
            
            analysis_time = time.time() - start_time
            self.logger.info(f"Content analysis completed in {analysis_time:.2f}s - Type: {content_type}, Bot: {bot_detection.is_bot_detected}")
            
            return result
            
        except Exception as e:
            self.logger.error(f"Content analysis failed: {e}")
            return ContentAnalysisResult(
                is_valid_content=False,
                content_type='error',
                content_length=len(content),
                cleaned_content="",
                metadata={},
                bot_detection=BotDetectionResult(
                    is_bot_detected=False,
                    detection_type='none',
                    confidence_score=0.0,
                    indicators=[],
                    analysis_details=f"Analysis failed: {str(e)}",
                    recommended_action='retry'
                )
            )
    
    def _analyze_bot_detection(self, content: str, url: str) -> BotDetectionResult:
        """Analyze content for bot detection indicators"""
        try:
            # Normalize content for analysis
            normalized_content = content.lower()
            
            # Check for bot detection patterns
            detected_patterns = []
            detection_scores = {}
            
            for detection_type, patterns in self.bot_detection_patterns.items():
                matches = []
                for pattern in patterns:
                    if re.search(pattern, normalized_content, re.IGNORECASE):
                        matches.append(pattern)
                
                if matches:
                    detected_patterns.extend(matches)
                    detection_scores[detection_type] = len(matches) / len(patterns)
            
            # Use AI for advanced detection if available
            if self.is_initialized and detected_patterns:
                ai_analysis = self._ai_bot_detection_analysis(content, url, detected_patterns)
                if ai_analysis:
                    return ai_analysis
            
            # Determine primary detection type
            if detection_scores:
                primary_type = max(detection_scores, key=detection_scores.get)
                confidence = min(detection_scores[primary_type] * 0.8, 0.95)  # Cap at 95%
                
                return BotDetectionResult(
                    is_bot_detected=True,
                    detection_type=primary_type,
                    confidence_score=confidence,
                    indicators=detected_patterns,
                    analysis_details=f"Pattern-based detection found {len(detected_patterns)} indicators",
                    recommended_action=self._get_recommended_action(primary_type)
                )
            
            # No bot detection found
            return BotDetectionResult(
                is_bot_detected=False,
                detection_type='none',
                confidence_score=0.0,
                indicators=[],
                analysis_details="No bot detection indicators found",
                recommended_action='continue'
            )
            
        except Exception as e:
            self.logger.error(f"Bot detection analysis failed: {e}")
            return BotDetectionResult(
                is_bot_detected=False,
                detection_type='none',
                confidence_score=0.0,
                indicators=[],
                analysis_details=f"Analysis failed: {str(e)}",
                recommended_action='retry'
            )
    
    def _ai_bot_detection_analysis(self, content: str, url: str, detected_patterns: List[str]) -> Optional[BotDetectionResult]:
        """Use AI for advanced bot detection analysis"""
        try:
            # Prepare content sample for AI analysis
            content_sample = content[:3000]  # First 3000 characters
            
            prompt = f"""
            Analyze this webpage content for bot detection, security challenges, or access restrictions:
            
            URL: {url}
            Content: {content_sample}
            
            Detected patterns: {', '.join(detected_patterns)}
            
            Please analyze if this page contains:
            1. CAPTCHA challenges (reCAPTCHA, hCaptcha, etc.)
            2. Firewall protection (Cloudflare, DDoS protection)
            3. Bot detection challenges
            4. Access restrictions (login required, paywall)
            5. Maintenance or error pages
            
            Respond with JSON format:
            {{
                "is_bot_detected": boolean,
                "detection_type": "captcha|firewall|bot_challenge|access_denied|maintenance|none",
                "confidence_score": float (0.0 to 1.0),
                "indicators": ["list", "of", "specific", "indicators"],
                "analysis_details": "detailed explanation",
                "recommended_action": "retry|wait|manual_intervention|continue"
            }}
            """
            
            response = self.model.generate_content(prompt)
            
            if response and response.text:
                # Parse JSON response
                try:
                    ai_result = json.loads(response.text.strip())
                    return BotDetectionResult(
                        is_bot_detected=ai_result.get('is_bot_detected', False),
                        detection_type=ai_result.get('detection_type', 'none'),
                        confidence_score=float(ai_result.get('confidence_score', 0.0)),
                        indicators=ai_result.get('indicators', []),
                        analysis_details=ai_result.get('analysis_details', ''),
                        recommended_action=ai_result.get('recommended_action', 'continue')
                    )
                except json.JSONDecodeError:
                    self.logger.warning("AI returned invalid JSON for bot detection")
                    return None
            
            return None
            
        except Exception as e:
            self.logger.error(f"AI bot detection analysis failed: {e}")
            return None
    
    def _determine_content_type(self, content: str, bot_detection: BotDetectionResult) -> str:
        """Determine the type of content"""
        if bot_detection.is_bot_detected:
            return bot_detection.detection_type
        
        # Check for common content indicators
        content_lower = content.lower()
        
        # Check for loading pages
        if any(indicator in content_lower for indicator in ['loading', 'please wait', 'loading content']):
            return 'loading_page'
        
        # Check for error pages
        if any(indicator in content_lower for indicator in ['error', 'not found', '404', '500', 'oops']):
            return 'error_page'
        
        # Check for paywall
        if any(indicator in content_lower for indicator in ['subscribe', 'premium', 'paywall', 'subscription']):
            return 'paywall'
        
        # Check for article content
        if len(content) > 500 and any(indicator in content_lower for indicator in ['article', 'story', 'news', 'paragraph']):
            return 'article'
        
        return 'unknown'
    
    def _clean_content_with_ai(self, content: str) -> str:
        """Clean content using AI"""
        try:
            # Use existing AI cleaning method from mainmanager
            if hasattr(self.mainmanager, 'ai_clean_content'):
                return self.mainmanager.ai_clean_content(content)
            
            # Fallback to basic cleaning
            return self._clean_content_basic(content)
            
        except Exception as e:
            self.logger.error(f"AI content cleaning failed: {e}")
            return self._clean_content_basic(content)
    
    def _clean_content_basic(self, content: str) -> str:
        """Basic content cleaning"""
        # Remove excessive whitespace
        content = re.sub(r'\s+', ' ', content)
        
        # Remove common noise
        noise_patterns = [
            r'Advertisement',
            r'Subscribe now',
            r'Related articles',
            r'More from',
            r'Share this',
            r'Follow us',
            r'Cookie policy',
            r'Terms of service'
        ]
        
        for pattern in noise_patterns:
            content = re.sub(pattern, '', content, flags=re.IGNORECASE)
        
        return content.strip()
    
    def _extract_metadata_with_ai(self, content: str) -> Dict[str, Any]:
        """Extract metadata using AI"""
        try:
            # Use existing metadata extraction from mainmanager
            if hasattr(self.mainmanager, 'extract_metadata_from_content'):
                return self.mainmanager.extract_metadata_from_content(content)
            
            # Fallback to basic extraction
            return self._extract_metadata_basic(content)
            
        except Exception as e:
            self.logger.error(f"AI metadata extraction failed: {e}")
            return self._extract_metadata_basic(content)
    
    def _extract_metadata_basic(self, content: str) -> Dict[str, Any]:
        """Basic metadata extraction"""
        return {
            'title': 'Unknown',
            'summary': content[:200] + '...' if len(content) > 200 else content,
            'extracted_at': datetime.now().isoformat(),
            'content_length': len(content),
            'method': 'basic'
        }
    
    def _get_recommended_action(self, detection_type: str) -> str:
        """Get recommended action based on detection type"""
        actions = {
            'captcha': 'manual_intervention',
            'firewall': 'wait',
            'bot_challenge': 'retry',
            'access_denied': 'manual_intervention',
            'maintenance': 'wait',
            'none': 'continue'
        }
        return actions.get(detection_type, 'retry')
    
    def _cache_result(self, cache_key: str, result: ContentAnalysisResult):
        """Cache analysis result"""
        if len(self.analysis_cache) >= self.cache_max_size:
            # Remove oldest entry
            oldest_key = next(iter(self.analysis_cache))
            del self.analysis_cache[oldest_key]
        
        self.analysis_cache[cache_key] = result
    
    def clear_cache(self):
        """Clear analysis cache"""
        self.analysis_cache.clear()
        self.logger.info("Analysis cache cleared")
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get analysis statistics"""
        return {
            'cache_size': len(self.analysis_cache),
            'cache_max_size': self.cache_max_size,
            'gemini_available': self.is_initialized,
            'detection_patterns': {k: len(v) for k, v in self.bot_detection_patterns.items()}
        }
    
    def test_capabilities(self) -> Dict[str, Any]:
        """Test analyzer capabilities"""
        capabilities = {
            'gemini_available': HAS_GEMINI,
            'gemini_initialized': self.is_initialized,
            'bot_detection_patterns': len(self.bot_detection_patterns),
            'cache_enabled': True
        }
        
        if self.is_initialized:
            try:
                # Test AI with simple query
                test_response = self.model.generate_content("Test: respond with 'OK'")
                capabilities['ai_test'] = 'OK' in test_response.text if test_response and test_response.text else False
            except Exception as e:
                capabilities['ai_test'] = False
                capabilities['ai_error'] = str(e)
        
        return capabilities

def create_gemini_analyzer(mainmanager_instance):
    """Factory function to create Gemini analyzer"""
    return GeminiAnalyzer(mainmanager_instance)