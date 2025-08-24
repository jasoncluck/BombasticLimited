import { describe, it, expect } from 'vitest';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';
import {
  calculateDynamicCropDimensions,
  validateAndAdjustCropDimensions,
} from '$lib/utils/dynamic-crop-dimensions';

describe('Dynamic Crop Dimensions', () => {
  describe('calculateDynamicCropDimensions', () => {
    it('should handle YouTube 320x180 thumbnails with conservative cropping', () => {
      const result = calculateDynamicCropDimensions(320, 180, true);

      // New conservative behavior: 90% of smaller dimension
      expect(result.width).toBe(162); // 90% of 180
      expect(result.height).toBe(162);
      expect(result.x).toBe(79); // (320-162)/2
      expect(result.y).toBe(9); // (180-162)/2
    });

    it('should handle YouTube 480x360 thumbnails (currently hardcoded)', () => {
      const result = calculateDynamicCropDimensions(480, 360, true);

      expect(result.width).toBe(360);
      expect(result.height).toBe(360);
      expect(result.x).toBe(60); // (480-360)/2
      expect(result.y).toBe(0);
    });

    it('should handle YouTube 120x90 thumbnails with conservative cropping', () => {
      const result = calculateDynamicCropDimensions(120, 90, true);

      // New conservative behavior: 85% of smaller dimension for very small images
      expect(result.width).toBe(77); // 85% of 90
      expect(result.height).toBe(77);
      expect(result.x).toBe(22); // (120-77)/2
      expect(result.y).toBe(7); // (90-77)/2
    });

    it('should handle arbitrary aspect ratios dynamically', () => {
      // Test a random size that is not hardcoded
      const result = calculateDynamicCropDimensions(640, 400, true);

      expect(result.width).toBe(400);
      expect(result.height).toBe(400);
      expect(result.x).toBe(120); // (640-400)/2
      expect(result.y).toBe(0);
    });

    it('should handle very wide images', () => {
      const result = calculateDynamicCropDimensions(1920, 600, true);

      expect(result.width).toBe(600);
      expect(result.height).toBe(600);
      expect(result.x).toBe(660); // (1920-600)/2
      expect(result.y).toBe(0);
    });

    it('should handle very tall images', () => {
      const result = calculateDynamicCropDimensions(600, 1200, true);

      expect(result.width).toBe(600);
      expect(result.height).toBe(600);
      expect(result.x).toBe(0);
      expect(result.y).toBe(300); // (1200-600)/2
    });

    it('should use custom properties when provided', () => {
      const customProps: PlaylistImageProperties = {
        x: 50,
        y: 100,
        width: 200,
        height: 150,
      };

      const result = calculateDynamicCropDimensions(
        800,
        600,
        true,
        customProps
      );

      expect(result.x).toBe(50);
      expect(result.y).toBe(100);
      expect(result.width).toBe(200);
      expect(result.height).toBe(150);
    });

    it('should validate custom properties to ensure they are within bounds', () => {
      const customProps: PlaylistImageProperties = {
        x: -10, // Invalid - negative
        y: 700, // Invalid - beyond image height
        width: 1000, // Invalid - too wide for image
        height: 150,
      };

      const result = calculateDynamicCropDimensions(
        800,
        600,
        true,
        customProps
      );

      expect(result.x).toBe(0); // Corrected from -10
      expect(result.y).toBe(599); // Corrected from 700 to max valid value (600-1)
      expect(result.width).toBe(800); // Since x=0, width can be full image width (800)
      expect(result.height).toBe(1); // Corrected because y=599 leaves only 1 pixel height
    });

    it('should handle edge case of very small images with conservative cropping', () => {
      const result = calculateDynamicCropDimensions(50, 30, true);

      // New conservative behavior: 85% for very small images
      expect(result.width).toBe(26); // 85% of 30
      expect(result.height).toBe(26);
      expect(result.x).toBe(12); // (50-26)/2
      expect(result.y).toBe(2); // (30-26)/2
    });

    it('should handle square images correctly', () => {
      const result = calculateDynamicCropDimensions(500, 500, true);

      expect(result.width).toBe(500);
      expect(result.height).toBe(500);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
    });

    it('should support non-square crops for specific use cases', () => {
      const result = calculateDynamicCropDimensions(1920, 1080, false);

      // Should maintain reasonable aspect ratio without forcing square
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);

      // Should be within image bounds
      expect(result.x + result.width).toBeLessThanOrEqual(1920);
      expect(result.y + result.height).toBeLessThanOrEqual(1080);
    });

    it('should handle maxres images (1280x720) commonly used', () => {
      const result = calculateDynamicCropDimensions(1280, 720, true);

      expect(result.width).toBe(720);
      expect(result.height).toBe(720);
      expect(result.x).toBe(280); // (1280-720)/2
      expect(result.y).toBe(0);
    });
  });

  describe('Compatibility with existing behavior', () => {
    it('should use new conservative cropping for YouTube medium thumbnails (320x180)', () => {
      // This tests that our dynamic approach now uses conservative cropping for small images
      const dynamicResult = calculateDynamicCropDimensions(320, 180, true);

      // New conservative logic for 320x180 (90% of smaller dimension):
      const newExpectedResult = {
        x: Math.round((320 - 162) / 2), // 79px from left
        y: Math.round((180 - 162) / 2), // 9px from top
        width: 162, // 90% of 180
        height: 162,
      };

      expect(dynamicResult).toEqual(newExpectedResult);

      // Verify it's more conservative than the old hardcoded approach
      expect(dynamicResult.width).toBeLessThan(180); // Old was 180x180
      expect(dynamicResult.height).toBeLessThan(180);
    });

    it('should produce same results as hardcoded YouTube high thumbnail logic', () => {
      const dynamicResult = calculateDynamicCropDimensions(480, 360, true);

      // Current hardcoded logic for YouTube high (480x360):
      const hardcodedResult = {
        x: Math.round((480 - 360) / 2), // 60px from left
        y: 0,
        width: 360,
        height: 360,
      };

      expect(dynamicResult).toEqual(hardcodedResult);
    });

    it('should use new conservative cropping for YouTube default thumbnails (120x90)', () => {
      const dynamicResult = calculateDynamicCropDimensions(120, 90, true);

      // New conservative logic for 120x90 (85% of smaller dimension):
      const newExpectedResult = {
        x: Math.round((120 - 77) / 2), // 22px from left
        y: Math.round((90 - 77) / 2), // 7px from top
        width: 77, // 85% of 90
        height: 77,
      };

      expect(dynamicResult).toEqual(newExpectedResult);

      // Verify it's more conservative than the old hardcoded approach
      expect(dynamicResult.width).toBeLessThan(90); // Old was 90x90
      expect(dynamicResult.height).toBeLessThan(90);
    });

    it('should produce same results as current fallback logic for unknown sizes', () => {
      const dynamicResult = calculateDynamicCropDimensions(640, 480, true);

      // Current fallback logic:
      const cropSize = Math.min(640, 480);
      const hardcodedResult = {
        x: Math.round((640 - cropSize) / 2),
        y: Math.round((480 - cropSize) / 2),
        width: cropSize,
        height: cropSize,
      };

      expect(dynamicResult).toEqual(hardcodedResult);
    });
  });

  describe('Enhanced validateAndAdjustCropDimensions', () => {
    it('should handle standard images with conservative dynamic cropping', () => {
      const properties: PlaylistImageProperties = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };
      const result = validateAndAdjustCropDimensions(
        properties,
        320,
        180,
        'standard',
        null
      );

      // Should produce square crop for standard images with conservative sizing

      expect(result.width).toBe(result.height);
      expect(result.width).toBe(162); // 90% of 180 (conservative cropping)
      expect(result.x).toBe(79); // Centered: (320-162)/2
      expect(result.y).toBe(9); // Centered: (180-162)/2
    });

    it('should handle maxres images with custom properties', () => {
      const properties: PlaylistImageProperties = {
        x: 280,
        y: 0,
        width: 720,
        height: 720,
      };
      const result = validateAndAdjustCropDimensions(
        properties,
        1280,
        720,
        'maxres',
        properties
      );

      expect(result.x).toBe(280);
      expect(result.y).toBe(0);
      expect(result.width).toBe(720);
      expect(result.height).toBe(720);
    });

    it('should validate bounds for invalid properties', () => {
      const properties: PlaylistImageProperties = {
        x: -10,
        y: 800,
        width: 2000,
        height: 1000,
      };
      const result = validateAndAdjustCropDimensions(
        properties,
        1280,
        720,
        'maxres',
        properties
      );

      expect(result.x).toBe(0); // Corrected from -10
      expect(result.y).toBe(719); // Corrected from 800 to max valid (720-1)
      expect(result.width).toBe(1280); // Max available width from x=0
      expect(result.height).toBe(1); // Max available height from y=719
    });

    it('should handle zero or negative image dimensions gracefully', () => {
      const properties: PlaylistImageProperties = {
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      };
      const result = validateAndAdjustCropDimensions(
        properties,
        0,
        0,
        'standard',
        null
      );

      expect(result.x).toBe(10);
      expect(result.y).toBe(10);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should allow custom crop properties for both maxres and standard when provided', () => {
      const customProps: PlaylistImageProperties = {
        x: 100,
        y: 50,
        width: 400,
        height: 300,
      };

      // Standard should use custom properties when provided (new behavior)
      const standardResult = validateAndAdjustCropDimensions(
        customProps,
        800,
        600,
        'standard',
        customProps
      );
      expect(standardResult.x).toBe(100);
      expect(standardResult.y).toBe(50);
      expect(standardResult.width).toBe(400);
      expect(standardResult.height).toBe(300);

      // Maxres should respect custom properties
      const maxresResult = validateAndAdjustCropDimensions(
        customProps,
        800,
        600,
        'maxres',
        customProps
      );

      expect(maxresResult.x).toBe(100);
      expect(maxresResult.y).toBe(50);
      expect(maxresResult.width).toBe(400);
      expect(maxresResult.height).toBe(300);
    });

    it('should handle various resolutions dynamically without hardcoded sizes', () => {
      const properties: PlaylistImageProperties = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      };

      // Test non-YouTube sizes that would have failed with hardcoded approach
      const cases = [
        { width: 640, height: 360, expectedCrop: 360 }, // 16:9 aspect ratio
        { width: 1024, height: 768, expectedCrop: 768 }, // 4:3 aspect ratio
        { width: 1200, height: 800, expectedCrop: 800 }, // 3:2 aspect ratio
        { width: 500, height: 500, expectedCrop: 500 }, // Square
        { width: 300, height: 200, expectedCrop: 200 }, // Random size
      ];

      cases.forEach(({ width, height, expectedCrop }) => {
        const result = validateAndAdjustCropDimensions(
          properties,
          width,
          height,
          'standard',
          null
        );
        // Note: For small images, conservative cropping will apply
        if (expectedCrop <= 180) {
          // Conservative cropping applied
          const conservativeRatio = expectedCrop <= 90 ? 0.85 : 0.9;
          const actualCrop = Math.round(expectedCrop * conservativeRatio);
          expect(result.width).toBe(actualCrop);
          expect(result.height).toBe(actualCrop);
          expect(result.x).toBe(Math.round((width - actualCrop) / 2));
          expect(result.y).toBe(Math.round((height - actualCrop) / 2));
        } else {
          // Normal cropping for larger images
          expect(result.width).toBe(expectedCrop);
          expect(result.height).toBe(expectedCrop);
          expect(result.x).toBe(Math.round((width - expectedCrop) / 2));
          expect(result.y).toBe(Math.round((height - expectedCrop) / 2));
        }
      });
    });
  });
});
