<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<article class="prose prose-invert max-w-none">
  {@render children()}
</article>

<style>
  /* Custom overrides for Tailwind Typography to integrate with the design system */
  :global(.prose) {
    /* Override prose colors to use design system variables */
    --tw-prose-body: var(--color-foreground);
    --tw-prose-headings: var(--color-foreground);
    --tw-prose-lead: var(--color-muted-foreground);
    --tw-prose-links: var(--color-primary);
    --tw-prose-bold: var(--color-foreground);
    --tw-prose-counters: var(--color-muted-foreground);
    --tw-prose-bullets: var(--color-muted-foreground);
    --tw-prose-hr: var(--color-border);
    --tw-prose-quotes: var(--color-foreground);
    --tw-prose-quote-borders: var(--color-border);
    --tw-prose-captions: var(--color-muted-foreground);
    --tw-prose-code: var(--color-foreground);
    --tw-prose-pre-code: var(--color-foreground);
    --tw-prose-pre-bg: var(--color-muted);
    --tw-prose-th-borders: var(--color-border);
    --tw-prose-td-borders: var(--color-border);
  }

  /* Integrate existing header styles from the design system */
  :global(.prose h1) {
    /* header-primary equivalent styles */
    margin: 0 0.5rem 1rem 0.5rem;
    font-size: 1.875rem; /* text-3xl */
    font-weight: 600; /* font-semibold */
    transition: color 0.15s ease-in-out;
    margin-top: 0;
  }

  @media (min-width: 640px) {
    :global(.prose h1) {
      margin: 0 0 0.5rem 0; /* sm:m-0 sm:mb-2 */
    }
  }

  @media (min-width: 1024px) {
    :global(.prose h1) {
      font-size: 2.25rem; /* lg:text-4xl */
    }
  }

  :global(.prose h2) {
    /* header-secondary equivalent styles */
    margin-bottom: 0.5rem; /* mb-2 */
    font-size: 1.5rem; /* text-2xl */
    font-weight: 600; /* font-semibold */
    transition: color 0.15s ease-in-out;
  }

  @media (min-width: 1024px) {
    :global(.prose h2) {
      font-size: 1.875rem; /* lg:text-3xl */
    }
  }

  /* Code blocks with design system integration */
  :global(.prose pre) {
    background-color: var(--color-muted) !important;
    border: 1px solid var(--color-border);
    color: var(--color-foreground) !important;
  }

  :global(.prose code) {
    background-color: var(--color-muted) !important;
    color: var(--color-foreground) !important;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    padding: 0.125rem 0.25rem;
  }

  /* Don't double-style code inside pre blocks */
  :global(.prose pre code) {
    background-color: transparent !important;
    border: none !important;
    padding: 0 !important;
  }
</style>
