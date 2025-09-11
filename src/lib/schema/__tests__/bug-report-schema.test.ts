import { describe, it, expect } from 'vitest';
import { bugReportSchema, type BugReportSchema } from '../bug-report-schema';

describe('bugReportSchema', () => {
  describe('valid data', () => {
    it('should parse valid bug report with minimal fields', () => {
      const validData = {
        title: 'Bug Title',
        description: 'Bug description here',
      };

      const result = bugReportSchema.parse(validData);
      expect(result).toEqual({
        title: 'Bug Title',
        description: 'Bug description here',
        steps_to_reproduce: undefined,
        images: undefined,
      });
    });

    it('should parse valid bug report with all fields', () => {
      const validData = {
        title: 'Complex Bug Report',
        description: 'This is a detailed description of the bug',
        steps_to_reproduce:
          'Step 1: Do this\nStep 2: Do that\nStep 3: Bug appears',
        images: [
          'https://example.com/image1.jpg',
          'https://example.com/image2.png',
          'https://example.com/image3.gif',
        ],
      };

      const result = bugReportSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should parse bug report with maximum length strings', () => {
      const validData = {
        title: 'A'.repeat(200), // max length
        description: 'B'.repeat(2000), // max length
        steps_to_reproduce: 'C'.repeat(1000), // max length
        images: ['https://example.com/image.jpg'],
      };

      const result = bugReportSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should parse bug report with empty optional fields', () => {
      const validData = {
        title: 'Bug Report',
        description: 'Description',
        steps_to_reproduce: '',
        images: [],
      };

      const result = bugReportSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should handle single image in array', () => {
      const validData = {
        title: 'Bug with Image',
        description: 'Bug has an image',
        images: ['https://example.com/screenshot.png'],
      };

      const result = bugReportSchema.parse(validData);
      expect(result.images).toEqual(['https://example.com/screenshot.png']);
    });

    it('should handle maximum number of images (3)', () => {
      const validData = {
        title: 'Bug with Multiple Images',
        description: 'Bug has multiple images',
        images: [
          'https://example.com/img1.jpg',
          'https://example.com/img2.jpg',
          'https://example.com/img3.jpg',
        ],
      };

      const result = bugReportSchema.parse(validData);
      expect(result.images?.length).toBe(3);
    });
  });

  describe('title validation', () => {
    it('should reject empty title', () => {
      const invalidData = {
        title: '',
        description: 'Valid description',
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should accept whitespace-only title (not trimmed)', () => {
      const validData = {
        title: '   ',
        description: 'Valid description',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.title).toBe('   ');
    });

    it('should reject title longer than 200 characters', () => {
      const invalidData = {
        title: 'A'.repeat(201), // too long
        description: 'Valid description',
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should accept title with exactly 200 characters', () => {
      const validData = {
        title: 'A'.repeat(200),
        description: 'Valid description',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.title).toBe('A'.repeat(200));
    });

    it('should accept single character title', () => {
      const validData = {
        title: 'A',
        description: 'Valid description',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.title).toBe('A');
    });

    it('should reject missing title', () => {
      const invalidData = {
        description: 'Valid description',
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });
  });

  describe('description validation', () => {
    it('should reject empty description', () => {
      const invalidData = {
        title: 'Valid title',
        description: '',
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should accept whitespace-only description (not trimmed)', () => {
      const validData = {
        title: 'Valid title',
        description: '   ',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.description).toBe('   ');
    });

    it('should reject description longer than 2000 characters', () => {
      const invalidData = {
        title: 'Valid title',
        description: 'A'.repeat(2001), // too long
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should accept description with exactly 2000 characters', () => {
      const validData = {
        title: 'Valid title',
        description: 'A'.repeat(2000),
      };

      const result = bugReportSchema.parse(validData);
      expect(result.description).toBe('A'.repeat(2000));
    });

    it('should accept single character description', () => {
      const validData = {
        title: 'Valid title',
        description: 'A',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.description).toBe('A');
    });

    it('should reject missing description', () => {
      const invalidData = {
        title: 'Valid title',
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should accept description with newlines and special characters', () => {
      const validData = {
        title: 'Valid title',
        description: 'Line 1\nLine 2\n\nSpecial chars: !@#$%^&*()_+{}|:"<>?',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.description).toContain('Line 1');
      expect(result.description).toContain('Special chars');
    });
  });

  describe('steps_to_reproduce validation', () => {
    it('should accept undefined steps_to_reproduce', () => {
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.steps_to_reproduce).toBeUndefined();
    });

    it('should accept empty string steps_to_reproduce', () => {
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
        steps_to_reproduce: '',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.steps_to_reproduce).toBe('');
    });

    it('should accept steps_to_reproduce with maximum length (1000 chars)', () => {
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
        steps_to_reproduce: 'A'.repeat(1000),
      };

      const result = bugReportSchema.parse(validData);
      expect(result.steps_to_reproduce).toBe('A'.repeat(1000));
    });

    it('should reject steps_to_reproduce longer than 1000 characters', () => {
      const invalidData = {
        title: 'Valid title',
        description: 'Valid description',
        steps_to_reproduce: 'A'.repeat(1001), // too long
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should accept steps_to_reproduce with formatting', () => {
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
        steps_to_reproduce: '1. First step\n2. Second step\n3. Third step',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.steps_to_reproduce).toContain('1. First step');
    });
  });

  describe('images validation', () => {
    it('should accept undefined images', () => {
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.images).toBeUndefined();
    });

    it('should accept empty images array', () => {
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
        images: [],
      };

      const result = bugReportSchema.parse(validData);
      expect(result.images).toEqual([]);
    });

    it('should accept valid URL images', () => {
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
        images: [
          'https://example.com/image.jpg',
          'http://example.com/image.png',
          'https://sub.domain.com/path/to/image.gif',
        ],
      };

      const result = bugReportSchema.parse(validData);
      expect(result.images).toHaveLength(3);
    });

    it('should reject invalid URL format in images', () => {
      const invalidData = {
        title: 'Valid title',
        description: 'Valid description',
        images: ['not-a-url', 'https://example.com/valid.jpg'],
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should reject relative URLs in images', () => {
      const invalidData = {
        title: 'Valid title',
        description: 'Valid description',
        images: ['/relative/path/image.jpg'],
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should reject more than 3 images', () => {
      const invalidData = {
        title: 'Valid title',
        description: 'Valid description',
        images: [
          'https://example.com/img1.jpg',
          'https://example.com/img2.jpg',
          'https://example.com/img3.jpg',
          'https://example.com/img4.jpg', // too many
        ],
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should reject non-string values in images array', () => {
      const invalidData = {
        title: 'Valid title',
        description: 'Valid description',
        images: ['https://example.com/image.jpg', null as any],
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should reject non-array value for images', () => {
      const invalidData = {
        title: 'Valid title',
        description: 'Valid description',
        images: 'https://example.com/image.jpg' as any,
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should accept various valid URL schemes', () => {
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
        images: [
          'https://example.com/image.jpg',
          'http://example.com/image.png',
          'ftp://example.com/image.gif',
        ],
      };

      const result = bugReportSchema.parse(validData);
      expect(result.images).toHaveLength(3);
    });
  });

  describe('comprehensive edge cases', () => {
    it('should handle unicode characters in text fields', () => {
      const validData = {
        title: 'Bug 报告 🐛',
        description: 'This is a bug with unicode: 测试 emoji 🚨',
        steps_to_reproduce: 'Step 1: 点击 button 🔘',
      };

      const result = bugReportSchema.parse(validData);
      expect(result.title).toContain('🐛');
      expect(result.description).toContain('🚨');
      expect(result.steps_to_reproduce).toContain('🔘');
    });

    it('should handle very long URLs in images', () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(1000) + '.jpg';
      const validData = {
        title: 'Valid title',
        description: 'Valid description',
        images: [longUrl],
      };

      const result = bugReportSchema.parse(validData);
      expect(result.images?.[0]).toBe(longUrl);
    });

    it('should trim validation work on actual form data structure', () => {
      // Test with nested object that might come from form data
      const formData = {
        title: 'Form Bug',
        description: 'This came from a form',
        steps_to_reproduce: 'Fill out form',
        images: ['https://example.com/form-bug.png'],
      };

      const result = bugReportSchema.parse(formData);
      expect(result).toEqual(formData);
    });

    it('should handle null values gracefully', () => {
      const invalidData = {
        title: null as any,
        description: 'Valid description',
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });

    it('should handle undefined values for required fields', () => {
      const invalidData = {
        title: undefined as any,
        description: 'Valid description',
      };

      expect(() => bugReportSchema.parse(invalidData)).toThrow();
    });
  });

  describe('type inference', () => {
    it('should infer correct TypeScript type', () => {
      const data: BugReportSchema = {
        title: 'Test',
        description: 'Description',
        steps_to_reproduce: 'Steps',
        images: ['https://example.com/image.jpg'],
      };

      // This should compile without errors, testing type inference
      expect(typeof data.title).toBe('string');
      expect(typeof data.description).toBe('string');
      expect(data.steps_to_reproduce).toBeDefined();
      expect(Array.isArray(data.images)).toBe(true);
    });

    it('should allow optional fields to be undefined in type', () => {
      const data: BugReportSchema = {
        title: 'Test',
        description: 'Description',
        // steps_to_reproduce and images are optional
      };

      expect(data.steps_to_reproduce).toBeUndefined();
      expect(data.images).toBeUndefined();
    });
  });
});
