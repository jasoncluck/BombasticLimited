# Root Route Tests

This directory contains comprehensive unit tests for the root route files in the
SvelteKit application.

## Test Files

### `page.server.test.ts`

Tests for `/src/routes/+page.server.ts` - the server-side load function:

- **Data fetching**: Tests parallel video fetching from multiple sources (Giant
  Bomb, Jeff Gerstmann, Nextlander, Remap)
- **Continue watching**: Tests fetching of in-progress videos for authenticated
  users
- **Error handling**: Tests URL error parameter handling and redirection
- **Session handling**: Tests behavior with authenticated and anonymous users
- **Content filters**: Tests proper application of sort and filter parameters
- **Data structure**: Tests the returned data structure and format

### `page.svelte.test.ts`

Tests for `/src/routes/+page.svelte` - the main page component:

- **Data validation**: Tests component handling of various data structures
- **User profile logic**: Tests source filtering based on user preferences
- **Continue watching visibility**: Tests conditional rendering based on session
  and video availability
- **OAuth handling**: Tests URL cleanup after OAuth authentication
- **Carousel state**: Tests initialization of carousel state for all content
  sections
- **Snapshot functionality**: Tests component state capture and restore
  functionality
- **Mock integration**: Tests component behavior with mocked dependencies

## Test Infrastructure

- **Framework**: Vitest for test execution
- **Mocking**: Comprehensive mocking of SvelteKit app stores, Supabase client,
  and component dependencies
- **Environment**: jsdom for DOM simulation
- **Coverage**: Tests cover both happy path and error scenarios

## Running Tests

```bash
# Run all route tests
npm run test src/routes/__tests__/

# Run server-side tests only
npm run test src/routes/__tests__/page.server.test.ts

# Run component tests only
npm run test src/routes/__tests__/page.svelte.test.ts

# Run integration tests (includes routes)
npm run test:integration
```

## Test Design Philosophy

The tests focus on:

1. **Logic validation** over DOM manipulation
2. **Data flow** and state management
3. **Error handling** and edge cases
4. **Integration** with mocked dependencies
5. **Type safety** and data structure validation

The component tests avoid complex DOM rendering issues by focusing on the
business logic, data handling, and component behavior rather than UI
interactions. This approach provides comprehensive coverage while maintaining
test reliability and maintainability.
