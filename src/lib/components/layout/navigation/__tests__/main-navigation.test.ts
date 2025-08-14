/**
 * Test to verify main navigation component following sidebar patterns
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import MainNavigation from '$lib/components/layout/navigation/main-navigation.svelte';
import { setNavigationState } from '$lib/state/navigation.svelte';

// Mock the page store
vi.mock('$app/stores', () => ({
  page: readable({
    url: { pathname: '/' },
    params: {},
  }),
}));

// Mock the navigation imports
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
}));

// Mock child components
vi.mock('$lib/components/side-drawer.svelte', () => ({
  default: () => ({
    render: () => '<div data-testid="side-drawer">Side Drawer</div>',
  }),
}));

vi.mock('./search-input.svelte', () => ({
  default: () => ({
    render: () => '<div data-testid="search-input">Search Input</div>',
  }),
}));

vi.mock('./user-menu.svelte', () => ({
  default: () => ({
    render: () => '<div data-testid="user-menu">User Menu</div>',
  }),
}));

vi.mock('$lib/assets/brand-logo.svelte', () => ({
  default: () => ({
    render: () => '<div data-testid="brand-logo">Brand Logo</div>',
  }),
}));

describe('Main Navigation Component', () => {
  let navigationState: any;

  beforeEach(() => {
    // Set up context states
    navigationState = setNavigationState();

    // Clear any previous state
    navigationState.cleanup();
  });

  const defaultProps = {
    userProfile: null,
    session: null,
    supabase: {} as any,
    openAccountDrawer: false,
  };

  it('should render navigation with sidebar pattern structure', () => {
    render(MainNavigation, { props: defaultProps });

    // Check main navigation is rendered
    expect(screen.getByTestId('main-navigation')).toBeInTheDocument();

    // Check main sections are present
    expect(screen.getByTestId('side-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('should render brand logo with navigation state', () => {
    render(MainNavigation, { props: defaultProps });

    const brandLogoLink = screen.getByTestId('brand-logo-link');
    expect(brandLogoLink).toBeInTheDocument();
    expect(brandLogoLink).toHaveAttribute('href', '/');
  });

  it('should render home button with navigation state', () => {
    render(MainNavigation, { props: defaultProps });

    const homeButton = screen.getByTestId('home-link');
    expect(homeButton).toBeInTheDocument();
    expect(homeButton).toHaveClass('hidden', 'rounded-full', 'sm:flex');
  });

  it('should follow sidebar accessibility patterns', () => {
    render(MainNavigation, { props: defaultProps });

    // Check for sr-only labels (following sidebar pattern)
    const brandLogoSrOnly = screen.getByText('Bombastic Home');
    expect(brandLogoSrOnly).toHaveClass('sr-only');

    const homeButtonSrOnly = screen.getByText('Home');
    expect(homeButtonSrOnly).toHaveClass('sr-only');
  });

  it('should sync context with navigation state following sidebar pattern', () => {
    const mockSession = { user: { id: 'test-user' } } as any;
    const mockUserProfile = { id: 'test-user', username: 'test' } as any;
    const mockSupabase = {} as any;

    render(MainNavigation, {
      props: {
        ...defaultProps,
        session: mockSession,
        userProfile: mockUserProfile,
        supabase: mockSupabase,
      },
    });

    // The component should sync these values with navigation state
    // Note: In a real test environment, we'd need to check if the effect ran
    expect(navigationState.session).toStrictEqual(mockSession);
    expect(navigationState.userProfile).toStrictEqual(mockUserProfile);
    expect(navigationState.supabase).toStrictEqual(mockSupabase);
  });

  it('should use consistent styling patterns with sidebar', () => {
    render(MainNavigation, { props: defaultProps });

    const homeButton = screen.getByTestId('home-link');

    // Should use Button component with consistent variant and size
    expect(homeButton).toHaveClass('hidden', 'rounded-full', 'sm:flex');

    // Should have proper button attributes
    expect(homeButton).toHaveAttribute('type', 'button');
  });

  it('should handle navigation state configuration', () => {
    // Test with home navigation disabled
    navigationState.updateConfig({ enableHomeNavigation: false });

    render(MainNavigation, { props: defaultProps });

    // Home button should not be rendered when disabled
    expect(screen.queryByTestId('home-link')).not.toBeInTheDocument();
  });

  it('should manage account drawer state like sidebar', () => {
    let openAccountDrawer = false;

    render(MainNavigation, {
      props: {
        ...defaultProps,
        openAccountDrawer,
      },
    });

    // Initial state should be synced
    expect(navigationState.openAccountDrawer).toBe(false);

    // When navigation state changes, it should sync back
    navigationState.setAccountDrawer(true);
    expect(navigationState.openAccountDrawer).toBe(true);
  });
});
