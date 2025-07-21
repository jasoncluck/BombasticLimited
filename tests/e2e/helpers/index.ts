/**
 * Test helpers for Option 3 approach - waiting for specific content
 * 
 * This module provides reusable helper functions that replace the traditional
 * waitForLoadState approach with more reliable content-specific waiting.
 */

export {
  waitForTextContent,
  waitForTestId,
  waitForSelector,
  waitForMultipleSelectors,
  waitForPageContent,
  waitForNavigationWithContent,
  type WaitForContentOptions
} from './wait-for-content';

export { PageObjectBase } from './page-object-base';
export { TestDataHelpers } from './test-data-helpers';