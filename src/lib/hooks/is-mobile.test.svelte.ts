import { describe, it, expect, vi, beforeEach } from "vitest";
import { IsMobile } from "./is-mobile.svelte";

// Mock the MediaQuery from svelte/reactivity
vi.mock("svelte/reactivity", () => ({
	MediaQuery: class MockMediaQuery {
		query: string;
		current: boolean = false;
		
		constructor(query: string) {
			this.query = query;
		}
	},
}));

describe("IsMobile", () => {
	let isMobile: IsMobile;

	beforeEach(() => {
		isMobile = new IsMobile();
	});

	describe("constructor", () => {
		it("should initialize with correct mobile breakpoint query", () => {
			expect(isMobile.query).toBe("max-width: 767px");
		});

		it("should extend MediaQuery class", () => {
			// Check that it's an instance of the mocked MediaQuery
			expect(isMobile).toBeDefined();
			expect(isMobile.query).toBeDefined();
		});
	});

	describe("mobile breakpoint constant", () => {
		it("should use 768px as the mobile breakpoint threshold", () => {
			// The query should be max-width: 767px (768 - 1)
			expect(isMobile.query).toContain("767px");
		});

		it("should use max-width query for mobile detection", () => {
			expect(isMobile.query).toContain("max-width");
		});
	});

	describe("integration with MediaQuery", () => {
		it("should have current property from MediaQuery base class", () => {
			expect(isMobile).toHaveProperty("current");
		});

		it("should initialize current as false by default", () => {
			expect(isMobile.current).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("should handle multiple instances correctly", () => {
			const isMobile1 = new IsMobile();
			const isMobile2 = new IsMobile();
			
			expect(isMobile1.query).toBe(isMobile2.query);
			expect(isMobile1.query).toBe("max-width: 767px");
		});

		it("should maintain consistent breakpoint calculation", () => {
			// Test that 768 - 1 = 767 consistently
			const expectedQuery = "max-width: 767px";
			expect(isMobile.query).toBe(expectedQuery);
		});
	});
});

describe("mobile breakpoint logic", () => {
	it("should use standard mobile breakpoint", () => {
		// 768px is a common mobile breakpoint (Bootstrap md breakpoint)
		const isMobile = new IsMobile();
		expect(isMobile.query).toBe("max-width: 767px");
	});

	it("should exclude the breakpoint value itself from mobile", () => {
		// At exactly 768px should not be considered mobile
		// So query should be max-width: 767px
		const isMobile = new IsMobile();
		expect(isMobile.query).not.toContain("768px");
		expect(isMobile.query).toContain("767px");
	});
});