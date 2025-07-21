# Option 3: Content-Specific Waiting - Migration Guide

## Overview

This document explains how to migrate from using `waitForLoadState` to the more reliable Option 3 approach of waiting for specific content. The Option 3 approach makes tests more reliable by waiting for actual content that the test needs, rather than generic page load states.

## Why Option 3 is Better

### Problems with `waitForLoadState`

```typescript
// ❌ OLD APPROACH - Unreliable
await page.goto('/video/123');
await page.waitForLoadState('domcontentloaded'); // Page might be "loaded" but video player isn't ready
await page.waitForLoadState('networkidle'); // Network might be idle but async content still loading
```

**Issues:**
- Page might be "loaded" but critical content (video player, dynamic sections) isn't ready
- Network might be "idle" but JavaScript is still rendering content
- Different content loads at different speeds
- False positives - test continues before the actual content is available

### Benefits of Option 3

```typescript
// ✅ NEW APPROACH - Reliable
await page.goto('/video/123');
await waitForSelector(page, '[data-testid="video-player"]'); // Wait for actual video player
await waitForTextContent(page, 'Video Title'); // Wait for actual video title
await waitForSelector(page, '[data-testid="video-controls"]'); // Wait for player controls
```

**Benefits:**
- Waits for actual content the test needs
- More precise and reliable
- Better error messages when content doesn't load
- Clearer test intent
- Handles dynamic content loading properly

## Migration Examples

### Basic Page Navigation

```typescript
// ❌ OLD WAY
await page.goto('/');
await page.waitForLoadState('domcontentloaded');

// ✅ NEW WAY
await page.goto('/');
await waitForTextContent(page, 'Latest Videos');
await waitForSelector(page, '[data-testid="latest-videos-section"]');
```

### Navigation with Actions

```typescript
// ❌ OLD WAY
await page.click('a[href="/playlists"]');
await page.waitForLoadState('networkidle');

// ✅ NEW WAY
await waitForNavigationWithContent(
  page,
  () => page.click('a[href="/playlists"]'),
  {
    text: ['Playlist'],
    selectors: ['[data-testid="playlist-title"]']
  }
);
```

### Video Player Loading

```typescript
// ❌ OLD WAY
await page.goto('/video/123');
await page.waitForLoadState('load');
await page.waitForTimeout(3000); // Brittle timing

// ✅ NEW WAY
await page.goto('/video/123');
await waitForSelector(page, '[data-testid="video-player"]');
await waitForSelector(page, '[data-testid="video-controls"]');
await waitForTextContent(page, 'Video Title');
```

### Complex Page with Multiple Sections

```typescript
// ❌ OLD WAY
await page.goto('/');
await page.waitForLoadState('networkidle');
// Hope everything has loaded

// ✅ NEW WAY
await page.goto('/');
await waitForPageContent(page, {
  text: ['Latest Videos', 'Giant Bomb', 'Jeff Gerstmann'],
  selectors: [
    '[data-testid="latest-videos-section"]',
    '[data-testid="source-sections"]',
    'header nav'
  ]
});
```

## Available Helper Functions

### Core Functions

- `waitForTextContent(page, text, options)` - Wait for specific text to appear
- `waitForSelector(page, selector, options)` - Wait for specific element
- `waitForTestId(page, testId, options)` - Wait for element by test ID
- `waitForPageContent(page, indicators, options)` - Wait for multiple content indicators

### Navigation Functions

- `waitForNavigationWithContent(page, action, expectedContent, options)` - Perform navigation and wait for content
- `waitForMultipleSelectors(page, selectors, options)` - Wait for multiple elements

### Page Object Base Class

```typescript
class MyPage extends PageObjectBase {
  protected getPageContentIndicators() {
    return {
      text: ['Page Title'],
      selectors: ['[data-testid="main-content"]']
    };
  }
}

const page = new MyPage(playwrightPage);
await page.navigate('/my-page'); // Automatically waits for content indicators
```

## Common Patterns

### 1. Wait for Dynamic Content

```typescript
// Wait for content that loads via JavaScript
await waitForSelector(page, '[data-testid="dynamic-content"]');
await waitForTextContent(page, 'Loaded Content');
```

