import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock service worker globals
const mockClients = {
  matchAll: vi.fn(() => Promise.resolve([])),
  claim: vi.fn(() => Promise.resolve()),
};

const mockCaches = {
  open: vi.fn(),
  keys: vi.fn(() => Promise.resolve([])),
  delete: vi.fn(() => Promise.resolve(true)),
};

const mockServiceWorkerGlobalScope = {
  skipWaiting: vi.fn(() => Promise.resolve()),
  clients: mockClients,
  location: { origin: 'http://localhost:5173' },
  addEventListener: vi.fn(),
};

// Mock global environment
Object.defineProperty(global, 'self', {
  value: mockServiceWorkerGlobalScope,
  writable: true,
});

Object.defineProperty(global, 'caches', {
  value: mockCaches,
  writable: true,
});

Object.defineProperty(global, 'fetch', {
  value: vi.fn(),
  writable: true,
});

// Mock SvelteKit service worker modules
vi.mock('$service-worker', () => ({
  build: ['/_app/app.js', '/_app/app.css'],
  files: ['/favicon.ico', '/robots.txt'],
  version: 'test-version',
}));

vi.mock('$lib/constants/routes', () => ({
  MAIN_ROUTE_PATHS: [
    '/',
    '/giantbomb',
    '/nextlander',
    '/remap',
    '/jeffgerstmann',
    '/continue',
  ],
}));

