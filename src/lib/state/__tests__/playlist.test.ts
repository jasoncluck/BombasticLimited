import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaylistStateClass } from '../playlist.svelte';
import type { PageState } from '../page.svelte';
import type { ContentState } from '../content.svelte';
import type { SidebarState } from '../sidebar.svelte';
import type { Playlist } from '$lib/supabase/playlists';

// Mock dependencies
vi.mock('$lib/utils/dragdrop', () => ({
  createDragImage: vi.fn(),
}));

vi.mock('$lib/components/playlist/playlist-service', () => ({
  handleAddVideosToPlaylist: vi.fn(),
  handleUpdatePlaylistPosition: vi.fn(),
}));

describe('PlaylistStateClass', () => {
  let playlistState: PlaylistStateClass;
  let mockPageState: Partial<PageState>;
  let mockContentState: Partial<ContentState>;
  let mockSidebarState: Partial<SidebarState>;

  beforeEach(() => {
    mockPageState = {
      sidebarScrollState: {
        scrolling: false,
        direction: null,
        interval: null,
      },
    };

    mockContentState = {
      selectedVideosBySection: {},
      dragContentType: null,
    };

    mockSidebarState = {};

    playlistState = new PlaylistStateClass(
      mockPageState as PageState,
      mockContentState as ContentState,
      mockSidebarState as SidebarState
    );
  });

  describe('initialization', () => {
    it('should initialize with correct default values', () => {
      expect(playlistState.openEditPlaylist).toBe(false);
      expect(playlistState.hoveredPlaylistIndex).toBeNull();
      expect(playlistState.draggedIndex).toBeNull();
      expect(playlistState.targetIndex).toBeNull();
      expect(playlistState.currentPlaylist).toBeNull();
    });

    it('should store references to state dependencies', () => {
      expect(playlistState.pageState).toBe(mockPageState);
      expect(playlistState.contentState).toBe(mockContentState);
      expect(playlistState.sidebarState).toBe(mockSidebarState);
    });
  });

  describe('mouse hover methods', () => {
    describe('handleMouseEnter', () => {
      it('should set hovered index when conditions are met', () => {
        playlistState.handleMouseEnter(2);

        expect(playlistState.hoveredPlaylistIndex).toBe(2);
      });

      it('should not set hovered index when sidebar is scrolling', () => {
        mockPageState.sidebarScrollState!.scrolling = true;

        playlistState.handleMouseEnter(2);

        expect(playlistState.hoveredPlaylistIndex).toBeNull();
      });

      it('should not set hovered index when dragging', () => {
        playlistState.draggedIndex = 1;

        playlistState.handleMouseEnter(2);

        expect(playlistState.hoveredPlaylistIndex).toBeNull();
      });
    });

    describe('handleMouseLeave', () => {
      it('should clear hovered index when leaving hovered item', () => {
        playlistState.hoveredPlaylistIndex = 2;

        playlistState.handleMouseLeave(2);

        expect(playlistState.hoveredPlaylistIndex).toBeNull();
      });

      it('should not clear hovered index when leaving different item', () => {
        playlistState.hoveredPlaylistIndex = 2;

        playlistState.handleMouseLeave(1);

        expect(playlistState.hoveredPlaylistIndex).toBe(2);
      });
    });
  });

  describe('getPlaylistDragClasses', () => {
    it('should return base classes', () => {
      const classes = playlistState.getPlaylistDragClasses(0);

      expect(classes).toBe('relative');
    });

    it('should add opacity when item is being dragged', () => {
      playlistState.draggedIndex = 1;

      const classes = playlistState.getPlaylistDragClasses(1);

      expect(classes).toContain('opacity-60');
    });

    it('should add bottom indicator when target index is higher than dragged', () => {
      playlistState.draggedIndex = 1;
      playlistState.targetIndex = 2;

      const classes = playlistState.getPlaylistDragClasses(2);

      expect(classes).toContain('after:absolute');
      expect(classes).toContain('after:bottom-0');
    });

    it('should add top indicator when target index is lower than dragged', () => {
      playlistState.draggedIndex = 2;
      playlistState.targetIndex = 1;

      const classes = playlistState.getPlaylistDragClasses(1);

      expect(classes).toContain('before:absolute');
      expect(classes).toContain('before:-top-0');
    });
  });

  describe('getButtonClasses', () => {
    const baseOptions = {
      index: 0,
      isSelected: false,
      itemType: 'playlist' as const,
      isSidebarCollapsed: false,
    };

    it('should return base button classes', () => {
      const classes = playlistState.getButtonClasses(baseOptions);

      expect(classes).toContain('sidebar-full-button');
      expect(classes).toContain('transition-all');
    });

    it('should add active state classes when not dragging', () => {
      const classes = playlistState.getButtonClasses(baseOptions);

      expect(classes).toContain('active:bg-secondary/70');
      expect(classes).toContain('active:scale-95');
    });

    it('should add drag classes for playlist items', () => {
      playlistState.draggedIndex = 1;

      const classes = playlistState.getButtonClasses({
        ...baseOptions,
        index: 1,
      });

      expect(classes).toContain('opacity-60');
    });

    it('should add hover classes when item is hovered', () => {
      playlistState.hoveredPlaylistIndex = 0;

      const classes = playlistState.getButtonClasses(baseOptions);

      expect(classes).toContain('bg-secondary/50');
      expect(classes).toContain('brightness-110');
    });

    it('should add selected classes for selected items', () => {
      const classes = playlistState.getButtonClasses({
        ...baseOptions,
        isSelected: true,
      });

      expect(classes).toContain('bg-secondary/65');
      expect(classes).toContain('text-secondary-foreground');
    });

    it('should add source-specific classes for source items', () => {
      const classes = playlistState.getButtonClasses({
        ...baseOptions,
        itemType: 'source',
        isSelected: true,
      });

      expect(classes).toContain('bg-secondary');
      expect(classes).toContain('text-secondary-foreground');
    });

    it('should add collapsed sidebar classes', () => {
      const classes = playlistState.getButtonClasses({
        ...baseOptions,
        isSidebarCollapsed: true,
      });

      expect(classes).toContain('align-middle');
    });

    it('should add expanded sidebar classes', () => {
      const classes = playlistState.getButtonClasses({
        ...baseOptions,
        isSidebarCollapsed: false,
      });

      expect(classes).toContain('min-w-[150px]');
      expect(classes).toContain('justify-normal');
    });

    it('should apply disabled styling for non-owned playlists during video drag', () => {
      mockContentState.dragContentType = 'video';

      const mockPlaylists: Partial<Playlist>[] = [
        { created_by: 'other-user', short_id: 'other-playlist' },
      ];

      const classes = playlistState.getButtonClasses({
        ...baseOptions,
        playlists: mockPlaylists as Playlist[],
        session: { user: { id: 'current-user' } } as any,
        selectedPlaylistIdParam: 'current-playlist',
      });

      expect(classes).toContain('opacity-50');
      expect(classes).toContain('border-transparent');
    });
  });

  describe('state mutations', () => {
    it('should allow updating openEditPlaylist', () => {
      playlistState.openEditPlaylist = true;
      expect(playlistState.openEditPlaylist).toBe(true);
    });

    it('should allow updating draggedIndex', () => {
      playlistState.draggedIndex = 3;
      expect(playlistState.draggedIndex).toBe(3);
    });

    it('should allow updating targetIndex', () => {
      playlistState.targetIndex = 2;
      expect(playlistState.targetIndex).toBe(2);
    });

    it('should allow updating currentPlaylist', () => {
      const mockPlaylist = { id: 1, name: 'Test Playlist' } as Playlist;
      playlistState.currentPlaylist = mockPlaylist;
      expect(playlistState.currentPlaylist).toStrictEqual(mockPlaylist);
    });
  });
});
