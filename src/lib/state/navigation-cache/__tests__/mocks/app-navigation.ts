import { vi } from 'vitest';

// Mock SvelteKit's preloadData function
export const preloadData = vi.fn(() => Promise.resolve({ data: 'test' }));
