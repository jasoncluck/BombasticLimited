# Playwright Authentication Model

This project implements the Playwright authentication model following the "one
account per parallel worker" pattern, enabling efficient testing of both
authenticated and non-authenticated user flows.

## Architecture Overview

The authentication system consists of:

1. **TestDataManager**: Creates and manages test users for each parallel worker
2. **Global Setup**: Authenticates users and stores auth states before tests run
3. **Auth Fixtures**: Provides authenticated and unauthenticated contexts for
   tests
4. **Global Teardown**: Cleans up test data and authentication states

## File Structure

```
tests/e2e/
├── auth.setup.ts                 # Global authentication setup
├── global.teardown.ts            # Cleanup after all tests
├── auth-fixtures.ts              # Test fixtures for auth contexts
├── utils/
│   └── TestDataManager.ts        # Test user management
├── authenticated.test.ts         # Tests requiring authentication
├── mixed-auth.test.ts            # Tests using both auth states
└── homepage.test.ts              # Updated to use unauthenticated fixtures

.auth/                            # Authentication state storage (gitignored)
└── user-{workerIndex}.json       # Per-worker auth states
```

## Usage

### Basic Authenticated Tests

```typescript
import { authenticatedTest as test, expect } from '../auth-fixtures';

test('should access protected features', async ({
  authenticatedPage,
  testUser,
}) => {
  await authenticatedPage.goto('/account');
  await expect(authenticatedPage.getByText(testUser.username)).toBeVisible();
});
```

### Basic Unauthenticated Tests

```typescript
import { unauthenticatedTest as test, expect } from '../auth-fixtures';

test('should show login button', async ({ unauthenticatedPage }) => {
  await unauthenticatedPage.goto('/');
  await expect(
    unauthenticatedPage.getByRole('button', { name: 'Login' })
  ).toBeVisible();
});
```

### Mixed Authentication Tests

```typescript
import { mixedTest as test, expect } from '../auth-fixtures';

test('should show different UI for different user types', async ({
  authenticatedPage,
  unauthenticatedPage,
}) => {
  await authenticatedPage.goto('/');
  await unauthenticatedPage.goto('/');

  // Compare authenticated vs unauthenticated experience
  await expect(authenticatedPage.getByText('Account')).toBeVisible();
  await expect(
    unauthenticatedPage.getByRole('button', { name: 'Login' })
  ).toBeVisible();
});
```

## Available Fixtures

### authenticatedTest

- `authenticatedPage`: Page with authenticated user context
- `authenticatedContext`: Browser context with stored auth state
- `testUser`: Test user data (id, email, password, username)
- `testDataManager`: Manager for test data operations

### unauthenticatedTest

- `unauthenticatedPage`: Page with no authentication
- `unauthenticatedContext`: Fresh browser context

### mixedTest

- All fixtures from both authenticated and unauthenticated tests
- Useful for testing both user types in the same test

## Test Data Management

The `TestDataManager` provides methods for:

- Creating unique test users per worker
- Authenticating test users
- Creating test playlists and other data
- Cleaning up test data and users

### Example Usage

```typescript
test('should manage user data', async ({ testDataManager, testUser }) => {
  // Create test playlist
  const playlist = await testDataManager.createTestPlaylist(
    testUser.id,
    'Test Playlist'
  );

  // Use playlist in test...

  // Cleanup happens automatically in teardown
});
```

## Authentication State Storage

- Authentication states are stored in `.auth/user-{workerIndex}.json`
- Each parallel worker gets its own isolated authentication state
- Files are automatically cleaned up after test completion
- The `.auth/` directory is gitignored

## Parallel Execution

The system supports parallel test execution with:

- Isolated authentication states per worker
- Unique test users for each worker
- No conflicts between parallel test runs
- Automatic cleanup of all test data

## Configuration

The authentication model is configured in `playwright.config.ts`:

```typescript
export default defineConfig({
  // Enable parallel execution
  fullyParallel: true,
  workers: process.env.CI ? 1 : 3,

  // Global setup and teardown
  globalSetup: require.resolve('./tests/e2e/auth.setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/global.teardown.ts'),

  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
    },
  ],
});
```

## Environment Variables

