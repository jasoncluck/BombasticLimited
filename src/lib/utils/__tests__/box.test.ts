import { describe, it, expect } from 'vitest';
import type { 
  Box, 
  WritableBoxedValues, 
  ReadableBoxedValues 
} from '../box';
import type { ReadableBox, WritableBox } from 'svelte-toolbelt';

describe('box types', () => {
  describe('Box type', () => {
    it('should accept ReadableBox types', () => {
      // This test verifies the type definitions work correctly at compile time
      const readableBox = { value: 42 } as ReadableBox<number>;
      const box: Box<number> = readableBox;
      
      expect(box).toBeDefined();
      expect(box.value).toBe(42);
    });

    it('should accept WritableBox types', () => {
      const writableBox = { 
        value: 'test',
        set: (newValue: string) => {},
        update: (fn: (value: string) => string) => {}
      } as WritableBox<string>;
      
      const box: Box<string> = writableBox;
      
      expect(box).toBeDefined();
      expect(box.value).toBe('test');
    });

    it('should work with different value types', () => {
      const stringBox: Box<string> = { value: 'hello' } as ReadableBox<string>;
      const numberBox: Box<number> = { value: 123 } as ReadableBox<number>;
      const booleanBox: Box<boolean> = { value: true } as ReadableBox<boolean>;
      const objectBox: Box<{ name: string }> = { value: { name: 'test' } } as ReadableBox<{ name: string }>;
      
      expect(stringBox.value).toBe('hello');
      expect(numberBox.value).toBe(123);
      expect(booleanBox.value).toBe(true);
      expect(objectBox.value.name).toBe('test');
    });

    it('should work with union types', () => {
      const unionBox: Box<string | number> = { value: 'test' } as ReadableBox<string | number>;
      expect(unionBox.value).toBe('test');
      
      const numberUnionBox: Box<string | number> = { value: 42 } as ReadableBox<string | number>;
      expect(numberUnionBox.value).toBe(42);
    });

    it('should work with null and undefined values', () => {
      const nullableBox: Box<string | null> = { value: null } as ReadableBox<string | null>;
      const undefinableBox: Box<string | undefined> = { value: undefined } as ReadableBox<string | undefined>;
      
      expect(nullableBox.value).toBeNull();
      expect(undefinableBox.value).toBeUndefined();
    });
  });

  describe('WritableBoxedValues type', () => {
    it('should create writable boxes for object properties', () => {
      interface UserData {
        name: string;
        age: number;
        active: boolean;
      }

      const writableBoxes: WritableBoxedValues<UserData> = {
        name: { 
          value: 'John',
          set: (newValue: string) => {},
          update: (fn: (value: string) => string) => {}
        } as WritableBox<string>,
        age: { 
          value: 30,
          set: (newValue: number) => {},
          update: (fn: (value: number) => number) => {}
        } as WritableBox<number>,
        active: { 
          value: true,
          set: (newValue: boolean) => {},
          update: (fn: (value: boolean) => boolean) => {}
        } as WritableBox<boolean>
      };

      expect(writableBoxes.name.value).toBe('John');
      expect(writableBoxes.age.value).toBe(30);
      expect(writableBoxes.active.value).toBe(true);
    });

    it('should preserve property structure', () => {
      interface SimpleObject {
        id: string;
        count: number;
      }

      const boxes: WritableBoxedValues<SimpleObject> = {
        id: { value: 'test-id' } as WritableBox<string>,
        count: { value: 42 } as WritableBox<number>
      };

      // Test that all required properties are present
      expect(boxes).toHaveProperty('id');
      expect(boxes).toHaveProperty('count');
      expect(boxes.id.value).toBe('test-id');
      expect(boxes.count.value).toBe(42);
    });

    it('should work with nested objects', () => {
      interface NestedData {
        user: { name: string; email: string };
        settings: { theme: string; notifications: boolean };
      }

      const boxes: WritableBoxedValues<NestedData> = {
        user: { value: { name: 'John', email: 'john@example.com' } } as WritableBox<{ name: string; email: string }>,
        settings: { value: { theme: 'dark', notifications: true } } as WritableBox<{ theme: string; notifications: boolean }>
      };

      expect(boxes.user.value.name).toBe('John');
      expect(boxes.settings.value.theme).toBe('dark');
    });

    it('should work with optional properties', () => {
      interface OptionalData {
        required: string;
        optional?: number;
      }

      const boxes: WritableBoxedValues<OptionalData> = {
        required: { value: 'test' } as WritableBox<string>,
        optional: { value: 42 } as WritableBox<number | undefined>
      };

      expect(boxes.required.value).toBe('test');
      expect(boxes.optional.value).toBe(42);
    });
  });

  describe('ReadableBoxedValues type', () => {
    it('should create readable boxes for object properties', () => {
      interface ConfigData {
        apiUrl: string;
        timeout: number;
        retries: number;
      }

      const readableBoxes: ReadableBoxedValues<ConfigData> = {
        apiUrl: { value: 'https://api.example.com' } as ReadableBox<string>,
        timeout: { value: 5000 } as ReadableBox<number>,
        retries: { value: 3 } as ReadableBox<number>
      };

      expect(readableBoxes.apiUrl.value).toBe('https://api.example.com');
      expect(readableBoxes.timeout.value).toBe(5000);
      expect(readableBoxes.retries.value).toBe(3);
    });

    it('should work with arrays', () => {
      interface ArrayData {
        items: string[];
        numbers: number[];
      }

      const boxes: ReadableBoxedValues<ArrayData> = {
        items: { value: ['a', 'b', 'c'] } as ReadableBox<string[]>,
        numbers: { value: [1, 2, 3] } as ReadableBox<number[]>
      };

      expect(boxes.items.value).toEqual(['a', 'b', 'c']);
      expect(boxes.numbers.value).toEqual([1, 2, 3]);
    });

    it('should work with complex data structures', () => {
      interface ComplexData {
        metadata: Record<string, any>;
        tags: Set<string>;
        map: Map<string, number>;
      }

      const boxes: ReadableBoxedValues<ComplexData> = {
        metadata: { value: { type: 'test', version: 1 } } as ReadableBox<Record<string, any>>,
        tags: { value: new Set(['tag1', 'tag2']) } as ReadableBox<Set<string>>,
        map: { value: new Map([['key1', 100]]) } as ReadableBox<Map<string, number>>
      };

      expect(boxes.metadata.value.type).toBe('test');
      expect(boxes.tags.value.has('tag1')).toBe(true);
      expect(boxes.map.value.get('key1')).toBe(100);
    });

    it('should work with functions', () => {
      interface FunctionData {
        handler: () => void;
        transformer: (value: string) => number;
      }

      const mockHandler = vi.fn();
      const mockTransformer = vi.fn((value: string) => value.length);

      const boxes: ReadableBoxedValues<FunctionData> = {
        handler: { value: mockHandler } as ReadableBox<() => void>,
        transformer: { value: mockTransformer } as ReadableBox<(value: string) => number>
      };

      expect(boxes.handler.value).toBe(mockHandler);
      expect(boxes.transformer.value('test')).toBe(4);
      expect(mockTransformer).toHaveBeenCalledWith('test');
    });
  });

  describe('type compatibility and edge cases', () => {
    it('should work with empty objects', () => {
      interface EmptyObject {}

      const writableBoxes: WritableBoxedValues<EmptyObject> = {};
      const readableBoxes: ReadableBoxedValues<EmptyObject> = {};

      expect(writableBoxes).toEqual({});
      expect(readableBoxes).toEqual({});
    });

    it('should preserve type constraints', () => {
      interface ConstrainedData {
        status: 'pending' | 'complete' | 'error';
        count: number;
      }

      const boxes: ReadableBoxedValues<ConstrainedData> = {
        status: { value: 'pending' } as ReadableBox<'pending' | 'complete' | 'error'>,
        count: { value: 0 } as ReadableBox<number>
      };

      expect(boxes.status.value).toBe('pending');
      expect(boxes.count.value).toBe(0);
    });

    it('should work with generic types', () => {
      interface GenericData<T> {
        value: T;
        list: T[];
      }

      const stringBoxes: ReadableBoxedValues<GenericData<string>> = {
        value: { value: 'test' } as ReadableBox<string>,
        list: { value: ['a', 'b'] } as ReadableBox<string[]>
      };

      const numberBoxes: ReadableBoxedValues<GenericData<number>> = {
        value: { value: 42 } as ReadableBox<number>,
        list: { value: [1, 2] } as ReadableBox<number[]>
      };

      expect(stringBoxes.value.value).toBe('test');
      expect(numberBoxes.value.value).toBe(42);
    });

    it('should handle mixed readable and writable scenarios', () => {
      // Test that we can use both types in different contexts
      interface MixedData {
        readonly config: string;
        mutable: number;
      }

      const readableConfig: ReadableBoxedValues<Pick<MixedData, 'config'>> = {
        config: { value: 'production' } as ReadableBox<string>
      };

      const writableMutable: WritableBoxedValues<Pick<MixedData, 'mutable'>> = {
        mutable: { 
          value: 100,
          set: (newValue: number) => {},
          update: (fn: (value: number) => number) => {}
        } as WritableBox<number>
      };

      expect(readableConfig.config.value).toBe('production');
      expect(writableMutable.mutable.value).toBe(100);
    });
  });

  describe('real-world usage scenarios', () => {
    it('should work in form state management', () => {
      interface FormData {
        username: string;
        email: string;
        age: number;
        termsAccepted: boolean;
      }

      const formState: WritableBoxedValues<FormData> = {
        username: { value: '' } as WritableBox<string>,
        email: { value: '' } as WritableBox<string>,
        age: { value: 0 } as WritableBox<number>,
        termsAccepted: { value: false } as WritableBox<boolean>
      };

      // Simulate form updates
      expect(formState.username.value).toBe('');
      expect(formState.termsAccepted.value).toBe(false);
    });

    it('should work in configuration management', () => {
      interface AppConfig {
        theme: 'light' | 'dark';
        language: string;
        apiEndpoint: string;
        enableFeatures: string[];
      }

      const config: ReadableBoxedValues<AppConfig> = {
        theme: { value: 'dark' } as ReadableBox<'light' | 'dark'>,
        language: { value: 'en' } as ReadableBox<string>,
        apiEndpoint: { value: 'https://api.example.com' } as ReadableBox<string>,
        enableFeatures: { value: ['feature1', 'feature2'] } as ReadableBox<string[]>
      };

      expect(config.theme.value).toBe('dark');
      expect(config.enableFeatures.value).toContain('feature1');
    });

    it('should work in reactive state patterns', () => {
      interface ComponentState {
        loading: boolean;
        error: string | null;
        data: any[];
      }

      const state: WritableBoxedValues<ComponentState> = {
        loading: { value: false } as WritableBox<boolean>,
        error: { value: null } as WritableBox<string | null>,
        data: { value: [] } as WritableBox<any[]>
      };

      // Test initial state
      expect(state.loading.value).toBe(false);
      expect(state.error.value).toBeNull();
      expect(state.data.value).toEqual([]);
    });
  });
});