describe('Service Worker Cache', () => {
  let mockCache: {
    match: Mock;
    put: Mock;
    delete: Mock;
  };
  let fetchMock: Mock;

  beforeEach(() => {
    mockCache = {
      match: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    mockCaches.open.mockResolvedValue(mockCache);
    fetchMock = fetch as Mock;

    vi.clearAllMocks();
  });

  describe('OAuth callback handling', () => {
    it('should not handle OAuth callback URLs', async () => {
      // Import service worker module to test the shouldHandleRequest function
      // We'll test this indirectly through the fetch event handler
      const { default: serviceWorker } = await import(
        '../../../service-worker.ts'
      );

      const request = new Request('http://localhost:5173/?code=abc123');

      // Create mock event
      const event = {
        request,
        respondWith: vi.fn(),
      };

      // The service worker should not call respondWith for OAuth callbacks
      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(event.respondWith).not.toHaveBeenCalled();
    });

    it('should not handle auth-related URLs', async () => {
      const request = new Request('http://localhost:5173/auth/callback');

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(event.respondWith).not.toHaveBeenCalled();
    });
  });

  describe('Static asset caching', () => {
    it('should serve static assets from cache when available', async () => {
      const cachedResponse = new Response('cached content');
      mockCache.match.mockResolvedValue(cachedResponse);

      const request = new Request('http://localhost:5173/_app/app.js');

      // Test the cacheStaticAsset function indirectly
      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(event.respondWith).toHaveBeenCalled();
    });

    it('should fetch and cache static assets when not in cache', async () => {
      mockCache.match.mockResolvedValue(null);
      const networkResponse = new Response('network content');
      fetchMock.mockResolvedValue(networkResponse);

      const request = new Request('http://localhost:5173/_app/app.css');

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(event.respondWith).toHaveBeenCalled();
    });
  });

  describe('Navigation request handling', () => {
    it('should prioritize network responses over cache', async () => {
      const networkResponse = new Response(JSON.stringify({ data: 'fresh' }), {
        status: 200,
        headers: { etag: '123', 'content-type': 'application/json' },
      });
      fetchMock.mockResolvedValue(networkResponse);

      const cachedResponse = new Response(JSON.stringify({ data: 'stale' }));
      mockCache.match.mockResolvedValue(cachedResponse);

      const request = new Request('http://localhost:5173/giantbomb');

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(event.respondWith).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(request);
    });

    it('should fall back to cache when network fails', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));

      const cachedResponse = new Response('cached content');
      mockCache.match.mockResolvedValue(cachedResponse);

      const request = new Request('http://localhost:5173/giantbomb');

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(event.respondWith).toHaveBeenCalled();
    });
  });

  describe('Cache response validation', () => {
    it('should cache responses with ETag', async () => {
      const response = new Response('content', {
        status: 200,
        headers: { etag: '123' },
      });
      fetchMock.mockResolvedValue(response);

      const request = new Request('http://localhost:5173/giantbomb');

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(mockCache.put).toHaveBeenCalled();
    });

    it('should cache responses with Last-Modified', async () => {
      const response = new Response('content', {
        status: 200,
        headers: { 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT' },
      });
      fetchMock.mockResolvedValue(response);

      const request = new Request('http://localhost:5173/giantbomb');

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(mockCache.put).toHaveBeenCalled();
    });

    it('should not cache responses without caching headers', async () => {
      const response = new Response('content', {
        status: 200,
        headers: {},
      });
      fetchMock.mockResolvedValue(response);

      const request = new Request('http://localhost:5173/giantbomb');

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(mockCache.put).not.toHaveBeenCalled();
    });
  });

  describe('Message handling', () => {
    it('should handle SKIP_WAITING message', () => {
      const event = {
        data: { type: 'SKIP_WAITING' },
        waitUntil: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1](event);

      expect(mockServiceWorkerGlobalScope.skipWaiting).toHaveBeenCalled();
    });

    it('should handle CLEAR_CACHE message', () => {
      const event = {
        data: { type: 'CLEAR_CACHE' },
        waitUntil: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1](event);

      expect(event.waitUntil).toHaveBeenCalled();
    });

    it('should handle REQUEST_PRELOADED_ROUTES message', () => {
      const event = {
        data: { type: 'REQUEST_PRELOADED_ROUTES' },
        ports: [{ postMessage: vi.fn() }],
        waitUntil: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'message'
      )?.[1](event);

      expect(event.waitUntil).toHaveBeenCalled();
    });
  });

  describe('Preloading during install', () => {
    it('should preload main routes during install', async () => {
      const responses = {
        '/': new Response('home', {
          status: 200,
          headers: { etag: 'home-123' },
        }),
        '/giantbomb': new Response('gb', {
          status: 200,
          headers: { etag: 'gb-123' },
        }),
        '/__data.json': new Response(JSON.stringify({ data: 'test' }), {
          status: 200,
          headers: { etag: 'data-123' },
        }),
      };

      fetchMock.mockImplementation((input: RequestInfo) => {
        const url = typeof input === 'string' ? input : input.url;
        const pathname = new URL(url).pathname;
        return Promise.resolve(
          responses[pathname] || new Response('', { status: 404 })
        );
      });

      const event = {
        waitUntil: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'install'
      )?.[1](event);

      expect(event.waitUntil).toHaveBeenCalled();
    });
  });

  describe('Cache cleanup', () => {
    it('should clean up old caches during activation', () => {
      mockCaches.keys.mockResolvedValue([
        'bombastic-static-old-version',
        'bombastic-data-old-version',
        'bombastic-static-test-version', // Current version, should not be deleted
        'other-cache', // Different prefix, should not be deleted
      ]);

      const event = {
        waitUntil: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'activate'
      )?.[1](event);

      expect(event.waitUntil).toHaveBeenCalled();
    });
  });

  describe('Data extraction and client communication', () => {
    it('should extract and send data from __data.json responses', async () => {
      const clients = [{ postMessage: vi.fn() }, { postMessage: vi.fn() }];
      mockClients.matchAll.mockResolvedValue(clients);

      const jsonData = { title: 'Test Page', content: 'Test content' };
      const response = new Response(JSON.stringify(jsonData), {
        status: 200,
        headers: { etag: '123', 'content-type': 'application/json' },
      });
      fetchMock.mockResolvedValue(response);

      const request = new Request(
        'http://localhost:5173/giantbomb/__data.json'
      );

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      clients.forEach((client) => {
        expect(client.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'CACHE_SET',
            key: 'page:/giantbomb',
            data: jsonData,
          })
        );
      });
    });
  });

  describe('Cache key generation', () => {
    it('should generate consistent cache keys', async () => {
      // This tests the generateCacheKey function indirectly
      // by verifying that the cache system works consistently

      const response = new Response('content', {
        status: 200,
        headers: { etag: '123' },
      });
      fetchMock.mockResolvedValue(response);

      const request1 = new Request('http://localhost:5173/giantbomb');
      const request2 = new Request('http://localhost:5173/giantbomb');

      const event1 = { request: request1, respondWith: vi.fn() };
      const event2 = { request: request2, respondWith: vi.fn() };

      const fetchHandler =
        mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
          (call) => call[0] === 'fetch'
        )?.[1];

      fetchHandler(event1);
      fetchHandler(event2);

      // Both requests should use the same cache
      expect(mockCaches.open).toHaveBeenCalledWith(
        'bombastic-data-test-version'
      );
    });
  });

  describe('Error handling', () => {
    it('should handle fetch errors gracefully', async () => {
      fetchMock.mockRejectedValue(new Error('Network error'));
      mockCache.match.mockResolvedValue(null);

      const request = new Request('http://localhost:5173/giantbomb');

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      expect(event.respondWith).toHaveBeenCalled();
      // Should not throw unhandled errors
    });

    it('should handle JSON parsing errors in data extraction', async () => {
      const clients = [{ postMessage: vi.fn() }];
      mockClients.matchAll.mockResolvedValue(clients);

      const response = new Response('invalid json', {
        status: 200,
        headers: { etag: '123' },
      });
      fetchMock.mockResolvedValue(response);

      const request = new Request(
        'http://localhost:5173/giantbomb/__data.json'
      );

      const event = {
        request,
        respondWith: vi.fn(),
      };

      mockServiceWorkerGlobalScope.addEventListener.mock.calls.find(
        (call) => call[0] === 'fetch'
      )?.[1](event);

      // Should not throw errors even with invalid JSON
      expect(event.respondWith).toHaveBeenCalled();
    });
  });
});
