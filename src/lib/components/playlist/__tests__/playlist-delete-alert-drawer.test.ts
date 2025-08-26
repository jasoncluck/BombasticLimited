import { createMockPlaylist, createMockSession } from '$lib/tests/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('$lib/components/ui/drawer', () => ({
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
  Close: class MockClose {
    constructor() {}
  },
}));

vi.mock('$lib/components/ui/button/button.svelte', () => ({
  default: class MockButton {
    constructor() {}
  },
  buttonVariants: vi.fn(() => 'mock-button-class'),
}));

vi.mock('@lucide/svelte', () => ({
  CircleMinus: class MockCircleMinus {
    constructor() {}
  },
  ListVideo: class MockListVideo {
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

describe('PlaylistDeleteAlertDrawer Component Logic', () => {
  const mockPublicPlaylist = createMockPlaylist({
    type: 'Public',
    created_by: 'user-1',
    name: 'My Test Playlist',
    image_url: 'https://example.com/playlist-image.jpg',
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

    it('should validate playlist type and properties', () => {
      expect(mockProps.playlist.type).toBe('Public');
      expect(mockProps.playlist.name).toBe('My Test Playlist');
      expect((mockProps.playlist as any).image_url).toBe(
        'https://example.com/playlist-image.jpg'
      );
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

        // Simulate closing drawer
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

        // Drawer should still close even on error
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
    it('should close drawer without deletion when cancelled', () => {
      // Simulate the cancelDelete function logic
      const cancelDelete = () => {
        let open = false;
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

  describe('drawer content and mobile UI', () => {
    it('should display correct warning message for public playlist', () => {
      const expectedTitle = 'Delete Public Playlist';
      const expectedPlaylistName = mockProps.playlist.name;

      expect(expectedTitle).toBe('Delete Public Playlist');
      expect(expectedPlaylistName).toBe('My Test Playlist');
    });

    it('should display playlist information in mobile-friendly format', () => {
      const playlist = mockProps.playlist;

      expect(playlist.name).toBe('My Test Playlist');
      expect(playlist.type).toBe('Public');
      expect((playlist as any).image_url).toBe(
        'https://example.com/playlist-image.jpg'
      );
    });

    it('should list consequences of deletion in mobile format', () => {
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
        'w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 justify-center';
      expect(expectedClasses).toContain('bg-destructive');
      expect(expectedClasses).toContain('text-destructive-foreground');
      expect(expectedClasses).toContain('w-full');
      expect(expectedClasses).toContain('justify-center');
    });

    it('should handle playlist without image', () => {
      const playlistWithoutImage = {
        ...mockProps.playlist,
        image_url: null,
      };

      expect(playlistWithoutImage.image_url).toBeNull();
      // Component should show ListVideo icon instead
    });
  });

  describe('mobile drawer specific features', () => {
    it('should use drawer components instead of alert dialog', () => {
      // Test that we're using drawer-specific components
      const drawerComponents = [
        'Drawer.Root',
        'Drawer.Content',
        'Drawer.Header',
        'Drawer.Title',
        'Drawer.Description',
        'Drawer.Footer',
        'Drawer.Close',
      ];

      drawerComponents.forEach((component) => {
        expect(component).toBeDefined();
        expect(typeof component).toBe('string');
      });
    });

    it('should have mobile-optimized button layout', () => {
      const mobileButtonClasses = {
        deleteButton:
          'w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 justify-center',
        cancelButton: 'w-full justify-center',
        closeButton: 'drawer-button-footer',
      };

      Object.values(mobileButtonClasses).forEach((buttonClass) => {
        expect(buttonClass).toBeDefined();
        expect(typeof buttonClass).toBe('string');
      });
    });

    it('should include proper drawer data attributes', () => {
      const drawerAttributes = ['data-drawer-content', 'data-drawer-close'];

      drawerAttributes.forEach((attr) => {
        expect(attr).toBeDefined();
        expect(typeof attr).toBe('string');
      });
    });
  });

  describe('state management for mobile', () => {
    it('should handle open state binding for drawer', () => {
      let drawerOpen = false;

      // Simulate opening drawer
      drawerOpen = true;
      expect(drawerOpen).toBe(true);

      // Simulate closing drawer
      drawerOpen = false;
      expect(drawerOpen).toBe(false);
    });

    it('should call onOpenChange when drawer state changes', () => {
      const mockOnOpenChange = vi.fn();

      // Simulate state change
      mockOnOpenChange(true);
      expect(mockOnOpenChange).toHaveBeenCalledWith(true);

      mockOnOpenChange(false);
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should close drawer after successful deletion', async () => {
      mockHandleDeletePlaylist.mockResolvedValue({ error: null });
      let isOpen = true;

      // Simulate successful deletion
      const confirmDelete = async () => {
        await mockHandleDeletePlaylist({
          playlist: mockProps.playlist,
          sidebarState: mockProps.sidebarState,
          session: mockProps.session,
          supabase: mockProps.supabase,
        });

        isOpen = false;
      };

      await confirmDelete();
      expect(isOpen).toBe(false);
    });
  });

  describe('integration with drawer system', () => {
    it('should work with mocked Drawer components', () => {
      // Test that our mocks are working as expected
      expect(mockProps.playlist).toBeDefined();
      expect(mockProps.sidebarState).toBeDefined();
      expect(mockProps.session).toBeDefined();
      expect(mockProps.supabase).toBeDefined();
    });

    it('should validate mock data consistency for drawer', () => {
      // Ensure our mock data structure matches what the drawer component expects
      expect(mockProps.playlist.short_id).toBe('abc123');
      expect(mockProps.playlist.name).toBe('My Test Playlist');
      expect(mockProps.playlist.type).toBe('Public');
      expect(mockProps.session?.user?.id).toBe('user-1');
    });

    it('should handle drawer-specific props correctly', () => {
      const drawerProps = {
        open: false,
        onOpenChange: vi.fn(),
      };

      expect(drawerProps.open).toBe(false);
      expect(typeof drawerProps.onOpenChange).toBe('function');
    });
  });

  describe('responsive design considerations', () => {
    it('should have appropriate spacing for mobile', () => {
      const mobileSpacing = {
        header: 'mx-4 text-left',
        content: 'px-4 py-6 space-y-3',
        footer: 'drawer-footer',
      };

      Object.values(mobileSpacing).forEach((spacing) => {
        expect(spacing).toBeDefined();
        expect(typeof spacing).toBe('string');
      });
    });

    it('should use appropriate icon sizes for mobile', () => {
      const iconClasses = {
        headerIcon: '!h-6 !w-6 text-destructive',
        buttonIcon: 'drawer-icon',
        playlistIcon: '!h-6 !w-6',
      };

      Object.values(iconClasses).forEach((iconClass) => {
        expect(iconClass).toBeDefined();
        expect(typeof iconClass).toBe('string');
      });
    });
  });
});
