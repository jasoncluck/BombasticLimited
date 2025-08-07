import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.test.ts',
  fullyParallel: true, // Enable parallel execution with isolated auth states
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 10, // Increase workers to handle parallel tests properly
  reporter: 'html',

  // Global setup and teardown for authentication
  globalSetup: './tests/e2e/auth.setup.ts',
  globalTeardown: './tests/e2e/global.teardown.ts',

  // Performance optimizations
  timeout: 30000, // Reduce from default 30s if tests don't need it
  expect: {
    timeout: 10000, // Reduce assertion timeout from default 5s
  },

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure', // Only keep traces on failure to save disk space
    screenshot: 'only-on-failure',
    video: 'retain-on-failure', // Only keep videos on failure
    testIdAttribute: 'data-testid',

    // Performance optimizations
    navigationTimeout: 15000, // Reduce navigation timeout
    actionTimeout: 10000, // Reduce action timeout

    // Disable animations for faster tests
    launchOptions: {
      args: [
        '--disable-web-security',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-background-timer-throttling',
        '--no-sandbox', // Only for CI/Docker environments
      ],
    },
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

    // Main test execution
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
      dependencies: ['setup'],
    },

    // Only run additional browsers when specifically needed
    // Use environment variable to control which browsers to test
    ...(process.env.TEST_ALL_BROWSERS
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            dependencies: ['setup'],
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            dependencies: ['setup'],
          },
          {
            name: 'Mobile Chrome',
            use: { ...devices['Pixel 5'] },
            dependencies: ['setup'],
          },
          {
            name: 'Mobile Safari',
            use: { ...devices['iPhone 12'] },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],

  webServer: {
    command: 'npm run dev:test',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // Increase if your server takes time to start
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.PUBLIC_SUPABASE_SERVICE_ROLE_KEY || '',
    },
  },
});
