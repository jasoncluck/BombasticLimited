import { describe, it, expect } from "vitest";
import { cn, type WithoutChild, type WithoutChildren, type WithoutChildrenOrChild, type WithElementRef } from "./utils";

describe("utils.ts", () => {
  describe("cn function", () => {
    it("merges class names correctly", () => {
      const result = cn("foo", "bar");
      expect(result).toBe("foo bar");
    });

    it("handles conditional classes", () => {
      const result = cn("foo", true && "bar", false && "baz");
      expect(result).toBe("foo bar");
    });

    it("handles object notation", () => {
      const result = cn({ foo: true, bar: false, baz: true });
      expect(result).toBe("foo baz");
    });

    it("resolves Tailwind conflicts", () => {
      // Testing twMerge functionality - later class wins
      const result = cn("p-4", "p-6");
      expect(result).toBe("p-6");
    });

    it("handles arrays", () => {
      const result = cn(["foo", "bar"], "baz");
      expect(result).toBe("foo bar baz");
    });

    it("handles empty values", () => {
      const result = cn("", null, undefined, false, "foo");
      expect(result).toBe("foo");
    });

    it("handles complex combinations", () => {
      const result = cn(
        "px-4 py-2",
        {
          "bg-red-500": true,
          "bg-blue-500": false,
        },
        ["text-white", "rounded"],
        "hover:bg-red-600"
      );
      expect(result).toBe("px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600");
    });
  });

  describe("Type utilities", () => {
    it("WithoutChild type removes child property", () => {
      interface TestWithChild {
        name: string;
        child?: string;
        other: number;
      }

      type TestWithoutChild = WithoutChild<TestWithChild>;
      
      // This test validates the type at compile time
      const test: TestWithoutChild = {
        name: "test",
        other: 1,
        // child: "should not be allowed" // This would cause a TypeScript error
      };
      
      expect(test.name).toBe("test");
      expect(test.other).toBe(1);
    });

    it("WithoutChildren type removes children property", () => {
      interface TestWithChildren {
        name: string;
        children?: string[];
        other: number;
      }

      type TestWithoutChildren = WithoutChildren<TestWithChildren>;
      
      // This test validates the type at compile time
      const test: TestWithoutChildren = {
        name: "test",
        other: 1,
        // children: ["should", "not", "be", "allowed"] // This would cause a TypeScript error
      };
      
      expect(test.name).toBe("test");
      expect(test.other).toBe(1);
    });

    it("WithoutChildrenOrChild type removes both children and child properties", () => {
      interface TestWithBoth {
        name: string;
        child?: string;
        children?: string[];
        other: number;
      }

      type TestWithoutBoth = WithoutChildrenOrChild<TestWithBoth>;
      
      // This test validates the type at compile time
      const test: TestWithoutBoth = {
        name: "test",
        other: 1,
        // child: "should not be allowed" // This would cause a TypeScript error
        // children: ["should", "not", "be", "allowed"] // This would cause a TypeScript error
      };
      
      expect(test.name).toBe("test");
      expect(test.other).toBe(1);
    });

    it("WithElementRef type adds ref property", () => {
      interface TestComponent {
        name: string;
        value: number;
      }

      type TestWithRef = WithElementRef<TestComponent, HTMLDivElement>;
      
      // This test validates the type at compile time
      const test: TestWithRef = {
        name: "test",
        value: 1,
        ref: null, // Should allow HTMLDivElement | null
      };
      
      expect(test.name).toBe("test");
      expect(test.value).toBe(1);
      expect(test.ref).toBeNull();
    });

    it("WithElementRef defaults to HTMLElement", () => {
      interface TestComponent {
        name: string;
      }

      type TestWithRef = WithElementRef<TestComponent>;
      
      // This test validates the type at compile time - should default to HTMLElement
      const test: TestWithRef = {
        name: "test",
        ref: null,
      };
      
      expect(test.name).toBe("test");
      expect(test.ref).toBeNull();
    });
  });
});