// Main navigation routes used throughout the application
export const MAIN_ROUTES = {
  HOME: '/',
  GIANTBOMB: '/giantbomb',
  NEXTLANDER: '/nextlander',
  REMAP: '/remap',
  JEFFGERSTMANN: '/jeffgerstmann',
  CONTINUE: '/continue',
} as const;

// Array of main route paths for easier iteration
export const MAIN_ROUTE_PATHS = [
  MAIN_ROUTES.HOME,
  MAIN_ROUTES.GIANTBOMB,
  MAIN_ROUTES.NEXTLANDER,
  MAIN_ROUTES.REMAP,
  MAIN_ROUTES.JEFFGERSTMANN,
  MAIN_ROUTES.CONTINUE,
];

// Main routes for navigation UI components
export const MAIN_ROUTE_CONFIG = [
  { href: MAIN_ROUTES.HOME, label: 'Home' },
  { href: MAIN_ROUTES.GIANTBOMB, label: 'Giant Bomb' },
  { href: MAIN_ROUTES.NEXTLANDER, label: 'Nextlander' },
  { href: MAIN_ROUTES.REMAP, label: 'Remap' },
  { href: MAIN_ROUTES.JEFFGERSTMANN, label: 'Jeff Gerstmann' },
] as const;
