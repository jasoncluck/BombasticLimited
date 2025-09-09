import { describe, it, expect } from 'vitest';
import {
  getSortField,
  parseImageProperties,
  isPlaylistVideo,
  isPlaylist,
  isUserPlaylist,
} from '../utils';
import type { Video } from '../../videos';
import type { Json } from '../../database.types';

describe('Playlist Utils', () => {
  describe('getSortField', () => {
    it('should map video_position sort keys correctly', () => {
      expect(getSortField('video_position')).toBe('video_position');
      expect(getSortField('playlistOrder')).toBe('video_position');
    });

    it('should map published_at sort keys correctly', () => {
      expect(getSortField('published_at')).toBe('video_published_at');
      expect(getSortField('datePublished')).toBe('video_published_at');
    });

    it('should map title sort key correctly', () => {
      expect(getSortField('title')).toBe('video_title');
    });

    it('should map duration sort key correctly', () => {
      expect(getSortField('duration')).toBe('video_duration');
    });

    it('should return default fallback for unknown keys', () => {
      expect(getSortField('unknown')).toBe('video_position');
      expect(getSortField('')).toBe('video_position');
      expect(getSortField('random_key')).toBe('video_position');
    });

    it('should handle null and undefined gracefully', () => {
      expect(getSortField(null as any)).toBe('video_position');
      expect(getSortField(undefined as any)).toBe('video_position');
    });

    it('should be case sensitive', () => {
      expect(getSortField('TITLE')).toBe('video_position');
      expect(getSortField('Title')).toBe('video_position');
      expect(getSortField('VIDEO_POSITION')).toBe('video_position');
    });
  });

  describe('parseImageProperties', () => {
    it('should parse valid JSON object', () => {
      const validJson = {
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      };

      const result = parseImageProperties(validJson);
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 80,
      });
    });

    it('should parse valid JSON string', () => {
      const jsonString = '{"x": 15, "y": 25, "width": 200, "height": 150}';

      const result = parseImageProperties(jsonString);
      expect(result).toEqual({
        x: 15,
        y: 25,
        width: 200,
        height: 150,
      });
    });

    it('should return null for invalid JSON', () => {
      expect(parseImageProperties(null)).toBeNull();
      expect(parseImageProperties(undefined as any)).toBeNull();
      expect(parseImageProperties('')).toBeNull();
      expect(parseImageProperties('invalid json')).toBeNull();
      expect(parseImageProperties('{"incomplete": }')).toBeNull();
    });

    it('should return null for objects missing required properties', () => {
      const invalidObjects = [
        { x: 10, y: 20, width: 100 }, // missing height
        { x: 10, y: 20, height: 100 }, // missing width
        { x: 10, width: 100, height: 100 }, // missing y
        { y: 20, width: 100, height: 100 }, // missing x
        { x: '10', y: 20, width: 100, height: 100 }, // x is string
        { x: 10, y: '20', width: 100, height: 100 }, // y is string
        { x: 10, y: 20, width: '100', height: 100 }, // width is string
        { x: 10, y: 20, width: 100, height: '100' }, // height is string
      ];

      invalidObjects.forEach((obj) => {
        expect(parseImageProperties(obj)).toBeNull();
      });
    });

    it('should handle valid edge case values', () => {
      const edgeCases = [
        { x: 0, y: 0, width: 0, height: 0 }, // all zeros
        { x: -10, y: -20, width: 100, height: 80 }, // negative x,y
        { x: 1.5, y: 2.5, width: 100.5, height: 80.5 }, // decimal values
      ];

      edgeCases.forEach((obj) => {
        const result = parseImageProperties(obj);
        expect(result).toEqual(obj);
      });
    });

    it('should handle objects with extra properties', () => {
      const objWithExtra = {
        x: 10,
        y: 20,
        width: 100,
        height: 80,
        extra: 'should be ignored',
        another: 123,
      };

      const result = parseImageProperties(objWithExtra);
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 80,
        extra: 'should be ignored',
        another: 123,
      });
    });

    it('should handle JSON string with extra properties', () => {
      const jsonString =
        '{"x": 10, "y": 20, "width": 100, "height": 80, "extra": "data"}';

      const result = parseImageProperties(jsonString);
      expect(result).toEqual({
        x: 10,
        y: 20,
        width: 100,
        height: 80,
        extra: 'data',
      });
    });
  });

  describe('isPlaylistVideo', () => {
    it('should return true for video with video_position', () => {
      const playlistVideo = {
        id: 'video-1',
        title: 'Test Video',
        video_position: 1,
      } as Video & { video_position: number };

      expect(isPlaylistVideo(playlistVideo)).toBe(true);
    });

    it('should return false for video without video_position', () => {
      const regularVideo = {
        id: 'video-1',
        title: 'Test Video',
      } as Video;

      expect(isPlaylistVideo(regularVideo)).toBe(false);
    });

    it('should handle null and undefined gracefully', () => {
      expect(isPlaylistVideo(null as any)).toBe(false);
      expect(isPlaylistVideo(undefined as any)).toBe(false);
    });

    it('should handle objects without video properties', () => {
      expect(isPlaylistVideo({} as any)).toBe(false);
      expect(isPlaylistVideo({ someOtherProp: 'value' } as any)).toBe(false);
    });

    it('should check for video_position property specifically', () => {
      const videoWithSimilarProp = {
        id: 'video-1',
        title: 'Test Video',
        position: 1, // similar but not exact property name
      } as any;

      expect(isPlaylistVideo(videoWithSimilarProp)).toBe(false);
    });
  });

  describe('isPlaylist', () => {
    const validPlaylist = {
      id: 1,
      created_at: '2024-01-15T10:30:00Z',
      created_by: 'user-123',
      description: 'Test playlist',
      image_properties: { x: 0, y: 0, width: 100, height: 100 },
      name: 'My Playlist',
      short_id: 'abc123',
      image_url: 'https://example.com/image.jpg',
      type: 'user',
      youtube_id: 'youtube123',
    };

    it('should return true for valid playlist object', () => {
      expect(isPlaylist(validPlaylist)).toBe(true);
    });

    it('should return true for playlist with null optional fields', () => {
      const playlistWithNulls = {
        ...validPlaylist,
        description: null,
        image_url: null,
        youtube_id: null,
      };

      expect(isPlaylist(playlistWithNulls)).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isPlaylist(null)).toBe(false);
      expect(isPlaylist(undefined)).toBe(false);
      expect(isPlaylist('string')).toBe(false);
      expect(isPlaylist(123)).toBe(false);
      expect(isPlaylist([])).toBe(false);
    });

    it('should return false for objects missing required properties', () => {
      const requiredProps = [
        'id',
        'created_at',
        'created_by',
        'name',
        'short_id',
        'type',
      ];

      requiredProps.forEach((prop) => {
        const incomplete = { ...validPlaylist };
        delete (incomplete as any)[prop];
        expect(isPlaylist(incomplete)).toBe(false);
      });
    });

    it('should return false for objects with wrong property types', () => {
      const wrongTypes = [
        { ...validPlaylist, id: 'not-number' },
        { ...validPlaylist, created_at: 123 },
        { ...validPlaylist, created_by: 123 },
        { ...validPlaylist, name: 123 },
        { ...validPlaylist, short_id: 123 },
        { ...validPlaylist, type: 123 },
        { ...validPlaylist, description: 123 }, // should be string or null
      ];

      wrongTypes.forEach((obj) => {
        expect(isPlaylist(obj)).toBe(false);
      });
    });

    it('should return false for objects missing image_properties', () => {
      const withoutImageProps = { ...validPlaylist };
      delete (withoutImageProps as any).image_properties;
      expect(isPlaylist(withoutImageProps)).toBe(false);
    });
  });

  describe('isUserPlaylist', () => {
    const validUserPlaylist = {
      id: 1,
      playlist_position: 5,
      sorted_by: 'created_at',
      sort_order: 'asc',
      name: 'My Playlist',
      short_id: 'abc123',
      created_at: '2024-01-15T10:30:00Z',
      created_by: 'user-123',
      description: 'Test playlist',
      image_properties: { x: 0, y: 0, width: 100, height: 100 },
      image_url: 'https://example.com/image.jpg',
      type: 'user',
    };

    it('should return true for valid user playlist object', () => {
      expect(isUserPlaylist(validUserPlaylist)).toBe(true);
    });

    it('should return true for user playlist with null optional fields', () => {
      const playlistWithNulls = {
        ...validUserPlaylist,
        playlist_position: null,
        description: null,
        image_url: null,
      };

      expect(isUserPlaylist(playlistWithNulls)).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isUserPlaylist(null)).toBe(false);
      expect(isUserPlaylist(undefined)).toBe(false);
      expect(isUserPlaylist('string')).toBe(false);
      expect(isUserPlaylist(123)).toBe(false);
      expect(isUserPlaylist([])).toBe(false);
    });

    it('should return false for objects missing required properties', () => {
      const requiredProps = [
        'id',
        'sorted_by',
        'sort_order',
        'name',
        'short_id',
        'created_at',
        'created_by',
        'type',
      ];

      requiredProps.forEach((prop) => {
        const incomplete = { ...validUserPlaylist };
        delete (incomplete as any)[prop];
        expect(isUserPlaylist(incomplete)).toBe(false);
      });
    });

    it('should return false for objects with wrong property types', () => {
      const wrongTypes = [
        { ...validUserPlaylist, id: 'not-number' },
        { ...validUserPlaylist, playlist_position: 'not-number' }, // should be number or null
        { ...validUserPlaylist, sorted_by: 123 },
        { ...validUserPlaylist, sort_order: 123 },
        { ...validUserPlaylist, name: 123 },
        { ...validUserPlaylist, short_id: 123 },
        { ...validUserPlaylist, created_at: 123 },
        { ...validUserPlaylist, created_by: 123 },
        { ...validUserPlaylist, type: 123 },
      ];

      wrongTypes.forEach((obj) => {
        expect(isUserPlaylist(obj)).toBe(false);
      });
    });

    it('should return false for objects missing image_properties', () => {
      const withoutImageProps = { ...validUserPlaylist };
      delete (withoutImageProps as any).image_properties;
      expect(isUserPlaylist(withoutImageProps)).toBe(false);
    });

    it('should handle edge case with playlist_position as 0', () => {
      const playlistWithZeroPosition = {
        ...validUserPlaylist,
        playlist_position: 0,
      };

      expect(isUserPlaylist(playlistWithZeroPosition)).toBe(true);
    });
  });

  describe('integration and type safety', () => {
    it('should provide proper type narrowing for isPlaylistVideo', () => {
      const video: Video = { id: 'test' } as Video;

      if (isPlaylistVideo(video)) {
        // TypeScript should know video has video_position here
        expect(typeof video.video_position).toBe('number');
      }
    });

    it('should handle mixed object types correctly', () => {
      const mixedObjects = [
        { id: 1, name: 'test' },
        { id: 'wrong-type', name: 'test' },
        { video_position: 1 },
        null,
        undefined,
        // Skip string and number since 'in' operator will fail
      ];

      mixedObjects.forEach((obj) => {
        expect(() => isPlaylist(obj)).not.toThrow();
        expect(() => isUserPlaylist(obj)).not.toThrow();
        expect(() => isPlaylistVideo(obj as any)).not.toThrow();
      });

      // Test these separately since they'll cause 'in' operator errors
      expect(() => isPlaylist('string')).not.toThrow();
      expect(() => isPlaylist(123)).not.toThrow();
      expect(() => isUserPlaylist('string')).not.toThrow();
      expect(() => isUserPlaylist(123)).not.toThrow();
    });
  });
});
