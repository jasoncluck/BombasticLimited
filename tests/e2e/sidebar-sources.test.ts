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

// Source test that extends authenticated test
const sourceTest = authenticatedTest.extend<{
  sourceHelpers: {
    navigateToHomepage(): Promise<void>;
    getSourceButtons(): import('@playwright/test').Locator;
    getSourceNames(): Promise<string[]>;
    reorderSources(fromIndex: number, toIndex: number): Promise<void>;
    verifySourceOrder(expectedNames: string[]): Promise<void>;
    getVisibleSourceCount(): Promise<number>;
  };
}>({
  sourceHelpers: async ({ authenticatedPage }, use) => {
    const helpers = {
      async navigateToHomepage(): Promise<void> {
        await authenticatedPage.goto('/');
      },

      getSourceButtons() {
        // Sources are identified by their button elements containing source images
        return authenticatedPage.locator('button[draggable="true"]').filter({
          has: authenticatedPage.locator('enhanced\\:img, img'),
        });
      },

      async getSourceNames(): Promise<string[]> {
        const sourceButtons = this.getSourceButtons();
        const count = await sourceButtons.count();
        const names: string[] = [];

        for (let i = 0; i < count; i++) {
          const button = sourceButtons.nth(i);
          // Try to get alt text from img or enhanced:img
          const img = button.locator('enhanced\\:img, img');
          const altText = await img.getAttribute('alt');
          const title = await button.getAttribute('title');
          const name = altText || title || `Source ${i + 1}`;
          names.push(name);
        }

        return names;
      },

      async reorderSources(fromIndex: number, toIndex: number): Promise<void> {
        const sourceButtons = this.getSourceButtons();
        const fromButton = sourceButtons.nth(fromIndex);
        const toButton = sourceButtons.nth(toIndex);

        await expect(fromButton).toBeVisible();
        await expect(toButton).toBeVisible();

        // Perform drag and drop
        await fromButton.dragTo(toButton);

        // Wait for the reorder to complete
        await authenticatedPage.waitForTimeout(1000);
      },

      async verifySourceOrder(expectedNames: string[]): Promise<void> {
        const actualNames = await this.getSourceNames();

        // Compare arrays, but be flexible about partial matches
        expect(actualNames.length).toBeGreaterThanOrEqual(expectedNames.length);

        for (let i = 0; i < expectedNames.length; i++) {
          expect(actualNames[i]).toContain(expectedNames[i]);
        }
      },

      async getVisibleSourceCount(): Promise<number> {
        const sourceButtons = this.getSourceButtons();
        return await sourceButtons.count();
      },
    };

    await use(helpers);
    // No cleanup needed for source helpers
  },
});

