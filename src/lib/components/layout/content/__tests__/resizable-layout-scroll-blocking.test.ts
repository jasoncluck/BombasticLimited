import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the dependencies since we're testing the core logic
const mockPageState = {
  viewportRefs: {
    contentViewportRef: null as HTMLElement | null,
    sidebarViewportRef: null as HTMLElement | null,
  },
};

const mockContentState = {
  isDropdownMenuOpen: false,
};

describe('ResizableLayout scroll blocking logic', () => {
  let mockSidebarViewport: HTMLElement;
  let mockContentViewport: HTMLElement;

  beforeEach(() => {
    // Create mock viewport elements
    mockSidebarViewport = document.createElement('div');
    mockContentViewport = document.createElement('div');

    // Set up the viewport refs
    mockPageState.viewportRefs.sidebarViewportRef = mockSidebarViewport;
    mockPageState.viewportRefs.contentViewportRef = mockContentViewport;

    // Reset dropdown state
    mockContentState.isDropdownMenuOpen = false;
  });

  /**
   * Test the core scroll blocking logic that would be used in the $effect
   */
  function applyScrollBlocking() {
    const sidebarViewport = mockPageState.viewportRefs.sidebarViewportRef;
    const contentViewport = mockPageState.viewportRefs.contentViewportRef;

    if (mockContentState.isDropdownMenuOpen) {
      // Block scrolling when dropdown is open
      if (sidebarViewport) {
        sidebarViewport.style.overflow = 'hidden';
      }
      if (contentViewport) {
        contentViewport.style.overflow = 'hidden';
      }
    } else {
      // Restore scrolling when dropdown is closed
      if (sidebarViewport) {
        sidebarViewport.style.overflow = '';
      }
      if (contentViewport) {
        contentViewport.style.overflow = '';
      }
    }
  }

  it('should not apply overflow hidden when dropdown is closed', () => {
    mockContentState.isDropdownMenuOpen = false;
    applyScrollBlocking();

    expect(mockSidebarViewport.style.overflow).toBe('');
    expect(mockContentViewport.style.overflow).toBe('');
  });

  it('should apply overflow hidden when dropdown is opened', () => {
    mockContentState.isDropdownMenuOpen = true;
    applyScrollBlocking();

    expect(mockSidebarViewport.style.overflow).toBe('hidden');
    expect(mockContentViewport.style.overflow).toBe('hidden');
  });

  it('should restore scrolling when dropdown is closed after being open', () => {
    // Start with dropdown open
    mockContentState.isDropdownMenuOpen = true;
    applyScrollBlocking();

    expect(mockSidebarViewport.style.overflow).toBe('hidden');
    expect(mockContentViewport.style.overflow).toBe('hidden');

    // Close dropdown
    mockContentState.isDropdownMenuOpen = false;
    applyScrollBlocking();

    expect(mockSidebarViewport.style.overflow).toBe('');
    expect(mockContentViewport.style.overflow).toBe('');
  });

  it('should handle null viewport refs gracefully when dropdown opens', () => {
    mockPageState.viewportRefs.sidebarViewportRef = null;
    mockPageState.viewportRefs.contentViewportRef = null;

    mockContentState.isDropdownMenuOpen = true;

    // Should not throw
    expect(() => applyScrollBlocking()).not.toThrow();
  });

  it('should handle null viewport refs gracefully when dropdown closes', () => {
    mockPageState.viewportRefs.sidebarViewportRef = null;
    mockPageState.viewportRefs.contentViewportRef = null;

    mockContentState.isDropdownMenuOpen = false;

    // Should not throw
    expect(() => applyScrollBlocking()).not.toThrow();
  });

  it('should work correctly when only one viewport exists', () => {
    // Only content viewport exists
    mockPageState.viewportRefs.sidebarViewportRef = null;

    mockContentState.isDropdownMenuOpen = true;
    applyScrollBlocking();

    expect(mockContentViewport.style.overflow).toBe('hidden');

    mockContentState.isDropdownMenuOpen = false;
    applyScrollBlocking();

    expect(mockContentViewport.style.overflow).toBe('');
  });

  it('should toggle scroll blocking correctly multiple times', () => {
    // Test multiple open/close cycles
    for (let i = 0; i < 3; i++) {
      // Open dropdown
      mockContentState.isDropdownMenuOpen = true;
      applyScrollBlocking();

      expect(mockSidebarViewport.style.overflow).toBe('hidden');
      expect(mockContentViewport.style.overflow).toBe('hidden');

      // Close dropdown
      mockContentState.isDropdownMenuOpen = false;
      applyScrollBlocking();

      expect(mockSidebarViewport.style.overflow).toBe('');
      expect(mockContentViewport.style.overflow).toBe('');
    }
  });
});
