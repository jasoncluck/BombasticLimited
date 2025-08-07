import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingSSEService } from '../streaming-sse.js';
import { activeStreams } from '$lib/state/streaming.svelte.js';
import { showNotification } from '$lib/stores/notification.js';

// Mock the notification store
vi.mock('$lib/stores/notification', () => ({
  showNotification: vi.fn(),
}));

// Mock the source constants
vi.mock('$lib/constants/source', () => ({
  SOURCE_INFO: {
    giantbomb: { displayName: 'Giant Bomb' },
    nextlander: { displayName: 'Nextlander' },
    remap: { displayName: 'Remap' },
    jeffgerstmann: { displayName: 'The Jeff Gerstmann Show' },
  },
}));

// Mock EventSource
class MockEventSource {
  readyState: number = EventSource.CONNECTING;
  url: string;
  withCredentials: boolean;
  listeners: { [key: string]: ((event: Event) => void)[] } = {};

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.withCredentials = options?.withCredentials || false;
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  close() {
    this.readyState = EventSource.CLOSED as any;
  }

  // Test helper to simulate events
  simulateEvent(type: string, data: string) {
    const event = new MessageEvent(type, { data });
    if (this.listeners[type]) {
      this.listeners[type].forEach((listener) => listener(event));
    }
  }

  simulateOpen() {
    this.readyState = EventSource.OPEN as any;
    const event = new Event('open');
    if (this.listeners['open']) {
      this.listeners['open'].forEach((listener) => listener(event));
    }
  }

  simulateError() {
    const event = new Event('error');
    if (this.listeners['error']) {
      this.listeners['error'].forEach((listener) => listener(event));
    }
  }
}

// Mock global EventSource
global.EventSource = MockEventSource as any;

