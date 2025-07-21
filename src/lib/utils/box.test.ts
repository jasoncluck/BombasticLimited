import { describe, it, expect } from "vitest";
import type { Box, WritableBoxedValues, ReadableBoxedValues } from "./box";
import type { ReadableBox, WritableBox } from "svelte-toolbelt";

describe("box.ts", () => {
  describe("Box type", () => {
    it("accepts ReadableBox types", () => {
      // This test validates the type at compile time
      const readableBox: ReadableBox<string> = {
        current: "test",
        subscribe: () => () => {},
      };

      const box: Box<string> = readableBox;
      expect(box.current).toBe("test");
    });

    it("accepts WritableBox types", () => {
      // This test validates the type at compile time
      const writableBox: WritableBox<string> = {
        current: "test",
        subscribe: () => () => {},
        set: () => {},
        update: () => {},
      };

      const box: Box<string> = writableBox;
      expect(box.current).toBe("test");
    });
  });

  describe("WritableBoxedValues type", () => {
    it("converts object properties to WritableBox types", () => {
      interface TestData {
        name: string;
        age: number;
        active: boolean;
      }

      // This test validates the type at compile time
      const boxedValues: WritableBoxedValues<TestData> = {
        name: {
          current: "John",
          subscribe: () => () => {},
          set: () => {},
          update: () => {},
        },
        age: {
          current: 30,
          subscribe: () => () => {},
          set: () => {},
          update: () => {},
        },
        active: {
          current: true,
          subscribe: () => () => {},
          set: () => {},
          update: () => {},
        },
      };

      expect(boxedValues.name.current).toBe("John");
      expect(boxedValues.age.current).toBe(30);
      expect(boxedValues.active.current).toBe(true);
    });

    it("handles empty objects", () => {
      interface EmptyData {}

      // This test validates the type at compile time
      const boxedValues: WritableBoxedValues<EmptyData> = {};

      expect(Object.keys(boxedValues)).toHaveLength(0);
    });

    it("handles nested object types", () => {
      interface NestedData {
        user: {
          id: number;
          name: string;
        };
        settings: {
          theme: string;
          notifications: boolean;
        };
      }

      // This test validates the type at compile time
      const boxedValues: WritableBoxedValues<NestedData> = {
        user: {
          current: { id: 1, name: "John" },
          subscribe: () => () => {},
          set: () => {},
          update: () => {},
        },
        settings: {
          current: { theme: "dark", notifications: true },
          subscribe: () => () => {},
          set: () => {},
          update: () => {},
        },
      };

      expect(boxedValues.user.current.id).toBe(1);
      expect(boxedValues.user.current.name).toBe("John");
      expect(boxedValues.settings.current.theme).toBe("dark");
      expect(boxedValues.settings.current.notifications).toBe(true);
    });
  });

  describe("ReadableBoxedValues type", () => {
    it("converts object properties to ReadableBox types", () => {
      interface TestData {
        name: string;
        age: number;
        active: boolean;
      }

      // This test validates the type at compile time
      const boxedValues: ReadableBoxedValues<TestData> = {
        name: {
          current: "Jane",
          subscribe: () => () => {},
        },
        age: {
          current: 25,
          subscribe: () => () => {},
        },
        active: {
          current: false,
          subscribe: () => () => {},
        },
      };

      expect(boxedValues.name.current).toBe("Jane");
      expect(boxedValues.age.current).toBe(25);
      expect(boxedValues.active.current).toBe(false);
    });

    it("handles optional properties", () => {
      interface OptionalData {
        required: string;
        optional?: number;
      }

      // This test validates the type at compile time
      const boxedValues: ReadableBoxedValues<OptionalData> = {
        required: {
          current: "test",
          subscribe: () => () => {},
        },
        optional: {
          current: undefined,
          subscribe: () => () => {},
        },
      };

      expect(boxedValues.required.current).toBe("test");
      expect(boxedValues.optional.current).toBeUndefined();
    });

    it("handles union types", () => {
      interface UnionData {
        status: "loading" | "success" | "error";
        value: string | number | null;
      }

      // This test validates the type at compile time
      const boxedValues: ReadableBoxedValues<UnionData> = {
        status: {
          current: "success",
          subscribe: () => () => {},
        },
        value: {
          current: "test",
          subscribe: () => () => {},
        },
      };

      expect(boxedValues.status.current).toBe("success");
      expect(boxedValues.value.current).toBe("test");
    });
  });

  describe("Type compatibility", () => {
    it("ReadableBoxedValues can be assigned from WritableBoxedValues", () => {
      interface TestData {
        name: string;
        value: number;
      }

      const writableBoxed: WritableBoxedValues<TestData> = {
        name: {
          current: "test",
          subscribe: () => () => {},
          set: () => {},
          update: () => {},
        },
        value: {
          current: 42,
          subscribe: () => () => {},
          set: () => {},
          update: () => {},
        },
      };

      // This should compile without error - WritableBox extends ReadableBox
      const readableBoxed: ReadableBoxedValues<TestData> = writableBoxed;

      expect(readableBoxed.name.current).toBe("test");
      expect(readableBoxed.value.current).toBe(42);
    });

    it("Box type can hold both readable and writable boxes", () => {
      const readableBox: ReadableBox<string> = {
        current: "readable",
        subscribe: () => () => {},
      };

      const writableBox: WritableBox<string> = {
        current: "writable",
        subscribe: () => () => {},
        set: () => {},
        update: () => {},
      };

      const boxes: Box<string>[] = [readableBox, writableBox];

      expect(boxes).toHaveLength(2);
      expect(boxes[0].current).toBe("readable");
      expect(boxes[1].current).toBe("writable");
    });
  });
});
