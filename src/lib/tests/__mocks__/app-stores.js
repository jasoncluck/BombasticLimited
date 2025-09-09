import { vi } from 'vitest';

export const page = {
  subscribe: vi.fn(),
  url: {
    searchParams: new URLSearchParams(),
  },
  params: {},
  route: { id: '/' },
  status: 200,
  error: null,
  data: {},
  form: null,
  state: {},
};

export const navigating = {
  subscribe: vi.fn(),
};

export const updated = {
  subscribe: vi.fn(),
  check: vi.fn(),
};
