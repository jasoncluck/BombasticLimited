import { describe, it, expect } from 'vitest';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';
import {
  calculateDynamicCropDimensions,
  validateAndAdjustCropDimensions,
} from '../dynamic-crop-dimensions';

describe('Conservative Cropping for Small Images', () => {
  describe('Problem Statement Requirements', () => {
    it('should apply conservative cropping to YouTube 320x180 thumbnails', () => {
      // 320x180 is a small thumbnail that was being over-cropped
      const result = calculateDynamicCropDimensions(320, 180, true);

      // Should use 90% of smaller dimension (180) = 162x162
      expect(result.width).toBe(162);
      expect(result.height).toBe(162);

      // Should be centered
      expect(result.x).toBe(Math.round((320 - 162) / 2)); // 79
      expect(result.y).toBe(Math.round((180 - 162) / 2)); // 9

      // Verify it's less aggressive than the old 100% cropping
      expect(result.width).toBeLessThan(180); // Old behavior was 180x180
      expect(result.height).toBeLessThan(180);
    });

    it('should apply more conservative cropping to very small 120x90 thumbnails', () => {
      // 120x90 is a very small thumbnail
      const result = calculateDynamicCropDimensions(120, 90, true);

      // Should use 85% of smaller dimension (90) = 76.5 → 77
      expect(result.width).toBe(77);
      expect(result.height).toBe(77);

      // Should be centered
      expect(result.x).toBe(Math.round((120 - 77) / 2)); // 22
      expect(result.y).toBe(Math.round((90 - 77) / 2)); // 7

      // Verify it's less aggressive than the old 100% cropping
      expect(result.width).toBeLessThan(90); // Old behavior was 90x90
      expect(result.height).toBeLessThan(90);
    });

    it('should use normal cropping for larger images', () => {
      // 1280x720 is a large image that should use full cropping
      const result = calculateDynamicCropDimensions(1280, 720, true);

      // Should use 100% of smaller dimension since it's not a small image
      expect(result.width).toBe(720);
      expect(result.height).toBe(720);
      expect(result.x).toBe(280); // (1280-720)/2
      expect(result.y).toBe(0);
    });

    it('should always respect custom crop properties when provided', () => {
      const customProps: PlaylistImageProperties = {
        x: 50,
        y: 25,
        width: 100,
        height: 80,
      };

      // Test with small image - custom properties should be respected
      const smallResult = validateAndAdjustCropDimensions(
        customProps,
        320,
        180,
        'standard',
        customProps
      );
      expect(smallResult.x).toBe(50);
      expect(smallResult.y).toBe(25);
      expect(smallResult.width).toBe(100);
      expect(smallResult.height).toBe(80);

      // Test with large image - custom properties should be respected
      const largeResult = validateAndAdjustCropDimensions(
        customProps,
        1280,
        720,
        'maxres',
        customProps
      );
      expect(largeResult.x).toBe(50);
      expect(largeResult.y).toBe(25);
      expect(largeResult.width).toBe(100);
      expect(largeResult.height).toBe(80);
    });

    it('should use conservative cropping for standard images without custom properties', () => {
      // Simulate no custom properties (default/empty properties)
      const defaultProps: PlaylistImageProperties = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      };

      const result = validateAndAdjustCropDimensions(
        defaultProps,
        320,
        180,
        'standard',
        null
      );

      // Should apply conservative cropping for small standard images
      expect(result.width).toBe(162); // 90% of 180
      expect(result.height).toBe(162);
      expect(result.x).toBe(79); // Centered
      expect(result.y).toBe(9);
    });

    it('should handle edge cases for very small images', () => {
      // Test with 50x30 - very small image
      const result = calculateDynamicCropDimensions(50, 30, true);

      // Should use 85% of smaller dimension (30) = 25.5 → 26
      expect(result.width).toBe(26);
      expect(result.height).toBe(26);

      // Should be centered
      expect(result.x).toBe(Math.round((50 - 26) / 2)); // 12
      expect(result.y).toBe(Math.round((30 - 26) / 2)); // 2
    });

    it('should preserve user preferences for custom properties on small images', () => {
      // This tests the critical requirement that custom properties are not ignored
      const userCustomProps: PlaylistImageProperties = {
        x: 30,
        y: 10,
        width: 260,
        height: 160,
      };

      // For a 320x180 image with custom properties, should use them
      const result = validateAndAdjustCropDimensions(
        userCustomProps,
        320,
        180,
        'standard',
        userCustomProps
      );

      // Should use the custom properties, not ignore them
      expect(result.x).toBe(30);
      expect(result.y).toBe(10);
      expect(result.width).toBe(260);
      expect(result.height).toBe(160);
    });
  });

  describe('Boundary Testing', () => {
    it('should apply conservative cropping at the 180px boundary', () => {
      // Test exactly at the boundary
      const result = calculateDynamicCropDimensions(300, 180, true);
      expect(result.width).toBe(162); // 90% of 180
      expect(result.height).toBe(162);
    });

    it('should apply normal cropping just above the boundary', () => {
      // Test just above the boundary
      const result = calculateDynamicCropDimensions(300, 181, true);
      expect(result.width).toBe(181); // 100% of 181 (not small)
      expect(result.height).toBe(181);
    });

    it('should apply extra conservative cropping at the 90px boundary', () => {
      // Test exactly at the 90px boundary
      const result = calculateDynamicCropDimensions(150, 90, true);
      expect(result.width).toBe(77); // 85% of 90
      expect(result.height).toBe(77);
    });

    it('should apply standard conservative cropping just above 90px', () => {
      // Test just above the 90px boundary
      const result = calculateDynamicCropDimensions(150, 91, true);
      expect(result.width).toBe(82); // 90% of 91
      expect(result.height).toBe(82);
    });
  });
});
