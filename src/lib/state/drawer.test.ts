import { describe, it, expect, beforeEach } from "vitest";
import { DrawerStateClass } from "./drawer.svelte";

// Mock component for testing
const MockComponent = (() => {}) as any;

describe("DrawerStateClass", () => {
  let drawerState: DrawerStateClass;

  beforeEach(() => {
    drawerState = new DrawerStateClass();
  });

  it("should initialize with closed state", () => {
    expect(drawerState.isOpen).toBe(false);
    expect(drawerState.content).toBe(null);
    expect(drawerState.hasContent).toBe(false);
  });

  it("should open drawer with component and props", () => {
    const mockProps = { test: "value" };

    drawerState.open({
      component: MockComponent,
      props: mockProps,
      title: "Test Title",
      subtitle: "Test Subtitle",
    });

    expect(drawerState.isOpen).toBe(true);
    expect(drawerState.hasContent).toBe(true);
    expect(drawerState.currentTitle).toBe("Test Title");
    expect(drawerState.currentSubtitle).toBe("Test Subtitle");
    expect(drawerState.currentProps).toEqual(mockProps);
  });

  it("should close drawer and maintain content until onClosed is called", () => {
    drawerState.open({
      component: MockComponent,
      props: { test: "value" },
    });

    expect(drawerState.isOpen).toBe(true);
    expect(drawerState.hasContent).toBe(true);

    drawerState.close();

    expect(drawerState.isOpen).toBe(false);
    // Content should still exist until onClosed is called
    expect(drawerState.hasContent).toBe(true);

    drawerState.onClosed();

    expect(drawerState.hasContent).toBe(false);
    expect(drawerState.content).toBe(null);
  });

  it("should handle multiple close calls gracefully", () => {
    drawerState.close(); // Should not throw error when already closed
    expect(drawerState.isOpen).toBe(false);
  });

  it("should toggle drawer state", () => {
    expect(drawerState.isOpen).toBe(false);

    // Toggle when closed should do nothing (as there's no content to show)
    drawerState.toggle();
    expect(drawerState.isOpen).toBe(false);

    // Open drawer first
    drawerState.open({
      component: MockComponent,
      props: {},
    });
    expect(drawerState.isOpen).toBe(true);

    // Now toggle should close it
    drawerState.toggle();
    expect(drawerState.isOpen).toBe(false);
  });

  it("should handle options correctly", () => {
    const customOptions = {
      closeOnEscape: false,
      showOverlay: false,
      fullHeight: true,
    };

    drawerState.open({
      component: MockComponent,
      props: {},
      options: customOptions,
    });

    expect(drawerState.options.closeOnEscape).toBe(false);
    expect(drawerState.options.showOverlay).toBe(false);
    expect(drawerState.options.fullHeight).toBe(true);
  });

  it("should reset options when drawer is closed", () => {
    const customOptions = {
      closeOnEscape: false,
      showOverlay: false,
    };

    drawerState.open({
      component: MockComponent,
      props: {},
      options: customOptions,
    });

    expect(drawerState.options.closeOnEscape).toBe(false);

    drawerState.close();
    drawerState.onClosed();

    // Options should be reset to defaults
    expect(drawerState.options.closeOnEscape).toBe(true);
    expect(drawerState.options.showOverlay).toBe(true);
  });
});