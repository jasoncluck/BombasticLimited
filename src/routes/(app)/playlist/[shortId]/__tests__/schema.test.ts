import { describe, it, expect } from 'vitest';
import {
  playlistSchema,
  type PlaylistSchema,
} from '$lib/schema/playlist-schema';

describe('playlist schema validation', () => {
  describe('name validation', () => {
    it('should accept valid playlist names', () => {
      const validData = {
        name: 'My Playlist',
        description: 'A test playlist',
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject names that are too short', () => {
      const invalidData = {
        name: 'A',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['name']);
        expect(result.error.issues[0].code).toBe('too_small');
      }
    });

    it('should reject names that are too long', () => {
      const invalidData = {
        name: 'A'.repeat(51),
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['name']);
        expect(result.error.issues[0].code).toBe('too_big');
      }
    });
  });

  describe('description validation', () => {
    it('should accept null description', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should accept valid description', () => {
      const validData = {
        name: 'My Playlist',
        description: 'This is a test playlist description',
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject descriptions that are too long', () => {
      const invalidData = {
        name: 'My Playlist',
        description: 'A'.repeat(251), // Updated to 251 to match max(250)
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['description']);
        expect(result.error.issues[0].code).toBe('too_big');
      }
    });
  });

  describe('type validation', () => {
    it('should accept Public type', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Public' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('Public');
      }
    });

    it('should accept Private type', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('Private');
      }
    });

    it('should require type field when not provided', () => {
      const dataWithoutType = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(dataWithoutType);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['type']);
        expect(result.error.issues[0].code).toBe('invalid_type');
      }
    });

    it('should reject invalid type', () => {
      const invalidData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Invalid' as any,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['type']);
        expect(result.error.issues[0].code).toBe('invalid_enum_value');
      }
    });
  });

  describe('image_properties validation', () => {
    it('should accept null image_properties', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.image_properties).toBe(null);
      }
    });

    it('should accept valid image_properties object', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: {
          x: 10,
          y: 10,
          height: 200,
          width: 200,
        },
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.image_properties).toEqual({
          x: 10,
          y: 10,
          height: 200,
          width: 200,
        });
      }
    });

    it('should parse and validate JSON string image_properties', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: '{"x":10,"y":10,"height":200,"width":200}',
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.image_properties).toEqual({
          x: 10,
          y: 10,
          height: 200,
          width: 200,
        });
      }
    });

    it('should reject invalid JSON string in image_properties', () => {
      const invalidData = {
        name: 'My Playlist',
        description: null,
        image_properties: '{"invalid":"json"',
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['image_properties']);
        expect(result.error.issues[0].message).toContain('Invalid JSON string');
      }
    });

    it('should reject invalid image_properties structure', () => {
      const invalidData = {
        name: 'My Playlist',
        description: null,
        image_properties: {
          x: 10,
          y: 10,
          // missing height and width
        },
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['image_properties']);
        expect(result.error.issues[0].message).toContain(
          'Invalid image properties'
        );
      }
    });
  });

  describe('isDeletingPlaylistImage validation', () => {
    it('should require isDeletingPlaylistImage field when not provided', () => {
      const dataWithoutFlag = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as const,
      };

      const result = playlistSchema.safeParse(dataWithoutFlag);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual([
          'isDeletingPlaylistImage',
        ]);
        expect(result.error.issues[0].code).toBe('invalid_type');
      }
    });

    it('should accept boolean false', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isDeletingPlaylistImage).toBe(false);
      }
    });

    it('should accept boolean true', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as const,
        isDeletingPlaylistImage: true,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isDeletingPlaylistImage).toBe(true);
      }
    });
  });

  describe('id validation', () => {
    it('should accept positive integer id', () => {
      const validData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 123,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject non-numeric id', () => {
      const invalidData = {
        name: 'My Playlist',
        description: null,
        image_properties: null,
        id: 'not-a-number' as any,
        type: 'Private' as const,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['id']);
        expect(result.error.issues[0].code).toBe('invalid_type');
      }
    });
  });

  describe('complete schema validation', () => {
    it('should validate complete valid playlist data', () => {
      const completeValidData: PlaylistSchema = {
        name: 'My Complete Playlist',
        description: 'This is a complete test playlist description',
        image_properties: {
          x: 70,
          y: 0,
          height: 180,
          width: 180,
        },
        thumbnail_url: null,
        id: 456,
        type: 'Public',
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.safeParse(completeValidData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(completeValidData);
      }
    });

    it('should reject data missing required fields', () => {
      const incompleteData = {
        name: 'My Playlist',
        // missing other required fields
      };

      const result = playlistSchema.safeParse(incompleteData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });
  });
});
