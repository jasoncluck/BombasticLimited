import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContentState } from '../../../state/content.svelte';
import type { Video } from '$lib/supabase/videos';

describe('ContentCard Robust Mount Hover Detection Logic', () => {
  let mockPageState: {
    sidebarScrollState: {
      scrolling: boolean;
    };
  };
  let contentState: ContentState;

  beforeEach(() => {
    mockPageState = {
      sidebarScrollState: {
        scrolling: false,
      },
    };

    contentState = new ContentState(mockPageState);

    // Mock DOM APIs
    Object.defineProperty(global, 'document', {
      value: {
        elementFromPoint: vi.fn(),
      },
      writable: true,
    });

    // Mock setTimeout
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should initialize hover state when element is hovered on mount', () => {
    const mockVideo = { id: 'video1', title: 'Test Video' } as Video;
    const sectionId = 'test-section';

    // Mock element that matches :hover
    const mockElement = {
      matches: vi.fn().mockReturnValue(true), // Element is hovered
    };

    // Simulate the robust mount logic from content-card.svelte
    const checkMousePosition = () => {
      const isCurrentlyHovered = mockElement.matches(':hover');

      if (isCurrentlyHovered) {
        const currentHoveredVideo =
          contentState.hoveredVideosBySection[sectionId];
        const isHoverStateCleared =
          !currentHoveredVideo || currentHoveredVideo.id !== mockVideo.id;

        if (isHoverStateCleared) {
          contentState.handleMouseEnter({
            video: mockVideo,
            sectionId,
          });
        }
      }
    };

    // Execute the check
    checkMousePosition();

    // Should have set hover state
    expect(contentState.hoveredVideosBySection[sectionId]).toEqual(mockVideo);
    expect(mockElement.matches).toHaveBeenCalledWith(':hover');
  });

  it('should re-initialize hover state when it gets cleared due to race condition', () => {
    const mockVideo = { id: 'video1', title: 'Test Video' } as Video;
    const sectionId = 'test-section';

    // Mock element that matches :hover
    const mockElement = {
      matches: vi.fn().mockReturnValue(true), // Element is hovered
    };

    // Initially set hover state
    contentState.handleMouseEnter({ video: mockVideo, sectionId });
    expect(contentState.hoveredVideosBySection[sectionId]).toEqual(mockVideo);

    // Simulate race condition - something clears the hover state
    contentState.hoveredVideosBySection[sectionId] = null;
    expect(contentState.hoveredVideosBySection[sectionId]).toBeNull();

    // Simulate the robust mount logic that should detect and fix this
    const checkMousePosition = () => {
      const isCurrentlyHovered = mockElement.matches(':hover');

      if (isCurrentlyHovered) {
        const currentHoveredVideo =
          contentState.hoveredVideosBySection[sectionId];
        const isHoverStateCleared =
          !currentHoveredVideo || currentHoveredVideo.id !== mockVideo.id;

        if (isHoverStateCleared) {
          contentState.handleMouseEnter({
            video: mockVideo,
            sectionId,
          });
        }
      }
    };

    // Execute the check - should restore hover state
    checkMousePosition();

    // Should have restored hover state
    expect(contentState.hoveredVideosBySection[sectionId]).toEqual(mockVideo);
    expect(mockElement.matches).toHaveBeenCalledWith(':hover');
  });

  it('should not initialize hover state when element is not hovered on mount', () => {
    const mockVideo = { id: 'video1', title: 'Test Video' } as Video;
    const sectionId = 'test-section';

    // Mock element that doesn't match :hover
    const mockElement = {
      matches: vi.fn().mockReturnValue(false), // Element is not hovered
    };

    // Simulate the robust mount logic from content-card.svelte
    const checkMousePosition = () => {
      const isCurrentlyHovered = mockElement.matches(':hover');

      if (isCurrentlyHovered) {
        const currentHoveredVideo =
          contentState.hoveredVideosBySection[sectionId];
        const isHoverStateCleared =
          !currentHoveredVideo || currentHoveredVideo.id !== mockVideo.id;

        if (isHoverStateCleared) {
          contentState.handleMouseEnter({
            video: mockVideo,
            sectionId,
          });
        }
      }
    };

    // Execute the check
    checkMousePosition();

    // Should not have set hover state
    expect(contentState.hoveredVideosBySection[sectionId]).toBeUndefined();
    expect(mockElement.matches).toHaveBeenCalledWith(':hover');
  });

  it('should work with existing handleMouseEnter functionality', () => {
    const mockVideo = { id: 'video1', title: 'Test Video' } as Video;
    const sectionId = 'test-section';

    // Test that the regular mouseenter handler still works
    contentState.handleMouseEnter({
      video: mockVideo,
      sectionId,
    });

    expect(contentState.hoveredVideosBySection[sectionId]).toEqual(mockVideo);
  });
});
