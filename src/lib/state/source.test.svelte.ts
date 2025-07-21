import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	SourceStateClass,
	setSourceState,
	getSourceState,
	type SourceButtonOptions,
} from "./source.svelte";
import type { PageState } from "./page.svelte";

// Mock svelte context functions
vi.mock("svelte", () => ({
	getContext: vi.fn(),
	setContext: vi.fn(),
}));

describe("SourceStateClass", () => {
	let sourceState: SourceStateClass;
	let mockPageState: PageState;

	beforeEach(() => {
		mockPageState = {
			sidebarScrollState: {
				scrolling: false,
				direction: null,
				interval: null,
			},
		} as PageState;

		sourceState = new SourceStateClass(mockPageState);
	});

	describe("initial state", () => {
		it("should initialize with null hovered source index", () => {
			expect(sourceState.hoveredSourceIndex).toBeNull();
		});

		it("should store reference to page state", () => {
			expect(sourceState.pageState).toBe(mockPageState);
		});
	});

	describe("mouse enter handling", () => {
		it("should set hovered source index when not scrolling", () => {
			sourceState.handleMouseEnter(5);
			expect(sourceState.hoveredSourceIndex).toBe(5);
		});

		it("should not set hovered source index when scrolling", () => {
			mockPageState.sidebarScrollState.scrolling = true;
			sourceState.handleMouseEnter(3);
			expect(sourceState.hoveredSourceIndex).toBeNull();
		});

		it("should update hovered index when moving between sources", () => {
			sourceState.handleMouseEnter(1);
			expect(sourceState.hoveredSourceIndex).toBe(1);

			sourceState.handleMouseEnter(2);
			expect(sourceState.hoveredSourceIndex).toBe(2);
		});
	});

	describe("mouse leave handling", () => {
		it("should clear hovered source index when leaving current hovered source", () => {
			sourceState.hoveredSourceIndex = 3;
			sourceState.handleMouseLeave(3);
			expect(sourceState.hoveredSourceIndex).toBeNull();
		});

		it("should not clear hovered source index when leaving different source", () => {
			sourceState.hoveredSourceIndex = 3;
			sourceState.handleMouseLeave(5);
			expect(sourceState.hoveredSourceIndex).toBe(3);
		});

		it("should handle leave when no source is hovered", () => {
			sourceState.handleMouseLeave(1);
			expect(sourceState.hoveredSourceIndex).toBeNull();
		});
	});

	describe("button classes generation", () => {
		let baseOptions: SourceButtonOptions;

		beforeEach(() => {
			baseOptions = {
				index: 0,
				isSelected: false,
				isSidebarCollapsed: false,
			};
		});

		it("should generate base classes", () => {
			const classes = sourceState.getButtonClasses(baseOptions);
			
			expect(classes).toContain("sidebar-full-button");
			expect(classes).toContain("transition-all");
			expect(classes).toContain("duration-200");
			expect(classes).toContain("ease-in-out");
		});

		it("should include hover and active classes", () => {
			const classes = sourceState.getButtonClasses(baseOptions);
			
			expect(classes).toContain("hover:bg-secondary/50");
			expect(classes).toContain("hover:brightness-110");
			expect(classes).toContain("active:bg-secondary/70");
		});

		it("should add selected styling when selected", () => {
			const options = { ...baseOptions, isSelected: true };
			const classes = sourceState.getButtonClasses(options);
			
			expect(classes).toContain("bg-secondary");
			expect(classes).toContain("text-secondary-foreground");
		});

		it("should add enhanced hover effect when manually hovering", () => {
			sourceState.hoveredSourceIndex = 1;
			const options = { ...baseOptions, index: 1, isSelected: false };
			const classes = sourceState.getButtonClasses(options);
			
			expect(classes).toContain("bg-secondary/25");
		});

		it("should add brightness effect when hovering over selected item", () => {
			sourceState.hoveredSourceIndex = 2;
			const options = { ...baseOptions, index: 2, isSelected: true };
			const classes = sourceState.getButtonClasses(options);
			
			expect(classes).toContain("brightness-110");
		});

		it("should not add hover effect when scrolling", () => {
			mockPageState.sidebarScrollState.scrolling = true;
			sourceState.hoveredSourceIndex = 1;
			const options = { ...baseOptions, index: 1 };
			const classes = sourceState.getButtonClasses(options);
			
			expect(classes).not.toContain("bg-secondary/25");
			// Note: hover:brightness-110 is always included in base classes
		});

		it("should add collapsed sidebar classes when sidebar is collapsed", () => {
			const options = { ...baseOptions, isSidebarCollapsed: true };
			const classes = sourceState.getButtonClasses(options);
			
			expect(classes).toContain("align-middle");
			expect(classes).not.toContain("min-w-[150px]");
		});

		it("should add expanded sidebar classes when sidebar is not collapsed", () => {
			const options = { ...baseOptions, isSidebarCollapsed: false };
			const classes = sourceState.getButtonClasses(options);
			
			expect(classes).toContain("min-w-[150px]");
			expect(classes).toContain("justify-normal");
		});

		it("should handle selected item with collapsed sidebar", () => {
			const options = { 
				...baseOptions, 
				isSelected: true, 
				isSidebarCollapsed: true 
			};
			const classes = sourceState.getButtonClasses(options);
			
			expect(classes).toContain("bg-secondary");
			expect(classes).toContain("align-middle");
		});

		it("should handle hovering over different index", () => {
			sourceState.hoveredSourceIndex = 5;
			const options = { ...baseOptions, index: 3 };
			const classes = sourceState.getButtonClasses(options);
			
			expect(classes).not.toContain("bg-secondary/25");
			// Note: hover:brightness-110 is always included in base classes
		});
	});

	describe("edge cases", () => {
		it("should handle rapid hover changes", () => {
			sourceState.handleMouseEnter(1);
			sourceState.handleMouseEnter(2);
			sourceState.handleMouseEnter(3);
			
			expect(sourceState.hoveredSourceIndex).toBe(3);
		});

		it("should handle leave without enter", () => {
			sourceState.handleMouseLeave(5);
			expect(sourceState.hoveredSourceIndex).toBeNull();
		});

		it("should handle multiple leaves on same index", () => {
			sourceState.hoveredSourceIndex = 2;
			sourceState.handleMouseLeave(2);
			sourceState.handleMouseLeave(2);
			
			expect(sourceState.hoveredSourceIndex).toBeNull();
		});

		it("should handle scrolling state changes during hover", () => {
			sourceState.handleMouseEnter(1);
			expect(sourceState.hoveredSourceIndex).toBe(1);

			mockPageState.sidebarScrollState.scrolling = true;
			sourceState.handleMouseEnter(2);
			
			// Should remain at 1 since scrolling is now true
			expect(sourceState.hoveredSourceIndex).toBe(1);
		});
	});
});

describe("context functions", () => {
	let mockPageState: PageState;

	beforeEach(() => {
		mockPageState = {
			sidebarScrollState: {
				scrolling: false,
				direction: null,
				interval: null,
			},
		} as PageState;
	});

	it("should set source state context", async () => {
		const { setContext } = vi.mocked(await import("svelte"));
		setSourceState(mockPageState);
		expect(setContext).toHaveBeenCalledWith("$_source_state", expect.any(SourceStateClass));
	});

	it("should set source state context with custom key", async () => {
		const { setContext } = vi.mocked(await import("svelte"));
		setSourceState(mockPageState, "custom_key");
		expect(setContext).toHaveBeenCalledWith("custom_key", expect.any(SourceStateClass));
	});

	it("should get source state context", async () => {
		const { getContext } = vi.mocked(await import("svelte"));
		getSourceState();
		expect(getContext).toHaveBeenCalledWith("$_source_state");
	});

	it("should get source state context with custom key", async () => {
		const { getContext } = vi.mocked(await import("svelte"));
		getSourceState("custom_key");
		expect(getContext).toHaveBeenCalledWith("custom_key");
	});
});