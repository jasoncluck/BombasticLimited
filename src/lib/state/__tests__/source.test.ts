import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SourceStateClass } from '../source.svelte.js';
import type { PageState } from '../page.svelte.js';

describe('SourceState', () => {
  let sourceState: SourceStateClass;
  let mockPageState: PageState;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock PageState with sidebar scroll state
    mockPageState = {
      sidebarScrollState: {
        scrolling: false,
      },
    } as PageState;

    sourceState = new SourceStateClass(mockPageState);
  });

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      expect(sourceState.hoveredSourceIndex).toBeNull();
      expect(sourceState.pageState).toBe(mockPageState);
    });

    it('should store reference to pageState', () => {
      expect(sourceState.pageState).toBe(mockPageState);
    });
  });

  describe('mouse hover handling', () => {
    describe('handleMouseEnter', () => {
      it('should set hovered index when not scrolling', () => {
        mockPageState.sidebarScrollState.scrolling = false;

        sourceState.handleMouseEnter(2);

        expect(sourceState.hoveredSourceIndex).toBe(2);
      });

      it('should not set hovered index when scrolling', () => {
        mockPageState.sidebarScrollState.scrolling = true;

        sourceState.handleMouseEnter(2);

        expect(sourceState.hoveredSourceIndex).toBeNull();
      });

      it('should update hovered index when called multiple times', () => {
        mockPageState.sidebarScrollState.scrolling = false;

        sourceState.handleMouseEnter(1);
        expect(sourceState.hoveredSourceIndex).toBe(1);

        sourceState.handleMouseEnter(3);
        expect(sourceState.hoveredSourceIndex).toBe(3);
      });

      it('should handle zero index correctly', () => {
        mockPageState.sidebarScrollState.scrolling = false;

        sourceState.handleMouseEnter(0);

        expect(sourceState.hoveredSourceIndex).toBe(0);
      });

      it('should handle negative index values', () => {
        mockPageState.sidebarScrollState.scrolling = false;

        sourceState.handleMouseEnter(-1);

        expect(sourceState.hoveredSourceIndex).toBe(-1);
      });
    });

    describe('handleMouseLeave', () => {
      it('should clear hovered index when it matches current hovered index', () => {
        sourceState.hoveredSourceIndex = 2;

        sourceState.handleMouseLeave(2);

        expect(sourceState.hoveredSourceIndex).toBeNull();
      });

      it('should not clear hovered index when it does not match', () => {
        sourceState.hoveredSourceIndex = 2;

        sourceState.handleMouseLeave(1);

        expect(sourceState.hoveredSourceIndex).toBe(2);
      });

      it('should handle clearing zero index correctly', () => {
        sourceState.hoveredSourceIndex = 0;

        sourceState.handleMouseLeave(0);

        expect(sourceState.hoveredSourceIndex).toBeNull();
      });

      it('should not affect state when hovered index is already null', () => {
        sourceState.hoveredSourceIndex = null;

        sourceState.handleMouseLeave(1);

        expect(sourceState.hoveredSourceIndex).toBeNull();
      });
    });

    describe('hover state transitions', () => {
      it('should handle enter then leave sequence', () => {
        mockPageState.sidebarScrollState.scrolling = false;

        sourceState.handleMouseEnter(2);
        expect(sourceState.hoveredSourceIndex).toBe(2);

        sourceState.handleMouseLeave(2);
        expect(sourceState.hoveredSourceIndex).toBeNull();
      });

      it('should handle multiple enter events', () => {
        mockPageState.sidebarScrollState.scrolling = false;

        sourceState.handleMouseEnter(1);
        sourceState.handleMouseEnter(2);
        sourceState.handleMouseEnter(3);

        expect(sourceState.hoveredSourceIndex).toBe(3);
      });

      it('should handle scrolling state change during hover', () => {
        mockPageState.sidebarScrollState.scrolling = false;
        sourceState.handleMouseEnter(2);
        expect(sourceState.hoveredSourceIndex).toBe(2);

        // Start scrolling and try to hover another item
        mockPageState.sidebarScrollState.scrolling = true;
        sourceState.handleMouseEnter(3);

        // Should not change from previous hovered index
        expect(sourceState.hoveredSourceIndex).toBe(2);
      });
    });
  });

  describe('getButtonClasses', () => {
    describe('base classes', () => {
      it('should always include base classes', () => {
        const options = {
          index: 0,
          isSelected: false,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('sidebar-full-button');
        expect(classes).toContain('transition-all');
        expect(classes).toContain('duration-200');
        expect(classes).toContain('ease-in-out');
      });

      it('should always include active state classes', () => {
        const options = {
          index: 0,
          isSelected: false,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('active:bg-secondary/70');
        expect(classes).toContain('active:scale-95');
        expect(classes).toContain('active:brightness-90');
      });
    });

    describe('hover state classes', () => {
      it('should add hover classes when item is hovered and not scrolling', () => {
        mockPageState.sidebarScrollState.scrolling = false;
        sourceState.hoveredSourceIndex = 2;

        const options = {
          index: 2,
          isSelected: false,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('bg-secondary/50');
        expect(classes).toContain('brightness-110');
      });

      it('should not add hover classes when item is not hovered', () => {
        mockPageState.sidebarScrollState.scrolling = false;
        sourceState.hoveredSourceIndex = 1;

        const options = {
          index: 2,
          isSelected: false,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).not.toContain('bg-secondary/50');
        expect(classes).not.toContain('brightness-110');
      });

      it('should not add hover classes when scrolling', () => {
        mockPageState.sidebarScrollState.scrolling = true;
        sourceState.hoveredSourceIndex = 2;

        const options = {
          index: 2,
          isSelected: false,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).not.toContain('bg-secondary/50');
        expect(classes).not.toContain('brightness-110');
      });

      it('should add different hover classes for selected items', () => {
        mockPageState.sidebarScrollState.scrolling = false;
        sourceState.hoveredSourceIndex = 2;

        const options = {
          index: 2,
          isSelected: true,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('brightness-110');
        expect(classes).not.toContain('bg-secondary/50'); // Should not have non-selected hover bg
      });
    });

    describe('selected state classes', () => {
      it('should add selected classes when item is selected', () => {
        const options = {
          index: 2,
          isSelected: true,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('bg-secondary');
        expect(classes).toContain('text-secondary-foreground');
      });

      it('should not add selected classes when item is not selected', () => {
        const options = {
          index: 2,
          isSelected: false,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        // Should not contain the exact "bg-secondary" class (but may contain "active:bg-secondary/70")
        expect(classes).not.toMatch(/\bbg-secondary\b(?!\/)/);
        expect(classes).not.toContain('text-secondary-foreground');
      });
    });

    describe('sidebar layout classes', () => {
      it('should add expanded sidebar classes when not collapsed', () => {
        const options = {
          index: 2,
          isSelected: false,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('min-w-[150px]');
        expect(classes).toContain('justify-normal');
        expect(classes).not.toContain('align-middle');
      });

      it('should add collapsed sidebar classes when collapsed', () => {
        const options = {
          index: 2,
          isSelected: false,
          isSidebarCollapsed: true,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('align-middle');
        expect(classes).not.toContain('min-w-[150px]');
        expect(classes).not.toContain('justify-normal');
      });
    });

    describe('combined state scenarios', () => {
      it('should handle selected and hovered state together', () => {
        mockPageState.sidebarScrollState.scrolling = false;
        sourceState.hoveredSourceIndex = 2;

        const options = {
          index: 2,
          isSelected: true,
          isSidebarCollapsed: false,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('bg-secondary');
        expect(classes).toContain('text-secondary-foreground');
        expect(classes).toContain('brightness-110');
        expect(classes).not.toContain('bg-secondary/50'); // Should not have non-selected hover bg
      });

      it('should handle collapsed sidebar with selected and hovered state', () => {
        mockPageState.sidebarScrollState.scrolling = false;
        sourceState.hoveredSourceIndex = 1;

        const options = {
          index: 1,
          isSelected: true,
          isSidebarCollapsed: true,
        };

        const classes = sourceState.getButtonClasses(options);

        expect(classes).toContain('bg-secondary');
        expect(classes).toContain('align-middle');
        expect(classes).toContain('brightness-110');
      });

      it('should handle all possible combinations', () => {
        const testCases = [
          { isSelected: false, isSidebarCollapsed: false, shouldHover: false },
          { isSelected: false, isSidebarCollapsed: false, shouldHover: true },
          { isSelected: false, isSidebarCollapsed: true, shouldHover: false },
          { isSelected: false, isSidebarCollapsed: true, shouldHover: true },
          { isSelected: true, isSidebarCollapsed: false, shouldHover: false },
          { isSelected: true, isSidebarCollapsed: false, shouldHover: true },
          { isSelected: true, isSidebarCollapsed: true, shouldHover: false },
          { isSelected: true, isSidebarCollapsed: true, shouldHover: true },
        ];

        testCases.forEach(
          ({ isSelected, isSidebarCollapsed, shouldHover }, idx) => {
            mockPageState.sidebarScrollState.scrolling = false;
            sourceState.hoveredSourceIndex = shouldHover ? idx : null;

            const options = {
              index: idx,
              isSelected,
              isSidebarCollapsed,
            };

            const classes = sourceState.getButtonClasses(options);

            // Verify base classes are always present
            expect(classes).toContain('sidebar-full-button');

            // Verify layout classes are correct
            if (isSidebarCollapsed) {
              expect(classes).toContain('align-middle');
            } else {
              expect(classes).toContain('min-w-[150px]');
            }

            // Verify selected classes
            if (isSelected) {
              expect(classes).toContain('bg-secondary');
            }

            // Verify hover classes
            if (shouldHover) {
              expect(classes).toContain('brightness-110');
            }
          }
        );
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle undefined pageState properties gracefully', () => {
      const mockPageStateWithoutScroll = {
        sidebarScrollState: undefined,
      } as any;
      const stateWithBadPage = new SourceStateClass(mockPageStateWithoutScroll);

      // Should throw since the implementation accesses scrolling property
      expect(() => stateWithBadPage.handleMouseEnter(0)).toThrow();
    });

    it('should handle large index values', () => {
      mockPageState.sidebarScrollState.scrolling = false;

      sourceState.handleMouseEnter(999);
      expect(sourceState.hoveredSourceIndex).toBe(999);

      sourceState.handleMouseLeave(999);
      expect(sourceState.hoveredSourceIndex).toBeNull();
    });

    it('should handle negative index values correctly in getButtonClasses', () => {
      sourceState.hoveredSourceIndex = -1;

      const options = {
        index: -1,
        isSelected: false,
        isSidebarCollapsed: false,
      };

      const classes = sourceState.getButtonClasses(options);

      expect(classes).toContain('sidebar-full-button');
    });

    it('should handle null hovered index in getButtonClasses', () => {
      sourceState.hoveredSourceIndex = null;

      const options = {
        index: 0,
        isSelected: false,
        isSidebarCollapsed: false,
      };

      const classes = sourceState.getButtonClasses(options);

      expect(classes).not.toContain('brightness-110');
      expect(classes).not.toContain('bg-secondary/50');
    });
  });

  describe('state consistency', () => {
    it('should maintain state consistency across operations', () => {
      mockPageState.sidebarScrollState.scrolling = false;

      // Sequence of operations
      sourceState.handleMouseEnter(1);
      expect(sourceState.hoveredSourceIndex).toBe(1);

      sourceState.handleMouseEnter(2);
      expect(sourceState.hoveredSourceIndex).toBe(2);

      sourceState.handleMouseLeave(1); // Wrong index
      expect(sourceState.hoveredSourceIndex).toBe(2); // Should remain unchanged

      sourceState.handleMouseLeave(2); // Correct index
      expect(sourceState.hoveredSourceIndex).toBeNull();
    });

    it('should handle rapid state changes', () => {
      mockPageState.sidebarScrollState.scrolling = false;

      for (let i = 0; i < 10; i++) {
        sourceState.handleMouseEnter(i);
        expect(sourceState.hoveredSourceIndex).toBe(i);
      }

      sourceState.handleMouseLeave(9);
      expect(sourceState.hoveredSourceIndex).toBeNull();
    });
  });
});
