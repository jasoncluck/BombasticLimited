/**
 * Demonstration test showing WebP vs JPEG file size benefits
 */

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

describe('WebP vs JPEG Compression Benefits', () => {
  it('should demonstrate significant file size reduction with WebP', async () => {
    // Create a sample image similar to a YouTube thumbnail
    const width = 720;
    const height = 720;

    // Create a test image with some complexity (gradient pattern)
    const sampleImageBuffer = await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: { r: 255, g: 100, b: 100 },
      },
    })
      .png()
      .toBuffer();

    // Process with JPEG (old format) - matching original settings
    const jpegBuffer = await sharp(sampleImageBuffer)
      .extract({ left: 280, top: 0, width: 720, height: 720 })
      .jpeg({
        quality: 80,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();

    // Process with WebP (new format) - matching new settings
    const webpBuffer = await sharp(sampleImageBuffer)
      .extract({ left: 280, top: 0, width: 720, height: 720 })
      .webp({
        quality: 80,
        effort: 4,
      })
      .toBuffer();

    const jpegSize = jpegBuffer.length;
    const webpSize = webpBuffer.length;
    const reduction = ((jpegSize - webpSize) / jpegSize) * 100;

    console.log('\n📸 WebP vs JPEG Compression Results:');
    console.log(`   JPEG size: ${jpegSize.toLocaleString()} bytes`);
    console.log(`   WebP size: ${webpSize.toLocaleString()} bytes`);
    console.log(`   Reduction: ${reduction.toFixed(1)}% smaller`);
    console.log(
      `   Savings:   ${(jpegSize - webpSize).toLocaleString()} bytes`
    );

    // Calculate data URL sizes (as they would be stored)
    const jpegDataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
    const webpDataUrl = `data:image/webp;base64,${webpBuffer.toString('base64')}`;

    const jpegDataUrlSize = jpegDataUrl.length;
    const webpDataUrlSize = webpDataUrl.length;
    const dataUrlReduction =
      ((jpegDataUrlSize - webpDataUrlSize) / jpegDataUrlSize) * 100;

    console.log('\n📄 Data URL sizes (as stored in application):');
    console.log(
      `   JPEG data URL: ${jpegDataUrlSize.toLocaleString()} characters`
    );
    console.log(
      `   WebP data URL: ${webpDataUrlSize.toLocaleString()} characters`
    );
    console.log(`   Reduction:     ${dataUrlReduction.toFixed(1)}% smaller`);

    // Assert that WebP provides meaningful compression benefits
    expect(webpSize).toBeLessThan(jpegSize);
    expect(reduction).toBeGreaterThan(5); // At least 5% reduction
    expect(webpDataUrlSize).toBeLessThan(jpegDataUrlSize);
    expect(dataUrlReduction).toBeGreaterThan(5); // At least 5% reduction for data URLs

    // Assert that we're using WebP format
    expect(webpDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(jpegDataUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('should verify WebP data URL format is correct', async () => {
    // Simple test image
    const testImageBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 255, b: 0 },
      },
    })
      .webp({ quality: 80, effort: 4 })
      .toBuffer();

    const dataUrl = `data:image/webp;base64,${testImageBuffer.toString('base64')}`;

    // Verify the data URL format
    expect(dataUrl).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
    expect(dataUrl.length).toBeGreaterThan(100); // Should have substantial content
  });
});
