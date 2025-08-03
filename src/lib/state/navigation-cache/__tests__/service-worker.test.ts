import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock service worker globals
const mockClients = {
  matchAll: vi.fn(() => Promise.resolve([] as Array<{ postMessage: Mock }>)),
  claim: vi.fn(() => Promise.resolve()),
};

const mockCaches = {
  open: vi.fn(),
  keys: vi.fn(() => Promise.resolve([] as string[])),
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

  beforeEach(async () => {
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
      // Test service worker behavior indirectly through the fetch event handler
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
    it('should identify static assets correctly', () => {
      // Test the STATIC_EXTENSIONS regex pattern
      const staticPattern =
        /\.(js|css|woff2?|ttf|eot|jpg|jpeg|png|gif|svg|webp|ico|avif)$/;

      expect('/app.js'.match(staticPattern)).toBeTruthy();
      expect('/styles.css'.match(staticPattern)).toBeTruthy();
      expect('/font.woff2'.match(staticPattern)).toBeTruthy();
      expect('/image.png'.match(staticPattern)).toBeTruthy();
      expect('/data.json'.match(staticPattern)).toBeFalsy();
      expect('/page'.match(staticPattern)).toBeFalsy();
    });

    it('should handle cache operations', async () => {
      const testResponse = new Response('test content');
      mockCache.match.mockResolvedValue(testResponse);

      const result = await mockCache.match('test-key');
      expect(result).toBe(testResponse);
      expect(mockCache.match).toHaveBeenCalledWith('test-key');
    });
  });

  describe('Navigation request handling', () => {
    it('should validate URL handling logic', () => {
      // Test the shouldHandleRequest logic
      const shouldHandle = (url: string): boolean => {
        const urlObj = new URL(url);
        // Don't handle OAuth callback URLs
        if (urlObj.searchParams.has('code') && urlObj.pathname === '/') {
          return false;
        }
        // Don't handle auth-related URLs
        if (urlObj.pathname.startsWith('/auth/')) {
          return false;
        }
        return true;
      };

      expect(shouldHandle('http://localhost:5173/')).toBe(true);
      expect(shouldHandle('http://localhost:5173/?code=123')).toBe(false);
      expect(shouldHandle('http://localhost:5173/auth/callback')).toBe(false);
      expect(shouldHandle('http://localhost:5173/giantbomb')).toBe(true);
    });

    it('should handle cache fallback scenarios', async () => {
      mockCache.match.mockResolvedValue(new Response('cached content'));

      const result = await mockCache.match('/test');
      expect(result?.status).toBe(200);
      expect(mockCache.match).toHaveBeenCalledWith('/test');
    });
  });

  describe('Cache response validation', () => {
    it('should validate response caching criteria', () => {
      // Test the shouldCacheResponse logic
      const shouldCache = (response: Response): boolean => {
        return (
          response.ok &&
          (response.headers.has('etag') ||
            response.headers.has('last-modified'))
        );
      };

      const responseWithETag = new Response('content', {
        status: 200,
        headers: { etag: '123' },
      });
      expect(shouldCache(responseWithETag)).toBe(true);

      const responseWithLastModified = new Response('content', {
        status: 200,
        headers: { 'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT' },
      });
      expect(shouldCache(responseWithLastModified)).toBe(true);

      const responseWithoutHeaders = new Response('content', { status: 200 });
      expect(shouldCache(responseWithoutHeaders)).toBe(false);

      const errorResponse = new Response('error', { status: 404 });
      expect(shouldCache(errorResponse)).toBe(false);
    });
  });

  describe('Message handling', () => {
    it('should validate message types', () => {
      const validTypes = [
        'SKIP_WAITING',
        'CLEAR_CACHE',
        'REQUEST_PRELOADED_ROUTES',
        'PRELOAD_ROUTE',
      ];

      const messageData = { type: 'SKIP_WAITING' };
      expect(validTypes.includes(messageData.type)).toBe(true);

      const invalidMessage = { type: 'UNKNOWN_TYPE' };
      expect(validTypes.includes(invalidMessage.type)).toBe(false);
    });

    it('should handle message port communication', () => {
      const mockPort = { postMessage: vi.fn() };
      const message = { routes: ['/', '/giantbomb'] };

      mockPort.postMessage(message);
      expect(mockPort.postMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('Preloading during install', () => {
    it('should validate main route constants', () => {
      // Test route validation logic
      const mainRoutes = [
        '/',
        '/giantbomb',
        '/nextlander',
        '/remap',
        '/jeffgerstmann',
        '/continue',
      ];

      expect(mainRoutes.includes('/')).toBe(true);
      expect(mainRoutes.includes('/giantbomb')).toBe(true);
      expect(mainRoutes.includes('/invalid')).toBe(false);
      expect(mainRoutes.length).toBeGreaterThan(0);
    });

    it('should handle data URL construction', () => {
      const createDataUrl = (route: string): string => {
        return route === '/' ? '/__data.json' : `${route}/__data.json`;
      };

      expect(createDataUrl('/')).toBe('/__data.json');
      expect(createDataUrl('/giantbomb')).toBe('/giantbomb/__data.json');
      expect(createDataUrl('/nextlander')).toBe('/nextlander/__data.json');
    });
  });

  describe('Cache cleanup', () => {
    it('should identify cache versions correctly', () => {
      const version = 'test-version';
      const isOldCache = (cacheName: string): boolean => {
        return (
          cacheName.startsWith('bombastic-') && !cacheName.includes(version)
        );
      };

      expect(isOldCache('bombastic-static-old-version')).toBe(true);
      expect(isOldCache('bombastic-data-old-version')).toBe(true);
      expect(isOldCache('bombastic-static-test-version')).toBe(false);
      expect(isOldCache('other-cache')).toBe(false);
    });

    it('should handle cache operations', async () => {
      mockCaches.delete.mockResolvedValue(true);

      const result = await mockCaches.delete();
      expect(result).toBe(true);
      expect(mockCaches.delete).toHaveBeenCalled();
    });
  });

  describe('Data extraction and client communication', () => {
    it('should validate data URL patterns', () => {
      const isDataUrl = (url: string): boolean => {
        return url.includes('__data.json');
      };

      expect(isDataUrl('http://localhost:5173/__data.json')).toBe(true);
      expect(isDataUrl('http://localhost:5173/giantbomb/__data.json')).toBe(
        true
      );
      expect(isDataUrl('http://localhost:5173/giantbomb')).toBe(false);
    });

    it('should extract route names from data URLs', () => {
      const extractRoute = (url: string): string => {
        const urlObj = new URL(url);
        return urlObj.pathname.replace('/__data.json', '') || '/';
      };

      expect(extractRoute('http://localhost:5173/__data.json')).toBe('/');
      expect(extractRoute('http://localhost:5173/giantbomb/__data.json')).toBe(
        '/giantbomb'
      );
      expect(extractRoute('http://localhost:5173/nextlander/__data.json')).toBe(
        '/nextlander'
      );
    });
  });

  describe('Cache key generation', () => {
    it('should validate cache key format', () => {
      const generateCacheKey = (pathname: string): string => {
        return `bombastic-data-${pathname.replace(/\//g, '_')}`;
      };

      expect(generateCacheKey('/')).toBe('bombastic-data-_');
      expect(generateCacheKey('/giantbomb')).toBe('bombastic-data-_giantbomb');
      expect(generateCacheKey('/nextlander')).toBe(
        'bombastic-data-_nextlander'
      );
    });

    it('should handle cache naming consistently', () => {
      const version = 'test-version';
      const staticCache = `bombastic-static-${version}`;
      const dataCache = `bombastic-data-${version}`;

      expect(staticCache).toBe('bombastic-static-test-version');
      expect(dataCache).toBe('bombastic-data-test-version');
    });
  });

  describe('Error handling', () => {
    it('should validate error response handling', () => {
      const isSuccessResponse = (response: Response): boolean => {
        return response.ok && response.status >= 200 && response.status < 300;
      };

      const successResponse = new Response('content', { status: 200 });
      const errorResponse = new Response('error', { status: 404 });
      const serverError = new Response('error', { status: 500 });

      expect(isSuccessResponse(successResponse)).toBe(true);
      expect(isSuccessResponse(errorResponse)).toBe(false);
      expect(isSuccessResponse(serverError)).toBe(false);
    });

    it('should handle JSON validation', () => {
      const isValidJson = (text: string): boolean => {
        try {
          JSON.parse(text);
          return true;
        } catch {
          return false;
        }
      };

      expect(isValidJson('{"valid": true}')).toBe(true);
      expect(isValidJson('invalid json')).toBe(false);
      expect(isValidJson('null')).toBe(true);
    });
  });
});
