import {
  unauthenticatedTest as unauthTest,
  authenticatedTest as authTest,
  expect,
} from './auth-fixtures';

unauthTest.describe('Navigation Component - Search Input Tests', () => {
  unauthTest(
    'should handle search with processing wait and allow subsequent searches',
    async ({ unauthenticatedPage }) => {
      await unauthenticatedPage.goto('/');

      // Get the search input
      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toBeVisible();

      // First search
      await searchInput.fill('test');

      // Wait for debounce and processing (~500ms)
      await unauthenticatedPage.waitForTimeout(600);

      // Should navigate to search page
      await expect(unauthenticatedPage).toHaveURL(/\/search\/test/);

      // Verify search results page is loaded
      await expect(
        unauthenticatedPage.getByTestId('search-results')
      ).toBeVisible();

      // Second search should work immediately after first completes
      await searchInput.fill('another search');

      // Wait for processing
      await unauthenticatedPage.waitForTimeout(600);

      // Should navigate to new search
      await expect(unauthenticatedPage).toHaveURL(/\/search\/another%20search/);
      await expect(
        unauthenticatedPage.getByTestId('search-results')
      ).toBeVisible();
    }
  );

  unauthTest(
    'should auto-populate search input when navigating directly to search URL',
    async ({ unauthenticatedPage }) => {
      // Navigate directly to search page
      await unauthenticatedPage.goto('/search/test');

      // Wait for page to load
      await expect(
        unauthenticatedPage.getByTestId('search-results')
      ).toBeVisible();

      // Search input should be auto-populated with the route param
      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toHaveValue('test');
    }
  );

  unauthTest(
    'should auto-populate search input on source-specific search pages',
    async ({ unauthenticatedPage }) => {
      // Navigate directly to source-specific search page
      await unauthenticatedPage.goto('/search/test/giantbomb');

      // Wait for page to load
      await unauthenticatedPage
        .getByTestId('search-results')
        .waitFor({ state: 'visible' });

      // Search input should be auto-populated with the search query
      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toHaveValue('test');

      // Should show Giant Bomb specific results

      const sourceLink = unauthenticatedPage
        .getByRole('heading', { name: 'Giant Bomb' })
        .first();
      await sourceLink.waitFor({ state: 'visible' });
    }
  );

  unauthTest(
    'should show "No Results Found" for invalid queries',
    async ({ unauthenticatedPage }) => {
      await unauthenticatedPage.goto('/');

      // Get the search input
      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toBeVisible();

      // Search with invalid query
      await searchInput.fill('aiwjefoiawjfopiahwef@$!)@*$');

      // Wait for processing
      await unauthenticatedPage.waitForTimeout(600);

      // Should navigate to search page
      await expect(unauthenticatedPage).toHaveURL(
        /\/search\/aiwjefoiawjfopiahwef/
      );

      // Should show no results message
      await expect(unauthenticatedPage.getByTestId('no-results')).toBeVisible();
      await expect(
        unauthenticatedPage.getByText('No Results Found')
      ).toBeVisible();
    }
  );

  unauthTest(
    'should handle URL decoding for search queries with special characters',
    async ({ unauthenticatedPage }) => {
      // Navigate to search with encoded special characters
      await unauthenticatedPage.goto('/search/hello%20world%21');

      // Wait for page to load
      await expect(
        unauthenticatedPage.getByTestId('search-results')
      ).toBeVisible();

      // Search input should show decoded value
      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toHaveValue('hello world!');
    }
  );

  unauthTest(
    'should maintain search state when navigating between search results',
    async ({ unauthenticatedPage }) => {
      await unauthenticatedPage.goto('/search/test');

      // Wait for search results to load
      await unauthenticatedPage
        .getByTestId('search-results')
        .waitFor({ state: 'visible' });

      // Verify search input is populated
      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toHaveValue('test');

      // Navigate to source-specific search (if available)
      const sourceLink = unauthenticatedPage
        .getByRole('heading', { name: 'Giant Bomb' })
        .first();
      if (await sourceLink.isVisible()) {
        await sourceLink.click();

        // Should navigate to source-specific page
        await expect(unauthenticatedPage).toHaveURL(
          /\/search\/test\/giantbomb/
        );

        // Search input should still show the search query
        await expect(searchInput).toHaveValue('test');
      }
    }
  );

  unauthTest(
    'should clear search when navigating home via home button',
    async ({ unauthenticatedPage }) => {
      // Start with a search
      await unauthenticatedPage.goto('/search/test');
      await expect(
        unauthenticatedPage.getByTestId('search-results')
      ).toBeVisible();

      // Verify search input has value
      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toHaveValue('test');

      // Click home button
      const homeButton = unauthenticatedPage.getByTestId('home-link');
      await expect(homeButton).toBeVisible();
      await homeButton.click();

      // Should navigate to home
      await expect(unauthenticatedPage).toHaveURL('/');

      // Search input should be cleared
      await expect(searchInput).toHaveValue('');
    }
  );

  unauthTest(
    'should handle rapid search input changes gracefully',
    async ({ unauthenticatedPage }) => {
      await unauthenticatedPage.goto('/');

      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toBeVisible();

      // Rapidly type different searches to test debouncing
      await searchInput.fill('a');
      await unauthenticatedPage.waitForTimeout(100);
      await searchInput.fill('ab');
      await unauthenticatedPage.waitForTimeout(100);
      await searchInput.fill('abc');
      await unauthenticatedPage.waitForTimeout(100);
      await searchInput.fill('final search');

      // Wait for debounce to settle
      await unauthenticatedPage.waitForTimeout(600);

      // Should only navigate to the final search
      await expect(unauthenticatedPage).toHaveURL(/\/search\/final%20search/);
      await expect(searchInput).toHaveValue('final search');
    }
  );
});