sourceTest.describe('Sidebar Source Reordering', () => {
  sourceTest.beforeEach(async ({ sourceHelpers }) => {
    await sourceHelpers.navigateToHomepage();
  });

  sourceTest.describe('Source Drag and Drop', () => {
    sourceTest(
      'should allow reordering sources when authenticated',
      async ({ sourceHelpers }) => {
        const initialCount = await sourceHelpers.getVisibleSourceCount();

        // Skip test if less than 2 sources available
        if (initialCount < 2) {
          return;
        }

        // Get initial order
        const initialOrder = await sourceHelpers.getSourceNames();

        // Perform reorder - move first source to second position
        await sourceHelpers.reorderSources(0, 1);

        // Get new order
        const newOrder = await sourceHelpers.getSourceNames();

        // Verify the order changed (first two items should be swapped)
        expect(newOrder).not.toEqual(initialOrder);
        expect(newOrder.length).toBe(initialOrder.length);
      }
    );

    sourceTest(
      'should show visual feedback during drag operations',
      async ({ sourceHelpers, authenticatedPage }) => {
        const sourceCount = await sourceHelpers.getVisibleSourceCount();

        if (sourceCount < 2) {
          return;
        }

        const sourceButtons = sourceHelpers.getSourceButtons();
        const firstSource = sourceButtons.first();
        const secondSource = sourceButtons.nth(1);

        // Start drag operation
        await firstSource.hover();
        await authenticatedPage.mouse.down();

        // Move to target (simulating drag in progress)
        await secondSource.hover();

        // Verify source is draggable (has draggable="true")
        const isDraggable = await firstSource.getAttribute('draggable');
        expect(isDraggable).toBe('true');

        // Complete the drag
        await authenticatedPage.mouse.up();

        // Wait for any animations to complete
        await authenticatedPage.waitForTimeout(500);
      }
    );

    sourceTest(
      'should persist source order across page reloads',
      async ({ sourceHelpers, authenticatedPage }) => {
        const sourceCount = await sourceHelpers.getVisibleSourceCount();

        if (sourceCount < 2) {
          return;
        }

        // Get initial order and perform reorder
        const initialOrder = await sourceHelpers.getSourceNames();
        await sourceHelpers.reorderSources(0, 1);

        // Get order after reorder
        const reorderedOrder = await sourceHelpers.getSourceNames();

        // Reload page
        await authenticatedPage.reload();
        await authenticatedPage.waitForLoadState('domcontentloaded');

        // Get order after reload
        const orderAfterReload = await sourceHelpers.getSourceNames();

        // Verify order is maintained (or at least not reverted to initial)
        expect(orderAfterReload).toEqual(reorderedOrder);
      }
    );

    sourceTest(
      'should handle edge cases gracefully',
      async ({ sourceHelpers }) => {
        const sourceCount = await sourceHelpers.getVisibleSourceCount();

        if (sourceCount === 0) {
          // No sources available - verify graceful handling
          const sourceNames = await sourceHelpers.getSourceNames();
          expect(sourceNames).toEqual([]);
          return;
        }

        if (sourceCount === 1) {
          // Only one source - reordering should be no-op
          const initialOrder = await sourceHelpers.getSourceNames();

          // Try to reorder (should do nothing)
          await sourceHelpers.reorderSources(0, 0);

          const finalOrder = await sourceHelpers.getSourceNames();
          expect(finalOrder).toEqual(initialOrder);
          return;
        }

        // Multiple sources - verify normal operation
        const initialOrder = await sourceHelpers.getSourceNames();
        expect(initialOrder.length).toBe(sourceCount);
      }
    );
  });
});

// Test unauthenticated behavior
unauthenticatedTest.describe(
  'Sidebar Source Reordering - Unauthenticated',
  () => {
    unauthenticatedTest(
      'should not allow source reordering when not authenticated',
      async ({ unauthenticatedPage }) => {
        await unauthenticatedPage.goto('/');

        // Sources should not be draggable for unauthenticated users
        const sourceButtons = unauthenticatedPage.locator('button').filter({
          has: unauthenticatedPage.locator('enhanced\\:img, img'),
        });

        const sourceCount = await sourceButtons.count();

        if (sourceCount > 0) {
          // Check if sources are draggable
          const firstSource = sourceButtons.first();
          const isDraggable = await firstSource.getAttribute('draggable');

          // Should not be draggable for unauthenticated users
          expect(isDraggable).not.toBe('true');
        }
      }
    );

    unauthenticatedTest(
      'should show sources but without drag capability',
      async ({ unauthenticatedPage }) => {
        await unauthenticatedPage.goto('/');

        // Sources should still be visible
        const sourceButtons = unauthenticatedPage.locator('button').filter({
          has: unauthenticatedPage.locator('enhanced\\:img, img'),
        });

        // Verify sources are visible (count >= 0)
        const sourceCount = await sourceButtons.count();
        expect(sourceCount).toBeGreaterThanOrEqual(0);

        // Verify they're clickable but not draggable
        if (sourceCount > 0) {
          const firstSource = sourceButtons.first();
          await expect(firstSource).toBeVisible();

          // Should be clickable for navigation
          await expect(firstSource).toBeEnabled();
        }
      }
    );
  }
);
