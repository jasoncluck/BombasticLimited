/**
 * Test to verify navigation state management follows sidebar patterns
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { NavigationStateClass } from '$lib/state/navigation.svelte';

describe('Navigation State Management', () => {
  let navigationState: NavigationStateClass;
  beforeEach(() => {
    navigationState = new NavigationStateClass();
  });

  it('should initialize with default navigation items', () => {
    expect(navigationState.navigationItems).toHaveLength(2);

    const homeItem = navigationState.getNavigationItem('home');
    const brandItem = navigationState.getNavigationItem('brand-logo');

    expect(homeItem).toBeDefined();
    expect(homeItem?.label).toBe('Home');
    expect(homeItem?.href).toBe('/');
    expect(homeItem?.testId).toBe('home-link');

    expect(brandItem).toBeDefined();
    expect(brandItem?.label).toBe('Bombastic Home');
    expect(brandItem?.href).toBe('/');
    expect(brandItem?.testId).toBe('brand-logo-link');
  });

  it('should follow sidebar pattern for state management', () => {
    // Check if it has similar state properties as sidebar
    expect(navigationState).toHaveProperty('activeRoute');
    expect(navigationState).toHaveProperty('isNavigating');
    expect(navigationState).toHaveProperty('config');
    expect(navigationState).toHaveProperty('session');
    expect(navigationState).toHaveProperty('userProfile');
    expect(navigationState).toHaveProperty('supabase');
  });

  it('should update active route correctly', () => {
    navigationState.updateActiveRoute('/some-path');
    expect(navigationState.activeRoute).toBe('/some-path');
  });

  it('should check navigation item active state', () => {
    navigationState.updateActiveRoute('/');

    const homeItem = navigationState.getNavigationItem('home');
    expect(homeItem).toBeDefined();
    expect(navigationState.isNavigationItemActive(homeItem!)).toBe(true);

    navigationState.updateActiveRoute('/other-path');
    expect(navigationState.isNavigationItemActive(homeItem!)).toBe(false);
  });

  it('should manage account drawer state like sidebar', () => {
    expect(navigationState.openAccountDrawer).toBe(false);

    navigationState.toggleAccountDrawer();
    expect(navigationState.openAccountDrawer).toBe(true);

    navigationState.setAccountDrawer(false);
    expect(navigationState.openAccountDrawer).toBe(false);
  });

  it('should provide navigation button classes following sidebar pattern', () => {
    const homeItem = navigationState.getNavigationItem('home')!;

    // Test when not active
    navigationState.updateActiveRoute('/other');
    let classes = navigationState.getNavigationButtonClasses(homeItem);
    expect(classes).toContain('transition-opacity');
    expect(classes).toContain('duration-200');
    expect(classes).toContain('hover:opacity-80');

    // Test when active
    navigationState.updateActiveRoute('/');
    classes = navigationState.getNavigationButtonClasses(homeItem);
    expect(classes).toContain('opacity-100');
  });

  it('should update context like sidebar state pattern', () => {
    const mockSession = { user: { id: 'test-user' } } as any;
    const mockUserProfile = { id: 'test-user', username: 'test' } as any;
    const mockSupabase = {} as any;

    navigationState.updateContext({
      session: mockSession,
      userProfile: mockUserProfile,
      supabase: mockSupabase,
    });

    expect(navigationState.session).toStrictEqual(mockSession);
    expect(navigationState.userProfile).toStrictEqual(mockUserProfile);
    expect(navigationState.supabase).toStrictEqual(mockSupabase);
  });

  it('should provide configuration management like sidebar', () => {
    expect(navigationState.config.enableHomeNavigation).toBe(true);
    expect(navigationState.config.enableBrandLogo).toBe(true);
    expect(navigationState.config.homeRouteReplaceState).toBe(true);

    navigationState.updateConfig({
      enableHomeNavigation: false,
    });

    expect(navigationState.config.enableHomeNavigation).toBe(false);
    expect(navigationState.config.enableBrandLogo).toBe(true); // Should remain unchanged
  });

  it('should support adding and removing navigation items like sidebar patterns', () => {
    const customItem = {
      id: 'custom-nav',
      label: 'Custom Navigation',
      href: '/custom',
      testId: 'custom-nav-link',
    };

    navigationState.addNavigationItem(customItem);
    expect(navigationState.navigationItems).toHaveLength(3);
    expect(navigationState.getNavigationItem('custom-nav')).toEqual(customItem);

    navigationState.removeNavigationItem('custom-nav');
    expect(navigationState.navigationItems).toHaveLength(2);
    expect(navigationState.getNavigationItem('custom-nav')).toBeNull();
  });

  it('should have cleanup method following sidebar pattern', () => {
    navigationState.isNavigating = true;
    navigationState.openAccountDrawer = true;

    navigationState.cleanup();

    expect(navigationState.isNavigating).toBe(false);
    expect(navigationState.openAccountDrawer).toBe(false);
  });
});
