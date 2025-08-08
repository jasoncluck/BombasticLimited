import { describe, it, expect, beforeEach } from 'vitest';
import { SidebarStateClass } from '../sidebar.svelte.js';
import type { Source } from '$lib/constants/source.js';

describe('SidebarStateClass - Streaming Functionality', () => {
  let sidebarState: SidebarStateClass;

  beforeEach(() => {
    sidebarState = new SidebarStateClass();
  });

  describe('streaming sources management', () => {
    it('should initialize with empty streaming sources', () => {
      expect(sidebarState.getStreamingSources()).toEqual([]);
    });

    it('should update streaming sources', () => {
      const sources: Source[] = ['giantbomb', 'nextlander'];
      sidebarState.updateStreamingSources(sources);

      expect(sidebarState.getStreamingSources()).toEqual(sources);
    });

    it('should check if source is streaming', () => {
      const sources: Source[] = ['giantbomb', 'nextlander'];
      sidebarState.updateStreamingSources(sources);

      expect(sidebarState.isSourceStreaming('giantbomb')).toBe(true);
      expect(sidebarState.isSourceStreaming('nextlander')).toBe(true);
      expect(sidebarState.isSourceStreaming('remap')).toBe(false);
    });

    it('should return copy of streaming sources', () => {
      const sources: Source[] = ['giantbomb'];
      sidebarState.updateStreamingSources(sources);

      const returnedSources = sidebarState.getStreamingSources();
      returnedSources.push('nextlander');

      // Original state should not be modified
      expect(sidebarState.getStreamingSources()).toEqual(['giantbomb']);
    });

    it('should handle empty streaming sources update', () => {
      sidebarState.updateStreamingSources(['giantbomb']);
      expect(sidebarState.getStreamingSources()).toEqual(['giantbomb']);

      sidebarState.updateStreamingSources([]);
      expect(sidebarState.getStreamingSources()).toEqual([]);
    });

    it('should preserve streaming sources order', () => {
      const sources: Source[] = ['remap', 'giantbomb', 'nextlander'];
      sidebarState.updateStreamingSources(sources);

      expect(sidebarState.getStreamingSources()).toEqual(sources);
    });

    it('should handle duplicate sources', () => {
      const sources: Source[] = ['giantbomb', 'giantbomb', 'nextlander'];
      sidebarState.updateStreamingSources(sources);

      expect(sidebarState.getStreamingSources()).toEqual(sources);
      expect(sidebarState.isSourceStreaming('giantbomb')).toBe(true);
    });

    it('should reset streaming sources on cleanup', () => {
      sidebarState.updateStreamingSources(['giantbomb', 'nextlander']);
      expect(sidebarState.getStreamingSources()).toEqual([
        'giantbomb',
        'nextlander',
      ]);

      sidebarState.cleanup();
      expect(sidebarState.getStreamingSources()).toEqual([]);
    });
  });

  describe('integration with existing functionality', () => {
    it('should maintain streaming sources independently of other state', () => {
      sidebarState.updateStreamingSources(['giantbomb']);
      sidebarState.setCollapsed(true);

      expect(sidebarState.getStreamingSources()).toEqual(['giantbomb']);
      expect(sidebarState.collapsed).toBe(true);
    });

    it('should not affect ordered sources', () => {
      const orderedSources: Source[] = ['nextlander', 'giantbomb'];
      const streamingSources: Source[] = ['giantbomb'];

      sidebarState.orderedSources = orderedSources;
      sidebarState.updateStreamingSources(streamingSources);

      expect(sidebarState.orderedSources).toEqual(orderedSources);
      expect(sidebarState.getStreamingSources()).toEqual(streamingSources);
    });
  });
});
