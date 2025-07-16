import { getContext, setContext } from "svelte";
import type { PageState } from "./page.svelte";

export interface SourceButtonOptions {
  index: number;
  isSelected: boolean;
  isSidebarCollapsed: boolean;
}

export class SourceStateClass {
  // Page state dependency
  pageState: PageState;

  // Source hover state
  hoveredSourceIndex = $state<number | null>(null);

  constructor(pageState: PageState) {
    this.pageState = pageState;
  }

  // Mouse hover methods
  handleMouseEnter(index: number) {
    // Only allow hover if not scrolling
    if (!this.pageState.sidebarScrollState.scrolling) {
      this.hoveredSourceIndex = index;
    }
  }

  handleMouseLeave(index: number) {
    if (this.hoveredSourceIndex === index) {
      this.hoveredSourceIndex = null;
    }
  }

  // CSS class helpers
  getButtonClasses(options: SourceButtonOptions): string {
    const { index, isSelected, isSidebarCollapsed } = options;

    let classes = "sidebar-full-button active:bg-black/70";

    // Manual hover effect (only when appropriate)
    if (
      this.hoveredSourceIndex === index &&
      !this.pageState.sidebarScrollState.scrolling
    ) {
      if (isSelected) {
        classes += " !hover:bg-secondary brightness-125";
      } else {
        classes += " hover:bg-secondary/25";
      }
    }

    // Selected styling
    if (isSelected) {
      classes += " bg-secondary";
    }

    // Sidebar layout classes
    if (!isSidebarCollapsed) {
      classes += " min-w-[150px] justify-normal";
    } else {
      classes += " align-middle";
    }

    return classes;
  }
}

// Export the class type for use elsewhere
export type SourceState = SourceStateClass;

const DEFAULT_KEY = "$_source_state";

export function setSourceState(pageState: PageState, key = DEFAULT_KEY) {
  const sourceState = new SourceStateClass(pageState);
  return setContext(key, sourceState);
}

export function getSourceState(key = DEFAULT_KEY) {
  return getContext<SourceState>(key);
}
