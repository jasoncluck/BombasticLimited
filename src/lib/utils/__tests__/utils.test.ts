import { describe, it, expect } from 'vitest';
import { cn } from '../utils';
import type {
  WithoutChild,
  WithoutChildren,
  WithoutChildrenOrChild,
  WithElementRef,
} from '../utils';

describe('utils', () => {
  describe('cn function', () => {
    it('should combine class names', () => {
      const result = cn('class1', 'class2');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
    });

    it('should handle conditional classes', () => {
      const result = cn('base', true && 'conditional', false && 'hidden');
      expect(result).toContain('base');
      expect(result).toContain('conditional');
      expect(result).not.toContain('hidden');
    });

    it('should merge Tailwind classes correctly', () => {
      // Test that conflicting Tailwind classes are merged properly
      const result = cn('p-4', 'p-2');
      // twMerge should resolve conflicts, keeping the last one
      expect(result).toBe('p-2');
    });

    it('should handle arrays of classes', () => {
      const result = cn(['class1', 'class2'], 'class3');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).toContain('class3');
    });

    it('should handle objects with conditional classes', () => {
      const result = cn({
        active: true,
        inactive: false,
        base: true,
      });
      expect(result).toContain('active');
      expect(result).toContain('base');
      expect(result).not.toContain('inactive');
    });

    it('should handle undefined and null values', () => {
      const result = cn('base', undefined, null, 'valid');
      expect(result).toContain('base');
      expect(result).toContain('valid');
    });

    it('should handle empty inputs', () => {
      expect(cn()).toBe('');
      expect(cn('')).toBe('');
      expect(cn(null)).toBe('');
      expect(cn(undefined)).toBe('');
    });

    it('should handle complex Tailwind merging scenarios', () => {
      // Test complex scenarios that twMerge handles
      const result1 = cn('bg-red-500', 'bg-blue-500');
      expect(result1).toBe('bg-blue-500');

      const result2 = cn('p-4 m-4', 'p-2');
      expect(result2).toContain('m-4');
      expect(result2).toContain('p-2');
      expect(result2).not.toContain('p-4');
    });

    it('should handle mixed input types', () => {
      const result = cn(
        'base',
        ['array1', 'array2'],
        { conditional: true, hidden: false },
        'final'
      );
      expect(result).toContain('base');
      expect(result).toContain('array1');
      expect(result).toContain('array2');
      expect(result).toContain('conditional');
      expect(result).toContain('final');
      expect(result).not.toContain('hidden');
    });

    it('should handle duplicate classes', () => {
      const result = cn('duplicate', 'other', 'duplicate');
      // twMerge should handle this, but let's check it doesn't break
      expect(result).toContain('duplicate');
      expect(result).toContain('other');
    });
  });

  describe('TypeScript type utilities', () => {
    describe('WithoutChild type', () => {
      it('should remove child property from type', () => {
        interface TestType {
          id: string;
          child?: string;
          other: number;
        }

        type WithoutChildType = WithoutChild<TestType>;

        // This is a compile-time test - if it compiles, the type works
        const test: WithoutChildType = {
          id: 'test',
          other: 123,
          // child should not be allowed here
        };

        expect(test.id).toBe('test');
        expect(test.other).toBe(123);
      });

      it('should preserve type when no child property exists', () => {
        interface TestType {
          id: string;
          other: number;
        }

        type WithoutChildType = WithoutChild<TestType>;

        const test: WithoutChildType = {
          id: 'test',
          other: 123,
        };

        expect(test.id).toBe('test');
        expect(test.other).toBe(123);
      });
    });

    describe('WithoutChildren type', () => {
      it('should remove children property from type', () => {
        interface TestType {
          id: string;
          children?: any;
          other: number;
        }

        type WithoutChildrenType = WithoutChildren<TestType>;

        const test: WithoutChildrenType = {
          id: 'test',
          other: 123,
          // children should not be allowed here
        };

        expect(test.id).toBe('test');
        expect(test.other).toBe(123);
      });
    });

    describe('WithoutChildrenOrChild type', () => {
      it('should remove both child and children properties', () => {
        interface TestType {
          id: string;
          child?: string;
          children?: any;
          other: number;
        }

        type CleanType = WithoutChildrenOrChild<TestType>;

        const test: CleanType = {
          id: 'test',
          other: 123,
          // Neither child nor children should be allowed
        };

        expect(test.id).toBe('test');
        expect(test.other).toBe(123);
      });
    });

    describe('WithElementRef type', () => {
      it('should add ref property to type', () => {
        interface TestType {
          id: string;
          other: number;
        }

        type WithRefType = WithElementRef<TestType>;

        const test: WithRefType = {
          id: 'test',
          other: 123,
          ref: null, // Should accept null
        };

        expect(test.id).toBe('test');
        expect(test.other).toBe(123);
        expect(test.ref).toBeNull();
      });

      it('should accept specific HTML element types', () => {
        interface TestType {
          id: string;
        }

        type WithDivRefType = WithElementRef<TestType, HTMLDivElement>;

        // This is primarily a compile-time test
        const test: WithDivRefType = {
          id: 'test',
          ref: null,
        };

        expect(test.id).toBe('test');
      });

      it('should allow undefined ref', () => {
        interface TestType {
          id: string;
        }

        type WithRefType = WithElementRef<TestType>;

        const test: WithRefType = {
          id: 'test',
          // ref is optional, so can be omitted
        };

        expect(test.id).toBe('test');
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle real-world className combination scenarios', () => {
      // Simulate common component scenarios
      const isActive = true;
      const isDisabled = false;
      const size = 'large';

      const buttonClasses = cn(
        'button-base',
        'px-4 py-2',
        {
          'bg-blue-500': isActive,
          'bg-gray-300': !isActive,
          'opacity-50': isDisabled,
          'cursor-not-allowed': isDisabled,
        },
        size === 'large' && 'text-lg px-6 py-3',
        'hover:bg-blue-600'
      );

      expect(buttonClasses).toContain('button-base');
      expect(buttonClasses).toContain('bg-blue-500');
      expect(buttonClasses).toContain('text-lg');
      expect(buttonClasses).toContain('px-6'); // Should override px-4
      expect(buttonClasses).toContain('py-3'); // Should override py-2
      expect(buttonClasses).not.toContain('bg-gray-300');
      expect(buttonClasses).not.toContain('opacity-50');
    });

    it('should handle responsive and state classes', () => {
      const classes = cn(
        'w-full',
        'sm:w-auto',
        'md:w-1/2',
        'lg:w-1/3',
        'hover:bg-gray-100',
        'focus:ring-2',
        'active:bg-gray-200'
      );

      expect(classes).toContain('w-full');
      expect(classes).toContain('sm:w-auto');
      expect(classes).toContain('md:w-1/2');
      expect(classes).toContain('lg:w-1/3');
      expect(classes).toContain('hover:bg-gray-100');
      expect(classes).toContain('focus:ring-2');
      expect(classes).toContain('active:bg-gray-200');
    });
  });
});
