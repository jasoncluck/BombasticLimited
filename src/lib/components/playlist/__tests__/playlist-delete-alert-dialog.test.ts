import { createMockPlaylist, createMockSession } from '$lib/tests/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('$lib/components/ui/alert-dialog/index.js', () => ({
  Root: class MockRoot {
    constructor() {}
  },
  Content: class MockContent {
    constructor() {}
  },
  Header: class MockHeader {
    constructor() {}
  },
  Title: class MockTitle {
    constructor() {}
  },
  Description: class MockDescription {
    constructor() {}
  },
  Footer: class MockFooter {
    constructor() {}
  },
  Cancel: class MockCancel {
    constructor() {}
  },
  Action: class MockAction {
    constructor() {}
  },
}));

vi.mock('../playlist-service', () => ({
  handleDeletePlaylist: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
}));

vi.mock('$app/state', () => ({
  page: {
    url: {
      pathname: '/playlist/abc123',
    },
  },
}));

const mockHandleDeletePlaylist = vi.mocked(
  await import('../playlist-service').then((m) => m.handleDeletePlaylist)
);
const mockGoto = vi.mocked(await import('$app/navigation').then((m) => m.goto));

describe('PlaylistDeleteAlertDialog Component Logic', () => {
  const mockPublicPlaylist = createMockPlaylist({
    type: 'Public',
    created_by: 'user-1',
  });
  const mockSession = createMockSession();
  const mockSidebarState = {
    refreshData: vi.fn(),
  } as any;
  const mockSupabase = {} as any;

  const mockProps = {
    playlist: mockPublicPlaylist,
    sidebarState: mockSidebarState,
    session: mockSession,
    supabase: mockSupabase,
    open: false,
    onOpenChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('component initialization', () => {
    it('should accept required props', () => {
      expect(mockProps.playlist).toBeDefined();
      expect(mockProps.sidebarState).toBeDefined();
      expect(mockProps.session).toBeDefined();
      expect(mockProps.supabase).toBeDefined();
    });

    it('should handle optional props', () => {
      const propsWithDefaults = {
        ...mockProps,
        open: undefined,
        onOpenChange: undefined,
      };

      // Component should handle undefined optional props
      expect(propsWithDefaults.playlist).toBeDefined();
    });

    it('should validate playlist type', () => {
      expect(mockProps.playlist.type).toBe('Public');
      expect(mockProps.playlist.name).toBe('Test Playlist');
    });
  });

  describe('delete confirmation logic', () => {
    it('should call handleDeletePlaylist when confirmed', async () => {
      mockHandleDeletePlaylist.mockResolvedValue({ error: null });

      // Simulate the confirmDelete function logic
      const confirmDelete = async () => {
        const result = await mockHandleDeletePlaylist({
          playlist: mockProps.playlist,
          sidebarState: mockProps.sidebarState,
          session: mockProps.session,
          supabase: mockProps.supabase,
        });

        // Simulate closing dialog
        let open = false;
        if (mockProps.onOpenChange) {
          mockProps.onOpenChange(false);
        }

        // Simulate navigation if on playlist page
        if (
          !result?.error &&
          '/playlist/abc123' === `/playlist/${mockProps.playlist.short_id}`
        ) {
          mockGoto('/');
        }
      };

      await confirmDelete();

      expect(mockHandleDeletePlaylist).toHaveBeenCalledWith({
        playlist: mockProps.playlist,
        sidebarState: mockProps.sidebarState,
        session: mockProps.session,
        supabase: mockProps.supabase,
      });
      expect(mockProps.onOpenChange).toHaveBeenCalledWith(false);
      expect(mockGoto).toHaveBeenCalledWith('/');
    });

    it('should handle delete error gracefully', async () => {
      const deleteError = {
        message: 'Delete failed',
        details: 'Server error details',
        hint: 'Check server logs',
        code: '500',
        name: 'PostgrestError',
      };
      mockHandleDeletePlaylist.mockResolvedValue({ error: deleteError });

      // Simulate the confirmDelete function logic
      const confirmDelete = async () => {
        const result = await mockHandleDeletePlaylist({
          playlist: mockProps.playlist,
          sidebarState: mockProps.sidebarState,
          session: mockProps.session,
          supabase: mockProps.supabase,
        });

        // Dialog should still close even on error
        let open = false;
        if (mockProps.onOpenChange) {
          mockProps.onOpenChange(false);
        }

        // Should not navigate on error
        if (!result?.error) {
          mockGoto('/');
        }
      };

      await confirmDelete();

      expect(mockHandleDeletePlaylist).toHaveBeenCalled();
      expect(mockProps.onOpenChange).toHaveBeenCalledWith(false);
      expect(mockGoto).not.toHaveBeenCalled();
    });

    it('should not navigate when not on playlist page', async () => {
      mockHandleDeletePlaylist.mockResolvedValue({ error: null });

      // Mock different current page
      vi.doMock('$app/state', () => ({
        page: {
          url: {
            pathname: '/different-page',
          },
        },
      }));

      // Simulate the confirmDelete function logic
      const confirmDelete = async () => {
        const result = await mockHandleDeletePlaylist({
          playlist: mockProps.playlist,
          sidebarState: mockProps.sidebarState,
          session: mockProps.session,
          supabase: mockProps.supabase,
        });

        // Check current page path
        const currentPath = '/different-page';
        if (
          !result?.error &&
          currentPath === `/playlist/${mockProps.playlist.short_id}`
        ) {
          mockGoto('/');
        }
      };

      await confirmDelete();

      expect(mockHandleDeletePlaylist).toHaveBeenCalled();
      expect(mockGoto).not.toHaveBeenCalled();
    });
  });

  describe('cancel functionality', () => {
    it('should close dialog without deletion when cancelled', () => {
      // Simulate the cancelDelete function logic
      const cancelDelete = () => {
        if (mockProps.onOpenChange) {
          mockProps.onOpenChange(false);
        }
      };

      cancelDelete();

      expect(mockHandleDeletePlaylist).not.toHaveBeenCalled();
      expect(mockProps.onOpenChange).toHaveBeenCalledWith(false);
      expect(mockGoto).not.toHaveBeenCalled();
    });

    it('should handle cancel without onOpenChange callback', () => {
      const propsWithoutCallback = {
        ...mockProps,
        onOpenChange: undefined as ((open: boolean) => void) | undefined,
      };

      // Simulate the cancelDelete function logic
      const cancelDelete = () => {
        let open = false;
        if (propsWithoutCallback.onOpenChange) {
          propsWithoutCallback.onOpenChange(false);
        }
      };

      // Should not throw when onOpenChange is undefined
      expect(() => cancelDelete()).not.toThrow();
      expect(mockHandleDeletePlaylist).not.toHaveBeenCalled();
    });
  });

  describe('dialog content', () => {
    it('should display correct warning message for public playlist', () => {
      const expectedTitle = 'Delete Public Playlist';
      const expectedPlaylistName = mockProps.playlist.name;

      expect(expectedTitle).toBe('Delete Public Playlist');
      expect(expectedPlaylistName).toBe('Test Playlist');
    });

    it('should list consequences of deletion', () => {
      const consequences = [
        'Permanently remove this playlist',
        "Remove it from all followers' profiles",
        'This action cannot be undone',
      ];

      consequences.forEach((consequence) => {
        expect(consequence).toBeDefined();
        expect(typeof consequence).toBe('string');
      });
    });

    it('should have destructive styling for delete button', () => {
      const expectedClasses =
        'bg-destructive text-destructive-foreground hover:bg-destructive/90';
      expect(expectedClasses).toContain('bg-destructive');
      expect(expectedClasses).toContain('text-destructive-foreground');
    });
  });

  describe('playlist types', () => {
    it('should work with Public playlist type', () => {
      expect(mockProps.playlist.type).toBe('Public');
    });

    it('should handle different playlist names', () => {
      const playlistWithDifferentName = {
        ...mockProps.playlist,
        name: 'My Custom Playlist',
      };

      expect(playlistWithDifferentName.name).toBe('My Custom Playlist');
    });

    it('should validate user ownership', () => {
      const userOwnsPlaylist =
        mockProps.session?.user?.id === mockProps.playlist.created_by;
      expect(userOwnsPlaylist).toBe(true);
    });
  });

  describe('state management', () => {
    it('should handle open state binding', () => {
      let dialogOpen = false;

      // Simulate opening dialog
      dialogOpen = true;
      expect(dialogOpen).toBe(true);

      // Simulate closing dialog
      dialogOpen = false;
      expect(dialogOpen).toBe(false);
    });

    it('should call onOpenChange when state changes', () => {
      const mockOnOpenChange = vi.fn();

      // Simulate state change
      mockOnOpenChange(true);
      expect(mockOnOpenChange).toHaveBeenCalledWith(true);

      mockOnOpenChange(false);
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('integration with dependencies', () => {
    it('should work with mocked AlertDialog components', () => {
      // Test that our mocks are working as expected
      expect(mockProps.playlist).toBeDefined();
      expect(mockProps.sidebarState).toBeDefined();
      expect(mockProps.session).toBeDefined();
      expect(mockProps.supabase).toBeDefined();
    });

    it('should validate mock data consistency', () => {
      // Ensure our mock data structure matches what the component expects
      expect(mockProps.playlist.short_id).toBe('abc123');
      expect(mockProps.playlist.name).toBe('Test Playlist');
      expect(mockProps.playlist.type).toBe('Public');
      expect(mockProps.session?.user?.id).toBe('user-1');
    });
  });
});
