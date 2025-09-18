import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationStateClass, showToast } from '../notifications.svelte';
import { toast } from 'svelte-sonner';

// Mock svelte-sonner
vi.mock('svelte-sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

describe('NotificationStateClass', () => {
  let notificationState: NotificationStateClass;

  beforeEach(() => {
    notificationState = new NotificationStateClass();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with correct default values', () => {
      expect(notificationState.notifications).toEqual([]);
      expect(notificationState.unreadCount).toBe(0);
      expect(notificationState.isLoading).toBe(false);
      expect(notificationState.error).toBeNull();
      expect(notificationState.hasMore).toBe(true);
      expect(notificationState.currentPage).toBe(0);
      expect(notificationState.preferences).toBeNull();
      expect(notificationState.isPreferencesLoading).toBe(false);
      expect(notificationState.lastFetch).toBeNull();
    });
  });

  describe('state mutations', () => {
    it('should allow updating notifications array', () => {
      const mockNotifications = [
        {
          id: 1,
          title: 'Test',
          message: 'Test message',
          created_at: new Date().toISOString(),
        },
      ] as any;

      notificationState.notifications = mockNotifications;
      expect(notificationState.notifications).toEqual(mockNotifications);
    });

    it('should allow updating unreadCount', () => {
      notificationState.unreadCount = 5;
      expect(notificationState.unreadCount).toBe(5);
    });

    it('should allow updating loading state', () => {
      notificationState.isLoading = true;
      expect(notificationState.isLoading).toBe(true);
    });

    it('should allow updating error state', () => {
      const errorMessage = 'Something went wrong';
      notificationState.error = errorMessage;
      expect(notificationState.error).toBe(errorMessage);
    });

    it('should allow updating hasMore state', () => {
      notificationState.hasMore = false;
      expect(notificationState.hasMore).toBe(false);
    });

    it('should allow updating currentPage', () => {
      notificationState.currentPage = 2;
      expect(notificationState.currentPage).toBe(2);
    });

    it('should allow updating preferences', () => {
      const mockPreferences = {
        email_enabled: true,
        push_enabled: false,
      } as any;
      notificationState.preferences = mockPreferences;
      expect(notificationState.preferences).toEqual(mockPreferences);
    });

    it('should allow updating preferences loading state', () => {
      notificationState.isPreferencesLoading = true;
      expect(notificationState.isPreferencesLoading).toBe(true);
    });

    it('should allow updating lastFetch timestamp', () => {
      const now = new Date();
      notificationState.lastFetch = now;
      expect(notificationState.lastFetch).toBe(now);
    });
  });
});

describe('showToast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call toast.success for success type', () => {
    showToast('Success message', 'success');

    expect(toast.success).toHaveBeenCalledWith('Success message', {
      class: 'toast-success',
    });
  });

  it('should call toast.error for error type', () => {
    showToast('Error message', 'error');

    expect(toast.error).toHaveBeenCalledWith('Error message', {
      class: 'toast-error',
    });
  });

  it('should call toast.warning for warning type', () => {
    showToast('Warning message', 'warning');

    expect(toast.warning).toHaveBeenCalledWith('Warning message', {
      class: 'toast-warning',
    });
  });

  it('should call toast.info for info type', () => {
    showToast('Info message', 'info');

    expect(toast.info).toHaveBeenCalledWith('Info message', {
      class: 'toast-info',
    });
  });

  it('should call default toast for undefined type', () => {
    showToast('Default message');

    expect(toast).toHaveBeenCalledWith('Default message', {
      class: 'toast-default',
    });
  });

  it('should call default toast for unknown type', () => {
    showToast('Unknown message', 'unknown' as any);

    expect(toast).toHaveBeenCalledWith('Unknown message', {
      class: 'toast-default',
    });
  });
});
