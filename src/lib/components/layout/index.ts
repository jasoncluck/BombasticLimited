// Re-export the main layout component
export { default as LayoutMain } from "./layout-main.svelte";

// Re-export individual components if needed
export { default as MainNavigation } from "./navigation/main-navigation.svelte";
export { default as SearchInput } from "./navigation/search-input.svelte";
export { default as UserMenu } from "./navigation/user-menu.svelte";
export { default as ResizableLayout } from "./content/resizable-layout.svelte";
export { default as LoadingOverlay } from "./content/loading-overlay.svelte";

// Re-export hooks
export { useNavigation } from "./hooks/use-navigation.svelte.js";
export { usePreloading } from "./hooks/use-preloading.svelte.js";
export { useLayoutEffects } from "./hooks/use-layout-effects.svelte.js";
