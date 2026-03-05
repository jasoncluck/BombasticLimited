import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ContentState,
  DEFAULT_SECTION_ID,
  VIDEO_DROPZONE_CLASSES,
  END_DROPZONE_CLASSES,
} from '../content.svelte.js';
import type { PageState } from '../page.svelte.js';
import {
  createMockVideo,
  createMockPlaylist,
  createMockSession,
} from '$lib/tests/test-utils.js';

// Mock dependencies
vi.mock('$lib/utils/dragdrop', () => ({
  createDragImage: vi.fn(),
}));

vi.mock('$lib/components/content/content-filter', () => ({
  isPlaylistVideosFilter: vi.fn((filter) => filter.type === 'playlist'),
}));

vi.mock('$lib/components/playlist/playlist-service', () => ({
  handleUpdatePlaylistVideoPosition: vi.fn(),
}));

// Mock DOM elements
const mockDocument = {
  body: {
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
    },
  },
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock global document
global.document = mockDocument as any;

describe('ContentState', () => {
  let contentState: ContentState;
  let mockVideo: any;
  let mockPlaylist: any;
  let mockSession: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset document mock
    mockDocument.body.classList.add.mockClear();
    mockDocument.body.classList.remove.mockClear();

    // Create test data
    mockVideo = createMockVideo({ id: 'test-video-1', title: 'Test Video' });
    mockPlaylist = createMockPlaylist({ id: 1, created_by: 'user-1' });
    mockSession = createMockSession({
      user: {
        id: 'user-1',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'test@example.com',
        email_confirmed_at: '2023-01-01T00:00:00Z',
        phone: '',
        confirmed_at: '2023-01-01T00:00:00Z',
        last_sign_in_at: '2023-01-01T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-01T00:00:00Z',
        is_anonymous: false,
      },
    });

    contentState = new ContentState();
  });

  afterEach(() => {
    // Clean up any timeouts
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      expect(contentState.selectedVideosBySection).toEqual({});
      expect(contentState.hoveredVideosBySection).toEqual({});
      expect(contentState.dragContentType).toBeNull();
      expect(contentState.isMenuOpen).toBe(false);
      expect(contentState.isMouseOverMenu).toBe(false);
      expect(contentState.openContextMenuSection).toBeNull();
      expect(contentState.openDrawerSection).toBeNull();
      expect(contentState.drawerVariant).toBeNull();
      expect(contentState.isDropdownMenuOpen).toBe(false);
      expect(contentState.openDropdownId).toBeNull();
      expect(contentState.hoverTimeoutId).toBeNull();
      expect(contentState.draggedIndex).toBeNull();
      expect(contentState.targetIndex).toBeNull();
      expect(contentState.draggedFromSectionId).toBeNull();
      expect(contentState.lastClickTime).toBe(0);
      expect(contentState.lastClickedVideo).toBeNull();
    });

    it('should initialize carousel state with lastViewedIndex 0', () => {
      expect(contentState.carouselState.lastViewedIndex).toBe(0);
    });
  });

  describe('context menu management', () => {
    it('should detect when context menu is open for specific section', () => {
      const sectionId = 'test-section';
      contentState.openContextMenuSection = sectionId;

      expect(contentState.isContextMenuOpenForSection(sectionId)).toBe(true);
      expect(contentState.isContextMenuOpenForSection('other-section')).toBe(
        false
      );
    });

    it('should use DEFAULT_SECTION_ID when no sectionId provided', () => {
      contentState.openContextMenuSection = DEFAULT_SECTION_ID;

      expect(contentState.isContextMenuOpenForSection()).toBe(true);
    });

    it('should detect when context menu is open for any section', () => {
      contentState.selectedVideosBySection = {
        section1: [mockVideo],
        section2: [mockVideo],
      };
      contentState.openContextMenuSection = 'section1';

      expect(contentState.isContextMenuOpenForAnySection()).toBe(true);
    });

    it('should return false when no context menu is open', () => {
      contentState.selectedVideosBySection = {
        section1: [mockVideo],
      };
      contentState.openContextMenuSection = null;

      expect(contentState.isContextMenuOpenForAnySection()).toBe(false);
    });

    it('should get isAnyContextMenuOpen correctly', () => {
      expect(contentState.isAnyContextMenuOpen).toBe(false);

      contentState.openContextMenuSection = 'test-section';
      expect(contentState.isAnyContextMenuOpen).toBe(true);
    });
  });

  describe('drawer management', () => {
    it('should detect when drawer is open for specific section', () => {
      const sectionId = 'test-section';
      contentState.openDrawerSection = sectionId;

      expect(contentState.isDrawerOpenForSection(sectionId)).toBe(true);
      expect(contentState.isDrawerOpenForSection('other-section')).toBe(false);
    });

    it('should use DEFAULT_SECTION_ID when no sectionId provided', () => {
      contentState.openDrawerSection = DEFAULT_SECTION_ID;

      expect(contentState.isDrawerOpenForSection()).toBe(true);
    });

    it('should detect when drawer is open for any section', () => {
      contentState.selectedVideosBySection = {
        section1: [mockVideo],
        section2: [mockVideo],
      };
      contentState.openDrawerSection = 'section1';

      expect(contentState.isDrawerOpenForAnySection()).toBe(true);
    });

    it('should return false when no drawer is open', () => {
      contentState.selectedVideosBySection = {
        section1: [mockVideo],
      };
      contentState.openDrawerSection = null;

      expect(contentState.isDrawerOpenForAnySection()).toBe(false);
    });
  });

  describe('state reset', () => {
    it('should reset all state to defaults', () => {
      // Set up some state
      contentState.selectedVideosBySection = { section1: [mockVideo] };
      contentState.hoveredVideosBySection = { section1: mockVideo };
      contentState.isDropdownMenuOpen = true;
      contentState.openDropdownId = 'test-dropdown';
      contentState.openContextMenuSection = 'test-section';
      contentState.dragContentType = 'video';

      // Reset state
      contentState.resetState();

      // Verify state is reset
      expect(contentState.selectedVideosBySection).toEqual({});
      expect(contentState.hoveredVideosBySection).toEqual({});
      expect(contentState.isDropdownMenuOpen).toBe(false);
      expect(contentState.openDropdownId).toBeNull();
      expect(contentState.openContextMenuSection).toBeNull();
      expect(contentState.dragContentType).toBeNull();
    });
  });

  describe('CSS class helpers', () => {
    it('should return video dropzone classes when dragging video to owned playlist', () => {
      contentState.dragContentType = 'video';

      const classes = contentState.getVideoDropzoneClasses(
        mockPlaylist,
        mockSession
      );
      expect(classes).toEqual(VIDEO_DROPZONE_CLASSES);
    });

    it('should return empty array when not dragging video', () => {
      contentState.dragContentType = null;

      const classes = contentState.getVideoDropzoneClasses(
        mockPlaylist,
        mockSession
      );
      expect(classes).toEqual([]);
    });

    it('should return empty array when playlist not owned by user', () => {
      contentState.dragContentType = 'video';
      const otherUserPlaylist = createMockPlaylist({
        id: 2,
        created_by: 'other-user',
      });

      const classes = contentState.getVideoDropzoneClasses(
        otherUserPlaylist,
        mockSession
      );
      expect(classes).toEqual([]);
    });

    it('should return end dropzone classes', () => {
      const classes = contentState.getEndDropzoneClasses();
      expect(classes).toEqual(END_DROPZONE_CLASSES);
    });

    it('should get video drag classes for table display', () => {
      contentState.draggedIndex = 1;
      contentState.targetIndex = 2;

      const classes = contentState.getVideoDragClasses(2, 'TABLE');
      expect(classes).toContain('relative');
      expect(classes).toContain('after:absolute');
      expect(classes).toContain('after:bottom-0');
    });

    it('should get video drag classes for non-table display', () => {
      contentState.draggedIndex = 1;
      contentState.targetIndex = 2;

      const classes = contentState.getVideoDragClasses(2, 'TILES');
      expect(classes).toContain('relative');
      // Should not contain table-specific after: classes
      expect(classes).not.toContain('after:bottom-0');
    });
  });

  describe('drag and drop state management', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear hover states during drag', () => {
      // Set up hover states
      contentState.hoveredVideosBySection = {
        section1: mockVideo,
        section2: mockVideo,
      };
      contentState.hoverTimeoutId = setTimeout(() => {}, 100);

      contentState.clearHoverStatesDuringDrag();

      // Verify hover states are cleared
      expect(contentState.hoveredVideosBySection['section1']).toBeNull();
      expect(contentState.hoveredVideosBySection['section2']).toBeNull();
      expect(contentState.hoverTimeoutId).toBeNull();
    });

    it('should enable hover states after drag', () => {
      // Test doesn't throw
      expect(() => contentState.enableHoverStatesAfterDrag()).not.toThrow();
    });

    it('should handle clearTimeout when no timeout exists', () => {
      contentState.hoverTimeoutId = null;

      expect(() => contentState.clearHoverStatesDuringDrag()).not.toThrow();
    });
  });

  describe('mouse hover handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle mouse enter when not dragging', () => {
      const sectionId = 'test-section';

      contentState.handleMouseEnter({ video: mockVideo, sectionId });

      expect(contentState.hoveredVideosBySection[sectionId]).toEqual(mockVideo);
    });

    it('should not update hover state when dragging', () => {
      const sectionId = 'test-section';
      contentState.dragContentType = 'video';

      contentState.handleMouseEnter({ video: mockVideo, sectionId });

      expect(contentState.hoveredVideosBySection[sectionId]).toBeUndefined();
    });

    it('should clear existing timeout on mouse enter', () => {
      const timeoutId = setTimeout(() => {}, 100);
      contentState.hoverTimeoutId = timeoutId;

      contentState.handleMouseEnter({ video: mockVideo });

      expect(contentState.hoverTimeoutId).toBeNull();
    });

    it('should use DEFAULT_SECTION_ID when no sectionId provided', () => {
      contentState.handleMouseEnter({ video: mockVideo });

      expect(contentState.hoveredVideosBySection[DEFAULT_SECTION_ID]).toEqual(
        mockVideo
      );
    });

    it('should handle mouse leave with timeout', () => {
      const sectionId = 'test-section';
      contentState.hoveredVideosBySection[sectionId] = mockVideo;

      contentState.handleMouseLeave({ sectionId });

      // Should set timeout
      expect(contentState.hoverTimeoutId).not.toBeNull();

      // Fast forward time to trigger timeout
      vi.advanceTimersByTime(100);

      expect(contentState.hoveredVideosBySection[sectionId]).toBeNull();
    });

    it('should clear selections on mouse leave when removeSelectedOnHover is true', () => {
      const sectionId = 'test-section';
      contentState.selectedVideosBySection[sectionId] = [mockVideo];
      contentState.hoveredVideosBySection[sectionId] = mockVideo;

      contentState.handleMouseLeave({ sectionId, removeSelectedOnHover: true });

      vi.advanceTimersByTime(100);

      expect(contentState.selectedVideosBySection[sectionId]).toEqual([]);
    });

    it('should not clear hover state if context menu is open', () => {
      const sectionId = 'test-section';
      contentState.hoveredVideosBySection[sectionId] = mockVideo;
      contentState.openContextMenuSection = sectionId;

      contentState.handleMouseLeave({ sectionId });

      vi.advanceTimersByTime(100);

      expect(contentState.hoveredVideosBySection[sectionId]).toEqual(mockVideo);
    });

    it('should not clear hover state when dragging', () => {
      const sectionId = 'test-section';
      contentState.hoveredVideosBySection[sectionId] = mockVideo;
      contentState.dragContentType = 'video';

      contentState.handleMouseLeave({ sectionId });

      vi.advanceTimersByTime(100);

      expect(contentState.hoveredVideosBySection[sectionId]).toEqual(mockVideo);
    });
  });

  describe('dropdown management', () => {
    it('should close all dropdowns', () => {
      contentState.isDropdownMenuOpen = true;
      contentState.openDropdownId = 'test-dropdown';

      contentState.closeAllDropdowns();

      expect(contentState.isDropdownMenuOpen).toBe(false);
      expect(contentState.openDropdownId).toBeNull();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle undefined document in clearHoverStatesDuringDrag', () => {
      const originalDocument = global.document;
      // @ts-ignore
      global.document = undefined;

      expect(() => contentState.clearHoverStatesDuringDrag()).not.toThrow();

      global.document = originalDocument;
    });

    it('should handle undefined document.body in clearHoverStatesDuringDrag', () => {
      const originalDocument = global.document;
      global.document = {} as any;

      expect(() => contentState.clearHoverStatesDuringDrag()).not.toThrow();

      global.document = originalDocument;
    });

    it('should handle empty selectedVideosBySection in isContextMenuOpenForAnySection', () => {
      contentState.selectedVideosBySection = {};
      contentState.openContextMenuSection = 'test-section';

      expect(contentState.isContextMenuOpenForAnySection()).toBe(true);
    });

    it('should handle empty selectedVideosBySection in isDrawerOpenForAnySection', () => {
      contentState.selectedVideosBySection = {};
      contentState.openDrawerSection = 'test-section';

      expect(contentState.isDrawerOpenForAnySection()).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple sections correctly', () => {
      const section1 = 'section1';
      const section2 = 'section2';
      const video1 = createMockVideo({ id: 'video1' });
      const video2 = createMockVideo({ id: 'video2' });

      // Set up multiple sections
      contentState.selectedVideosBySection[section1] = [video1];
      contentState.selectedVideosBySection[section2] = [video2];
      contentState.hoveredVideosBySection[section1] = video1;
      contentState.hoveredVideosBySection[section2] = video2;

      // Open context menu for one section
      contentState.openContextMenuSection = section1;

      expect(contentState.isContextMenuOpenForSection(section1)).toBe(true);
      expect(contentState.isContextMenuOpenForSection(section2)).toBe(false);
      expect(contentState.isContextMenuOpenForAnySection()).toBe(true);

      // Reset and verify cleanup
      contentState.resetState();

      expect(contentState.selectedVideosBySection).toEqual({});
      expect(contentState.hoveredVideosBySection).toEqual({});
      expect(contentState.openContextMenuSection).toBeNull();
    });

    it('should handle state transitions correctly', () => {
      const sectionId = 'test-section';

      // Start with hover
      contentState.handleMouseEnter({ video: mockVideo, sectionId });
      expect(contentState.hoveredVideosBySection[sectionId]).toEqual(mockVideo);

      // Start dragging
      contentState.dragContentType = 'video';
      contentState.clearHoverStatesDuringDrag();
      expect(contentState.hoveredVideosBySection[sectionId]).toBeNull();

      // End dragging
      contentState.dragContentType = null;

      // Test that methods don't throw
      expect(() => contentState.enableHoverStatesAfterDrag()).not.toThrow();
    });
  });
});