authTest.describe('Navigation Component - Authenticated Search Tests', () => {
  authTest(
    'should maintain search functionality when authenticated',
    async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/');

      // Get the search input
      const searchInput = authenticatedPage.getByTestId('search-input');
      await expect(searchInput).toBeVisible();

      // Perform search
      await searchInput.fill('authenticated test');

      // Wait for processing
      await authenticatedPage.waitForTimeout(600);

      // Should navigate to search page
      await expect(authenticatedPage).toHaveURL(
        /\/search\/authenticated%20test/
      );

      // Verify search results page is loaded
      await expect(
        authenticatedPage.getByTestId('search-results')
      ).toBeVisible();

      // Search input should maintain value
      await expect(searchInput).toHaveValue('authenticated test');
    }
  );

  authTest(
    'should show personalized empty results for authenticated users',
    async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/');

      const searchInput = authenticatedPage.getByTestId('search-input');
      await expect(searchInput).toBeVisible();

      // Search with query that should have no results
      await searchInput.fill('zzzznonexistentquery123456');

      // Wait for processing
      await authenticatedPage.waitForTimeout(600);

      // Should navigate to search page
      await expect(authenticatedPage).toHaveURL(
        /\/search\/zzzznonexistentquery123456/
      );

      // Should show no results message
      await expect(authenticatedPage.getByTestId('no-results')).toBeVisible();
      await expect(
        authenticatedPage.getByText('No Results Found')
      ).toBeVisible();
    }
  );
});

unauthTest.describe('Navigation Component - Cross-viewport Tests', () => {
  unauthTest(
    'should work on mobile viewport',
    async ({ unauthenticatedPage }) => {
      // Set mobile viewport
      await unauthenticatedPage.setViewportSize({ width: 375, height: 667 });
      await unauthenticatedPage.goto('/');

      // Search input should be visible on mobile
      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toBeVisible();

      // Search should work on mobile
      await searchInput.fill('mobile test');
      await unauthenticatedPage.waitForTimeout(600);

      await expect(unauthenticatedPage).toHaveURL(/\/search\/mobile%20test/);
      await expect(searchInput).toHaveValue('mobile test');
    }
  );

  unauthTest(
    'should work on tablet viewport',
    async ({ unauthenticatedPage }) => {
      // Set tablet viewport
      await unauthenticatedPage.setViewportSize({ width: 768, height: 1024 });
      await unauthenticatedPage.goto('/');

      const searchInput = unauthenticatedPage.getByTestId('search-input');
      await expect(searchInput).toBeVisible();

      // Search should work on tablet
      await searchInput.fill('tablet test');
      await unauthenticatedPage.waitForTimeout(600);

      await expect(unauthenticatedPage).toHaveURL(/\/search\/tablet%20test/);
      await expect(searchInput).toHaveValue('tablet test');
    }
  );
});
