import { test, expect } from '../fixtures/base-fixtures';

test.describe('Cross-Browser Compatibility', () => {
  const testCases = [
    {
      name: 'Basic functionality',
      test: async (page: any) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await expect(page.getByText('Latest Videos')).toBeVisible();
      }
    },
    {
      name: 'Page loading performance',
      test: async (page: any) => {
        const startTime = Date.now();
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        const loadTime = Date.now() - startTime;
        
        // Page should load within reasonable time (10 seconds max)
        expect(loadTime).toBeLessThan(10000);
      }
    },
    {
      name: 'Interactive elements',
      test: async (page: any) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        
        // Check if buttons are clickable
        const buttons = page.locator('button:visible');
        const count = await buttons.count();
        
        if (count > 0) {
          const firstButton = buttons.first();
          await expect(firstButton).toBeEnabled();
        }
      }
    },
    {
      name: 'CSS rendering',
      test: async (page: any) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        
        // Check if main content has proper styling
        const mainContent = page.locator('main, [role="main"], body > div');
        if (await mainContent.first().isVisible()) {
          const styles = await mainContent.first().evaluate((el: Element) => {
            const computed = window.getComputedStyle(el);
            return {
              display: computed.display,
              position: computed.position
            };
          });
          
          expect(styles.display).not.toBe('none');
        }
      }
    }
  ];

  for (const testCase of testCases) {
    test.describe(testCase.name, () => {
      test('works in Chromium', async ({ page }) => {
        await testCase.test(page);
      });
    });
  }
});

test.describe('Browser-Specific Features', () => {
  test('should handle JavaScript features consistently', async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Test modern JavaScript features
    const jsSupport = await page.evaluate(() => {
      const tests = {
        es6Classes: typeof class {} === 'function',
        arrowFunctions: typeof (() => {}) === 'function',
        promises: typeof Promise !== 'undefined',
        fetch: typeof fetch !== 'undefined',
        localStorage: typeof localStorage !== 'undefined',
        sessionStorage: typeof sessionStorage !== 'undefined'
      };
      
      return tests;
    });
    
    // All modern browsers should support these features
    expect(jsSupport.es6Classes).toBe(true);
    expect(jsSupport.arrowFunctions).toBe(true);
    expect(jsSupport.promises).toBe(true);
    expect(jsSupport.fetch).toBe(true);
    expect(jsSupport.localStorage).toBe(true);
    expect(jsSupport.sessionStorage).toBe(true);
  });

  test('should handle CSS Grid and Flexbox', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const cssSupport = await page.evaluate(() => {
      const testEl = document.createElement('div');
      document.body.appendChild(testEl);
      
      const tests = {
        flexbox: false,
        grid: false
      };
      
      try {
        testEl.style.display = 'flex';
        tests.flexbox = window.getComputedStyle(testEl).display === 'flex';
        
        testEl.style.display = 'grid';
        tests.grid = window.getComputedStyle(testEl).display === 'grid';
      } catch (e) {
        // Browser doesn't support these properties
      }
      
      document.body.removeChild(testEl);
      return tests;
    });
    
    // Modern browsers should support both
    expect(cssSupport.flexbox).toBe(true);
    expect(cssSupport.grid).toBe(true);
  });

  test('should handle media queries correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Test media query support
    const mediaQuerySupport = await page.evaluate(() => {
      return {
        matchMedia: typeof window.matchMedia !== 'undefined',
        supportsTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0
      };
    });
    
    expect(mediaQuerySupport.matchMedia).toBe(true);
  });

  test('should handle viewport changes consistently', async ({ page }) => {
    await page.goto('/');
    
    const viewports = [
      { width: 320, height: 568 },  // iPhone 5
      { width: 768, height: 1024 }, // iPad
      { width: 1200, height: 800 }  // Desktop
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300); // Wait for responsive adjustments
      
      // Page should remain functional at all viewport sizes
      await expect(page.getByText('Latest Videos')).toBeVisible();
      
      // Check if responsive elements adapt
      const body = page.locator('body');
      const styles = await body.evaluate((el) => {
        return window.getComputedStyle(el).overflow;
      });
      
      // Body should not have horizontal overflow
      expect(styles).not.toContain('scroll');
    }
  });
});