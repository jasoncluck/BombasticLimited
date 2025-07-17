# Mock Architecture and Testing Guide

## Overview

This document describes the mock architecture and testing patterns used in the
bombify project. The mocks have been organized to be reusable, maintainable, and
provide consistent test isolation.

## Mock Organization

### Core Mock Files

- **`src/tests/mocks/`** - Centralized mock implementations
  - `auth.ts` - Authentication-related mocks (users, sessions)
  - `videos.ts` - Video data mocks and utilities
  - `playlists.ts` - Playlist-related mocks
  - `supabase.ts` - Supabase client mocks
  - `sveltekit.ts` - SvelteKit framework mocks
  - `page-data.ts` - Page data structure mocks
  - `media-query.ts` - Media query state mocks
  - `user-profiles.ts` - User profile mocks
  - `common.ts` - Common mock utilities (currently not used due to hoisting
    issues)

### Test Utilities

- **`src/tests/utils/`** - Test utility functions
  - `test-setup.ts` - Common test setup functions

### Global Test Setup

- **`src/test-setup.ts`** - Global test configuration and common mocks

## Mock Patterns

### 1. Global Mocks (in test-setup.ts)

Global mocks are defined in `test-setup.ts` and apply to all tests. These
include:

- Browser APIs (ResizeObserver, IntersectionObserver, etc.)
- SvelteKit modules ($app/navigation, $app/state, etc.)
- Common application modules (media query state, content state, etc.)

```typescript
vi.mock("$app/navigation", () => ({
  invalidate: vi.fn(),
  goto: vi.fn(),
  // ... other navigation functions
}));
```

### 2. Test-Specific Mocks (hoisted)

For test files that need specific mock behavior, use `vi.hoisted()` to ensure
proper scoping:

```typescript
// At the top of your test file
const { mockGetVideos, mockGetInProgressVideos } = vi.hoisted(() => ({
  mockGetVideos: vi.fn(),
  mockGetInProgressVideos: vi.fn(),
}));

vi.mock("$lib/supabase/videos", () => ({
  getVideos: mockGetVideos,
  getInProgressVideos: mockGetInProgressVideos,
  DEFAULT_NUM_VIDEOS_OVERVIEW: 30,
}));
```

### 3. Reusable Mock Data

Mock data creators provide consistent test data:

```typescript
import { createMockVideo, createMockPageData } from "../tests/mocks/videos";

const testVideo = createMockVideo({
  title: "Custom Test Video",
  source: "giantbomb",
});

const testPageData = createMockPageData({
  continueWatchingVideos: [testVideo],
});
```

## Test Setup Patterns

### Basic Test Setup

```typescript
import { setupTest } from "../tests/utils/test-setup";

describe("My Component", () => {
  setupTest(); // Provides beforeEach/afterEach cleanup

  it("should work correctly", () => {
    // Test implementation
  });
});
```

### Mock State Management

For tests that need to modify global state (like page URL):

```typescript
import { pageState } from "../test-setup";

it("handles URL changes", () => {
  pageState.url = new URL("http://localhost:3000?code=oauth_code");
  // Test implementation
});
```

## Best Practices

### 1. Mock Isolation

- Each test should start with a clean mock state
- Use `beforeEach` to reset mocks to default values
- Avoid test interdependencies

### 2. Realistic Mock Data

- Mock data should closely resemble real data structures
- Use factory functions for creating variations
- Include edge cases in mock data

### 3. Mock Behavior

- Mock functions should return realistic promises/values
- Error scenarios should be tested with appropriate mock failures
- Async operations should be properly mocked

### 4. Mock Organization

- Keep mocks close to what they're testing when possible
- Use global mocks for cross-cutting concerns
- Document complex mock setups

## Common Patterns

### Testing Server Load Functions

```typescript
const { mockGetVideos } = vi.hoisted(() => ({
  mockGetVideos: vi.fn(),
}));

vi.mock("$lib/supabase/videos", () => ({
  getVideos: mockGetVideos,
}));

beforeEach(() => {
  mockGetVideos.mockResolvedValue({
    videos: [mockVideo],
    count: 1,
    error: null,
  });
});
```

### Testing Svelte Components

```typescript
import { render, screen } from "@testing-library/svelte";
import { mockPageData } from "../tests/mocks/page-data";

it("renders correctly", () => {
  render(MyComponent, { data: mockPageData });
  expect(screen.getByText("Expected Text")).toBeDefined();
});
```

### Mocking Browser State

```typescript
import { pageState } from "../test-setup";

it("handles browser state", () => {
  pageState.url = new URL("http://localhost:3000?param=value");
  // Test implementation that depends on URL
});
```

## Troubleshooting

### Common Issues

1. **Hoisting Problems**: Use `vi.hoisted()` for mocks that need access to
   variables
2. **Mock Conflicts**: Ensure global mocks don't conflict with test-specific
   ones
3. **State Pollution**: Always reset state in `beforeEach` hooks
4. **Async Issues**: Properly await async operations in tests

### Debugging Tips

- Use `vi.clearAllMocks()` to reset all mocks
- Check mock call counts with `expect(mockFn).toHaveBeenCalledTimes(n)`
- Verify mock implementations with `expect(mockFn).toHaveBeenCalledWith(...)`

## Migration Guide

When adding new tests:

1. Check if global mocks in `test-setup.ts` cover your needs
2. Use existing mock data from `src/tests/mocks/` when possible
3. Create new mock utilities for reusable patterns
4. Follow the established patterns for hoisted mocks
5. Add proper cleanup in test setup functions
