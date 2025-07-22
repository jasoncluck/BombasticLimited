# E2E Testing with Playwright

This project uses Playwright for comprehensive end-to-end testing with mobile
browser support.

## Getting Started

### Installation

The necessary dependencies are already installed. To set up browsers:

```bash
npx playwright install
```

### Running Tests

#### All Tests

```bash
npm run test:e2e
```

#### Interactive Mode

```bash
npm run test:e2e:ui
```

#### Debug Mode

```bash
npm run test:e2e:debug
```

#### Headed Mode (See browser)

```bash
npm run test:e2e:headed
```

#### Mobile-Only Tests

```bash
npm run test:e2e:mobile
```

#### Desktop-Only Tests

```bash
npm run test:e2e:desktop
```

#### Run Unit and E2E Tests

```bash
npm run test:all
```

### View Test Reports

```bash
npm run test:e2e:report
```

## Test Structure

### Test Organization

```
tests/e2e/
├── fixtures/          # Test fixtures and custom test setups
├── pages/             # Page Object Model classes
├── specs/             # Test specifications
├── setup/             # Global setup and teardown
└── utils/             # Test utilities and helpers
```

### Test Categories

#### 1. Basic Navigation (`basic-navigation.spec.ts`)

- Page loading and rendering
- Console error detection
- Meta tag validation
- Network error handling

#### 2. Responsive Design (`responsive-design.spec.ts`)

- Mobile layout testing (375px width)
- Tablet layout testing (768px width)
- Desktop layout testing (1920px width)
- Cross-viewport consistency
- Touch-friendly interface validation

#### 3. Touch Interactions (`touch-interactions.spec.ts`)

- Touch tap gestures
- Swipe gestures
- Pinch zoom
- Long press interactions
- Orientation change handling

#### 4. Cross-Browser Compatibility (`cross-browser.spec.ts`)

- JavaScript feature support
- CSS Grid and Flexbox support
- Media query handling
- Viewport responsiveness

#### 5. User Interaction Flows (`user-flows.spec.ts`)

- Navigation flows
- Video card interactions
- Search functionality
- Settings and preferences
- Mobile menu handling

## Browser Support

### Desktop Browsers

- **Chromium** (Chrome/Edge)
- **Firefox**
- **WebKit** (Safari)

### Mobile Devices

- **iPhone 12** (iOS Safari)
- **iPhone 13** (iOS Safari)
- **Pixel 5** (Android Chrome)
- **Galaxy S8** (Android Chrome)
- **iPad Pro** (iOS Safari)

## Writing Tests

### Page Object Model

Use the Page Object Model pattern for maintainable tests:

```typescript
import { test, expect } from "../fixtures/base-fixtures";

test("example test", async ({ homePage }) => {
  await homePage.goto("/");
  await homePage.expectPageToLoad();
  // Your test logic here
});
```

### Mobile-Specific Testing

```typescript
test("mobile touch interaction", async ({ testUtils, page }) => {
  await page.setViewportSize({ width: 375, height: 667 });

  if (await testUtils.isMobileViewport()) {
    await testUtils.touchTap('[data-testid="button"]');
    await testUtils.touchSwipe('[data-testid="carousel"]', "left");
  }
});
```

### Responsive Testing Patterns

```typescript
test("responsive element", async ({ testUtils, page }) => {
  await testUtils.checkResponsiveElement('[data-testid="nav"]', {
    mobile: { visible: false },
    tablet: { visible: true },
    desktop: { visible: true, class: "desktop-nav" },
  });
});
```

## Test Configuration

### Environment Variables

Tests run against `http://localhost:4173` by default. Configure in
`playwright.config.ts`:

```typescript
use: {
  baseURL: 'http://localhost:4173',
  // Other settings...
}
```

### Timeouts

- **Test timeout**: 30 seconds
- **Navigation timeout**: 30 seconds
- **Action timeout**: 10 seconds
- **Expect timeout**: 5 seconds

### Test Artifacts

- **Screenshots**: Taken on failure and for responsive testing
- **Videos**: Recorded on retry failures
- **Traces**: Available on first retry for debugging

Artifacts are saved in `test-results/` directory.

## CI/CD Integration

### Headless Mode

Tests run in headless mode by default in CI environments:

```bash
# CI environment detected automatically
npm run test:e2e
```

### Docker Support

For consistent CI environments, use the Playwright Docker image:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-focal

COPY . /app
WORKDIR /app

RUN npm ci
RUN npm run build
CMD ["npm", "run", "test:e2e"]
```

### GitHub Actions Example

```yaml
- name: Install dependencies
  run: npm ci

- name: Install Playwright browsers
  run: npx playwright install --with-deps

- name: Build application
  run: npm run build

- name: Run Playwright tests
  run: npm run test:e2e

- name: Upload test results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

## Best Practices

### Test Writing Guidelines

1. **Use descriptive test names** that explain what is being tested
2. **Follow AAA pattern**: Arrange, Act, Assert
3. **Keep tests independent** and isolated
4. **Use page objects** for reusable page interactions
5. **Test user workflows** rather than implementation details

### Mobile Testing Guidelines

1. **Test touch interactions** separately from click interactions
2. **Verify touch target sizes** meet accessibility guidelines (minimum 44px)
3. **Test orientation changes** for responsive layouts
4. **Validate swipe gestures** for carousels and lists
5. **Check mobile-specific UI elements** (hamburger menus, etc.)

### Performance Guidelines

1. **Wait for specific elements** instead of network states for reliability
2. **Minimize unnecessary waits** with specific selectors
3. **Run tests in parallel** where possible
4. **Use fixtures** to reduce test setup overhead

### Debugging Tips

1. **Use headed mode** (`--headed`) to see browser interactions
2. **Enable debug mode** (`--debug`) to step through tests
3. **Add screenshots** (`await page.screenshot()`) for debugging
4. **Use browser dev tools** in debug mode
5. **Check test artifacts** in `test-results/` for failure analysis

## Troubleshooting

### Common Issues

#### Browser Installation Failed

```bash
# Try installing browsers manually
npx playwright install chromium
```

#### Tests Timeout

- Check if the application is running on the correct port
- Increase timeout values in `playwright.config.ts`
- Verify network connectivity

#### Flaky Tests

- Add proper wait conditions
- Use `page.waitForSelector()` instead of `page.waitForTimeout()`
- Check for race conditions in the application

#### Mobile Tests Failing

- Verify viewport settings
- Check touch event simulation
- Ensure mobile-specific selectors exist

### Getting Help

- **Playwright Documentation**: https://playwright.dev/
- **Debugging Guide**: https://playwright.dev/docs/debug
- **Best Practices**: https://playwright.dev/docs/best-practices
