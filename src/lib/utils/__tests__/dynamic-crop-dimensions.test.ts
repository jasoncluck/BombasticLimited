import { describe, it, expect } from 'vitest';
import {
  calculateDynamicCropDimensions,
  validateAndAdjustCropDimensions,
} from '../dynamic-crop-dimensions';
import type { PlaylistImageProperties } from '$lib/supabase/playlists';

describe('dynamic-crop-dimensions', () => {
  describe('calculateDynamicCropDimensions', () => {
    describe('input validation', () => {
      it('should handle zero or negative dimensions', () => {
        const result = calculateDynamicCropDimensions(0, 0);
        expect(result).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      });

      it('should handle negative width', () => {
        const result = calculateDynamicCropDimensions(-100, 200);
        expect(result).toEqual({ x: 0, y: 0, width: 1, height: 200 });
      });

      it('should handle negative height', () => {
        const result = calculateDynamicCropDimensions(300, -150);
        expect(result).toEqual({ x: 0, y: 0, width: 300, height: 1 });
      });
    });

    describe('square crop calculations', () => {
      it('should create centered square crop for landscape image', () => {
        const result = calculateDynamicCropDimensions(400, 300, true);
        expect(result).toEqual({
          x: 50, // (400 - 300) / 2
          y: 0, // (300 - 300) / 2
          width: 300,
          height: 300,
        });
      });

      it('should create centered square crop for portrait image', () => {
        const result = calculateDynamicCropDimensions(300, 400, true);
        expect(result).toEqual({
          x: 0, // (300 - 300) / 2
          y: 50, // (400 - 300) / 2
          width: 300,
          height: 300,
        });
      });

      it('should use full image for square input', () => {
        const result = calculateDynamicCropDimensions(300, 300, true);
        expect(result).toEqual({
          x: 0,
          y: 0,
          width: 300,
          height: 300,
        });
      });

      it('should apply conservative cropping for small images', () => {
        // Test small image (120x90)
        const result = calculateDynamicCropDimensions(120, 90, true);
        const expectedSize = Math.round(90 * 0.85); // 85% of smaller dimension

        expect(result.width).toBe(expectedSize);
        expect(result.height).toBe(expectedSize);
        expect(result.x).toBe(Math.round((120 - expectedSize) / 2));
        expect(result.y).toBe(Math.round((90 - expectedSize) / 2));
      });

      it('should apply different conservative ratio for very small images', () => {
        // Test very small image (80x60)
        const result = calculateDynamicCropDimensions(80, 60, true);
        const expectedSize = Math.round(60 * 0.85); // 85% for very small images

        expect(result.width).toBe(expectedSize);
        expect(result.height).toBe(expectedSize);
      });

      it('should apply moderate conservative cropping for medium small images', () => {
        // Test medium small image (160x120)
        const result = calculateDynamicCropDimensions(160, 120, true);
        const expectedSize = Math.round(120 * 0.9); // 90% for medium small images

        expect(result.width).toBe(expectedSize);
        expect(result.height).toBe(expectedSize);
      });

      it('should not apply conservative cropping for large images', () => {
        const result = calculateDynamicCropDimensions(800, 600, true);

        expect(result.width).toBe(600); // Full smaller dimension
        expect(result.height).toBe(600);
      });
    });

    describe('non-square crop calculations', () => {
      it('should maintain aspect ratio for balanced image', () => {
        const result = calculateDynamicCropDimensions(400, 300, false);
        expect(result).toEqual({
          x: 0,
          y: 0,
          width: 400,
          height: 300,
        });
      });

      it('should crop wide images to 3:2 aspect ratio', () => {
        const result = calculateDynamicCropDimensions(600, 200, false); // 3:1 ratio
        const expectedWidth = Math.round(200 * 1.5); // 3:2 ratio

        expect(result.height).toBe(200);
        expect(result.width).toBe(expectedWidth);
        expect(result.x).toBe(Math.round((600 - expectedWidth) / 2));
        expect(result.y).toBe(0);
      });

      it('should crop tall images to 4:3 aspect ratio', () => {
        const result = calculateDynamicCropDimensions(200, 600, false); // 1:3 ratio
        const expectedHeight = Math.round(200 / 0.75); // 4:3 ratio

        expect(result.width).toBe(200);
        expect(result.height).toBe(expectedHeight);
        expect(result.x).toBe(0);
        expect(result.y).toBe(Math.round((600 - expectedHeight) / 2));
      });

      it('should reduce cropping intensity for small wide images', () => {
        const imageWidth = 320;
        const imageHeight = 180; // Small thumbnail area
        const result = calculateDynamicCropDimensions(
          imageWidth,
          imageHeight,
          false
        );

        const maxCropWidth = imageWidth * 0.9;
        expect(result.width).toBeLessThanOrEqual(maxCropWidth);
      });

      it('should reduce cropping intensity for small tall images', () => {
        const imageWidth = 180;
        const imageHeight = 320; // Small thumbnail area
        const result = calculateDynamicCropDimensions(
          imageWidth,
          imageHeight,
          false
        );

        const maxCropHeight = imageHeight * 0.9;
        expect(result.height).toBeLessThanOrEqual(maxCropHeight);
      });

      it('should use full image for small thumbnails with reasonable aspect ratio', () => {
        const result = calculateDynamicCropDimensions(240, 180, false); // 4:3 ratio, small area

        expect(result.width).toBe(240);
        expect(result.height).toBe(180);
        expect(result.x).toBe(0);
        expect(result.y).toBe(0);
      });
    });

    describe('custom properties handling', () => {
      it('should use custom properties when provided', () => {
        const customProps: PlaylistImageProperties = {
          x: 50,
          y: 30,
          width: 200,
          height: 150,
        };

        const result = calculateDynamicCropDimensions(
          400,
          300,
          true,
          customProps
        );
        expect(result).toEqual(customProps);
      });

      it('should adjust custom properties to fit within image bounds', () => {
        const customProps: PlaylistImageProperties = {
          x: 350, // Too far right
          y: 250, // Too far down
          width: 200,
          height: 150,
        };

        const result = calculateDynamicCropDimensions(
          400,
          300,
          true,
          customProps
        );
        expect(result.x).toBeLessThanOrEqual(399); // Within bounds
        expect(result.y).toBeLessThanOrEqual(299); // Within bounds
        expect(result.x + result.width).toBeLessThanOrEqual(400);
        expect(result.y + result.height).toBeLessThanOrEqual(300);
      });

      it('should ensure minimum dimensions for custom properties', () => {
        const customProps: PlaylistImageProperties = {
          x: 100,
          y: 100,
          width: 0, // Invalid
          height: -10, // Invalid
        };

        const result = calculateDynamicCropDimensions(
          400,
          300,
          true,
          customProps
        );
        expect(result.width).toBeGreaterThanOrEqual(1);
        expect(result.height).toBeGreaterThanOrEqual(1);
      });

      it('should handle custom properties with out-of-bounds coordinates', () => {
        const customProps: PlaylistImageProperties = {
          x: 500, // Beyond image width
          y: 400, // Beyond image height
          width: 100,
          height: 100,
        };

        const result = calculateDynamicCropDimensions(
          400,
          300,
          true,
          customProps
        );
        expect(result.x).toBe(399); // Clamped to max valid x
        expect(result.y).toBe(299); // Clamped to max valid y
        expect(result.width).toBe(1); // Minimum width due to bounds
        expect(result.height).toBe(1); // Minimum height due to bounds
      });
    });

    describe('edge cases', () => {
      it('should handle very large images', () => {
        const result = calculateDynamicCropDimensions(4000, 3000, true);
        expect(result.width).toBe(3000);
        expect(result.height).toBe(3000);
        expect(result.x).toBe(500); // (4000 - 3000) / 2
        expect(result.y).toBe(0);
      });

      it('should handle 1x1 pixel image', () => {
        const result = calculateDynamicCropDimensions(1, 1, true);
        expect(result).toEqual({ x: 0, y: 0, width: 1, height: 1 });
      });

      it('should handle extremely wide images', () => {
        const result = calculateDynamicCropDimensions(2000, 100, false);
        const expectedWidth = Math.round(100 * 1.5); // 3:2 ratio

        expect(result.height).toBe(100);
        expect(result.width).toBe(expectedWidth);
      });

      it('should handle extremely tall images', () => {
        const result = calculateDynamicCropDimensions(100, 2000, false);
        const expectedHeight = Math.round(100 / 0.75); // 4:3 ratio

        expect(result.width).toBe(100);
        expect(result.height).toBe(expectedHeight);
      });
    });
  });

  describe('validateAndAdjustCropDimensions', () => {
    const defaultProps: PlaylistImageProperties = {
      x: 50,
      y: 50,
      width: 200,
      height: 150,
    };

    describe('input validation', () => {
      it('should handle zero or negative image dimensions', () => {
        const result = validateAndAdjustCropDimensions(
          defaultProps,
          0,
          0,
          'maxres'
        );

        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.y).toBeGreaterThanOrEqual(0);
        expect(result.width).toBeGreaterThanOrEqual(1);
        expect(result.height).toBeGreaterThanOrEqual(1);
      });

      it('should clamp coordinates to valid bounds', () => {
        const invalidProps: PlaylistImageProperties = {
          x: -10,
          y: -20,
          width: 100,
          height: 100,
        };

        const result = validateAndAdjustCropDimensions(
          invalidProps,
          400,
          300,
          'maxres'
        );

        expect(result.x).toBe(0); // Clamped from -10
        expect(result.y).toBe(0); // Clamped from -20
      });
    });

    describe('custom properties handling', () => {
      it('should use custom properties when provided', () => {
        const customProps: PlaylistImageProperties = {
          x: 100,
          y: 80,
          width: 150,
          height: 120,
        };

        const result = validateAndAdjustCropDimensions(
          defaultProps,
          400,
          300,
          'standard',
          customProps
        );

        // Should use custom properties through calculateDynamicCropDimensions
        expect(result.x).toBe(customProps.x);
        expect(result.y).toBe(customProps.y);
        expect(result.width).toBe(customProps.width);
        expect(result.height).toBe(customProps.height);
      });

      it('should respect custom properties for maxres images', () => {
        const customProps: PlaylistImageProperties = {
          x: 200,
          y: 150,
          width: 100,
          height: 100,
        };

        const result = validateAndAdjustCropDimensions(
          defaultProps,
          800,
          600,
          'maxres',
          customProps
        );

        expect(result.x).toBe(customProps.x);
        expect(result.y).toBe(customProps.y);
        expect(result.width).toBe(customProps.width);
        expect(result.height).toBe(customProps.height);
      });

      it('should handle null custom properties', () => {
        const result = validateAndAdjustCropDimensions(
          defaultProps,
          400,
          300,
          'standard',
          null
        );

        // Should apply dynamic cropping for standard images
        expect(result).toBeDefined();
        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.y).toBeGreaterThanOrEqual(0);
      });

      it('should handle undefined custom properties', () => {
        const result = validateAndAdjustCropDimensions(
          defaultProps,
          400,
          300,
          'standard',
          undefined
        );

        // Should apply dynamic cropping for standard images
        expect(result).toBeDefined();
        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.y).toBeGreaterThanOrEqual(0);
      });
    });

    describe('image type handling', () => {
      it('should apply dynamic cropping for standard images without custom properties', () => {
        const result = validateAndAdjustCropDimensions(
          defaultProps,
          320,
          180, // Small standard image
          'standard',
          null
        );

        // Should use conservative cropping for small images
        expect(result.width).toBeLessThanOrEqual(180); // Should be cropped conservatively
        expect(result.height).toBeLessThanOrEqual(180);
      });

      it('should use provided properties for maxres images without custom properties', () => {
        const result = validateAndAdjustCropDimensions(
          defaultProps,
          800,
          600,
          'maxres',
          null
        );

        // Should validate and adjust the provided default properties
        expect(result.x).toBeLessThanOrEqual(defaultProps.x);
        expect(result.y).toBeLessThanOrEqual(defaultProps.y);
      });

      it('should prefer square crop for standard images', () => {
        const result = validateAndAdjustCropDimensions(
          defaultProps,
          400,
          300,
          'standard',
          null
        );

        // Should create square crop (preferSquareCrop: true)
        expect(result.width).toBe(result.height);
      });
    });

    describe('bounds validation', () => {
      it('should ensure crop area fits within image bounds', () => {
        const largeProps: PlaylistImageProperties = {
          x: 300,
          y: 200,
          width: 500, // Too wide
          height: 400, // Too tall
        };

        const result = validateAndAdjustCropDimensions(
          largeProps,
          400,
          300,
          'maxres'
        );

        expect(result.x + result.width).toBeLessThanOrEqual(400);
        expect(result.y + result.height).toBeLessThanOrEqual(300);
      });

      it('should enforce minimum dimensions', () => {
        const tinyProps: PlaylistImageProperties = {
          x: 399, // Near edge
          y: 299, // Near edge
          width: 10,
          height: 10,
        };

        const result = validateAndAdjustCropDimensions(
          tinyProps,
          400,
          300,
          'maxres'
        );

        expect(result.width).toBeGreaterThanOrEqual(1);
        expect(result.height).toBeGreaterThanOrEqual(1);
      });

      it('should handle coordinates at image edge', () => {
        const edgeProps: PlaylistImageProperties = {
          x: 399, // At right edge
          y: 299, // At bottom edge
          width: 50,
          height: 50,
        };

        const result = validateAndAdjustCropDimensions(
          edgeProps,
          400,
          300,
          'maxres'
        );

        expect(result.x).toBeLessThan(400);
        expect(result.y).toBeLessThan(300);
        expect(result.width).toBe(1); // Maximum possible width from edge
        expect(result.height).toBe(1); // Maximum possible height from edge
      });
    });

    describe('integration scenarios', () => {
      it('should handle YouTube thumbnail dimensions', () => {
        // Test with common YouTube thumbnail sizes
        const ytSizes = [
          { width: 320, height: 180 },
          { width: 480, height: 360 },
          { width: 640, height: 480 },
        ];

        ytSizes.forEach(({ width, height }) => {
          const result = validateAndAdjustCropDimensions(
            defaultProps,
            width,
            height,
            'standard',
            null
          );

          expect(result.x).toBeGreaterThanOrEqual(0);
          expect(result.y).toBeGreaterThanOrEqual(0);
          expect(result.x + result.width).toBeLessThanOrEqual(width);
          expect(result.y + result.height).toBeLessThanOrEqual(height);
        });
      });

      it('should maintain consistency between calls', () => {
        const testProps = { x: 100, y: 100, width: 200, height: 200 };

        const result1 = validateAndAdjustCropDimensions(
          testProps,
          800,
          600,
          'maxres'
        );
        const result2 = validateAndAdjustCropDimensions(
          testProps,
          800,
          600,
          'maxres'
        );

        expect(result1).toEqual(result2);
      });

      it('should handle workflow from dynamic calculation to validation', () => {
        // Simulate the typical workflow
        const dynamicResult = calculateDynamicCropDimensions(400, 300, true);
        const validatedResult = validateAndAdjustCropDimensions(
          dynamicResult,
          400,
          300,
          'standard',
          null
        );

        expect(validatedResult.x).toBeGreaterThanOrEqual(0);
        expect(validatedResult.y).toBeGreaterThanOrEqual(0);
        expect(validatedResult.x + validatedResult.width).toBeLessThanOrEqual(
          400
        );
        expect(validatedResult.y + validatedResult.height).toBeLessThanOrEqual(
          300
        );
      });
    });
  });
});
