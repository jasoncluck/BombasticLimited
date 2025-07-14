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
  // Stack-based state for nested drawers
  drawers = $state<DrawerContent[]>([]);
  optionsStack = $state<DrawerOptions[]>([]);

  // Computed properties for current drawer
  get isOpen() {
    return this.drawers.length > 0;
  }

  get content() {
    return this.drawers[this.drawers.length - 1] || null;
  }

  get options() {
    return (
      this.optionsStack[this.optionsStack.length - 1] ||
      this.getDefaultOptions()
    );
  }

  constructor() {
    if (typeof window !== "undefined") {
      this.setupKeyboardListeners();
    }
  }

  updateFormState(isSubmitting: boolean) {
    if (this.optionsStack.length > 0) {
      this.optionsStack[this.optionsStack.length - 1].isSubmitting =
        isSubmitting;
    }
  }

  // Type-safe open method for nested drawers
  open<T extends Record<string, unknown>>({
    component,
    props,
    title,
    subtitle,
    options,
  }: OpenDrawerOptions<T>) {
    const newContent = {
      component: component as Component<Record<string, unknown>>,
      props: props as Record<string, unknown>,
      title,
      subtitle,
    };

    const newOptions = {
      ...this.getDefaultOptions(),
      ...options,
      nested: this.drawers.length > 0, // Auto-detect nested state
    };

    this.drawers.push(newContent);
    this.optionsStack.push(newOptions);
  }

  // Close the topmost drawer
  close() {
    if (this.drawers.length === 0) return;

    // Create new arrays to ensure reactivity
    this.drawers = this.drawers.slice(0, -1);
    this.optionsStack = this.optionsStack.slice(0, -1);

    if (this.drawers.length === 0) {
      this.onClosed();
    }
  }

  // Close all drawers
  closeAll() {
    this.drawers = [];
    this.optionsStack = [];
    this.onClosed();
  }

  // Close to a specific level (0-based index)
  closeTo(level: number) {
    if (level < 0 || level >= this.drawers.length) return;

    this.drawers = this.drawers.slice(0, level + 1);
    this.optionsStack = this.optionsStack.slice(0, level + 1);

    if (this.drawers.length === 0) {
      this.onClosed();
    }
  }

  // Toggle drawer state (only affects topmost drawer)
  toggle() {
    if (this.isOpen) {
      this.close();
    }
  }

  // Handle when all drawers are closed
  onClosed() {
    this.drawers = [];
    this.optionsStack = [];
  }

  // Get default options
  private getDefaultOptions(): DrawerOptions {
    return {
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

  // Handle backdrop click (only closes if not nested or if configured to do so)
  handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget && this.options.showOverlay) {
      this.close();
    }
  }

  // Setup keyboard event listeners
  private setupKeyboardListeners() {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.isOpen && this.options.closeOnEscape) {
        this.close(); // Close only the topmost drawer
      }
    };

    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
    };
  }

  // Nested drawer helpers
  get nestingLevel(): number {
    return this.drawers.length;
  }

  get isNested(): boolean {
    return this.drawers.length > 1;
  }

  get parentDrawer(): DrawerContent | null {
    return this.drawers.length > 1
      ? this.drawers[this.drawers.length - 2]
      : null;
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
    // For nested drawers, only show overlay for the first drawer unless explicitly configured
    if (this.isNested && !this.options.nested) {
      return false;
    }
    return this.options.showOverlay
      ? this.options.showOverlay && this.shouldRender
      : this.shouldRender;
  }

  // Get all drawer contents (useful for debugging or complex UI)
  get allDrawers(): DrawerContent[] {
    return [...this.drawers];
  }

  // Get all options stack (useful for debugging)
  get allOptions(): DrawerOptions[] {
    return [...this.optionsStack];
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
    closeAll: drawerState.closeAll.bind(drawerState),
    closeTo: drawerState.closeTo.bind(drawerState),
    toggle: drawerState.toggle.bind(drawerState),
    isOpen: drawerState.isOpen,
    isNested: drawerState.isNested,
    nestingLevel: drawerState.nestingLevel,
    parentDrawer: drawerState.parentDrawer,
    allDrawers: drawerState.allDrawers,
  };
}
