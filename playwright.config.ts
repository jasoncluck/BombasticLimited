import { defineConfig, devices } from "@playwright/test";

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: "./tests/e2e",

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["html", { outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:5173",

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",

    /* Take screenshot on failure */
    screenshot: "only-on-failure",

    /* Capture video on retry */
    video: "retain-on-failure",

    /* Default navigation timeout - increased for reliability */
    navigationTimeout: 45000,

    /* Default action timeout - increased for reliability */
    actionTimeout: 15000,
  },

  /* Configure projects for major browsers */
  projects: [
    /* Desktop browsers */
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },

    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },

    /* Mobile browsers */
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },

    {
      name: "mobile-safari",
      use: { ...devices["iPhone 12"] },
    },

    {
      name: "tablet-chrome",
      use: { ...devices["iPad Pro"] },
    },

    /* Additional mobile devices for comprehensive testing */
    {
      name: "android-chrome",
      use: { ...devices["Galaxy S8"] },
    },

    {
      name: "iphone-13",
      use: { ...devices["iPhone 13"] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "npm run dev -- --host 0.0.0.0",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // Don't try to build the app for tests, use dev mode
    env: {
      NODE_ENV: "test"
    }
  },

  /* Global setup and teardown */
  globalSetup: "./tests/e2e/setup/global-setup.ts",
  globalTeardown: "./tests/e2e/setup/global-teardown.ts",

  /* Test output directory */
  outputDir: "test-results/",

  /* Timeout for each test - increased for reliability */
  timeout: 45000,

  /* Global test timeout */
  globalTimeout: 900000,

  /* Expect timeout - increased for reliability */
  expect: {
    timeout: 10000,
  },
});
