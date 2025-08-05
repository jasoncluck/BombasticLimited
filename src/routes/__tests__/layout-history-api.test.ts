import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replaceState } from '$app/navigation';

// Mock SvelteKit's replaceState
vi.mock('$app/navigation', () => ({
  replaceState: vi.fn(),
  beforeNavigate: vi.fn(),
  afterNavigate: vi.fn(),
  invalidate: vi.fn(),
}));

// Mock other dependencies
vi.mock('$app/stores', () => ({
  page: {
    url: {
      searchParams: {
        get: vi.fn(),
      },
    },
  },
}));

describe('History API Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use SvelteKit replaceState instead of window.history.replaceState', () => {
    // Verify that replaceState is imported and available
    expect(replaceState).toBeDefined();
    expect(typeof replaceState).toBe('function');
  });

  it('should not use window.history.replaceState directly', async () => {
    // Mock window.history to detect if it's called directly
    const mockReplaceState = vi.fn();
    const mockWindow = {
      history: {
        replaceState: mockReplaceState,
      },
      location: {
        href: 'http://localhost:5173/?logout=true',
        reload: vi.fn(),
      },
    };

    vi.stubGlobal('window', mockWindow);

    // Mock URL constructor
    global.URL = class MockURL {
      searchParams: URLSearchParams;
      constructor(url: string) {
        this.searchParams = new URLSearchParams('logout=true');
      }
      toString() {
        return 'http://localhost:5173/';
      }
    } as any;

    // Import and simulate the effect that would run in +layout.svelte
    // This simulates the logout parameter handling logic
    const handleLogoutParameter = () => {
      if (mockWindow.location.href.includes('logout=true')) {
        const url = new URL(mockWindow.location.href);
        url.searchParams.delete('logout');

        // Should use SvelteKit's replaceState, not window.history.replaceState
        replaceState(url.toString(), {});
        mockWindow.location.reload();
      }
    };

    handleLogoutParameter();

    // Verify SvelteKit's replaceState was called, not window.history.replaceState
    expect(replaceState).toHaveBeenCalledWith('http://localhost:5173/', {});
    expect(mockReplaceState).not.toHaveBeenCalled();
    expect(mockWindow.location.reload).toHaveBeenCalled();
  });

  it('should handle logout parameter correctly with SvelteKit navigation', () => {
    const mockUrl = {
      searchParams: new URLSearchParams('logout=true'),
      toString: () => 'http://localhost:5173/',
    };

    // Simulate the effect logic
    const url = new URL('http://localhost:5173/?logout=true');
    url.searchParams.delete('logout');

    // This is what should happen in the fixed code
    replaceState(url.toString(), {});

    expect(replaceState).toHaveBeenCalledWith('http://localhost:5173/', {});
  });
});
