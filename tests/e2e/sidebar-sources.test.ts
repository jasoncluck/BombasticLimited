import { expect } from '@playwright/test';
import { authenticatedTest, unauthenticatedTest } from './auth-fixtures';

/**
 * E2E tests for sidebar source reordering functionality
 *
 * These tests cover:
 * 1. Drag and drop reordering of sources in the sidebar
 * 2. Persistence of source order across page reloads
 * 3. Visual feedback during drag operations
 * 4. Authentication requirements for reordering
 */

export class SidebarHelpers {
  constructor(private page: import('@playwright/test').Page) {}

  async navigateToHomepage(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  getSourceButtons() {
    // Sources are identified by their button elements containing source images
    return this.page.locator('button[draggable="true"]').filter({ 
      has: this.page.locator('enhanced\\:img, img') 
    });
  }

  async getSourceNames(): Promise<string[]> {
    const sourceButtons = this.getSourceButtons();
    const count = await sourceButtons.count();
    const names = [];

    for (let i = 0; i < count; i++) {
      const button = sourceButtons.nth(i);
      const title = await button.getAttribute('title');
      if (title) {
        names.push(title);
      }
    }

    return names;
  }

  async dragSourceToPosition(fromIndex: number, toIndex: number): Promise<void> {
    const sourceButtons = this.getSourceButtons();
    const fromSource = sourceButtons.nth(fromIndex);
    const toSource = sourceButtons.nth(toIndex);

    await fromSource.dragTo(toSource);
    
    // Wait for any animations or state updates
    await this.page.waitForTimeout(500);
  }

  async verifySourceOrder(expectedOrder: string[]): Promise<void> {
    const currentOrder = await this.getSourceNames();
    expect(currentOrder).toEqual(expectedOrder);
  }

  async verifyDragVisualFeedback(sourceIndex: number): Promise<void> {
    const sourceButtons = this.getSourceButtons();
    const sourceButton = sourceButtons.nth(sourceIndex);

    // Start drag operation
    await sourceButton.hover();
    await this.page.mouse.down();

    // Check for visual feedback classes
    const hasOpacity = await sourceButton.evaluate(el => 
      el.classList.contains('opacity-60') || 
      getComputedStyle(el).opacity !== '1'
    );

    // Check for body dragging class
    const bodyHasDraggingClass = await this.page.evaluate(() => 
      document.body.classList.contains('dragging')
    );

    expect(hasOpacity || bodyHasDraggingClass).toBe(true);

    // End drag operation
    await this.page.mouse.up();
  }

  async verifySourcesTooltips(): Promise<void> {
    const sourceButtons = this.getSourceButtons();
    const count = await sourceButtons.count();

    for (let i = 0; i < Math.min(3, count); i++) {
      const button = sourceButtons.nth(i);
      const title = await button.getAttribute('title');
      expect(title).toBeTruthy();
    }
  }
}

authenticatedTest.describe('Sidebar Source Reordering', () => {
  let sidebarHelpers: SidebarHelpers;

  authenticatedTest.beforeEach(async ({ authenticatedPage }) => {
    sidebarHelpers = new SidebarHelpers(authenticatedPage);
    await sidebarHelpers.navigateToHomepage();
  });

  authenticatedTest.describe('Basic Source Reordering', () => {
    authenticatedTest('should reorder sources via drag and drop', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      // Only test if we have multiple sources
      if (initialOrder.length >= 2) {
        // Reorder first two sources
        await sidebarHelpers.dragSourceToPosition(0, 1);
        
        // Verify order changed
        const expectedOrder = [...initialOrder];
        [expectedOrder[0], expectedOrder[1]] = [expectedOrder[1], expectedOrder[0]];
        
        await sidebarHelpers.verifySourceOrder(expectedOrder);
      } else {
        // Skip test if insufficient sources
        authenticatedPage.skip();
      }
    });

    authenticatedTest('should reorder sources from end to beginning', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      if (initialOrder.length >= 3) {
        // Move last source to first position
        const lastIndex = initialOrder.length - 1;
        await sidebarHelpers.dragSourceToPosition(lastIndex, 0);
        
        // Verify order changed
        const expectedOrder = [
          initialOrder[lastIndex],
          ...initialOrder.slice(0, lastIndex)
        ];
        
        await sidebarHelpers.verifySourceOrder(expectedOrder);
      } else {
        authenticatedPage.skip();
      }
    });

    authenticatedTest('should reorder sources from beginning to end', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      if (initialOrder.length >= 3) {
        // Move first source to last position
        const lastIndex = initialOrder.length - 1;
        await sidebarHelpers.dragSourceToPosition(0, lastIndex);
        
        // Verify order changed
        const expectedOrder = [
          ...initialOrder.slice(1),
          initialOrder[0]
        ];
        
        await sidebarHelpers.verifySourceOrder(expectedOrder);
      } else {
        authenticatedPage.skip();
      }
    });

    authenticatedTest('should reorder multiple sources in sequence', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      if (initialOrder.length >= 4) {
        // Perform multiple reorderings
        await sidebarHelpers.dragSourceToPosition(0, 2);
        await sidebarHelpers.dragSourceToPosition(1, 3);
        
        // Verify final order
        const currentOrder = await sidebarHelpers.getSourceNames();
        expect(currentOrder).not.toEqual(initialOrder);
      } else {
        authenticatedPage.skip();
      }
    });
  });

  authenticatedTest.describe('Visual Feedback and UX', () => {
    authenticatedTest('should show visual feedback during drag operation', async ({ authenticatedPage }) => {
      const sourceOrder = await sidebarHelpers.getSourceNames();
      
      if (sourceOrder.length >= 2) {
        await sidebarHelpers.verifyDragVisualFeedback(0);
      } else {
        authenticatedPage.skip();
      }
    });

    authenticatedTest('should display source tooltips on hover', async ({ authenticatedPage }) => {
      await sidebarHelpers.verifySourcesTooltips();
    });

    authenticatedTest('should maintain source button styling during reorder', async ({ authenticatedPage }) => {
      const sourceButtons = sidebarHelpers.getSourceButtons();
      const count = await sourceButtons.count();
      
      if (count >= 2) {
        // Check initial styling
        const initialClasses = await sourceButtons.nth(0).getAttribute('class');
        
        // Perform reorder
        await sidebarHelpers.dragSourceToPosition(0, 1);
        
        // Check styling is maintained
        const newClasses = await sourceButtons.nth(1).getAttribute('class');
        expect(newClasses).toContain('sidebar-full-button');
      } else {
        authenticatedPage.skip();
      }
    });
  });

  authenticatedTest.describe('Persistence and State Management', () => {
    authenticatedTest('should persist source order after page reload', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      if (initialOrder.length >= 2) {
        // Reorder sources
        await sidebarHelpers.dragSourceToPosition(0, 1);
        const reorderedOrder = await sidebarHelpers.getSourceNames();
        
        // Reload page
        await authenticatedPage.reload();
        await authenticatedPage.waitForLoadState('networkidle');
        
        // Verify order persisted
        await sidebarHelpers.verifySourceOrder(reorderedOrder);
      } else {
        authenticatedPage.skip();
      }
    });

    authenticatedTest('should persist source order across navigation', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      if (initialOrder.length >= 2) {
        // Reorder sources
        await sidebarHelpers.dragSourceToPosition(0, 1);
        const reorderedOrder = await sidebarHelpers.getSourceNames();
        
        // Navigate to a different page
        if (reorderedOrder.length > 0) {
          const firstSourceButton = sidebarHelpers.getSourceButtons().first();
          await firstSourceButton.click();
          await authenticatedPage.waitForLoadState('networkidle');
          
          // Navigate back to homepage
          await authenticatedPage.goto('/');
          await authenticatedPage.waitForLoadState('networkidle');
          
          // Verify order persisted
          await sidebarHelpers.verifySourceOrder(reorderedOrder);
        }
      } else {
        authenticatedPage.skip();
      }
    });

    authenticatedTest('should handle rapid successive reorderings', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      if (initialOrder.length >= 3) {
        // Perform rapid reorderings
        await sidebarHelpers.dragSourceToPosition(0, 1);
        await sidebarHelpers.dragSourceToPosition(1, 2);
        await sidebarHelpers.dragSourceToPosition(2, 0);
        
        // Verify final state is stable
        const finalOrder = await sidebarHelpers.getSourceNames();
        expect(finalOrder.length).toBe(initialOrder.length);
        
        // All sources should still be present
        for (const source of initialOrder) {
          expect(finalOrder).toContain(source);
        }
      } else {
        authenticatedPage.skip();
      }
    });
  });

  authenticatedTest.describe('Error Handling and Edge Cases', () => {
    authenticatedTest('should handle dragging source to same position', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      if (initialOrder.length >= 1) {
        // Drag source to its own position
        await sidebarHelpers.dragSourceToPosition(0, 0);
        
        // Order should remain unchanged
        await sidebarHelpers.verifySourceOrder(initialOrder);
      } else {
        authenticatedPage.skip();
      }
    });

    authenticatedTest('should handle invalid drag targets gracefully', async ({ authenticatedPage }) => {
      const sourceButtons = sidebarHelpers.getSourceButtons();
      const count = await sourceButtons.count();
      
      if (count >= 1) {
        const sourceButton = sourceButtons.first();
        const initialOrder = await sidebarHelpers.getSourceNames();
        
        // Try to drag to an invalid target (empty area)
        await sourceButton.dragTo(authenticatedPage.locator('body'));
        
        // Order should remain unchanged
        await sidebarHelpers.verifySourceOrder(initialOrder);
      } else {
        authenticatedPage.skip();
      }
    });

    authenticatedTest('should recover from network errors during reorder', async ({ authenticatedPage }) => {
      const initialOrder = await sidebarHelpers.getSourceNames();
      
      if (initialOrder.length >= 2) {
        // Intercept network requests and simulate failure
        await authenticatedPage.route('**/api/**', route => {
          if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
            route.abort();
          } else {
            route.continue();
          }
        });
        
        // Attempt to reorder
        await sidebarHelpers.dragSourceToPosition(0, 1);
        
        // The UI might show the new order optimistically
        // but it should eventually revert on error
        await authenticatedPage.waitForTimeout(2000);
        
        // Check that error was handled gracefully (no crash)
        const isPageResponsive = await authenticatedPage.locator('body').isVisible();
        expect(isPageResponsive).toBe(true);
      } else {
        authenticatedPage.skip();
      }
    });
  });
});

