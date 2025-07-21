import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Loader from "./loader.svelte";
import { setupTest } from "../../tests/utils/test-setup";

describe("Loader Component", () => {
  setupTest();

  it("renders the loader component with default props", () => {
    const { container } = render(Loader);

    expect(container).toBeDefined();
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("displays custom message when provided", () => {
    render(Loader, { props: { message: "Please wait..." } });

    expect(screen.getByText("Please wait...")).toBeDefined();
    expect(screen.queryByText("Loading...")).toBeNull();
  });

  it("applies correct size classes for small size", () => {
    const { container } = render(Loader, { props: { size: "sm" } });

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toHaveClass("h-6", "w-6");
  });

  it("applies correct size classes for medium size (default)", () => {
    const { container } = render(Loader, { props: { size: "md" } });

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toHaveClass("h-8", "w-8");
  });

  it("applies correct size classes for large size", () => {
    const { container } = render(Loader, { props: { size: "lg" } });

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toHaveClass("h-12", "w-12");
  });

  it("is visible by default", () => {
    const { container } = render(Loader);

    const loaderContainer = container.querySelector(".flex");
    expect(loaderContainer).toHaveClass("visible");
    expect(loaderContainer).not.toHaveClass("invisible");
  });

  it("is invisible when visible prop is false", () => {
    const { container } = render(Loader, { props: { visible: false } });

    const loaderContainer = container.querySelector(".flex");
    expect(loaderContainer).toHaveClass("invisible");
    expect(loaderContainer).not.toHaveClass("visible");
  });

  it("has correct spinner styling", () => {
    const { container } = render(Loader);

    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toHaveClass(
      "animate-spin",
      "rounded-full",
      "border-b-2",
      "border-primary",
      "mx-auto",
      "mb-2",
    );
  });

  it("has correct text styling", () => {
    render(Loader);

    const message = screen.getByText("Loading...");
    expect(message).toHaveClass("text-sm", "text-muted-foreground");
  });

  it("centers content correctly", () => {
    const { container } = render(Loader);

    const outerContainer = container.querySelector(".flex");
    expect(outerContainer).toHaveClass(
      "flex",
      "items-center",
      "justify-center",
      "p-4",
    );

    const innerContainer = container.querySelector(".text-center");
    expect(innerContainer).toHaveClass("text-center");
  });

  it("handles all size options correctly", () => {
    const sizes = ["sm", "md", "lg"] as const;
    const expectedClasses = {
      sm: ["h-6", "w-6"],
      md: ["h-8", "w-8"],
      lg: ["h-12", "w-12"],
    };

    sizes.forEach((size) => {
      const { container } = render(Loader, { props: { size } });
      const spinner = container.querySelector(".animate-spin");

      expectedClasses[size].forEach((className) => {
        expect(spinner).toHaveClass(className);
      });
    });
  });

  it("component initializes without errors", () => {
    const { container } = render(Loader);
    expect(container).toBeDefined();
  });
});
