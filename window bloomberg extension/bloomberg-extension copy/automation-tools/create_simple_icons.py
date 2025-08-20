#!/usr/bin/env python3
"""
Simple script to create basic PNG icons without external dependencies.
Creates solid color icons with text overlay.
"""

def create_simple_png(size, filename):
    """Create a simple PNG file with basic header and pixel data."""
    
    # PNG signature
    png_signature = b'\x89PNG\r\n\x1a\n'
    
    # Create IHDR chunk (image header)
    width = size
    height = size
    bit_depth = 8
    color_type = 6  # RGBA
    compression = 0
    filter_method = 0
    interlace = 0
    
    ihdr_data = (width.to_bytes(4, 'big') + 
                 height.to_bytes(4, 'big') +
                 bytes([bit_depth, color_type, compression, filter_method, interlace]))
    
    ihdr_crc = calculate_crc(b'IHDR' + ihdr_data)
    ihdr_chunk = len(ihdr_data).to_bytes(4, 'big') + b'IHDR' + ihdr_data + ihdr_crc.to_bytes(4, 'big')
    
    # Create simple gradient pattern (blue gradient)
    idat_data = b''
    for y in range(height):
        idat_data += b'\x00'  # Filter type for each row
        for x in range(width):
            # Create blue gradient
            blue_intensity = min(255, int(150 + (105 * y / height)))
            
            # Add newspaper emoji-like pattern in center
            center_x, center_y = width // 2, height // 2
            if (abs(x - center_x) < width // 4 and abs(y - center_y) < height // 4):
                # Newspaper pattern
                r, g, b, a = 255, 255, 255, 255  # White
            else:
                # Blue gradient background
                r, g, b, a = 66, 126, blue_intensity, 255
            
            idat_data += bytes([r, g, b, a])
    
    # Compress IDAT data (simplified - just add minimal zlib wrapper)
    import zlib
    compressed_data = zlib.compress(idat_data)
    
    idat_crc = calculate_crc(b'IDAT' + compressed_data)
    idat_chunk = len(compressed_data).to_bytes(4, 'big') + b'IDAT' + compressed_data + idat_crc.to_bytes(4, 'big')
    
    # Create IEND chunk
    iend_crc = calculate_crc(b'IEND')
    iend_chunk = b'\x00\x00\x00\x00IEND' + iend_crc.to_bytes(4, 'big')
    
    # Write PNG file
    with open(filename, 'wb') as f:
        f.write(png_signature + ihdr_chunk + idat_chunk + iend_chunk)
    
    print(f"Created {filename} ({size}x{size})")

def calculate_crc(data):
    """Calculate CRC32 for PNG chunks."""
    import zlib
    return zlib.crc32(data) & 0xffffffff

def main():
    import os
    
    # Ensure we're in the right directory
    os.makedirs('', exist_ok=True)
    
    # Create icons in different sizes
    sizes = [16, 48, 128]
    
    for size in sizes:
        filename = f'icon{size}.png'
        create_simple_png(size, filename)
    
    print("\nAll icons created successfully!")

if __name__ == '__main__':
    main()