#!/usr/bin/env python3
"""
Example usage of MainManager integrated automation system
Demonstrates how to start and use the full automation workflow
"""

import time
from mainmanager import StreamlinedMainManager

def main():
    """Example usage of MainManager automation system"""
    
    print("🚀 Starting MainManager with Integrated Automation")
    print("=" * 60)
    
    # 1. Create MainManager instance
    manager = StreamlinedMainManager()
    print("✅ MainManager created")
    
    # 2. Start the integrated automation system
    print("\n🎛️ Starting integrated automation system...")
    
    # Configure ports and credentials
    web_port = 5000
    extension_port = 8889
    
    # Optional: Add your Telegram bot credentials for notifications
    # telegram_bot_token = "YOUR_BOT_TOKEN_HERE"  # Get from @BotFather
    # telegram_chat_id = "YOUR_CHAT_ID_HERE"      # Your chat ID
    
    # Start automation system (without Telegram for demo)
    success = manager.start_integrated_automation(
        web_port=web_port,
        extension_port=extension_port,
        # telegram_bot_token=telegram_bot_token,  # Uncomment if you have credentials
        # telegram_chat_id=telegram_chat_id       # Uncomment if you have credentials
    )
    
    if success:
        print("✅ Automation system started successfully!")
        print(f"🌐 Web UI: http://localhost:{web_port}")
        print(f"🔌 Extension API: http://localhost:{extension_port}")
        
        # 3. Show automation status
        print("\n📊 Automation Status:")
        status = manager.get_automation_status()
        for key, value in status.items():
            print(f"   {key}: {value}")
        
        # 4. Example: Add links to processing queue
        print("\n📝 Adding example links to processing queue...")
        example_links = [
            "https://www.bloomberg.com/news/articles/2025-01-01/example-article-1",
            "https://www.wsj.com/articles/example-article-2",
            "https://www.cnbc.com/2025/01/01/example-article-3.html"
        ]
        
        if manager.add_links_for_automation(example_links, "example_test"):
            print("✅ Links added to processing queue")
        else:
            print("❌ Failed to add links")
        
        # 5. Example: Start processing (commented out for demo)
        # print("\n🔄 Starting processing...")
        # if manager.start_automation_processing():
        #     print("✅ Processing started")
        # else:
        #     print("❌ Failed to start processing")
        
        print("\n" + "=" * 60)
        print("🎉 MainManager Automation System is now running!")
        print()
        print("📋 Next steps:")
        print("1. Open Chrome browser")
        print("2. Load the Universal News Processor extension")
        print("3. Navigate to http://localhost:5000 for the web dashboard")
        print("4. Use the dashboard to:")
        print("   - Add links to process")
        print("   - Start/pause/stop processing")
        print("   - Monitor progress and status")
        print("   - View processing history")
        print()
        print("🔧 Manual testing:")
        print("- Test extension connection: Check dashboard status")
        print("- Test automation: Add links and start processing")
        print("- Test bot detection: Links with CAPTCHAs will be detected")
        print("- Test retry logic: Failed links will be retried automatically")
        print()
        print("⚠️ Important notes:")
        print("- The Chrome extension must be manually opened")
        print("- Database connection is required for full functionality")
        print("- Gemini API key needed for AI analysis")
        print("- Telegram bot optional for notifications")
        print()
        print("Press Ctrl+C to stop the system...")
        
        # Keep the system running
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n\n🛑 Stopping automation system...")
            manager.stop_automation()
            print("✅ System stopped gracefully")
            
    else:
        print("❌ Failed to start automation system")
        print("Check the logs for error details")

if __name__ == "__main__":
    main()