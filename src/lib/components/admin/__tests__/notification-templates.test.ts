import { describe, it, expect } from 'vitest';
import {
  notificationTemplates,
  notificationTypes,
  type NotificationTemplate,
} from '../notification-templates';

describe('notification templates module', () => {
  describe('notificationTemplates', () => {
    it('should have welcome template with correct structure', () => {
      const welcome = notificationTemplates.welcome;

      expect(welcome).toBeDefined();
      expect(welcome.type).toBe('system');
      expect(welcome.title).toBe('Welcome Message');
      expect(welcome.message).toContain(
        'Thanks for being part of our community'
      );
      expect(welcome.message).toContain('playlists');
    });

    it('should have feature template with correct structure', () => {
      const feature = notificationTemplates.feature;

      expect(feature).toBeDefined();
      expect(feature.type).toBe('system');
      expect(feature.title).toBe('New Feature Released!');
      expect(feature.message).toContain('enhanced playlist features');
      expect(feature.message).toContain('<a href="/features">');
    });

    it('should have maintenance template with correct structure', () => {
      const maintenance = notificationTemplates.maintenance;

      expect(maintenance).toBeDefined();
      expect(maintenance.type).toBe('system');
      expect(maintenance.title).toBe('Scheduled Maintenance');
      expect(maintenance.message).toContain('2-4 AM EST');
      expect(maintenance.message).toContain('<b>');
      expect(maintenance.message).toContain('<a href="/status">');
    });

    it('should have announcement template with correct structure', () => {
      const announcement = notificationTemplates.announcement;

      expect(announcement).toBeDefined();
      expect(announcement.type).toBe('system');
      expect(announcement.title).toBe('Important Announcement');
      expect(announcement.message).toContain('important update');
      expect(announcement.message).toContain('account settings');
    });

    it('should have all templates with system type', () => {
      const templates = Object.values(notificationTemplates);

      templates.forEach((template) => {
        expect(template.type).toBe('system');
      });
    });

    it('should have all templates with non-empty titles and messages', () => {
      const templates = Object.values(notificationTemplates);

      templates.forEach((template) => {
        expect(template.title).toBeTruthy();
        expect(template.title.length).toBeGreaterThan(0);
        expect(template.message).toBeTruthy();
        expect(template.message.length).toBeGreaterThan(0);
      });
    });

    it('should have unique titles for each template', () => {
      const templates = Object.values(notificationTemplates);
      const titles = templates.map((t) => t.title);
      const uniqueTitles = new Set(titles);

      expect(uniqueTitles.size).toBe(titles.length);
    });

    it('should have specific template keys', () => {
      const expectedKeys = [
        'welcome',
        'feature',
        'maintenance',
        'announcement',
      ];

      expectedKeys.forEach((key) => {
        expect(notificationTemplates[key]).toBeDefined();
      });

      const actualKeys = Object.keys(notificationTemplates);
      expect(actualKeys).toEqual(expect.arrayContaining(expectedKeys));
    });

    it('should have templates that conform to NotificationTemplate interface', () => {
      const templates = Object.values(notificationTemplates);

      templates.forEach((template) => {
        // Check required properties exist
        expect(template).toHaveProperty('type');
        expect(template).toHaveProperty('title');
        expect(template).toHaveProperty('message');

        // Check types
        expect(typeof template.type).toBe('string');
        expect(typeof template.title).toBe('string');
        expect(typeof template.message).toBe('string');
      });
    });

    it('should have HTML content in appropriate templates', () => {
      const feature = notificationTemplates.feature;
      const maintenance = notificationTemplates.maintenance;

      // Feature template should have HTML link
      expect(feature.message).toMatch(/<a href="[^"]+">.*<\/a>/);

      // Maintenance template should have HTML formatting
      expect(maintenance.message).toMatch(/<b>.*<\/b>/);
      expect(maintenance.message).toMatch(/<br>/);
      expect(maintenance.message).toMatch(/<a href="[^"]+">.*<\/a>/);
    });

    it('should have consistent message formatting', () => {
      const templates = Object.values(notificationTemplates);

      templates.forEach((template) => {
        // Messages should not start or end with whitespace
        expect(template.message).toBe(template.message.trim());

        // Messages should not be empty after trimming
        expect(template.message.trim().length).toBeGreaterThan(0);
      });
    });

    it('should have accessible link text in HTML content', () => {
      const feature = notificationTemplates.feature;
      const maintenance = notificationTemplates.maintenance;

      // Links should have meaningful text, not just URLs
      const featureLinks = feature.message.match(/<a[^>]*>([^<]+)<\/a>/g);
      if (featureLinks) {
        featureLinks.forEach((link) => {
          const linkText = link.replace(/<[^>]*>/g, '');
          expect(linkText.length).toBeGreaterThan(3); // More than just "here"
        });
      }

      const maintenanceLinks =
        maintenance.message.match(/<a[^>]*>([^<]+)<\/a>/g);
      if (maintenanceLinks) {
        maintenanceLinks.forEach((link) => {
          const linkText = link.replace(/<[^>]*>/g, '');
          expect(linkText.length).toBeGreaterThan(3);
        });
      }
    });
  });

  describe('notificationTypes', () => {
    it('should define notification types array', () => {
      expect(notificationTypes).toBeDefined();
      expect(Array.isArray(notificationTypes)).toBe(true);
    });

    it('should have system type defined', () => {
      const systemType = notificationTypes.find(
        (type) => type.value === 'system'
      );

      expect(systemType).toBeDefined();
      expect(systemType!.value).toBe('system');
      expect(systemType!.label).toBe('System');
    });

    it('should have consistent structure for all types', () => {
      notificationTypes.forEach((type) => {
        expect(type).toHaveProperty('value');
        expect(type).toHaveProperty('label');
        expect(typeof type.value).toBe('string');
        expect(typeof type.label).toBe('string');
      });
    });

    it('should have unique values', () => {
      const values = notificationTypes.map((type) => type.value);
      const uniqueValues = new Set(values);

      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have non-empty values and labels', () => {
      notificationTypes.forEach((type) => {
        expect(type.value.length).toBeGreaterThan(0);
        expect(type.label.length).toBeGreaterThan(0);
      });
    });

    it('should have properly formatted labels', () => {
      notificationTypes.forEach((type) => {
        // Labels should be capitalized
        expect(type.label[0]).toBe(type.label[0].toUpperCase());

        // Labels should not have leading/trailing whitespace
        expect(type.label).toBe(type.label.trim());
      });
    });
  });

  describe('template and type consistency', () => {
    it('should have all template types represented in notificationTypes', () => {
      const templateTypes = new Set(
        Object.values(notificationTemplates).map((template) => template.type)
      );
      const definedTypes = new Set(notificationTypes.map((type) => type.value));

      templateTypes.forEach((templateType) => {
        expect(definedTypes).toContain(templateType);
      });
    });

    it('should have consistent type usage across all templates', () => {
      const templates = Object.values(notificationTemplates);
      const validTypes = notificationTypes.map((type) => type.value);

      templates.forEach((template) => {
        expect(validTypes).toContain(template.type);
      });
    });
  });

  describe('content quality', () => {
    it('should have informative welcome message', () => {
      const welcome = notificationTemplates.welcome;

      expect(welcome.message).toContain('community');
      expect(welcome.message).toContain('playlists');
      expect(welcome.message).toContain('discover');
    });

    it('should have actionable feature announcement', () => {
      const feature = notificationTemplates.feature;

      expect(feature.message).toContain('Check out');
      expect(feature.message).toContain('features');
      expect(feature.message).toContain('href');
    });

    it('should have specific maintenance details', () => {
      const maintenance = notificationTemplates.maintenance;

      expect(maintenance.message).toContain('2-4 AM EST');
      expect(maintenance.message).toContain('maintenance');
      expect(maintenance.message).toContain('status page');
    });

    it('should have clear announcement message', () => {
      const announcement = notificationTemplates.announcement;

      expect(announcement.message).toContain('important update');
      expect(announcement.message).toContain('account settings');
    });
  });
});
