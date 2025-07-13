import type { Component } from "svelte";
import { getContext, setContext } from "svelte";

export interface DrawerContent<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  component: Component<T>;
  props: T;
  title?: string;
  subtitle?: string;
}

export interface DrawerOptions {
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  showOverlay?: boolean;
  fullHeight?: boolean;
  nested?: boolean;
  handleOnly?: boolean;
  showCloseButton?: boolean;
  closeButtonText?: string;
  closeButtonVariant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  formId?: string;
  submitButtonText?: string;
  submitButtonVariant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  showSubmitButton?: boolean;
  isSubmitting?: boolean;
}

export interface OpenDrawerOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  component: Component<T>;
  props: T;
  title?: string;
  subtitle?: string;
  options?: DrawerOptions;
}

export class DrawerStateClass {
  // Add the missing state properties
  isOpen = $state(false);
  content = $state<DrawerContent | null>(null);

  options = $state<DrawerOptions>({
    closeOnBackdropClick: true,
    closeOnEscape: true,
    showOverlay: true,
    fullHeight: false,
    nested: false,
    handleOnly: true,
    showCloseButton: true,
    closeButtonText: "Close",
    closeButtonVariant: "outline",
    // Form defaults
    submitButtonText: "Save Changes",
    submitButtonVariant: "default",
    showSubmitButton: false,
    isSubmitting: false,
  });

  constructor() {
    if (typeof window !== "undefined") {
      this.setupKeyboardListeners();
    }
  }

  updateFormState(isSubmitting: boolean) {
    this.options.isSubmitting = isSubmitting;
  }

  // Type-safe open method
  open<T extends Record<string, unknown>>({
    component,
    props,
    title,
    subtitle,
    options,
  }: OpenDrawerOptions<T>) {
    this.content = {
      component: component as Component<Record<string, unknown>>,
      props: props as Record<string, unknown>,
      title,
      subtitle,
    };

    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.isOpen = true;
  }

  // Close drawer
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
  }

  // Toggle drawer state
  toggle() {
    if (this.isOpen) {
      this.close();
    }
  }

  // Handle when the drawer is actually closed
  onClosed() {
    this.content = null;
    this.resetOptions();
  }

  // Reset options to defaults
  private resetOptions() {
    this.options = {
      closeOnBackdropClick: true,
      closeOnEscape: true,
      showOverlay: true,
      fullHeight: false,
      nested: false,
      handleOnly: true,
      showCloseButton: true,
      closeButtonText: "Close",
      closeButtonVariant: "outline",
      submitButtonText: "Save Changes",
      submitButtonVariant: "default",
      showSubmitButton: false,
      isSubmitting: false,
    };
  }

  // Handle backdrop click
  handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
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

    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }

  // Content helpers with proper typing
  get hasContent(): boolean {
    return this.content !== null;
  }

  get currentComponent(): Component<Record<string, unknown>> | null {
    return this.content?.component || null;
  }

  get currentProps(): Record<string, unknown> {
    return this.content?.props || {};
  }

  get currentTitle(): string | undefined {
    return this.content?.title;
  }

  get currentSubtitle(): string | undefined {
    return this.content?.subtitle;
  }

  // State helpers
  get shouldRender(): boolean {
    return this.hasContent;
  }

  get shouldShowOverlay(): boolean {
    return this.options.showOverlay && this.shouldRender;
  }
}

export type DrawerState = DrawerStateClass;

const DEFAULT_KEY = "$_drawer_state";

export function setDrawerState(key = DEFAULT_KEY) {
  const drawerState = new DrawerStateClass();
  return setContext(key, drawerState);
}

export function getDrawerState(key = DEFAULT_KEY) {
  return getContext<DrawerState>(key);
}

export function useDrawer(key = DEFAULT_KEY) {
  const drawerState = getDrawerState(key);

  return {
    open: drawerState.open.bind(drawerState),
    close: drawerState.close.bind(drawerState),
    toggle: drawerState.toggle.bind(drawerState),
    isOpen: drawerState.isOpen,
  };
}
