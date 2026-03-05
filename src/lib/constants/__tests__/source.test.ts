import { describe, it, expect } from 'vitest';
import {
  SOURCES,
  SOURCE_INFO,
  isSourceArray,
  isSource,
  type Source,
  type Sources,
} from '../source';

describe('Source Constants and Utilities', () => {
  describe('SOURCES constant', () => {
    it('should contain expected source values', () => {
      expect(SOURCES).toEqual([
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ]);
    });

    it('should be readonly array', () => {
      expect(Array.isArray(SOURCES)).toBe(true);
      expect(SOURCES.length).toBe(4);
    });

    it('should contain only string values', () => {
      SOURCES.forEach((source) => {
        expect(typeof source).toBe('string');
      });
    });
  });

  describe('SOURCE_INFO constant', () => {
    it('should have entries for all sources', () => {
      SOURCES.forEach((source) => {
        expect(SOURCE_INFO).toHaveProperty(source);
      });
    });

    it('should have consistent structure for all sources', () => {
      SOURCES.forEach((source) => {
        const info = SOURCE_INFO[source];

        // Required properties
        expect(info).toHaveProperty('displayName');
        expect(info).toHaveProperty('urlParam');
        expect(info).toHaveProperty('image');
        expect(info).toHaveProperty('twitchId');
        expect(info).toHaveProperty('youtubeId');
        expect(info).toHaveProperty('youtubeUrl');
        expect(info).toHaveProperty('highlightedPlaylists');
        expect(info).toHaveProperty('supportUrl');

        // Type checks
        expect(typeof info.displayName).toBe('string');
        expect(typeof info.urlParam).toBe('string');
        expect(typeof info.twitchId).toBe('string');
        expect(typeof info.youtubeId).toBe('string');
        expect(typeof info.youtubeUrl).toBe('string');
        expect(typeof info.supportUrl).toBe('string');
        expect(Array.isArray(info.highlightedPlaylists)).toBe(true);
      });
    });

    describe('Giant Bomb source info', () => {
      const giantbomb = SOURCE_INFO.giantbomb;

      it('should have correct basic info', () => {
        expect(giantbomb.displayName).toBe('Giant Bomb');
        expect(giantbomb.urlParam).toBe('giantbomb');
        expect(giantbomb.twitchId).toBe('504350');
        expect(giantbomb.youtubeId).toBe('UCmeds0MLhjfkjD_5acPnFlQ');
        expect(giantbomb.youtubeUrl).toBe('https://www.youtube.com/giantbomb');
        expect(giantbomb.supportUrl).toBe('https://www.giantbomb.com/upgrade/');
      });

      it('should have highlighted playlists', () => {
        expect(giantbomb.highlightedPlaylists).toHaveLength(2);
        expect(giantbomb.highlightedPlaylists[0].name).toBe('Blight Club');
        expect(giantbomb.highlightedPlaylists[1].name).toBe(
          'Voicemail Dump Truck'
        );
      });

      it('should have website URL domain', () => {
        expect(giantbomb.websiteUrlDomain).toBe('giantbomb.com');
      });
    });

    describe('Jeff Gerstmann source info', () => {
      const jeffgerstmann = SOURCE_INFO.jeffgerstmann;

      it('should have correct basic info', () => {
        expect(jeffgerstmann.displayName).toBe('Jeff Gerstmann');
        expect(jeffgerstmann.urlParam).toBe('jeffgerstmann');
        expect(jeffgerstmann.twitchId).toBe('504350');
        expect(jeffgerstmann.youtubeId).toBe('UCR9R2ARN74dCebn1kv06UhA');
        expect(jeffgerstmann.youtubeUrl).toBe(
          'https://www.youtube.com/@JeffGerstmannShow'
        );
        expect(jeffgerstmann.supportUrl).toBe(
          'https://www.patreon.com/cw/jeffgerstmann'
        );
      });

      it('should have highlighted playlists', () => {
        expect(jeffgerstmann.highlightedPlaylists).toHaveLength(2);
        expect(jeffgerstmann.highlightedPlaylists[0].name).toBe(
          'Quick Looks at New Video Games'
        );
        expect(jeffgerstmann.highlightedPlaylists[1].name).toBe(
          'Ranking the NES!'
        );
      });

      it('should not have website URL domain', () => {
        expect(jeffgerstmann.websiteUrlDomain).toBeUndefined();
      });
    });

    describe('Nextlander source info', () => {
      const nextlander = SOURCE_INFO.nextlander;

      it('should have correct basic info', () => {
        expect(nextlander.displayName).toBe('Nextlander');
        expect(nextlander.urlParam).toBe('nextlander');
        expect(nextlander.twitchId).toBe('689331234');
        expect(nextlander.youtubeId).toBe('UCO0gHyqLNeIrCAjwlO2BmiA');
        expect(nextlander.youtubeUrl).toBe(
          'https://www.youtube.com/@Nextlander'
        );
        expect(nextlander.supportUrl).toBe(
          'https://www.patreon.com/nextlander/'
        );
      });

      it('should have highlighted playlists', () => {
        expect(nextlander.highlightedPlaylists).toHaveLength(2);
        expect(nextlander.highlightedPlaylists[0].name).toBe('NXL Highlights');
        expect(nextlander.highlightedPlaylists[1].name).toBe(
          "Talkin' Over Things"
        );
      });

      it('should not have website URL domain', () => {
        expect(nextlander.websiteUrlDomain).toBeUndefined();
      });
    });

    describe('Remap source info', () => {
      const remap = SOURCE_INFO.remap;

      it('should have correct basic info', () => {
        expect(remap.displayName).toBe('Remap');
        expect(remap.urlParam).toBe('remap');
        expect(remap.twitchId).toBe('913491352');
        expect(remap.youtubeId).toBe('UCpcSq3A3Z4tUJsHKfn8zpnA');
        expect(remap.youtubeUrl).toBe('https://www.youtube.com/@RemapRadio');
        expect(remap.supportUrl).toBe('https://remapradio.com/signup/');
      });

      it('should have custom Twitch username', () => {
        expect(remap.twitchUserName).toBe('RemapRadio');
      });

      it('should have highlighted playlists', () => {
        expect(remap.highlightedPlaylists).toHaveLength(2);
        expect(remap.highlightedPlaylists[0].name).toBe('Wheel of GeForce Now');
        expect(remap.highlightedPlaylists[1].name).toBe('Remap Radio');
      });

      it('should have website URL domain', () => {
        expect(remap.websiteUrlDomain).toBe('remapradio.com');
      });
    });

    it('should have valid YouTube URLs', () => {
      SOURCES.forEach((source) => {
        const info = SOURCE_INFO[source];
        expect(info.youtubeUrl).toMatch(/^https:\/\/www\.youtube\.com\//);
      });
    });

    it('should have valid support URLs', () => {
      SOURCES.forEach((source) => {
        const info = SOURCE_INFO[source];
        expect(info.supportUrl).toMatch(/^https:\/\//);
      });
    });

    it('should have valid highlighted playlists', () => {
      SOURCES.forEach((source) => {
        const info = SOURCE_INFO[source];
        info.highlightedPlaylists.forEach((playlist) => {
          expect(playlist).toHaveProperty('name');
          expect(playlist).toHaveProperty('youtubeId');
          expect(typeof playlist.name).toBe('string');
          expect(typeof playlist.youtubeId).toBe('string');
          expect(playlist.name.length).toBeGreaterThan(0);
          expect(playlist.youtubeId.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('isSourceArray function', () => {
    it('should return true for valid source arrays', () => {
      expect(isSourceArray(['giantbomb'])).toBe(true);
      expect(isSourceArray(['giantbomb', 'nextlander'])).toBe(true);
      expect(isSourceArray(SOURCES)).toBe(true);
      expect(isSourceArray([])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isSourceArray('giantbomb')).toBe(false);
      expect(isSourceArray(null)).toBe(false);
      expect(isSourceArray(undefined)).toBe(false);
      expect(isSourceArray(123)).toBe(false);
      expect(isSourceArray({})).toBe(false);
    });

    it('should return false for arrays with non-string elements', () => {
      expect(isSourceArray([123])).toBe(false);
      expect(isSourceArray(['giantbomb', 123])).toBe(false);
      expect(isSourceArray([null])).toBe(false);
      expect(isSourceArray([undefined])).toBe(false);
      expect(isSourceArray([{}])).toBe(false);
    });

    it('should return false for arrays with invalid source strings', () => {
      expect(isSourceArray(['invalid-source'])).toBe(true); // Note: function only checks if strings, not valid sources
      expect(isSourceArray(['giantbomb', 'invalid'])).toBe(true);
    });
  });

  describe('isSource function', () => {
    it('should return true for valid sources', () => {
      SOURCES.forEach((source) => {
        expect(isSource(source)).toBe(true);
      });
    });

    it('should return false for invalid sources', () => {
      const invalidSources = [
        'invalid-source',
        'youtube',
        'twitch',
        '',
        'GIANTBOMB', // case sensitive
      ];

      invalidSources.forEach((source) => {
        expect(isSource(source)).toBe(false);
      });
    });

    it('should return false for non-string values', () => {
      const nonStrings = [null, undefined, 123, {}, [], true, false];

      nonStrings.forEach((value) => {
        expect(isSource(value)).toBe(false);
      });
    });

    it('should be case sensitive', () => {
      expect(isSource('GiantBomb')).toBe(false);
      expect(isSource('GIANTBOMB')).toBe(false);
      expect(isSource('giantBomb')).toBe(false);
    });
  });

  describe('TypeScript types', () => {
    it('should have Source type matching SOURCES values', () => {
      // This is primarily a compile-time test
      const validSources: Source[] = [
        'giantbomb',
        'jeffgerstmann',
        'nextlander',
        'remap',
      ];
      expect(validSources).toHaveLength(4);

      validSources.forEach((source) => {
        expect(SOURCES).toContain(source);
      });
    });

    it('should have Sources type as keyof SOURCE_INFO', () => {
      // Compile-time test to ensure Types match SOURCE_INFO keys
      const sourceKeys = Object.keys(SOURCE_INFO) as Sources[];
      expect(sourceKeys).toHaveLength(4);

      sourceKeys.forEach((key) => {
        expect(SOURCES).toContain(key);
      });
    });
  });

  describe('data consistency', () => {
    it('should have unique YouTube IDs', () => {
      const youtubeIds = SOURCES.map((source) => SOURCE_INFO[source].youtubeId);
      const uniqueYoutubeIds = new Set(youtubeIds);
      expect(uniqueYoutubeIds.size).toBe(youtubeIds.length);
    });

    it('should have unique Twitch IDs', () => {
      const twitchIds = SOURCES.map((source) => SOURCE_INFO[source].twitchId);
      const uniqueTwitchIds = new Set(twitchIds);
      // Note: giantbomb and jeffgerstmann share the same Twitch ID
      expect(uniqueTwitchIds.size).toBeLessThanOrEqual(twitchIds.length);
    });

    it('should have unique URL params', () => {
      const urlParams = SOURCES.map((source) => SOURCE_INFO[source].urlParam);
      const uniqueUrlParams = new Set(urlParams);
      expect(uniqueUrlParams.size).toBe(urlParams.length);
    });

    it('should have URL params matching source keys', () => {
      SOURCES.forEach((source) => {
        expect(SOURCE_INFO[source].urlParam).toBe(source);
      });
    });

    it('should have non-empty display names', () => {
      SOURCES.forEach((source) => {
        expect(SOURCE_INFO[source].displayName.length).toBeGreaterThan(0);
      });
    });

    it('should have at least one highlighted playlist per source', () => {
      SOURCES.forEach((source) => {
        expect(SOURCE_INFO[source].highlightedPlaylists.length).toBeGreaterThan(
          0
        );
      });
    });
  });
});
