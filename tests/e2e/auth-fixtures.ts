import {
  test as base,
  expect,
  type Page,
  type BrowserContext,
} from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { TestDataManager, type TestUser } from './utils/TestDataManager';

export interface AuthenticatedFixtures {
  authenticatedPage: Page;
  authenticatedContext: BrowserContext;
  testUser: TestUser;
  testDataManager: TestDataManager;
}

export interface UnauthenticatedFixtures {
  unauthenticatedPage: Page;
  unauthenticatedContext: BrowserContext;
}

// Test with authenticated user context
export const authenticatedTest = base.extend<AuthenticatedFixtures>({
  testDataManager: async ({}, use) => {
    const manager = new TestDataManager();
    await use(manager);
    // Cleanup happens in global teardown
  },

  testUser: async ({ testDataManager }, use, workerInfo) => {
    const testUser = await testDataManager.getOrCreateTestUser(
      workerInfo.workerIndex
    );
    await use(testUser);
  },

  authenticatedContext: async ({ browser }, use, workerInfo) => {
    const authFile = path.join(
      process.cwd(),
      '.auth',
      `user-${workerInfo.workerIndex}.json`
    );

    // Check if auth file exists
    if (!fs.existsSync(authFile)) {
      throw new Error(
        `Authentication file not found for worker ${workerInfo.workerIndex}. Make sure global setup ran successfully.`
      );
    }

    const context = await browser.newContext({
      storageState: authFile,
    });

    await use(context);
    await context.close();
  },

  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

// Test with unauthenticated user context
export const unauthenticatedTest = base.extend<UnauthenticatedFixtures>({
  unauthenticatedContext: async ({ browser }, use) => {
    // Create fresh context with no stored auth state
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },

  unauthenticatedPage: async ({ unauthenticatedContext }, use) => {
    const page = await unauthenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

// Mixed test that can test both authenticated and unauthenticated flows
export const mixedTest = base.extend<
  AuthenticatedFixtures & UnauthenticatedFixtures
>({
  testDataManager: async ({}, use) => {
    const manager = new TestDataManager();
    await use(manager);
  },

  testUser: async ({ testDataManager }, use, workerInfo) => {
    const testUser = await testDataManager.getOrCreateTestUser(
      workerInfo.workerIndex
    );
    await use(testUser);
  },

  authenticatedContext: async ({ browser }, use, workerInfo) => {
    const authFile = path.join(
      process.cwd(),
      '.auth',
      `user-${workerInfo.workerIndex}.json`
    );

    if (!fs.existsSync(authFile)) {
      throw new Error(
        `Authentication file not found for worker ${workerInfo.workerIndex}.`
      );
    }

    const context = await browser.newContext({
      storageState: authFile,
    });

    await use(context);
    await context.close();
  },

  authenticatedPage: async ({ authenticatedContext }, use) => {
    const page = await authenticatedContext.newPage();
    await use(page);
    await page.close();
  },

  unauthenticatedContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await use(context);
    await context.close();
  },

  unauthenticatedPage: async ({ unauthenticatedContext }, use) => {
    const page = await unauthenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

export { expect };
