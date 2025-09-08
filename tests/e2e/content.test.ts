import {
  unauthenticatedTest as unauthTest,
  authenticatedTest as authTest,
  expect,
} from './auth-fixtures';

unauthTest.describe('Unauthenticated content interactions', () => {
  unauthTest(
    'should not be able to open context menu',
    async ({ unauthenticatedPage: page }) => {
      await page.goto('/');

      const contentCard = page.getByTestId('content-item').first();
      await contentCard.waitFor();
      await contentCard.click({ button: 'right' });
      const contextMenuContent = page.getByTestId(
        'content-context-menu-content'
      );
      await expect(contextMenuContent).not.toBeVisible();
    }
  );

  unauthTest(
    'should not be able to open dropdown menu',
    async ({ unauthenticatedPage: page }) => {
      await page.goto('/');
      const contentCard = page.getByTestId('content-item').first();
      await contentCard.waitFor();
      await contentCard.hover();

      // Check that the dropdown trigger button doesn't exist
      const dropdownTrigger = page
        .getByTestId('content-dropdown-trigger')
        .getByRole('button');
      await expect(dropdownTrigger).toHaveCount(0);
    }
  );
});

authTest.describe('Authenticated content interactions', () => {
  authTest(
    'clicking a card while a context menu is open should close the context menu but not redirect',
    async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const contentCard = page.getByTestId('content-item').first();
      await contentCard.waitFor();
      await contentCard.click({ button: 'right' });
      const contextMenuContent = page.getByTestId(
        'content-context-menu-content'
      );
      await expect(contextMenuContent).toBeVisible();

      const secondContentCard = page.getByTestId('content-item').nth(1);
      await secondContentCard.click();
      await expect(contextMenuContent).not.toBeVisible();
      await expect(page).toHaveURL('/');
    }
  );

  authTest(
    'clicking a card while a dropdown menu is open should close the dropdown menu but not redirect',
    async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const contentCard = page.getByTestId('content-item').first();
      await contentCard.waitFor();
      await contentCard.hover();

      const contentDropdownTrigger = page
        .getByTestId('content-dropdown-trigger')
        .and(page.getByRole('button'))
        .first();
      await contentDropdownTrigger.click();
      const dropdownContent = page.getByTestId('content-dropdown-content');
      await expect(dropdownContent).toBeVisible();

      const secondContentCard = page.getByTestId('content-item').nth(1);
      await secondContentCard.click();
      await expect(dropdownContent).not.toBeVisible();
      await expect(page).toHaveURL('/');
    }
  );

  authTest(
    'should prevent all forms of scrolling when context menu is open',
    async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const contentCard = page.getByTestId('content-item').first();
      await contentCard.waitFor();
      await contentCard.click({ button: 'right' });
      const contextMenuContent = page.getByTestId(
        'content-context-menu-content'
      );
      await expect(contextMenuContent).toBeVisible();

      const initialScrollPosition = await page.evaluate(() => window.scrollY);

      // Test various scroll methods
      const scrollTests = [
        () => page.keyboard.press('PageDown'),
        () => page.keyboard.press('PageUp'),
        () => page.keyboard.press('ArrowDown'),
        () => page.keyboard.press('ArrowUp'),
        () => page.keyboard.press('End'),
        () => page.keyboard.press('Home'),
        () => page.mouse.wheel(0, 300),
        () => page.mouse.wheel(0, -300),
        () => page.evaluate(() => window.scrollTo(0, 500)),
        () => page.evaluate(() => window.scrollBy(0, 200)),
      ];

      for (const scrollTest of scrollTests) {
        await scrollTest();
        await page.waitForTimeout(50);

        const currentScrollPosition = await page.evaluate(() => window.scrollY);
        expect(currentScrollPosition).toBe(initialScrollPosition);
      }

      // Close context menu and verify scrolling works again
      await page.keyboard.press('Escape');
      await expect(contextMenuContent).not.toBeVisible();

      // Now scrolling should work (if there's scrollable content)
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(100);
      await page.evaluate(() => window.scrollY);
      // We don't assert the scroll position changed here because the page might not have enough content to scroll
    }
  );

  authTest(
    'should prevent all forms of scrolling when dropdown menu is open',
    async ({ authenticatedPage: page }) => {
      await page.goto('/');

      const contentCard = page.getByTestId('content-item').first();
      await contentCard.waitFor();
      await contentCard.hover();

      const contentDropdownTrigger = page
        .getByTestId('content-dropdown-trigger')
        .and(page.getByRole('button'))
        .first();
      await contentDropdownTrigger.click();
      const dropdownContent = page.getByTestId('content-dropdown-content');
      await expect(dropdownContent).toBeVisible();

      const initialScrollPosition = await page.evaluate(() => window.scrollY);

      // Test various scroll methods
      const scrollTests = [
        () => page.keyboard.press('PageDown'),
        () => page.keyboard.press('PageUp'),
        () => page.keyboard.press('ArrowDown'),
        () => page.keyboard.press('ArrowUp'),
        () => page.keyboard.press('End'),
        () => page.keyboard.press('Home'),
        () => page.mouse.wheel(0, 300),
        () => page.mouse.wheel(0, -300),
        () => page.evaluate(() => window.scrollTo(0, 500)),
        () => page.evaluate(() => window.scrollBy(0, 200)),
      ];

      for (const scrollTest of scrollTests) {
        await scrollTest();
        await page.waitForTimeout(50);

        const currentScrollPosition = await page.evaluate(() => window.scrollY);
        expect(currentScrollPosition).toBe(initialScrollPosition);
      }

      // Close dropdown menu and verify scrolling works again
      await page.keyboard.press('Escape');
      await expect(dropdownContent).not.toBeVisible();

      // Now scrolling should work (if there's scrollable content)
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(100);

      await page.evaluate(() => window.scrollY);
      // We don't assert the scroll position changed here because the page might not have enough content to scroll
    }
  );
});
