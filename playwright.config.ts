import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.test.ts',
  fullyParallel: true,
  retries: 2,
  workers: 2,
  reporter: 'html',

  // Global setup and teardown for authentication
  globalSetup: './tests/e2e/auth.setup.ts',
  globalTeardown: './tests/e2e/global.teardown.ts',

  // Increased timeouts to account for sequential execution and server load
  timeout: 60000, // Increase timeout for slower sequential execution
  expect: {
    timeout: 15000, // Increase assertion timeout for slower server responses
  },

  use: {
    headless: true,
    baseURL: 'http://localhost:5173',

    // Global screenshot and video settings
    screenshot: 'only-on-failure', // Capture screenshots on failures
    video: 'retain-on-failure', // Keep videos only when tests fail
    trace: 'retain-on-failure', // Keep traces only when tests fail

    // Adjusted timeouts for sequential execution and server load
    navigationTimeout: 30000, // Increase navigation timeout for slower server
    actionTimeout: 15000, // Increase action timeout for slower server
  },

  projects: [
    // Global authentication setup
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        // Enable recording for auth setup
        screenshot: 'on', // Capture all screenshots
        video: 'on', // Record all videos
        trace: 'on', // Enable tracing
      },
    },

    // Main test execution with optimized settings for devserver stability
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Inherit global screenshot/video settings, or override if needed
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
      },
      dependencies: ['setup'],
    },

    // Integration tests with sequential execution to prevent overload
    {
      name: 'integration',
      testMatch: '**/integration/**/*.test.ts',
      fullyParallel: false, // Force sequential for integration tests
      workers: 1, // Single worker for integration tests
      use: {
        ...devices['Desktop Chrome'],
        // Screenshots and videos for integration tests
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        // Longer timeouts for integration tests
        navigationTimeout: 45000,
        actionTimeout: 20000,
      },
      dependencies: ['setup'],
    },

    // Only run additional browsers when specifically needed
    // Use environment variable to control which browsers to test
    ...(process.env.TEST_ALL_BROWSERS
      ? [
          {
            name: 'firefox',
            use: {
              ...devices['Desktop Firefox'],
              screenshot: 'only-on-failure',
              video: 'retain-on-failure',
              trace: 'retain-on-failure',
            },
            dependencies: ['setup'],
          },
          {
            name: 'webkit',
            use: {
              ...devices['Desktop Safari'],
              screenshot: 'only-on-failure',
              video: 'retain-on-failure',
              trace: 'retain-on-failure',
            },
            dependencies: ['setup'],
          },
          {
            name: 'Mobile Chrome',
            use: {
              ...devices['Pixel 5'],
              screenshot: 'only-on-failure',
              video: 'retain-on-failure',
              trace: 'retain-on-failure',
            },
            dependencies: ['setup'],
          },
          {
            name: 'Mobile Safari',
            use: {
              ...devices['iPhone 12'],
              screenshot: 'only-on-failure',
              video: 'retain-on-failure',
              trace: 'retain-on-failure',
            },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],

  webServer: {
    command: 'npm run dev:test',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 180000, // Increase server startup timeout for slower environments
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.PUBLIC_SUPABASE_SERVICE_ROLE_KEY || '',
      // Test environment flags to optimize server behavior
      NODE_ENV: 'test',
      TEST_MODE: 'true',
      DISABLE_SERVICE_WORKER_BACKGROUND_REFRESH: 'true',
      DISABLE_AGGRESSIVE_CACHING: 'true',
    },
  },
});
