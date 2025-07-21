import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';

/**
 * Option 3: Wait for specific content to appear
 * This is a more reliable approach than waitForLoadState as it waits for actual content
 * that the test needs, rather than generic page load states.
 */

export interface WaitForContentOptions {
  /** Maximum time to wait in milliseconds */
  timeout?: number;
  /** Whether the element should be visible */
  visible?: boolean;
  /** Custom error message for timeout */
  timeoutMessage?: string;
}

/**
 * Wait for specific text content to appear on the page
 * @param page - Playwright page object
 * @param text - Text content to wait for
 * @param options - Additional options for waiting
 */
export async function waitForTextContent(
  page: Page, 
  text: string, 
  options: WaitForContentOptions = {}
): Promise<Locator> {
  const { timeout = 30000, visible = true, timeoutMessage } = options;
  
  const locator = page.getByText(text);
  
  try {
    if (visible) {
      await expect(locator).toBeVisible({ timeout });
    } else {
      await expect(locator).toBeAttached({ timeout });
    }
    return locator;
  } catch (error) {
    const customMessage = timeoutMessage || `Timeout waiting for text content: "${text}"`;
    throw new Error(`${customMessage}. Original error: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Wait for a specific element by test ID to appear
 * @param page - Playwright page object
 * @param testId - Test ID to wait for
 * @param options - Additional options for waiting
 */
export async function waitForTestId(
  page: Page, 
  testId: string, 
  options: WaitForContentOptions = {}
): Promise<Locator> {
  const { timeout = 30000, visible = true, timeoutMessage } = options;
  
  const locator = page.getByTestId(testId);
  
  try {
    if (visible) {
      await expect(locator).toBeVisible({ timeout });
    } else {
      await expect(locator).toBeAttached({ timeout });
    }
    return locator;
  } catch (error) {
    const customMessage = timeoutMessage || `Timeout waiting for test ID: "${testId}"`;
    throw new Error(`${customMessage}. Original error: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Wait for a specific selector to appear
 * @param page - Playwright page object
 * @param selector - CSS selector to wait for
 * @param options - Additional options for waiting
 */
export async function waitForSelector(
  page: Page, 
  selector: string, 
  options: WaitForContentOptions = {}
): Promise<Locator> {
  const { timeout = 30000, visible = true, timeoutMessage } = options;
  
  const locator = page.locator(selector);
  
  try {
    if (visible) {
      await expect(locator).toBeVisible({ timeout });
    } else {
      await expect(locator).toBeAttached({ timeout });
    }
    return locator;
  } catch (error) {
    const customMessage = timeoutMessage || `Timeout waiting for selector: "${selector}"`;
    throw new Error(`${customMessage}. Original error: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Wait for multiple elements to appear
 * @param page - Playwright page object
 * @param selectors - Array of selectors to wait for
 * @param options - Additional options for waiting
 */
export async function waitForMultipleSelectors(
  page: Page, 
  selectors: string[], 
  options: WaitForContentOptions = {}
): Promise<Locator[]> {
  const { timeout = 30000, visible = true, timeoutMessage } = options;
  
  const locators = selectors.map(selector => page.locator(selector));
  
  try {
    await Promise.all(
      locators.map(async (locator, index) => {
        if (visible) {
          await expect(locator).toBeVisible({ timeout });
        } else {
          await expect(locator).toBeAttached({ timeout });
        }
      })
    );
    return locators;
  } catch (error) {
    const customMessage = timeoutMessage || `Timeout waiting for selectors: ${selectors.join(', ')}`;
    throw new Error(`${customMessage}. Original error: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Wait for content to load by checking for specific elements that indicate the page is ready
 * This replaces the generic waitForLoadState with content-specific checks
 * @param page - Playwright page object
 * @param contentIndicators - Object defining what content to wait for
 * @param options - Additional options for waiting
 */
export async function waitForPageContent(
  page: Page, 
  contentIndicators: {
    text?: string[];
    testIds?: string[];
    selectors?: string[];
  }, 
  options: WaitForContentOptions = {}
): Promise<void> {
  const { timeout = 30000, visible = true, timeoutMessage } = options;
  
  const waitPromises: Promise<any>[] = [];
  
  // Wait for text content
  if (contentIndicators.text) {
    contentIndicators.text.forEach(text => {
      waitPromises.push(waitForTextContent(page, text, { timeout, visible }));
    });
  }
  
  // Wait for test IDs
  if (contentIndicators.testIds) {
    contentIndicators.testIds.forEach(testId => {
      waitPromises.push(waitForTestId(page, testId, { timeout, visible }));
    });
  }
  
  // Wait for selectors
  if (contentIndicators.selectors) {
    contentIndicators.selectors.forEach(selector => {
      waitPromises.push(waitForSelector(page, selector, { timeout, visible }));
    });
  }
  
  try {
    await Promise.all(waitPromises);
  } catch (error) {
    const customMessage = timeoutMessage || `Timeout waiting for page content to load`;
    throw new Error(`${customMessage}. Original error: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Wait for a navigation to complete by checking for specific content
 * This is more reliable than waitForLoadState as it ensures the expected content is actually present
 * @param page - Playwright page object
 * @param navigationAction - Function that triggers the navigation
 * @param expectedContent - Content to wait for after navigation
 * @param options - Additional options for waiting
 */
export async function waitForNavigationWithContent(
  page: Page,
  navigationAction: () => Promise<void>,
  expectedContent: {
    text?: string[];
    testIds?: string[];
    selectors?: string[];
  },
  options: WaitForContentOptions = {}
): Promise<void> {
  const { timeout = 30000 } = options;
  
  // Perform the navigation action and wait for content
  await navigationAction();
  await waitForPageContent(page, expectedContent, { ...options, timeout });
}