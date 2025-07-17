import { vi } from "vitest";

export const mockMediaQueryState = {
  isSm: true,
  isMd: false,
  isLg: false,
  isXl: false,
  canHover: true,
  subscribe: vi.fn(() => () => {}),
};

// You can use this in specific tests that need different media query states
export const createMockMediaQueryState = (overrides = {}) => ({
  ...mockMediaQueryState,
  ...overrides,
});
