import { describe, it, expect } from 'vitest';
import { calculateOptimalQuality } from '../image-processing';
import { detectOptimalFormat } from '../../utils/image-format-detection';

describe('WebP Processing Improvements', () => {
  describe('Enhanced Quality Calculation', () => {
    it('should provide better base quality for WebP', () => {
      const metadata = { width: 1280, height: 720 };
      
      // Test WebP quality improvement
      const webpQuality = calculateOptimalQuality(metadata, 'webp', 78);
      const jpegQuality = calculateOptimalQuality(metadata, 'jpeg', 78);
      
      // WebP should have slightly lower quality due to better compression
      expect(webpQuality).toBe(75); // 78 - 3 = 75
      expect(jpegQuality).toBe(78); // No reduction for JPEG
      
      console.log(`🎯 WebP quality: ${webpQuality}, JPEG quality: ${jpegQuality}`);
    });

    it('should handle small images with higher quality for sharpness', () => {
      const smallMetadata = { width: 180, height: 180 }; // 32,400 pixels
      
      const webpQuality = calculateOptimalQuality(smallMetadata, 'webp', 78);
      
      // Small images should get quality boost: base 78 - 3 (webp) + 5 (tiny) = 80
      // But the condition checks 320*180 = 57,600 vs 180*180 = 32,400
      // So 32,400 < 57,600 (320x180), it gets +5 boost: 75 + 5 = 80
      expect(webpQuality).toBe(80); 
      
      console.log(`🔍 Small image WebP quality: ${webpQuality}`);
    });

    it('should optimize AVIF quality efficiently', () => {
      const metadata = { width: 1280, height: 720 };
      
      const avifQuality = calculateOptimalQuality(metadata, 'avif', 78);
      
      // AVIF should have more aggressive reduction due to superior compression
      expect(avifQuality).toBe(70); // 78 - 8 = 70
      
      console.log(`🚀 AVIF quality: ${avifQuality}`);
    });
  });

  describe('Enhanced Format Detection', () => {
    it('should better prioritize WebP with quality preferences', () => {
      // Test enhanced Accept header parsing
      const acceptWithQuality = 'image/webp;q=0.9,image/jpeg;q=0.8,*/*;q=0.5';
      const format = detectOptimalFormat(acceptWithQuality);
      
      expect(format).toBe('webp');
      console.log(`📝 Format detected with quality preference: ${format}`);
    });

    it('should default to WebP for modern browsers', () => {
      const modernBrowserAccept = 'image/*,*/*;q=0.8';
      const format = detectOptimalFormat(modernBrowserAccept);
      
      expect(format).toBe('webp');
      console.log(`🌐 Modern browser format: ${format}`);
    });

    it('should prefer WebP over JPEG when quality is equal', () => {
      const equalQualityAccept = 'image/webp;q=0.8,image/jpeg;q=0.8';
      const format = detectOptimalFormat(equalQualityAccept);
      
      expect(format).toBe('webp');
      console.log(`⚖️ Equal quality preference format: ${format}`);
    });
  });

  describe('Compression Efficiency', () => {
    it('should demonstrate WebP improvements maintain excellent compression', () => {
      // This test validates that our quality improvements still provide good compression
      const smallImageQuality = calculateOptimalQuality({ width: 180, height: 180 }, 'webp');
      const mediumImageQuality = calculateOptimalQuality({ width: 720, height: 480 }, 'webp');
      const largeImageQuality = calculateOptimalQuality({ width: 1920, height: 1080 }, 'webp');
      
      // All should be reasonable for good compression
      expect(smallImageQuality).toBeGreaterThanOrEqual(78); // High quality for small images
      expect(mediumImageQuality).toBeGreaterThanOrEqual(75); // Good quality for medium
      expect(largeImageQuality).toBeGreaterThanOrEqual(72); // Efficient for large
      
      console.log(`📊 Quality progression - Small: ${smallImageQuality}, Medium: ${mediumImageQuality}, Large: ${largeImageQuality}`);
    });
  });
});