describe('StreamingSSEService', () => {
  let service: StreamingSSEService;
  let mockShowNotification: any;

  beforeEach(() => {
    // Reset the streaming state
    activeStreams.sources = [];
    
    // Create a new service instance
    service = new StreamingSSEService();
    
    // Get the mocked showNotification function
    mockShowNotification = vi.mocked(showNotification);
    mockShowNotification.mockClear();

    // Clear timers
    vi.clearAllTimers();
  });

  afterEach(() => {
    service.stop();
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('should create an EventSource connection when started', () => {
      service.start();
      expect(service.getStatus()).toBe('connecting');
    });

    it('should not create multiple connections', () => {
      service.start();
      const firstStatus = service.getStatus();
      
      service.start();
      const secondStatus = service.getStatus();
      
      expect(firstStatus).toBe(secondStatus);
    });

    it('should connect to the correct endpoint', () => {
      service.start();
      
      // Access the private eventSource through any to test
      const eventSource = (service as any).eventSource;
      expect(eventSource.url).toBe('/api/twitch');
      expect(eventSource.withCredentials).toBe(true);
    });
  });

  describe('status tracking', () => {
    it('should report correct status when disconnected', () => {
      expect(service.getStatus()).toBe('disconnected');
    });

    it('should report correct status when connecting', () => {
      service.start();
      expect(service.getStatus()).toBe('connecting');
    });

    it('should report correct status when connected', () => {
      service.start();
      const eventSource = (service as any).eventSource as MockEventSource;
      eventSource.simulateOpen();
      
      // Need to check the actual status through the service
      expect(eventSource.readyState).toBe(EventSource.OPEN);
    });

    it('should report correct status when closed', () => {
      service.start();
      service.stop();
      expect(service.getStatus()).toBe('disconnected');
    });
  });

  describe('streaming updates', () => {
    beforeEach(() => {
      service.start();
    });

    it('should update streaming state when receiving data', () => {
      const eventSource = (service as any).eventSource as MockEventSource;
      const streamingData = ['giantbomb', 'nextlander'];
      
      eventSource.simulateEvent('streamingSubscriptions', JSON.stringify(streamingData));
      
      expect(activeStreams.sources).toEqual(streamingData);
    });

    it('should send notifications for new streams', () => {
      const eventSource = (service as any).eventSource as MockEventSource;
      
      // Start with no streams
      expect(activeStreams.sources).toEqual([]);
      
      // Simulate a stream starting
      eventSource.simulateEvent('streamingSubscriptions', JSON.stringify(['giantbomb']));
      
      expect(mockShowNotification).toHaveBeenCalledWith(
        'Giant Bomb has started streaming!',
        'success'
      );
    });

    it('should not send notifications for existing streams', () => {
      const eventSource = (service as any).eventSource as MockEventSource;
      
      // Start with a stream already active
      activeStreams.sources = ['giantbomb'];
      
      // Simulate the same stream continuing
      eventSource.simulateEvent('streamingSubscriptions', JSON.stringify(['giantbomb']));
      
      expect(mockShowNotification).not.toHaveBeenCalled();
    });

    it('should handle multiple stream changes', () => {
      const eventSource = (service as any).eventSource as MockEventSource;
      
      // Start with one stream
      activeStreams.sources = ['giantbomb'];
      
      // Add another stream
      eventSource.simulateEvent('streamingSubscriptions', JSON.stringify(['giantbomb', 'nextlander']));
      
      expect(activeStreams.sources).toEqual(['giantbomb', 'nextlander']);
      expect(mockShowNotification).toHaveBeenCalledWith(
        'Nextlander has started streaming!',
        'success'
      );
    });

    it('should handle streams ending', () => {
      const eventSource = (service as any).eventSource as MockEventSource;
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Start with two streams
      activeStreams.sources = ['giantbomb', 'nextlander'];
      
      // Remove one stream
      eventSource.simulateEvent('streamingSubscriptions', JSON.stringify(['giantbomb']));
      
      expect(activeStreams.sources).toEqual(['giantbomb']);
      expect(consoleSpy).toHaveBeenCalledWith('Nextlander has stopped streaming');
      
      consoleSpy.mockRestore();
    });

    it('should handle invalid JSON gracefully', () => {
      const eventSource = (service as any).eventSource as MockEventSource;
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      eventSource.simulateEvent('streamingSubscriptions', 'invalid json');
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to parse streaming update:',
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('connection management', () => {
    it('should close connection when stopped', () => {
      service.start();
      const eventSource = (service as any).eventSource as MockEventSource;
      
      service.stop();
      
      expect(eventSource.readyState).toBe(EventSource.CLOSED);
      expect(service.getStatus()).toBe('disconnected');
    });

    it('should handle connection errors', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      service.start();
      const eventSource = (service as any).eventSource as MockEventSource;
      
      eventSource.simulateError();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Twitch streaming SSE error:',
        expect.any(Event)
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should reset reconnection attempts on successful connection', () => {
      service.start();
      const eventSource = (service as any).eventSource as MockEventSource;
      
      // Simulate successful connection
      eventSource.simulateOpen();
      
      expect((service as any).reconnectAttempts).toBe(0);
    });
  });

  describe('reconnection logic', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should attempt to reconnect after connection error', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      service.start();
      const eventSource = (service as any).eventSource as MockEventSource;
      
      // Simulate connection closed
      eventSource.readyState = EventSource.CLOSED as any;
      eventSource.simulateError();
      
      // Fast-forward time to trigger reconnection
      vi.advanceTimersByTime(2000);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Attempting to reconnect')
      );
      
      consoleLogSpy.mockRestore();
    });

    it.skip('should stop reconnecting after max attempts', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      service.start();
      
      // Simulate multiple failed connections
      for (let i = 0; i < 6; i++) {
        const eventSource = (service as any).eventSource as MockEventSource;
        eventSource.readyState = EventSource.CLOSED as any;
        eventSource.simulateError();
        
        // Fast-forward time
        vi.advanceTimersByTime(10000);
        
        // Stop and restart to simulate reconnection attempt
        if (i < 5) {
          service.stop();
          service.start();
        }
      }
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Maximum reconnection attempts reached for Twitch streaming SSE'
      );
      
      consoleErrorSpy.mockRestore();
    });
  });
});