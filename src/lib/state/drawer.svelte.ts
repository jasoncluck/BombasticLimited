import type { Component } from "svelte";
import { getContext, setContext } from "svelte";

export interface DrawerContent {
  component: Component<any>; // Changed from Component to Component<any>
  props: Record<string, any>;
  title?: string;
}

export interface DrawerOptions {
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  showOverlay: boolean;
}

export class DrawerStateClass {
  // Drawer state
  isOpen = $state<boolean>(false);
  content = $state<DrawerContent | null>(null);
  options = $state<DrawerOptions>({
    closeOnBackdropClick: true,
    closeOnEscape: true,
    showOverlay: true,
  });

  // Animation state
  isAnimating = $state<boolean>(false);

  constructor() {
    // Set up keyboard listener for escape key
    if (typeof window !== "undefined") {
      this.setupKeyboardListeners();
    }
  }

  // Open drawer with content - Updated to accept any component type
  open<T extends Record<string, any>>(
    component: Component<T>,
    props: T,
    title?: string,
    options?: Partial<DrawerOptions>,
  ) {
    this.content = {
      component: component as Component<any>,
      props,
      title,
    };

    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.isAnimating = true;
    this.isOpen = true;

    // Clear animation state after animation completes
    setTimeout(() => {
      this.isAnimating = false;
    }, 300);
  }

  // Close drawer
  close() {
    if (!this.isOpen) return;

    this.isAnimating = true;
    this.isOpen = false;

    // Clear content after animation completes
    setTimeout(() => {
      this.content = null;
      this.isAnimating = false;
      this.resetOptions();
    }, 300);
  }

  // Toggle drawer state
  toggle() {
    if (this.isOpen) {
      this.close();
    }
  }

  // Reset options to defaults
  private resetOptions() {
    this.options = {
      closeOnBackdropClick: true,
      closeOnEscape: true,
      showOverlay: true,
    };
  }

  // Handle backdrop click
  handleBackdropClick(event: MouseEvent) {
    if (
      this.options.closeOnBackdropClick &&
      event.target === event.currentTarget
    ) {
      this.close();
    }
  }

  // Setup keyboard event listeners
  private setupKeyboardListeners() {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.isOpen && this.options.closeOnEscape) {
        this.close();
      }
    };

    document.addEventListener("keydown", handleKeydown);

    // Cleanup function (you might want to call this when the component is destroyed)
    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }

  // CSS class helpers
  getDrawerClasses(): string {
    let classes =
      "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background";

    if (this.isAnimating) {
      classes += " transition-transform duration-300 ease-in-out";
    }

    if (!this.isOpen) {
      classes += " translate-y-full";
    }

    return classes;
  }

  getOverlayClasses(): string {
    let classes = "fixed inset-0 z-40 bg-black/80";

    if (this.isAnimating) {
      classes += " transition-opacity duration-300 ease-in-out";
    }

    if (!this.isOpen) {
      classes += " opacity-0 pointer-events-none";
    }

    return classes;
  }

  // Content helpers
  get hasContent(): boolean {
    return this.content !== null;
  }

  get currentComponent(): Component<any> | null {
    return this.content?.component || null;
  }

  get currentProps(): Record<string, any> {
    return this.content?.props || {};
  }

  get currentTitle(): string | undefined {
    return this.content?.title;
  }

  // State helpers
  get shouldRender(): boolean {
    return this.isOpen || this.isAnimating;
  }

  get shouldShowOverlay(): boolean {
    return this.options.showOverlay && this.shouldRender;
  }
}

// Export the class type for use elsewhere
export type DrawerState = DrawerStateClass;

const DEFAULT_KEY = "$_drawer_state";

export function setDrawerState(key = DEFAULT_KEY) {
  const drawerState = new DrawerStateClass();
  return setContext(key, drawerState);
}

export function getDrawerState(key = DEFAULT_KEY) {
  return getContext<DrawerState>(key);
}

// Convenience function for components that just need to open drawers
export function useDrawer(key = DEFAULT_KEY) {
  const drawerState = getDrawerState(key);

  return {
    open: drawerState.open.bind(drawerState),
    close: drawerState.close.bind(drawerState),
    toggle: drawerState.toggle.bind(drawerState),
    isOpen: drawerState.isOpen,
  };
}