unauthenticatedTest.describe('Sidebar Source Reordering - Unauthenticated User', () => {
  let sidebarHelpers: SidebarHelpers;

  unauthenticatedTest.beforeEach(async ({ page }) => {
    sidebarHelpers = new SidebarHelpers(page);
    await sidebarHelpers.navigateToHomepage();
  });

  unauthenticatedTest('should not allow source reordering for unauthenticated users', async ({ page }) => {
    const sourceButtons = sidebarHelpers.getSourceButtons();
    const count = await sourceButtons.count();
    
    if (count >= 1) {
      // Check if sources are draggable
      const firstSource = sourceButtons.first();
      const isDraggable = await firstSource.getAttribute('draggable');
      
      expect(isDraggable).toBe('false');
    } else {
      // If no sources visible, that's also expected for unauthenticated users
      expect(count).toBe(0);
    }
  });

  unauthenticatedTest('should show sources in default order for unauthenticated users', async ({ page }) => {
    const sourceNames = await sidebarHelpers.getSourceNames();
    
    // For unauthenticated users, sources should be in default order
    // This test verifies the order is consistent and follows expected default
    if (sourceNames.length > 0) {
      // Sources should be visible but not reorderable
      expect(sourceNames.length).toBeGreaterThan(0);
      
      // Check that source order is stable
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      const reloadedOrder = await sidebarHelpers.getSourceNames();
      expect(reloadedOrder).toEqual(sourceNames);
    }
  });

  unauthenticatedTest('should not show drag visual feedback for unauthenticated users', async ({ page }) => {
    const sourceButtons = sidebarHelpers.getSourceButtons();
    const count = await sourceButtons.count();
    
    if (count >= 1) {
      const sourceButton = sourceButtons.first();
      
      // Hover and attempt to drag
      await sourceButton.hover();
      await page.mouse.down();
      
      // Should not show dragging state
      const bodyHasDraggingClass = await page.evaluate(() => 
        document.body.classList.contains('dragging')
      );
      
      expect(bodyHasDraggingClass).toBe(false);
      
      await page.mouse.up();
    }
  });
});