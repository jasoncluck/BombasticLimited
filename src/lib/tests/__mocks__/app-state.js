import { vi } from 'vitest';

// Mock app state for testing
export const page = {
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