### 2. Wait for Form Readiness

```typescript
// Wait for form to be fully interactive
await waitForSelector(page, 'form[data-testid="contact-form"]');
await waitForSelector(page, 'input[name="email"]:not([disabled])');
await waitForSelector(page, 'button[type="submit"]:not([disabled])');
```

### 3. Wait for List/Grid Content

```typescript
// Wait for list items to load
await waitForSelector(page, '[data-testid="video-grid"]');
await expect(page.locator('.video-card')).toHaveCount({ atLeast: 1 });
```

### 4. Handle Authentication State

```typescript
// Wait for different content based on auth state
const isLoggedIn = await page.locator('[data-testid="user-menu"]').isVisible({ timeout: 2000 });
if (isLoggedIn) {
  await waitForTextContent(page, 'Continue Watching');
} else {
  await waitForTextContent(page, 'Sign In');
}
```

## Error Handling

### Timeout Errors

```typescript
try {
  await waitForTextContent(page, 'Expected Content', { timeout: 10000 });
} catch (error) {
  // Custom error message includes what we were waiting for
  console.log(error.message); // "Timeout waiting for text content: 'Expected Content'"
}
```

### Conditional Content

```typescript
// Handle content that may or may not appear
try {
  await waitForTextContent(page, 'Optional Content', { timeout: 5000 });
  console.log('Optional content found');
} catch {
  console.log('Optional content not present');
}
```

## Best Practices

### 1. Use Descriptive Test IDs

```typescript
// ✅ Good - descriptive test IDs
await waitForTestId(page, 'video-player-loaded');
await waitForTestId(page, 'user-playlist-grid');

// ❌ Avoid - generic test IDs
await waitForTestId(page, 'content');
await waitForTestId(page, 'div1');
```

### 2. Combine Multiple Indicators

```typescript
// Wait for multiple things to ensure page is fully ready
await waitForPageContent(page, {
  text: ['Page Title'],
  testIds: ['main-content', 'navigation'],
  selectors: ['.loaded', ':not(.loading)']
});
```

### 3. Use Appropriate Timeouts

```typescript
// Adjust timeouts based on expected load time
await waitForTextContent(page, 'Quick Content', { timeout: 5000 });
await waitForSelector(page, '[data-testid="video-player"]', { timeout: 15000 });
await waitForTextContent(page, 'Heavy Content', { timeout: 30000 });
```

### 4. Page Object Pattern

```typescript
// Encapsulate page-specific waits in page objects
class VideoPage extends PageObjectBase {
  async waitForVideoReady() {
    await this.waitForVideoPlayer();
    await this.waitForVideoMetadata();
    await this.waitForRelatedVideos();
  }
}
```

## Migration Checklist

- [ ] Replace all `page.waitForLoadState()` calls
- [ ] Replace all `page.waitForTimeout()` calls with content-specific waits
- [ ] Add appropriate test IDs to components for reliable selection
- [ ] Use helper functions for common waiting patterns
- [ ] Create page objects that encapsulate content waiting logic
- [ ] Add error handling for timeout scenarios
- [ ] Test with slow network conditions to verify reliability
- [ ] Update CI/CD to use new test approach

## Common Migration Issues

### Issue: Test IDs Missing

```typescript
// ❌ Problem - no test IDs available
await waitForSelector(page, '.complex > .nested > .selector');

// ✅ Solution - add test IDs to components
await waitForTestId(page, 'video-player');
```

### Issue: Multiple Similar Elements

```typescript
// ❌ Problem - ambiguous selector
await waitForSelector(page, '.video-card');

// ✅ Solution - be more specific
await waitForSelector(page, '[data-testid="latest-videos"] .video-card:first-child');
```

### Issue: Content Loads in Stages

```typescript
// ❌ Problem - only waiting for first stage
await waitForTextContent(page, 'Loading...');

// ✅ Solution - wait for final content
await waitForTextContent(page, 'Content Loaded');
await waitForSelector(page, '[data-testid="content"]:not(.loading)');
```

This approach makes tests more reliable, maintainable, and provides better debugging information when things go wrong.