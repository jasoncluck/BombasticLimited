import { describe, it, expect, beforeEach } from 'vitest';
import { SourceStateClass } from '../source.svelte';
import { PlaylistStateClass } from '../playlist.svelte';
import { ContentState } from '../content.svelte';

// Mock PageState
const mockPageState = {
  sidebarScrollState: {
    scrolling: false,
  },
} as any;

// Mock ContentState
const mockContentState = {
  clearHoverStatesDuringDrag: () => {},
  dragContentType: null,
} as any;

// Mock SidebarState
const mockSidebarState = {} as any;

describe('Hover-Drag Conflict Prevention', () => {
  describe('SourceStateClass', () => {
    let sourceState: SourceStateClass;

    beforeEach(() => {
      sourceState = new SourceStateClass(mockPageState);
    });

    it('should not include CSS hover classes in button classes', () => {
      const classes = sourceState.getButtonClasses({
        index: 0,
        isSelected: false,
        isSidebarCollapsed: false,
      });

      // Should not contain Tailwind CSS hover classes
      expect(classes).not.toMatch(/hover:bg-secondary/);
      expect(classes).not.toMatch(/hover:brightness-110/);
    });

    it('should apply hover styles via JavaScript state when hovered', () => {
      sourceState.hoveredSourceIndex = 0;

      const classes = sourceState.getButtonClasses({
        index: 0,
        isSelected: false,
        isSidebarCollapsed: false,
      });

      // Should contain JavaScript-applied hover styles
      expect(classes).toContain('bg-secondary/50');
      expect(classes).toContain('brightness-110');
    });

    it('should not apply hover styles when not hovered', () => {
      sourceState.hoveredSourceIndex = null;

      const classes = sourceState.getButtonClasses({
        index: 0,
        isSelected: false,
        isSidebarCollapsed: false,
      });

      // Should not contain hover styles when not hovered
      expect(classes).not.toContain('bg-secondary/50');
    });

    it('should not apply hover styles when scrolling', () => {
      sourceState.hoveredSourceIndex = 0;
      mockPageState.sidebarScrollState.scrolling = true;

      const classes = sourceState.getButtonClasses({
        index: 0,
        isSelected: false,
        isSidebarCollapsed: false,
      });

      // Should not contain hover styles when scrolling
      expect(classes).not.toContain('bg-secondary/50');

      // Reset scrolling state for other tests
      mockPageState.sidebarScrollState.scrolling = false;
    });
  });

  describe('PlaylistStateClass', () => {
    let playlistState: PlaylistStateClass;

    beforeEach(() => {
      playlistState = new PlaylistStateClass(
        mockPageState,
        mockContentState,
        mockSidebarState
      );
    });

    it('should not include CSS hover classes in button classes', () => {
      const classes = playlistState.getButtonClasses({
        index: 0,
        isSelected: false,
        itemType: 'playlist',
        isSidebarCollapsed: false,
      });

      // Should not contain Tailwind CSS hover classes
      expect(classes).not.toMatch(/hover:bg-secondary/);
      expect(classes).not.toMatch(/hover:brightness-110/);
    });

    it('should apply hover styles via JavaScript state when hovered', () => {
      playlistState.hoveredPlaylistIndex = 0;
      playlistState.draggedIndex = null; // Ensure not dragging
      mockPageState.sidebarScrollState.scrolling = false; // Ensure not scrolling

      const classes = playlistState.getButtonClasses({
        index: 0,
        isSelected: false,
        itemType: 'playlist',
        isSidebarCollapsed: false,
      });

      // Should contain JavaScript-applied hover styles
      expect(classes).toContain('bg-secondary/50');
      expect(classes).toContain('brightness-110');
    });

    it('should not apply hover styles when dragging', () => {
      playlistState.hoveredPlaylistIndex = 0;
      playlistState.draggedIndex = 1; // Simulate dragging

      const classes = playlistState.getButtonClasses({
        index: 0,
        isSelected: false,
        itemType: 'playlist',
        isSidebarCollapsed: false,
      });

      // Should not contain hover styles when dragging
      expect(classes).not.toContain('bg-secondary/50');
    });
  });

  describe('ContentState', () => {
    let contentState: ContentState;

    beforeEach(() => {
      contentState = new ContentState();
    });

    it('should clear hover states when drag starts', () => {
      const sectionId = 'test-section';
      const mockVideo = { id: 'video1', title: 'Test Video' } as any;

      // Set up initial hover state
      contentState.hoveredVideosBySection[sectionId] = mockVideo;
      contentState.hoverTimeoutId = setTimeout(() => {}, 1000);

      // Clear hover states during drag
      contentState.clearHoverStatesDuringDrag();

      // Should clear hover states
      expect(contentState.hoveredVideosBySection[sectionId]).toBeNull();
      expect(contentState.hoverTimeoutId).toBeNull();
    });

    it('should not update hover state when dragging', () => {
      const sectionId = 'test-section';
      const mockVideo = { id: 'video1', title: 'Test Video' } as any;

      // Set drag state
      contentState.dragContentType = 'video';

      // Try to set hover state
      contentState.handleMouseEnter({ video: mockVideo, sectionId });

      // Should not update hover state when dragging
      expect(contentState.hoveredVideosBySection[sectionId]).toBeUndefined();
    });
  });
});
