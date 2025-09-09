import { describe, it, expect } from 'vitest';
import { MAIN_ROUTES, MAIN_ROUTE_PATHS, MAIN_ROUTE_CONFIG } from '../routes';

describe('routes constants', () => {
  describe('MAIN_ROUTES', () => {
    it('should have all expected routes', () => {
      expect(MAIN_ROUTES).toHaveProperty('HOME');
      expect(MAIN_ROUTES).toHaveProperty('GIANTBOMB');
      expect(MAIN_ROUTES).toHaveProperty('NEXTLANDER');
      expect(MAIN_ROUTES).toHaveProperty('REMAP');
      expect(MAIN_ROUTES).toHaveProperty('JEFFGERSTMANN');
      expect(MAIN_ROUTES).toHaveProperty('CONTINUE');
    });

    it('should have correct route values', () => {
      expect(MAIN_ROUTES.HOME).toBe('/');
      expect(MAIN_ROUTES.GIANTBOMB).toBe('/giantbomb');
      expect(MAIN_ROUTES.NEXTLANDER).toBe('/nextlander');
      expect(MAIN_ROUTES.REMAP).toBe('/remap');
      expect(MAIN_ROUTES.JEFFGERSTMANN).toBe('/jeffgerstmann');
      expect(MAIN_ROUTES.CONTINUE).toBe('/continue');
    });

    it('should have valid URL path formats', () => {
      Object.values(MAIN_ROUTES).forEach((route) => {
        expect(route).toMatch(/^\/[a-z]*$/); // Should start with / and contain only lowercase letters
        expect(route.length).toBeGreaterThan(0);
      });
    });

    it('should have unique route values', () => {
      const routeValues = Object.values(MAIN_ROUTES);
      const uniqueValues = new Set(routeValues);
      expect(uniqueValues.size).toBe(routeValues.length);
    });

    it('should be immutable (const assertion)', () => {
      // This test verifies the 'as const' assertion works correctly
      const homeRoute: '/' = MAIN_ROUTES.HOME;
      const giantbombRoute: '/giantbomb' = MAIN_ROUTES.GIANTBOMB;

      expect(homeRoute).toBe('/');
      expect(giantbombRoute).toBe('/giantbomb');
    });

    it('should work with SvelteKit routing patterns', () => {
      // Test that routes follow SvelteKit conventions
      Object.values(MAIN_ROUTES).forEach((route) => {
        expect(route.startsWith('/')).toBe(true);
        expect(route).not.toContain('//'); // No double slashes
        expect(route).not.toContain(' '); // No spaces
      });
    });
  });

  describe('MAIN_ROUTE_PATHS', () => {
    it('should be an array', () => {
      expect(Array.isArray(MAIN_ROUTE_PATHS)).toBe(true);
    });

    it('should have correct length', () => {
      expect(MAIN_ROUTE_PATHS).toHaveLength(6);
    });

    it('should contain all MAIN_ROUTES values', () => {
      const routeValues = Object.values(MAIN_ROUTES);
      routeValues.forEach((route) => {
        expect(MAIN_ROUTE_PATHS).toContain(route);
      });
    });

    it('should maintain order', () => {
      const expectedOrder = [
        MAIN_ROUTES.HOME,
        MAIN_ROUTES.GIANTBOMB,
        MAIN_ROUTES.NEXTLANDER,
        MAIN_ROUTES.REMAP,
        MAIN_ROUTES.JEFFGERSTMANN,
        MAIN_ROUTES.CONTINUE,
      ];

      expect(MAIN_ROUTE_PATHS).toEqual(expectedOrder);
    });

    it('should work with array methods', () => {
      // Test that it can be used in common array operations
      const filteredPaths = MAIN_ROUTE_PATHS.filter((path) => path !== '/');
      expect(filteredPaths).toHaveLength(5);

      const pathExists = MAIN_ROUTE_PATHS.includes('/giantbomb');
      expect(pathExists).toBe(true);

      const mappedPaths = MAIN_ROUTE_PATHS.map((path) => path.toUpperCase());
      expect(mappedPaths).toContain('/GIANTBOMB');
    });

    it('should work in routing utilities', () => {
      // Test common routing use cases
      const isMainRoute = (path: string) =>
        MAIN_ROUTE_PATHS.includes(path as any);

      expect(isMainRoute('/giantbomb')).toBe(true);
      expect(isMainRoute('/unknown')).toBe(false);
      expect(isMainRoute('/')).toBe(true);
    });
  });

  describe('MAIN_ROUTE_CONFIG', () => {
    it('should be an array', () => {
      expect(Array.isArray(MAIN_ROUTE_CONFIG)).toBe(true);
    });

    it('should have correct length (excludes CONTINUE)', () => {
      expect(MAIN_ROUTE_CONFIG).toHaveLength(5); // Excludes CONTINUE route
    });

    it('should have correct structure for each route', () => {
      MAIN_ROUTE_CONFIG.forEach((config) => {
        expect(config).toHaveProperty('href');
        expect(config).toHaveProperty('label');
        expect(typeof config.href).toBe('string');
        expect(typeof config.label).toBe('string');
      });
    });

    it('should have correct href values', () => {
      const expectedHrefs = [
        MAIN_ROUTES.HOME,
        MAIN_ROUTES.GIANTBOMB,
        MAIN_ROUTES.NEXTLANDER,
        MAIN_ROUTES.REMAP,
        MAIN_ROUTES.JEFFGERSTMANN,
      ];

      const actualHrefs = MAIN_ROUTE_CONFIG.map((config) => config.href);
      expect(actualHrefs).toEqual(expectedHrefs);
    });

    it('should have appropriate labels', () => {
      const expectedConfig = [
        { href: '/', label: 'Home' },
        { href: '/giantbomb', label: 'Giant Bomb' },
        { href: '/nextlander', label: 'Nextlander' },
        { href: '/remap', label: 'Remap' },
        { href: '/jeffgerstmann', label: 'Jeff Gerstmann' },
      ];

      expect(MAIN_ROUTE_CONFIG).toEqual(expectedConfig);
    });

    it('should have user-friendly labels', () => {
      MAIN_ROUTE_CONFIG.forEach((config) => {
        expect(config.label.length).toBeGreaterThan(0);
        expect(config.label).toMatch(/^[A-Za-z\s]+$/); // Only letters and spaces
        expect(config.label.trim()).toBe(config.label); // No leading/trailing whitespace
      });
    });

    it('should be immutable (const assertion)', () => {
      // Test that the config has the correct TypeScript types
      const firstConfig: { readonly href: '/'; readonly label: 'Home' } =
        MAIN_ROUTE_CONFIG[0];
      expect(firstConfig.href).toBe('/');
      expect(firstConfig.label).toBe('Home');
    });

    it('should work in navigation components', () => {
      // Test typical usage in UI components
      const navItems = MAIN_ROUTE_CONFIG.map(({ href, label }) => ({
        url: href,
        title: label,
        active: false,
      }));

      expect(navItems).toHaveLength(5);
      expect(navItems[0]).toEqual({
        url: '/',
        title: 'Home',
        active: false,
      });
    });

    it('should exclude continue route from navigation', () => {
      const hrefs = MAIN_ROUTE_CONFIG.map((config) => config.href);
      expect(hrefs).not.toContain(MAIN_ROUTES.CONTINUE);
    });
  });

  describe('consistency between exports', () => {
    it('should have consistent data between MAIN_ROUTES and MAIN_ROUTE_PATHS', () => {
      const routeValues = Object.values(MAIN_ROUTES);
      expect(MAIN_ROUTE_PATHS).toEqual(routeValues);
    });

    it('should have consistent hrefs between MAIN_ROUTES and MAIN_ROUTE_CONFIG', () => {
      const configHrefs = MAIN_ROUTE_CONFIG.map((config) => config.href);

      // All config hrefs should exist in MAIN_ROUTES
      configHrefs.forEach((href) => {
        const isInMainRoutes = Object.values(MAIN_ROUTES).includes(href as any);
        expect(isInMainRoutes).toBe(true);
      });
    });

    it('should maintain referential integrity', () => {
      // The href values in config should reference the same string literals as MAIN_ROUTES
      expect(MAIN_ROUTE_CONFIG[0].href).toBe(MAIN_ROUTES.HOME);
      expect(MAIN_ROUTE_CONFIG[1].href).toBe(MAIN_ROUTES.GIANTBOMB);
      expect(MAIN_ROUTE_CONFIG[2].href).toBe(MAIN_ROUTES.NEXTLANDER);
      expect(MAIN_ROUTE_CONFIG[3].href).toBe(MAIN_ROUTES.REMAP);
      expect(MAIN_ROUTE_CONFIG[4].href).toBe(MAIN_ROUTES.JEFFGERSTMANN);
    });
  });

  describe('usage scenarios', () => {
    it('should work with router matching', () => {
      const currentPath = '/giantbomb';
      const matchingRoute = MAIN_ROUTE_PATHS.find(
        (path) => path === currentPath
      );
      expect(matchingRoute).toBe('/giantbomb');
    });

    it('should work with breadcrumb generation', () => {
      const generateBreadcrumb = (path: string) => {
        const config = MAIN_ROUTE_CONFIG.find((c) => c.href === path);
        return config ? { path: config.href, label: config.label } : null;
      };

      const breadcrumb = generateBreadcrumb('/nextlander');
      expect(breadcrumb).toEqual({
        path: '/nextlander',
        label: 'Nextlander',
      });
    });

    it('should work with dynamic navigation generation', () => {
      const generateNavigation = () => {
        return MAIN_ROUTE_CONFIG.map(({ href, label }) => ({
          id: href.slice(1) || 'home', // Remove leading slash
          path: href,
          name: label,
          isExternal: false,
        }));
      };

      const navigation = generateNavigation();
      expect(navigation[0]).toEqual({
        id: 'home',
        path: '/',
        name: 'Home',
        isExternal: false,
      });
    });

    it('should work with route validation', () => {
      const isValidMainRoute = (path: string): boolean => {
        return MAIN_ROUTE_PATHS.includes(path as any);
      };

      expect(isValidMainRoute('/')).toBe(true);
      expect(isValidMainRoute('/giantbomb')).toBe(true);
      expect(isValidMainRoute('/invalid')).toBe(false);
      expect(isValidMainRoute('')).toBe(false);
    });
  });
});
