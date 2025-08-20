#!/usr/bin/env python3
"""
Simple script to create placeholder icons for the Chrome extension.
Run with: python3 create_icons.py
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, filename):
    # Create a new image with a blue gradient background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw gradient background
    for i in range(size):
        alpha = int(255 * (i / size))
        color = (102, 126, 234, alpha)  # Blue gradient
        draw.rectangle([0, i, size, i+1], fill=color)
    
    # Add Bloomberg "B" in the center
    try:
        # Try to use a system font
        font_size = size // 2
        font = ImageFont.truetype("Arial.ttf", font_size)
    except:
        # Fallback to default font
        font = ImageFont.load_default()
    
    # Draw the "B" for Bloomberg
    text = "📰"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    
    # Draw white text with shadow
    draw.text((x+1, y+1), text, fill=(0, 0, 0, 128), font=font)  # Shadow
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)  # Main text
    
    # Save the image
    img.save(filename, 'PNG')
    print(f"Created {filename} ({size}x{size})")

def main():
    # Create icons directory if it doesn't exist
    os.makedirs('icons', exist_ok=True)
    
    # Create icons in different sizes
    sizes = [(16, 'icons/icon16.png'), (48, 'icons/icon48.png'), (128, 'icons/icon128.png')]
    
    for size, filename in sizes:
        create_icon(size, filename)
    
    print("\\nAll icons created successfully!")
    print("Note: You can replace these with custom-designed icons if needed.")

if __name__ == '__main__':
    main()