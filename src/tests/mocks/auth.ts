import type { User, Session } from "@supabase/supabase-js";
import { mockDeep } from "vitest-mock-extended";

export const mockUser: User = {
  id: "user-1",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2023-01-01T00:00:00Z",
  email: "test@example.com",
};

export const mockSession: Session = {
  user: mockUser,
  access_token: "mock-token",
  refresh_token: "mock-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  expires_at: Date.now() / 1000 + 3600,
};

// Create deep mocks with full type safety
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  ...mockUser,
  ...overrides,
});

export const createMockSession = (
  overrides: Partial<Session> = {},
): Session => ({
  ...mockSession,
  ...overrides,
});

// Type-safe deep mock for complex auth scenarios
export const createMockAuthUser = () => mockDeep<User>();
export const createMockAuthSession = () => mockDeep<Session>();
