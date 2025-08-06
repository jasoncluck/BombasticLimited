import { describe, it, expect } from 'vitest';
import { activeStreams } from '../streaming.svelte.js';
import type { Source } from '$lib/constants/source.js';

// Mock the Source type constants
const mockSources: Source[] = [
  'giantbomb',
  'jeffgerstmann',
  'nextlander',
  'remap',
];

describe('Streaming State', () => {
  describe('initialization', () => {
    it('should initialize with empty sources array', () => {
      expect(activeStreams.sources).toEqual([]);
      expect(Array.isArray(activeStreams.sources)).toBe(true);
    });

    it('should have correct structure', () => {
      expect(typeof activeStreams).toBe('object');
      expect(activeStreams).toHaveProperty('sources');

      // Verify there are no unexpected properties
      const keys = Object.keys(activeStreams);
      expect(keys).toHaveLength(1);
      expect(keys).toContain('sources');
    });
  });

  describe('state mutations', () => {
    beforeEach(() => {
      // Reset state before each test
      activeStreams.sources = [];
    });

    it('should allow adding sources to the array', () => {
      activeStreams.sources.push('giantbomb');
      expect(activeStreams.sources).toEqual(['giantbomb']);
      expect(activeStreams.sources.length).toBe(1);
    });

    it('should allow adding multiple sources', () => {
      activeStreams.sources.push('giantbomb', 'nextlander');
      expect(activeStreams.sources).toEqual(['giantbomb', 'nextlander']);
      expect(activeStreams.sources.length).toBe(2);
    });

    it('should allow removing sources from the array', () => {
      activeStreams.sources = ['giantbomb', 'nextlander', 'remap'];

      // Remove middle element
      activeStreams.sources.splice(1, 1);
      expect(activeStreams.sources).toEqual(['giantbomb', 'remap']);
    });

    it('should allow replacing entire sources array', () => {
      activeStreams.sources = ['giantbomb', 'nextlander'];
      expect(activeStreams.sources).toEqual(['giantbomb', 'nextlander']);

      activeStreams.sources = ['remap', 'jeffgerstmann'];
      expect(activeStreams.sources).toEqual(['remap', 'jeffgerstmann']);
    });

    it('should allow clearing all sources', () => {
      activeStreams.sources = ['giantbomb', 'nextlander', 'remap'];
      expect(activeStreams.sources.length).toBe(3);

      activeStreams.sources = [];
      expect(activeStreams.sources).toEqual([]);
      expect(activeStreams.sources.length).toBe(0);
    });
  });

  describe('array operations', () => {
    beforeEach(() => {
      activeStreams.sources = [];
    });

    it('should support standard array methods', () => {
      // Test push
      activeStreams.sources.push('giantbomb');
      expect(activeStreams.sources.includes('giantbomb')).toBe(true);

      // Test pop
      const popped = activeStreams.sources.pop();
      expect(popped).toBe('giantbomb');
      expect(activeStreams.sources.length).toBe(0);

      // Test unshift
      activeStreams.sources.unshift('nextlander');
      expect(activeStreams.sources[0]).toBe('nextlander');

      // Test shift
      const shifted = activeStreams.sources.shift();
      expect(shifted).toBe('nextlander');
      expect(activeStreams.sources.length).toBe(0);
    });

    it('should support filtering sources', () => {
      activeStreams.sources = ['giantbomb', 'nextlander', 'remap'];

      const filtered = activeStreams.sources.filter(
        (source) => source !== 'nextlander'
      );
      expect(filtered).toEqual(['giantbomb', 'remap']);

      // Original array should remain unchanged until reassigned
      expect(activeStreams.sources).toEqual([
        'giantbomb',
        'nextlander',
        'remap',
      ]);

      // Reassign filtered result
      activeStreams.sources = filtered;
      expect(activeStreams.sources).toEqual(['giantbomb', 'remap']);
    });

    it('should support mapping over sources', () => {
      activeStreams.sources = ['giantbomb', 'nextlander'];

      const mapped = activeStreams.sources.map((source) =>
        source.toUpperCase()
      );
      expect(mapped).toEqual(['GIANTBOMB', 'NEXTLANDER']);
    });

    it('should support finding sources', () => {
      activeStreams.sources = ['giantbomb', 'nextlander', 'remap'];

      const found = activeStreams.sources.find(
        (source) => source === 'nextlander'
      );
      expect(found).toBe('nextlander');

      const notFound = activeStreams.sources.find(
        (source) => source === ('nonexistent' as any)
      );
      expect(notFound).toBeUndefined();
    });

    it('should support checking if source exists', () => {
      activeStreams.sources = ['giantbomb', 'nextlander'];

      expect(activeStreams.sources.includes('giantbomb')).toBe(true);
      expect(activeStreams.sources.includes('remap')).toBe(false);
    });
  });

  describe('duplicate handling', () => {
    beforeEach(() => {
      activeStreams.sources = [];
    });

    it('should allow duplicate sources if not prevented', () => {
      activeStreams.sources.push('giantbomb');
      activeStreams.sources.push('giantbomb');

      expect(activeStreams.sources).toEqual(['giantbomb', 'giantbomb']);
      expect(activeStreams.sources.length).toBe(2);
    });

    it('should be able to remove duplicates manually', () => {
      activeStreams.sources = ['giantbomb', 'nextlander', 'giantbomb', 'remap'];

      // Remove duplicates using Set
      activeStreams.sources = [...new Set(activeStreams.sources)];

      expect(activeStreams.sources).toEqual([
        'giantbomb',
        'nextlander',
        'remap',
      ]);
      expect(activeStreams.sources.length).toBe(3);
    });

    it('should handle adding unique sources only', () => {
      activeStreams.sources = ['giantbomb', 'nextlander'];

      // Helper function to add unique source
      const addUniqueSource = (source: Source) => {
        if (!activeStreams.sources.includes(source)) {
          activeStreams.sources.push(source);
        }
      };

      addUniqueSource('remap'); // Should be added
      addUniqueSource('giantbomb'); // Should not be added (already exists)

      expect(activeStreams.sources).toEqual([
        'giantbomb',
        'nextlander',
        'remap',
      ]);
      expect(activeStreams.sources.length).toBe(3);
    });
  });

  describe('state persistence', () => {
    beforeEach(() => {
      activeStreams.sources = [];
    });

    it('should maintain state across multiple reads', () => {
      activeStreams.sources = ['giantbomb', 'nextlander'];

      // Read multiple times to ensure consistency
      for (let i = 0; i < 5; i++) {
        expect(activeStreams.sources).toEqual(['giantbomb', 'nextlander']);
        expect(activeStreams.sources.length).toBe(2);
      }
    });

    it('should handle rapid state changes', () => {
      const testCases = [
        ['giantbomb'],
        ['giantbomb', 'nextlander'],
        ['remap'],
        ['jeffgerstmann', 'nextlander', 'remap'],
        [],
      ];

      testCases.forEach((sources) => {
        activeStreams.sources = sources as Source[];
        expect(activeStreams.sources).toEqual(sources);
      });
    });

    it('should maintain array reference integrity', () => {
      const originalRef = activeStreams.sources;
      activeStreams.sources.push('giantbomb');

      // The reference should be the same when modifying in place
      expect(activeStreams.sources).toBe(originalRef);

      // But not when reassigning
      activeStreams.sources = ['nextlander'];
      expect(activeStreams.sources).not.toBe(originalRef);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      activeStreams.sources = [];
    });

    it('should handle empty operations gracefully', () => {
      // Pop from empty array
      const popped = activeStreams.sources.pop();
      expect(popped).toBeUndefined();
      expect(activeStreams.sources.length).toBe(0);

      // Shift from empty array
      const shifted = activeStreams.sources.shift();
      expect(shifted).toBeUndefined();
      expect(activeStreams.sources.length).toBe(0);
    });

    it('should handle large arrays', () => {
      const largeSources: Source[] = [];
      for (let i = 0; i < 100; i++) {
        largeSources.push(mockSources[i % mockSources.length]);
      }

      activeStreams.sources = largeSources;
      expect(activeStreams.sources.length).toBe(100);

      // Clear
      activeStreams.sources = [];
      expect(activeStreams.sources.length).toBe(0);
    });

    it('should handle mixed operations correctly', () => {
      activeStreams.sources.push('giantbomb');
      expect(activeStreams.sources.length).toBe(1);

      activeStreams.sources.unshift('nextlander');
      expect(activeStreams.sources).toEqual(['nextlander', 'giantbomb']);

      activeStreams.sources.splice(1, 0, 'remap');
      expect(activeStreams.sources).toEqual([
        'nextlander',
        'remap',
        'giantbomb',
      ]);

      activeStreams.sources.reverse();
      expect(activeStreams.sources).toEqual([
        'giantbomb',
        'remap',
        'nextlander',
      ]);
    });
  });
});
