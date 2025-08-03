import { getContext, setContext } from 'svelte';
import type { PageState } from './page.svelte';

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

    let classes = 'sidebar-full-button transition-all duration-200 ease-in-out';

    // Base hover and active states that apply to the whole button
    classes += ' hover:bg-secondary/50 hover:brightness-110';
    classes += ' active:bg-secondary/70 active:scale-95 active:brightness-90';

    // Enhanced hover effect when manually tracking hover state
    if (
      this.hoveredSourceIndex === index &&
      !this.pageState.sidebarScrollState.scrolling
    ) {
      if (isSelected) {
        classes += ' brightness-110';
      } else {
        classes += ' bg-secondary/25';
      }
    }

    // Selected styling
    if (isSelected) {
      classes += ' bg-secondary text-secondary-foreground';
      // Override hover for selected items
      classes += ' hover:bg-secondary hover:brightness-110';
    }

    // Sidebar layout classes
    if (!isSidebarCollapsed) {
      classes += ' min-w-[150px] justify-normal';
    } else {
      classes += ' align-middle';
    }

    return classes;
  }
}

// Export the class type for use elsewhere
export type SourceState = SourceStateClass;

const DEFAULT_KEY = '$_source_state';

export function setSourceState(pageState: PageState, key = DEFAULT_KEY) {
  const sourceState = new SourceStateClass(pageState);
  return setContext(key, sourceState);
}

export function getSourceState(key = DEFAULT_KEY) {
  return getContext<SourceState>(key);
}
