import type { Page } from '@playwright/test';
import { expect } from '../auth-fixtures';

export async function extractVideoIdFromUrl(page: Page): Promise<string> {
  // Wait for the URL to contain /video/ pattern first
  await expect(page).toHaveURL(/\/video\/[a-zA-Z0-9_-]+$/);

  // Now get the current URL and extract the video ID
  const url = page.url();
  const videoIdMatch = url.match(/\/video\/([a-zA-Z0-9_-]+)$/);

  if (!videoIdMatch) {
    throw new Error(`Could not extract video ID from URL: ${url}`);
  }

  return videoIdMatch[1];
}
