import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendGlobalNotification,
  sendTemplateNotification,
  NOTIFICATION_TEMPLATES,
} from '../global-notifications';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import type { NotificationType } from '$lib/supabase/notifications';

// Mock Supabase client
const createMockSupabaseClient = () => {
  const mockRpc = vi.fn();

  return {
    rpc: mockRpc,
    mockRpc,
  } as unknown as SupabaseClient<Database> & { mockRpc: typeof mockRpc };
};

describe('global-notifications', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
  });

  describe('sendGlobalNotification', () => {
    it('should send a global notification successfully', async () => {
      const mockResponse = { data: 100, error: null };
      mockSupabase.mockRpc.mockResolvedValue(mockResponse);

      const result = await sendGlobalNotification(
        mockSupabase,
        'system',
        'Test Title',
        'Test Message',
        { source: 'test' },
        '/test/url'
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Test Title',
          notification_message: 'Test Message',
          notification_metadata: { source: 'test' },
          notification_action_url: '/test/url',
        }
      );

      expect(result).toEqual({ count: 100, error: null });
    });

    it('should handle missing optional parameters', async () => {
      const mockResponse = { data: 50, error: null };
      mockSupabase.mockRpc.mockResolvedValue(mockResponse);

      const result = await sendGlobalNotification(
        mockSupabase,
        'system',
        'Simple Title',
        'Simple Message'
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Simple Title',
          notification_message: 'Simple Message',
          notification_metadata: {},
          notification_action_url: undefined,
        }
      );

      expect(result).toEqual({ count: 50, error: null });
    });

    it('should handle RPC errors from Supabase', async () => {
      const mockError = { message: 'Database error', code: 'DB_ERROR' };
      const mockResponse = { data: null, error: mockError };
      mockSupabase.mockRpc.mockResolvedValue(mockResponse);

      const result = await sendGlobalNotification(
        mockSupabase,
        'system',
        'Error Test',
        'This should fail'
      );

      expect(result).toEqual({ count: null, error: mockError });
    });

    it('should handle exceptions thrown by RPC call', async () => {
      const thrownError = new Error('Network error');
      mockSupabase.mockRpc.mockRejectedValue(thrownError);

      const result = await sendGlobalNotification(
        mockSupabase,
        'system',
        'Exception Test',
        'This will throw'
      );

      expect(result).toEqual({ count: null, error: thrownError });
    });

    it('should work with notification types', async () => {
      const types: NotificationType[] = ['system'];

      for (const type of types) {
        mockSupabase.mockRpc.mockResolvedValue({ data: 10, error: null });

        const result = await sendGlobalNotification(
          mockSupabase,
          type,
          `${type} title`,
          `${type} message`
        );

        expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
          'create_notification_for_all_users',
          {
            notification_type: type,
            notification_title: `${type} title`,
            notification_message: `${type} message`,
            notification_metadata: {},
            notification_action_url: undefined,
          }
        );

        expect(result.count).toBe(10);
      }
    });

    it('should handle complex metadata objects', async () => {
      const complexMetadata = {
        source: 'admin',
        priority: 'high',
        tags: ['urgent', 'system'],
        data: {
          userId: 123,
          action: 'update',
          nested: {
            value: 'test',
            timestamp: new Date().toISOString(),
          },
        },
      };

      mockSupabase.mockRpc.mockResolvedValue({ data: 75, error: null });

      const result = await sendGlobalNotification(
        mockSupabase,
        'system',
        'Complex Notification',
        'This has complex metadata',
        complexMetadata,
        '/admin/dashboard'
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Complex Notification',
          notification_message: 'This has complex metadata',
          notification_metadata: complexMetadata,
          notification_action_url: '/admin/dashboard',
        }
      );

      expect(result.count).toBe(75);
    });

    it('should handle empty strings and null values', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 0, error: null });

      const result = await sendGlobalNotification(
        mockSupabase,
        'system',
        '',
        '',
        {},
        ''
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: '',
          notification_message: '',
          notification_metadata: {},
          notification_action_url: '',
        }
      );

      expect(result.count).toBe(0);
    });
  });

  describe('NOTIFICATION_TEMPLATES', () => {
    it('should have welcome template with correct structure', () => {
      const template = NOTIFICATION_TEMPLATES.welcome;

      expect(template).toEqual({
        type: 'system',
        title: 'Welcome to Bombastic!',
        message:
          'Thanks for being part of our community. Enjoy exploring the latest content from your favorite creators.',
        metadata: { source: 'admin_welcome' },
        actionUrl: '/account/notifications',
      });
    });

    it('should have maintenance template with correct structure', () => {
      const template = NOTIFICATION_TEMPLATES.maintenance;

      expect(template).toEqual({
        type: 'system',
        title: 'Scheduled Maintenance',
        message:
          'We will be performing scheduled maintenance tonight. Some features may be temporarily unavailable.',
        metadata: { source: 'admin_maintenance' },
        actionUrl: '/support/maintenance',
      });
    });

    it('should have newFeature template with correct structure', () => {
      const template = NOTIFICATION_TEMPLATES.newFeature;

      expect(template).toEqual({
        type: 'system',
        title: 'New Feature Available',
        message:
          'Check out our latest feature update with enhanced functionality!',
        metadata: { source: 'feature_announcement' },
        actionUrl: '/features',
      });
    });

    it('should have all required template properties', () => {
      Object.values(NOTIFICATION_TEMPLATES).forEach((template) => {
        expect(template).toHaveProperty('type');
        expect(template).toHaveProperty('title');
        expect(template).toHaveProperty('message');
        expect(template).toHaveProperty('metadata');
        expect(template).toHaveProperty('actionUrl');

        expect(typeof template.type).toBe('string');
        expect(typeof template.title).toBe('string');
        expect(typeof template.message).toBe('string');
        expect(typeof template.metadata).toBe('object');
        expect(typeof template.actionUrl).toBe('string');
      });
    });

    it('should have non-empty titles and messages', () => {
      Object.values(NOTIFICATION_TEMPLATES).forEach((template) => {
        expect(template.title.length).toBeGreaterThan(0);
        expect(template.message.length).toBeGreaterThan(0);
        expect(template.actionUrl.length).toBeGreaterThan(0);
      });
    });

    it('should have valid action URLs', () => {
      Object.values(NOTIFICATION_TEMPLATES).forEach((template) => {
        expect(template.actionUrl).toMatch(/^\/[a-zA-Z0-9/_-]*$/);
      });
    });

    it('should have source metadata for all templates', () => {
      Object.values(NOTIFICATION_TEMPLATES).forEach((template) => {
        expect(template.metadata).toHaveProperty('source');
        expect(typeof template.metadata.source).toBe('string');
        expect(template.metadata.source.length).toBeGreaterThan(0);
      });
    });

    it('should have unique source values', () => {
      const sources = Object.values(NOTIFICATION_TEMPLATES).map(
        (t) => t.metadata.source
      );
      const uniqueSources = new Set(sources);
      expect(uniqueSources.size).toBe(sources.length);
    });

    it('should have appropriate notification types', () => {
      const validTypes: NotificationType[] = ['system'];

      Object.values(NOTIFICATION_TEMPLATES).forEach((template) => {
        expect(validTypes).toContain(template.type);
      });
    });
  });

  describe('sendTemplateNotification', () => {
    it('should send notification using welcome template', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 150, error: null });

      const result = await sendTemplateNotification(mockSupabase, 'welcome');

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Welcome to Bombastic!',
          notification_message:
            'Thanks for being part of our community. Enjoy exploring the latest content from your favorite creators.',
          notification_metadata: { source: 'admin_welcome' },
          notification_action_url: '/account/notifications',
        }
      );

      expect(result).toEqual({ count: 150, error: null });
    });

    it('should send notification using maintenance template', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 200, error: null });

      const result = await sendTemplateNotification(
        mockSupabase,
        'maintenance'
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Scheduled Maintenance',
          notification_message:
            'We will be performing scheduled maintenance tonight. Some features may be temporarily unavailable.',
          notification_metadata: { source: 'admin_maintenance' },
          notification_action_url: '/support/maintenance',
        }
      );

      expect(result).toEqual({ count: 200, error: null });
    });

    it('should send notification using newFeature template', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 100, error: null });

      const result = await sendTemplateNotification(mockSupabase, 'newFeature');

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'New Feature Available',
          notification_message:
            'Check out our latest feature update with enhanced functionality!',
          notification_metadata: { source: 'feature_announcement' },
          notification_action_url: '/features',
        }
      );

      expect(result).toEqual({ count: 100, error: null });
    });

    it('should apply custom title override', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 75, error: null });

      const result = await sendTemplateNotification(mockSupabase, 'welcome', {
        title: 'Custom Welcome Title',
      });

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Custom Welcome Title',
          notification_message:
            'Thanks for being part of our community. Enjoy exploring the latest content from your favorite creators.',
          notification_metadata: { source: 'admin_welcome' },
          notification_action_url: '/account/notifications',
        }
      );

      expect(result.count).toBe(75);
    });

    it('should apply custom message override', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 50, error: null });

      const result = await sendTemplateNotification(
        mockSupabase,
        'maintenance',
        {
          message: 'Custom maintenance message with specific timing.',
        }
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Scheduled Maintenance',
          notification_message:
            'Custom maintenance message with specific timing.',
          notification_metadata: { source: 'admin_maintenance' },
          notification_action_url: '/support/maintenance',
        }
      );

      expect(result.count).toBe(50);
    });

    it('should merge custom metadata with template metadata', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 80, error: null });

      const result = await sendTemplateNotification(
        mockSupabase,
        'newFeature',
        {
          metadata: {
            version: '2.1.0',
            priority: 'high',
          },
        }
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'New Feature Available',
          notification_message:
            'Check out our latest feature update with enhanced functionality!',
          notification_metadata: {
            source: 'feature_announcement',
            version: '2.1.0',
            priority: 'high',
          },
          notification_action_url: '/features',
        }
      );

      expect(result.count).toBe(80);
    });

    it('should override template metadata properties with custom ones', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 90, error: null });

      const result = await sendTemplateNotification(mockSupabase, 'welcome', {
        metadata: {
          source: 'custom_welcome', // This should override the template source
          campaign: 'spring2024',
        },
      });

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Welcome to Bombastic!',
          notification_message:
            'Thanks for being part of our community. Enjoy exploring the latest content from your favorite creators.',
          notification_metadata: {
            source: 'custom_welcome', // Overridden
            campaign: 'spring2024', // Added
          },
          notification_action_url: '/account/notifications',
        }
      );

      expect(result.count).toBe(90);
    });

    it('should apply custom action URL override', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 60, error: null });

      const result = await sendTemplateNotification(
        mockSupabase,
        'maintenance',
        {
          actionUrl: '/custom/maintenance/page',
        }
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Scheduled Maintenance',
          notification_message:
            'We will be performing scheduled maintenance tonight. Some features may be temporarily unavailable.',
          notification_metadata: { source: 'admin_maintenance' },
          notification_action_url: '/custom/maintenance/page',
        }
      );

      expect(result.count).toBe(60);
    });

    it('should apply all customizations simultaneously', async () => {
      mockSupabase.mockRpc.mockResolvedValue({ data: 125, error: null });

      const result = await sendTemplateNotification(
        mockSupabase,
        'newFeature',
        {
          title: 'Awesome New Feature!',
          message:
            'We have launched an incredible new feature that will change everything!',
          metadata: {
            version: '3.0.0',
            breaking_changes: true,
            source: 'major_release',
          },
          actionUrl: '/features/v3',
        }
      );

      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        {
          notification_type: 'system',
          notification_title: 'Awesome New Feature!',
          notification_message:
            'We have launched an incredible new feature that will change everything!',
          notification_metadata: {
            source: 'major_release',
            version: '3.0.0',
            breaking_changes: true,
          },
          notification_action_url: '/features/v3',
        }
      );

      expect(result.count).toBe(125);
    });

    it('should handle RPC errors when using templates', async () => {
      const mockError = { message: 'Template error', code: 'TEMPLATE_ERROR' };
      mockSupabase.mockRpc.mockResolvedValue({ data: null, error: mockError });

      const result = await sendTemplateNotification(mockSupabase, 'welcome');

      expect(result).toEqual({ count: null, error: mockError });
    });

    it('should handle exceptions when using templates', async () => {
      const thrownError = new Error('Template exception');
      mockSupabase.mockRpc.mockRejectedValue(thrownError);

      const result = await sendTemplateNotification(
        mockSupabase,
        'maintenance'
      );

      expect(result).toEqual({ count: null, error: thrownError });
    });
  });

  describe('integration scenarios', () => {
    it('should work with all template names', async () => {
      const templateNames = Object.keys(NOTIFICATION_TEMPLATES) as Array<
        keyof typeof NOTIFICATION_TEMPLATES
      >;

      for (const templateName of templateNames) {
        mockSupabase.mockRpc.mockResolvedValue({ data: 100, error: null });

        const result = await sendTemplateNotification(
          mockSupabase,
          templateName
        );

        expect(result.count).toBe(100);
        expect(result.error).toBeNull();
      }
    });

    it('should work in admin notification workflow', async () => {
      // Simulate an admin sending a maintenance notification
      mockSupabase.mockRpc.mockResolvedValue({ data: 500, error: null });

      const maintenanceTime = '2:00 AM EST';
      const result = await sendTemplateNotification(
        mockSupabase,
        'maintenance',
        {
          message: `Scheduled maintenance will begin at ${maintenanceTime}. Please save your work.`,
          metadata: {
            maintenance_window: maintenanceTime,
            estimated_duration: '2 hours',
            admin_id: 'admin_123',
          },
        }
      );

      expect(result.count).toBe(500);
      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        expect.objectContaining({
          notification_metadata: expect.objectContaining({
            maintenance_window: maintenanceTime,
            estimated_duration: '2 hours',
            admin_id: 'admin_123',
          }),
        })
      );
    });

    it('should work in feature release workflow', async () => {
      // Simulate announcing a new feature
      mockSupabase.mockRpc.mockResolvedValue({ data: 750, error: null });

      const result = await sendTemplateNotification(
        mockSupabase,
        'newFeature',
        {
          title: 'Dark Mode Now Available!',
          message:
            'Switch to dark mode in your account settings for a better viewing experience.',
          metadata: {
            feature_name: 'dark_mode',
            release_date: new Date().toISOString(),
            requires_refresh: false,
          },
          actionUrl: '/account/settings#appearance',
        }
      );

      expect(result.count).toBe(750);
      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        expect.objectContaining({
          notification_title: 'Dark Mode Now Available!',
          notification_action_url: '/account/settings#appearance',
        })
      );
    });

    it('should work in user onboarding workflow', async () => {
      // Simulate sending welcome notifications for new user cohorts
      mockSupabase.mockRpc.mockResolvedValue({ data: 25, error: null });

      const result = await sendTemplateNotification(mockSupabase, 'welcome', {
        metadata: {
          cohort: 'december_2024',
          campaign: 'holiday_signup',
          referral_source: 'social_media',
        },
      });

      expect(result.count).toBe(25);
      expect(mockSupabase.mockRpc).toHaveBeenCalledWith(
        'create_notification_for_all_users',
        expect.objectContaining({
          notification_metadata: expect.objectContaining({
            cohort: 'december_2024',
            campaign: 'holiday_signup',
            referral_source: 'social_media',
          }),
        })
      );
    });
  });
});
