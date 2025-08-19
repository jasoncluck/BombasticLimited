<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<article class="markdown-content">
  {@render children()}
</article>

<style>
  .markdown-content {
    margin: 0 auto;
    padding: 2rem 1rem;
    max-width: none;
  }

  /* Header styles matching the existing design system */
  :global(.markdown-content h1) {
    margin: 0 0.5rem 1rem 0.5rem;
    font-size: 1.875rem;
    font-weight: 600;
    transition: color 0.15s ease-in-out;
  }

  :global(.markdown-content h1:first-child) {
    margin-top: 0;
  }

  :global(.markdown-content h2) {
    margin-bottom: 0.5rem;
    font-size: 1.5rem;
    font-weight: 600;
    transition: color 0.15s ease-in-out;
  }

  :global(.markdown-content h3) {
    margin: 1.5rem 0 0.75rem 0;
    font-size: 1.25rem;
    font-weight: 500;
  }

  :global(.markdown-content h4) {
    margin: 1rem 0 0.5rem 0;
    font-size: 1.125rem;
    font-weight: 500;
  }

  :global(.markdown-content p) {
    margin-bottom: 1rem;
    line-height: 1.75;
  }

  :global(.markdown-content ul, .markdown-content ol) {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
  }

  :global(.markdown-content li) {
    margin-bottom: 0.5rem;
  }

  /* Code blocks using design system colors */
  :global(.markdown-content pre) {
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
    font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.875rem;
    background-color: var(--color-muted);
    border: 1px solid var(--color-border);
    color: var(--color-foreground);
    margin: 1rem 0;
  }

  :global(.markdown-content code) {
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: ui-monospace, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 0.875rem;
    background-color: var(--color-muted);
    border: 1px solid var(--color-border);
    color: var(--color-foreground);
  }

  /* Don't double-style code inside pre blocks */
  :global(.markdown-content pre code) {
    padding: 0;
    border: 0;
    background-color: transparent;
  }

  :global(.markdown-content blockquote) {
    padding-left: 1rem;
    font-style: italic;
    border-left: 4px solid var(--color-border);
    color: var(--color-muted-foreground);
    margin: 1rem 0;
  }

  :global(.markdown-content strong) {
    font-weight: 600;
  }

  :global(.markdown-content em) {
    font-style: italic;
  }

  :global(.markdown-content a) {
    text-decoration: underline;
    color: var(--color-primary);
  }

  :global(.markdown-content a:hover) {
    text-decoration: none;
  }
</style>