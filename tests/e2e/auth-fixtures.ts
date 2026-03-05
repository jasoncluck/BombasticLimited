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

// Helper function to get the correct worker index within the configured range
function getValidWorkerIndex(workerIndex: number): number {
  const maxWorkers = process.env.CI ? 1 : 2;
  return workerIndex % maxWorkers;
}

// Test with authenticated user context
export const authenticatedTest = base.extend<AuthenticatedFixtures>({
  testDataManager: async ({}, use) => {
    const manager = new TestDataManager();
    await use(manager);
  },

  testUser: async ({ testDataManager }, use, workerInfo) => {
    const validWorkerIndex = getValidWorkerIndex(workerInfo.workerIndex);
    const testUser =
      await testDataManager.getOrCreateTestUser(validWorkerIndex);
    await use(testUser);
  },

  authenticatedContext: async ({ browser }, use, workerInfo) => {
    const validWorkerIndex = getValidWorkerIndex(workerInfo.workerIndex);
    const authFile = path.join(
      process.cwd(),
      '.auth',
      `user-${validWorkerIndex}.json`
    );

    if (!fs.existsSync(authFile)) {
      throw new Error(
        `Authentication file not found for worker ${validWorkerIndex} (original: ${workerInfo.workerIndex}). Make sure global setup ran successfully.`
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
    const context = await browser.newContext({
      // Explicitly clear all storage state
      storageState: { cookies: [], origins: [] },
    });
    await use(context);
    await context.close();
  },

  unauthenticatedPage: async ({ unauthenticatedContext }, use) => {
    const page = await unauthenticatedContext.newPage();
    await use(page);
    await page.close();
  },
});

// Mixed test - using delayed/conditional fixture initialization
export const mixedTest = base.extend<
  AuthenticatedFixtures & UnauthenticatedFixtures
>({
  // Initialize unauthenticated context FIRST and independently
  unauthenticatedContext: async ({ browser }, use) => {
    console.log('Creating unauthenticated context...');
    const context = await browser.newContext({
      // Force completely clean state
      storageState: { cookies: [], origins: [] },
      // Add extra headers to distinguish this context
      extraHTTPHeaders: {
        'X-Test-Context': 'unauthenticated',
        'Cache-Control': 'no-cache',
      },
    });
    console.log('Unauthenticated context created successfully');
    await use(context);
    await context.close();
  },

  unauthenticatedPage: async ({ unauthenticatedContext }, use) => {
    console.log('Creating unauthenticated page...');
    const page = await unauthenticatedContext.newPage();

    // Add debugging to see what's happening
    page.on('response', (response) => {
      if (response.status() >= 400 || response.url().includes('auth')) {
        console.log(`Unauth response: ${response.status()} ${response.url()}`);
      }
    });

    page.on('request', (request) => {
      if (request.url().includes('auth')) {
        console.log(`Unauth request: ${request.method()} ${request.url()}`);
      }
    });

    console.log('Unauthenticated page created successfully');
    await use(page);
    await page.close();
  },

  // Only initialize authenticated fixtures if they're actually used
  testDataManager: async ({}, use) => {
    const manager = new TestDataManager();
    await use(manager);
  },

  testUser: async ({ testDataManager }, use, workerInfo) => {
    const validWorkerIndex = getValidWorkerIndex(workerInfo.workerIndex);
    const testUser =
      await testDataManager.getOrCreateTestUser(validWorkerIndex);
    await use(testUser);
  },

  authenticatedContext: async ({ browser }, use, workerInfo) => {
    const validWorkerIndex = getValidWorkerIndex(workerInfo.workerIndex);
    const authFile = path.join(
      process.cwd(),
      '.auth',
      `user-${validWorkerIndex}.json`
    );

    if (!fs.existsSync(authFile)) {
      throw new Error(
        `Authentication file not found for worker ${validWorkerIndex} (original: ${workerInfo.workerIndex}).`
      );
    }

    const context = await browser.newContext({
      storageState: authFile,
      extraHTTPHeaders: {
        'X-Test-Context': 'authenticated',
      },
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

export { expect };
