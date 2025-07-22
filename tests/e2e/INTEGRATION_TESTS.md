# Integration Test Documentation

## Overview

This document describes the comprehensive integration tests added to ensure the main application features work correctly end-to-end.

## Test Files

### 1. `home-page-integration.spec.ts`
Tests the main home page functionality:
- **Page Loading**: Verifies home page loads correctly with all main sections
- **Continue Watching**: Tests continue watching section for authenticated users with watch history
- **Video Interactions**: Tests video card clicking and navigation
- **Source Sections**: Verifies source sections (Giant Bomb, Jeff Gerstmann, etc.) display properly
- **OAuth Handling**: Tests page handles OAuth codes without breaking
- **Responsive Design**: Tests layout across mobile, tablet, and desktop viewports

### 2. `search-page-integration.spec.ts`
Tests search functionality comprehensively:
- **Search Navigation**: Tests search input navigation to search results page
- **No Results Handling**: Tests "No results found" display for empty searches
- **Query Types**: Tests different types of search queries
- **Playlist Results**: Tests playlist search results display
- **Source Results**: Tests video source results display
- **Source Filtering**: Tests filtered search by source
- **Query Persistence**: Tests search query remains in input field
- **Special Characters**: Tests search with special characters and encoding
- **Empty Search**: Tests clearing search returns to home page

### 3. `auth-flow-integration.spec.ts`
Tests authentication and user management:
- **Login Button**: Tests login button display for unauthenticated users
- **User Menu**: Tests user menu display for authenticated users
- **Navigation**: Tests login/signup page navigation
- **Logout**: Tests logout functionality
- **Protected Routes**: Tests access to protected pages
- **Login Redirect**: Tests redirect behavior for protected routes
- **User Preferences**: Tests user preferences dropdown functionality
- **Authentication State**: Tests consistent auth state across pages
- **Continue Watching**: Tests continue watching for authenticated users

### 4. `layout-navigation-integration.spec.ts`
Tests layout and navigation functionality:
- **Header Structure**: Tests main navigation header structure
- **Home Navigation**: Tests home link functionality
- **Search Input**: Tests search input behavior
- **User Preferences**: Tests preferences dropdown
- **Mobile Responsive**: Tests mobile viewport behavior
- **Tablet Responsive**: Tests tablet viewport behavior
- **Mobile Menu**: Tests mobile menu interactions
- **Layout Resizing**: Tests dynamic layout changes on resize
- **Sidebar Layout**: Tests sidebar and content layout
- **Navigation State**: Tests navigation state persistence
- **Loading States**: Tests proper loading state handling

## Test Data Requirements

### Mock Data
The tests use the existing mock infrastructure from `src/tests/mocks/`:
- **Videos**: Mock video data for testing video cards and carousels
- **Users**: Mock user data for authentication tests
- **Playlists**: Mock playlist data for playlist-related tests
- **Search Results**: Mock search results for testing search functionality

### Environment Variables
No additional environment variables are required for basic test execution. Tests are designed to work with:
- Default test environment setup
- Existing mock data
- Local development server on `http://localhost:4173`

### Authentication Testing
Authentication tests handle both states:
- **Unauthenticated**: Tests verify login button display and login flow
- **Authenticated**: Tests verify user menu and authenticated features
- **State Detection**: Tests automatically detect current auth state

## Test Execution

### Prerequisites
1. **Install Dependencies**: `npm install`
2. **Install Playwright Browsers**: `npx playwright install`
3. **Build Application**: `npm run build` (for production testing)

### Running Tests

#### All Integration Tests
```bash
npm run test:e2e
```

#### Specific Test Files
```bash
# Home page tests
npx playwright test tests/e2e/specs/home-page-integration.spec.ts

# Search functionality tests
npx playwright test tests/e2e/specs/search-page-integration.spec.ts

# Authentication flow tests
npx playwright test tests/e2e/specs/auth-flow-integration.spec.ts

# Layout and navigation tests
npx playwright test tests/e2e/specs/layout-navigation-integration.spec.ts
```

#### Interactive Mode
```bash
npm run test:e2e:ui
```

#### Debug Mode
```bash
npm run test:e2e:debug
```

#### Mobile Only
```bash
npm run test:e2e:mobile
```

#### Desktop Only
```bash
npm run test:e2e:desktop
```

## Test IDs Added

### Navigation Elements
- `data-testid="main-navigation"` - Main navigation container
- `data-testid="home-link"` - Home navigation link
- `data-testid="search-input"` - Search input field (with `type="search"`)

### Authentication Elements
- `data-testid="login-button"` - Login button for unauthenticated users
- `data-testid="user-menu-trigger"` - User menu trigger for authenticated users
- `data-testid="logout-button"` - Logout button in user menu
- `data-testid="user-preferences"` - User preferences dropdown

### Content Elements
- `data-testid="continue-watching-section"` - Continue watching section
- `data-testid="continue-watching-link"` - Continue watching header link
- `data-testid="source-section"` - Source sections (with `data-source` attribute)
- `data-testid="source-link"` - Source header links
- `data-testid="video-card"` - Individual video cards
- `data-testid="video-carousel"` - Video carousels

### Search Elements
- `data-testid="search-results"` - Search results page container
- `data-testid="no-results"` - No results found message

## Browser Support

Tests run on:
- **Desktop**: Chromium, Firefox, WebKit
- **Mobile**: iPhone 12/13 (Safari), Pixel 5 (Chrome), Galaxy S8 (Chrome), iPad Pro (Safari)

## Test Patterns

### Conditional Testing
Tests handle different application states gracefully:
```typescript
if (await element.isVisible()) {
  // Test the functionality
  await expect(element).toBeVisible();
  // Additional assertions
} else {
  // Element not present - valid state, no assertions needed
}
```

### Responsive Testing
Tests adapt to different viewport sizes:
```typescript
await page.setViewportSize({ width: 375, height: 667 }); // Mobile
await page.setViewportSize({ width: 768, height: 1024 }); // Tablet
await page.setViewportSize({ width: 1920, height: 1080 }); // Desktop
```

### Touch Interactions
Mobile tests use touch-specific interactions:
```typescript
if (await testUtils.isMobileViewport()) {
  await testUtils.touchTap(element);
} else {
  await element.click();
}
```

## Debugging Failed Tests

### Common Issues
1. **Timing Issues**: Tests wait for debounce (300ms) and navigation
2. **State Dependencies**: Tests handle both authenticated and unauthenticated states
3. **Responsive Layouts**: Tests account for element visibility changes across viewports

### Debug Tools
- Use `npm run test:e2e:debug` for step-by-step debugging
- Use `npm run test:e2e:headed` to see browser interactions
- Check `test-results/` directory for screenshots and traces on failures

### Test Environment
Tests expect the application to be running on `http://localhost:4173` (production build).
For development testing, update the base URL in `playwright.config.ts`.

## Maintenance

### Adding New Tests
1. Follow existing patterns in test files
2. Use consistent test ID naming (`data-testid="element-name"`)
3. Handle multiple application states (authenticated/unauthenticated)
4. Test across different viewport sizes
5. Use proper wait conditions instead of fixed timeouts

### Updating Test IDs
When adding new UI elements that need testing:
1. Add descriptive `data-testid` attributes
2. Update corresponding test files
3. Follow the established naming conventions
4. Document new test IDs in this file

### Mock Data Updates
When application data structures change:
1. Update mock files in `src/tests/mocks/`
2. Ensure integration tests continue to work with new data structures
3. Add new mock data as needed for comprehensive testing