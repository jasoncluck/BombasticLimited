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

    // Active state (keep non-hover active state)
    classes += ' active:bg-secondary/70 active:scale-95 active:brightness-90';

    // Enhanced hover effect when manually tracking hover state
    const isHovered =
      this.hoveredSourceIndex === index &&
      !this.pageState.sidebarScrollState.scrolling;

    // Apply hover styling only through JavaScript state, not CSS hover
    if (isHovered) {
      if (isSelected) {
        classes += ' !brightness-120 !bg-secondary';
      } else {
        classes += ' bg-secondary/50 brightness-110';
      }
    }

    // Selected styling
    if (isSelected) {
      classes += ' bg-secondary text-secondary-foreground';
      // Apply hover effect for selected items only via JavaScript state
      if (isHovered) {
        classes += ' brightness-110';
      }
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
