#!/usr/bin/env python3
"""
Setup script for Gemini API key configuration
"""

import json
import os
from pathlib import Path

def setup_gemini_api_key():
    """Interactive setup for Gemini API key"""
    
    print("=" * 60)
    print("GEMINI API KEY SETUP")
    print("=" * 60)
    
    print("\nTo get your Gemini API key:")
    print("1. Go to: https://makersuite.google.com/app/apikey")
    print("2. Sign in with your Google account")
    print("3. Click 'Create API key'")
    print("4. Copy the API key")
    print("5. Paste it below")
    
    print("\nNote: Keep your API key secure and don't share it!")
    
    # Get API key from user
    api_key = input("\nEnter your Gemini API key (or press Enter to skip): ").strip()
    
    if not api_key:
        print("Skipping API key setup. You can add it later.")
        return False
    
    # Basic validation
    if len(api_key) < 20:
        print("Warning: API key seems too short. Please double-check.")
        continue_anyway = input("Continue anyway? (y/N): ").lower().startswith('y')
        if not continue_anyway:
            return False
    
    # Update config.json
    config_path = Path(__file__).parent / "config.json"
    
    try:
        # Load existing config
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # Update API key
        config['gemini_api_key'] = api_key
        
        # Save updated config
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4)
        
        print(f"\n✅ API key saved to {config_path}")
        
        # Also create .env file
        env_path = Path(__file__).parent / ".env"
        with open(env_path, 'w', encoding='utf-8') as f:
            f.write(f"GEMINI_API_KEY={api_key}\n")
        
        print(f"✅ API key also saved to {env_path}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error saving API key: {e}")
        return False

def test_gemini_connection():
    """Test the Gemini API connection"""
    
    print("\n" + "=" * 60)
    print("TESTING GEMINI CONNECTION")
    print("=" * 60)
    
    try:
        import google.generativeai as genai
        
        # Load API key from config
        config_path = Path(__file__).parent / "config.json"
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        api_key = config.get('gemini_api_key')
        if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
            print("❌ No valid API key found in config")
            return False
        
        # Configure Gemini
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')
        
        print("🔄 Testing API connection...")
        
        # Test API call
        response = model.generate_content("Reply with exactly: 'API_TEST_SUCCESS'")
        
        if response and response.text:
            if "API_TEST_SUCCESS" in response.text:
                print("✅ Gemini API connection successful!")
                print(f"Response: {response.text}")
                return True
            else:
                print("⚠️  API responded but with unexpected content:")
                print(f"Response: {response.text}")
                return False
        else:
            print("❌ API call failed - no response")
            return False
            
    except ImportError:
        print("❌ google-generativeai not installed")
        print("Run: pip install google-generativeai")
        return False
    except Exception as e:
        print(f"❌ API test failed: {e}")
        return False

def main():
    """Main setup function"""
    
    print("Bloomberg Extension - Gemini Setup")
    print("This will help you configure Gemini AI for PDF processing\n")
    
    # Check if google-generativeai is installed
    try:
        import google.generativeai
        print("✅ google-generativeai is installed")
    except ImportError:
        print("❌ google-generativeai not installed")
        print("Installing now...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "google-generativeai"])
        print("✅ google-generativeai installed")
    
    # Setup API key
    if setup_gemini_api_key():
        # Test connection
        test_gemini_connection()
    
    print("\n" + "=" * 60)
    print("Setup complete!")
    print("You can now run: python mainmanager.py --config config.json")
    print("=" * 60)

if __name__ == "__main__":
    main()