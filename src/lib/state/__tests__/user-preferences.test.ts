import { describe, it, expect } from 'vitest';

// Import the user preferences state
import { userPreferences } from '../user-preferences.svelte.js';

describe('User Preferences State', () => {
  describe('initialization', () => {
    it('should initialize with correct default values', () => {
      expect(userPreferences.contentDisplay).toBe('TILES');
      expect(userPreferences.contentDescription).toBe('BRIEF');
    });
  });

  describe('state mutations', () => {
    it('should allow updating contentDisplay', () => {
      userPreferences.contentDisplay = 'TABLE';
      expect(userPreferences.contentDisplay).toBe('TABLE');

      userPreferences.contentDisplay = 'TILES';
      expect(userPreferences.contentDisplay).toBe('TILES');

      // Reset to default
      userPreferences.contentDisplay = 'TILES';
    });

    it('should allow updating contentDescription', () => {
      userPreferences.contentDescription = 'FULL';
      expect(userPreferences.contentDescription).toBe('FULL');

      userPreferences.contentDescription = 'NONE';
      expect(userPreferences.contentDescription).toBe('NONE');

      // Reset to default
      userPreferences.contentDescription = 'BRIEF';
    });

    it('should allow updating both properties simultaneously', () => {
      userPreferences.contentDisplay = 'TABLE';
      userPreferences.contentDescription = 'FULL';

      expect(userPreferences.contentDisplay).toBe('TABLE');
      expect(userPreferences.contentDescription).toBe('FULL');

      // Reset to defaults
      userPreferences.contentDisplay = 'TILES';
      userPreferences.contentDescription = 'BRIEF';
    });
  });

  describe('type safety', () => {
    it('should maintain type consistency for contentDisplay', () => {
      const validDisplayTypes = ['TILES', 'TABLE'];

      validDisplayTypes.forEach((type) => {
        userPreferences.contentDisplay = type as any;
        expect(userPreferences.contentDisplay).toBe(type);
      });

      // Reset to default
      userPreferences.contentDisplay = 'TILES';
    });

    it('should maintain type consistency for contentDescription', () => {
      const validDescriptionTypes = ['BRIEF', 'FULL', 'NONE'];

      validDescriptionTypes.forEach((type) => {
        userPreferences.contentDescription = type as any;
        expect(userPreferences.contentDescription).toBe(type);
      });

      // Reset to default
      userPreferences.contentDescription = 'BRIEF';
    });
  });

  describe('state persistence', () => {
    it('should maintain state across multiple reads', () => {
      userPreferences.contentDisplay = 'TILES';
      userPreferences.contentDescription = 'FULL';

      // Read multiple times to ensure consistency
      for (let i = 0; i < 5; i++) {
        expect(userPreferences.contentDisplay).toBe('TILES');
        expect(userPreferences.contentDescription).toBe('FULL');
      }

      // Reset to defaults
      userPreferences.contentDisplay = 'TILES';
      userPreferences.contentDescription = 'BRIEF';
    });

    it('should handle rapid state changes', () => {
      const displayTypes = ['TILES', 'TABLE'];
      const descriptionTypes = ['BRIEF', 'FULL', 'NONE'];

      for (let i = 0; i < displayTypes.length; i++) {
        userPreferences.contentDisplay = displayTypes[i] as any;
        userPreferences.contentDescription = descriptionTypes[i] as any;

        expect(userPreferences.contentDisplay).toBe(displayTypes[i]);
        expect(userPreferences.contentDescription).toBe(descriptionTypes[i]);
      }

      // Reset to defaults
      userPreferences.contentDisplay = 'TILES';
      userPreferences.contentDescription = 'BRIEF';
    });
  });

  describe('edge cases', () => {
    it('should handle state object structure correctly', () => {
      // Verify the state object has the expected structure
      expect(typeof userPreferences).toBe('object');
      expect(userPreferences).toHaveProperty('contentDisplay');
      expect(userPreferences).toHaveProperty('contentDescription');

      // Verify there are no unexpected properties
      const keys = Object.keys(userPreferences);
      expect(keys).toHaveLength(2);
      expect(keys).toContain('contentDisplay');
      expect(keys).toContain('contentDescription');
    });

    it('should handle repeated assignments to same value', () => {
      userPreferences.contentDisplay = 'TABLE';
      userPreferences.contentDisplay = 'TABLE';
      userPreferences.contentDisplay = 'TABLE';

      expect(userPreferences.contentDisplay).toBe('TABLE');

      // Reset to default
      userPreferences.contentDisplay = 'TILES';
    });

    it('should maintain independence between properties', () => {
      // Change only contentDisplay
      userPreferences.contentDisplay = 'TABLE';
      expect(userPreferences.contentDisplay).toBe('TABLE');
      expect(userPreferences.contentDescription).toBe('BRIEF'); // Should remain unchanged

      // Change only contentDescription
      userPreferences.contentDescription = 'FULL';
      expect(userPreferences.contentDisplay).toBe('TABLE'); // Should remain unchanged
      expect(userPreferences.contentDescription).toBe('FULL');

      // Reset to defaults
      userPreferences.contentDisplay = 'TILES';
      userPreferences.contentDescription = 'BRIEF';
    });
  });
});
