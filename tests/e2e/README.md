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

- **15-second rule**: Videos must be watched for more than 15 seconds before a
  timestamp is saved
- **95% completion rule**: Videos watched to 95% or more are marked as "watched"
  (not saved as progress)
- **25% progress rule**: Videos watched between 15 seconds and 95% save progress
  timestamps

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

---

# Playlist E2E Tests

## Overview

The playlist functionality allows authenticated users to:

- Create and manage personal playlists
- Add and remove videos from playlists
- Reorder videos within playlists via drag and drop
- Reorder playlists in the sidebar
- Set custom sort orders for playlist videos
- Watch playlist videos with timestamp integration
- Resume playlist videos from Continue Watching

## Playlist Test Files

### `playlist-operations.test.ts`

Core playlist operations and UI interactions:

- Basic playlist CRUD operations (create, delete, add/remove videos)
- Drag and drop functionality (videos to playlists, playlist reordering)
- Video reordering within playlists when sort is Custom
- Playlist sort order management (Custom, Published At, Title)
- Sort order persistence across navigation
- Drag and drop disabling for non-Custom sort orders
- Authentication requirements and restrictions

### `playlist-behavior.test.ts`

Playlist watching behavior and timestamp integration:

- Timestamp creation when watching playlist videos
- Continue watching integration with playlist context
- Resume playlist functionality with correct sort order
- Next videos display and ordering
- Playlist video navigation flows
- Query parameter handling for non-default sort orders

### `sidebar-sources.test.ts`

Sidebar source reordering functionality (separate from playlists):

- Drag and drop reordering of sources in sidebar
- Persistence of source order across page reloads and navigation
- Visual feedback during drag operations
- Authentication requirements for source reordering
- Error handling and edge cases

### `playlist/playlist-helpers.ts`

Comprehensive helper functions for playlist test operations:

- Basic playlist operations (create, delete, navigation)
- Video management (add/remove, drag and drop)
- Sort order operations and verification
- Continue watching integration
- Playlist page operations

## Key Playlist Features Tested

### Basic Operations

- ✅ Create and delete playlists
- ✅ Add videos to playlists via context menu
- ✅ Remove videos from playlists
- ✅ Authentication requirements

### Drag & Drop Functionality

- ✅ Drag videos from homepage onto playlists
- ✅ Reorder videos within playlists (when sort = Custom)
- ✅ Reorder playlists in sidebar
- ✅ Reorder sources in sidebar (separate test file)
- ✅ Visual feedback during drag operations

### Sort Order Management

- ✅ Change playlist sort order: Custom → Published At → Title
- ✅ Ascending/descending options for Published At and Title
- ✅ Disable drag & drop when sort order is not Custom
- ✅ Persist sort order across navigation

### Timestamp Integration

- ✅ Create timestamps when watching playlist videos
- ✅ Resume playlist from Continue Watching with correct sort order
- ✅ Navigate to playlist page via Continue Watching playlist title
- ✅ Display next videos in correct sort order
- ✅ Include query parameters for non-default sort orders

## Running Playlist Tests

### Quick Start

```bash
# Run all playlist-related tests
npm run test:e2e -- --grep "playlist"

# Run specific test categories
npm run test:e2e -- --grep "playlist operations"
npm run test:e2e -- --grep "playlist behavior"
npm run test:e2e -- --grep "sidebar source"
```

### Using the Playlist Test Runner Script

```bash
# Run all playlist tests
./tests/e2e/run-playlist-tests.sh

# Run with visible browser
./tests/e2e/run-playlist-tests.sh --headed

# Run specific test categories
./tests/e2e/run-playlist-tests.sh --operations  # Basic operations
./tests/e2e/run-playlist-tests.sh --behavior   # Watching & timestamps
./tests/e2e/run-playlist-tests.sh --sidebar    # Source reordering

# Run with debug mode
./tests/e2e/run-playlist-tests.sh --debug --grep "drag and drop"

# Run with Playwright UI
./tests/e2e/run-playlist-tests.sh --ui

# Show test report
./tests/e2e/run-playlist-tests.sh --report
```

### Specific Test Files

```bash
# Playlist operations tests
npx playwright test tests/e2e/playlist-operations.test.ts

# Playlist behavior tests
npx playwright test tests/e2e/playlist-behavior.test.ts

# Sidebar source tests
npx playwright test tests/e2e/sidebar-sources.test.ts

# Single test
npx playwright test --grep "should reorder videos within playlist"
```

## Playlist Test Architecture

### Sort Order System

The playlist sort system supports:

- **Custom (playlistOrder)**: User-defined order with drag & drop enabled
- **Published At (datePublished)**: Sort by video publication date
- **Title**: Alphabetical sort by video title

Both Published At and Title support ascending and descending order.

### Query Parameter Handling

- Default sort (Custom/ascending) does not include query parameters
- Non-default sorts include query parameters in URLs
- Sort order persists across navigation and page reloads

### Authentication Context

- Authenticated users: Full playlist functionality
- Unauthenticated users: No playlist creation, limited viewing

## Playlist Test Limitations

### Drag and Drop Complexity

- Focus on DOM event simulation rather than pixel-perfect mouse movements
- Visual feedback verification through CSS class changes
- State verification through DOM inspection

### Playlist Content Requirements

Some tests require:

- Multiple videos available for playlist creation
- Sufficient test data for drag and drop operations
- Clean user state for certain scenarios

### Cross-Platform Considerations

- Drag and drop behavior may vary between browsers
- Mobile vs desktop interaction differences
- Keyboard modifier key support (Ctrl/Cmd, Shift)
