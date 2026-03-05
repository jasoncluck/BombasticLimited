import { describe, it, expect } from 'vitest';
import { playlistSchema, type PlaylistSchema } from '../playlist-schema';
import type { PlaylistType } from '$lib/supabase/playlists';

describe('playlistSchema', () => {
  describe('valid data', () => {
    it('should parse valid playlist data with minimal fields', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should parse valid playlist data with all fields', () => {
      const validData = {
        name: 'My Awesome Playlist',
        description: 'A great collection of videos',
        image_properties: { x: 10, y: 20, width: 100, height: 200 },
        id: 42,
        type: 'Public' as PlaylistType,
        isDeletingPlaylistImage: true,
        thumbnail_url: 'https://example.com/thumb.jpg',
      };

      const result = playlistSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should parse playlist with maximum length name and description', () => {
      const validData = {
        name: 'A'.repeat(50), // max length
        description: 'B'.repeat(250), // max length
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result).toEqual(validData);
    });

    it('should handle image_properties as JSON string', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: '{"x": 5, "y": 10, "width": 150, "height": 100}',
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.image_properties).toEqual({
        x: 5,
        y: 10,
        width: 150,
        height: 100,
      });
    });

    it('should default image_properties to null when not provided', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.image_properties).toBeNull();
    });

    it('should default thumbnail_url to null when not provided', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
      };

      const result = playlistSchema.parse(validData);
      expect(result.thumbnail_url).toBeNull();
    });
  });

  describe('name validation', () => {
    it('should reject empty name', () => {
      const invalidData = {
        name: '',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });

    it('should reject single character name', () => {
      const invalidData = {
        name: 'A',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });

    it('should reject name longer than 50 characters', () => {
      const invalidData = {
        name: 'A'.repeat(51), // too long
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });
  });

  describe('description validation', () => {
    it('should accept null description', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.description).toBeNull();
    });

    it('should accept empty string description', () => {
      const validData = {
        name: 'Test Playlist',
        description: '',
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.description).toBe('');
    });

    it('should reject description longer than 250 characters', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: 'A'.repeat(251), // too long
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });
  });

  describe('image_properties validation', () => {
    it('should accept valid image properties object', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: { x: 0, y: 0, width: 100, height: 100 },
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.image_properties).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
    });

    it('should accept negative coordinates', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: { x: -10, y: -5, width: 50, height: 75 },
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.image_properties).toEqual({
        x: -10,
        y: -5,
        width: 50,
        height: 75,
      });
    });

    it('should reject image properties with missing fields', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: null,
        image_properties: { x: 10, y: 20, width: 100 }, // missing height
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });

    it('should reject image properties with non-numeric values', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: null,
        image_properties: { x: '10', y: 20, width: 100, height: 50 }, // x is string
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });

    it('should reject invalid JSON string in image_properties', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: null,
        image_properties: '{"x": 10, "y": 20, width: 100}', // invalid JSON syntax
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });

    it('should reject array in image_properties', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: null,
        image_properties: [1, 2, 3, 4],
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });

    it('should reject number in image_properties', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: null,
        image_properties: 42,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });
  });

  describe('type validation', () => {
    it('should accept Private type', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.type).toBe('Private');
    });

    it('should accept Public type', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Public' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.type).toBe('Public');
    });

    it('should reject invalid type', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Invalid' as any,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });
  });

  describe('id validation', () => {
    it('should accept positive integer id', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 42,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.id).toBe(42);
    });

    it('should accept zero as id', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 0,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.id).toBe(0);
    });

    it('should reject string id', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: '42' as any,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });
  });

  describe('boolean field validation', () => {
    it('should accept true for isDeletingPlaylistImage', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: true,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.isDeletingPlaylistImage).toBe(true);
    });

    it('should accept false for isDeletingPlaylistImage', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.isDeletingPlaylistImage).toBe(false);
    });

    it('should reject string for isDeletingPlaylistImage', () => {
      const invalidData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: 'true' as any,
        thumbnail_url: null,
      };

      expect(() => playlistSchema.parse(invalidData)).toThrow();
    });
  });

  describe('thumbnail_url validation', () => {
    it('should accept valid URL string', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: 'https://example.com/image.jpg',
      };

      const result = playlistSchema.parse(validData);
      expect(result.thumbnail_url).toBe('https://example.com/image.jpg');
    });

    it('should accept null thumbnail_url', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      const result = playlistSchema.parse(validData);
      expect(result.thumbnail_url).toBeNull();
    });

    it('should accept empty string thumbnail_url', () => {
      const validData = {
        name: 'Test Playlist',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private' as PlaylistType,
        isDeletingPlaylistImage: false,
        thumbnail_url: '',
      };

      const result = playlistSchema.parse(validData);
      expect(result.thumbnail_url).toBe('');
    });
  });

  describe('type inference', () => {
    it('should infer correct TypeScript type', () => {
      const data: PlaylistSchema = {
        name: 'Test',
        description: null,
        image_properties: null,
        id: 1,
        type: 'Private',
        isDeletingPlaylistImage: false,
        thumbnail_url: null,
      };

      // This should compile without errors, testing type inference
      expect(typeof data.name).toBe('string');
      expect(typeof data.id).toBe('number');
      expect(typeof data.isDeletingPlaylistImage).toBe('boolean');
    });
  });
});