Required environment variables:

- `SUPABASE_URL`: Supabase project URL (defaults to local:
  http://127.0.0.1:54321)
- `SUPABASE_SERVICE_ROLE_KEY` or `PUBLIC_SUPABASE_SERVICE_ROLE_KEY`: Service
  role key for admin operations
- `SUPABASE_ANON_KEY`: Anonymous key for client operations

## Best Practices

1. **Use appropriate fixtures**: Choose `authenticatedTest`,
   `unauthenticatedTest`, or `mixedTest` based on your test needs
2. **Clean up test data**: Use `testDataManager` methods to clean up any test
   data you create
3. **Test both user types**: Consider how features work for both authenticated
   and unauthenticated users
4. **Leverage parallel execution**: Tests run in parallel with isolated auth
   states
5. **Handle async operations**: Always await authentication and data operations

## Debugging

To debug authentication issues:

1. Check the `.auth/` directory for stored auth states
2. Verify environment variables are set correctly
3. Check global setup logs for authentication errors
4. Use `console.log` in TestDataManager methods to trace user creation

## Cleanup

The system automatically cleans up:

- Test users and their profiles
- Test playlists and related data
- Authentication state files
- Any other test data created through TestDataManager

Manual cleanup can be triggered by running the global teardown script if needed.

---

# Video Timestamp E2E Tests

## Overview

The timestamp functionality allows authenticated users to:
- Save their progress when watching videos
- Resume videos from where they left off via the "Continue Watching" section
- Mark videos as watched or reset their progress
- Manage video state through context menus and dropdown operations

## Additional Test Files for Timestamp Functionality

### `timestamp.test.ts`
Main E2E tests focusing on UI interactions and functionality:
- Continue watching section visibility and interaction
- Video navigation and iframe loading
- Right-click context menu operations 
- Content dropdown menu operations
- Multi-selection with Ctrl/Cmd and Shift
- Unauthenticated user limitations

### `timestamp-behavior.test.ts` 
Specific tests for timestamp behavior scenarios:
- Continue watching entry creation and verification
- Watched video behavior (not appearing in continue watching)
- Quick navigation scenarios (< 15 seconds)
- Progress reset functionality
- State persistence across page reloads
- Multiple video management

### `helpers/video-helpers.ts`
Helper class with reusable functions for video-related test operations:
- Video card interaction utilities
- Continue watching section management
- Context menu and dropdown operations
- Multi-selection helpers
- Navigation utilities

## Key Timestamp Logic

Based on the application code, the timestamp system follows these rules:

- **15-second rule**: Videos must be watched for more than 15 seconds before a timestamp is saved
- **95% completion rule**: Videos watched to 95% or more are marked as "watched" (not saved as progress)
- **25% progress rule**: Videos watched between 15 seconds and 95% save progress timestamps

## Running Timestamp Tests

### Quick Start
```bash
# Run all timestamp-related tests
npm run test:e2e -- --grep "timestamp|continue watching"

# Run with visible browser
npm run test:e2e:headed -- --grep "timestamp"

# Run in debug mode
npm run test:e2e:debug -- --grep "timestamp"
```

### Using the Test Runner Script
```bash
# Basic run
./tests/e2e/run-timestamp-tests.sh

# With visible browser
./tests/e2e/run-timestamp-tests.sh --headed

# With debug mode
./tests/e2e/run-timestamp-tests.sh --debug

# With Playwright UI
./tests/e2e/run-timestamp-tests.sh --ui
```

### Specific Test Files
```bash
# Main timestamp tests
npx playwright test tests/e2e/timestamp.test.ts

# Behavior-specific tests  
npx playwright test tests/e2e/timestamp-behavior.test.ts

# Single test
npx playwright test --grep "should display continue watching section"
```

## Timestamp Test Limitations

### YouTube Player Interaction
Direct manipulation of the YouTube player iframe is complex in E2E tests due to:
- Cross-origin iframe restrictions
- Complex YouTube API message passing
- Timing dependencies

The tests focus on UI state verification rather than direct player control.

### Test Data Requirements
Some tests may require specific test data or scenarios:
- Videos with existing progress
- Multiple videos in continue watching
- Clean user state for certain scenarios
