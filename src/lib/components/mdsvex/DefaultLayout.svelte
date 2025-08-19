<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<article class="prose prose-neutral dark:prose-invert max-w-none mdx-layout">
  {@render children()}
</article>

<style>
  .mdx-layout {
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  :global(.prose h1) {
    font-size: 1.875rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
    margin-top: 2rem;
  }

  :global(.prose h1:first-child) {
    margin-top: 0;
  }

  :global(.prose h2) {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1rem;
    margin-top: 1.5rem;
  }

  :global(.prose h3) {
    font-size: 1.25rem;
    font-weight: 500;
    margin-bottom: 0.75rem;
    margin-top: 1.25rem;
  }

  :global(.prose p) {
    margin-bottom: 1rem;
    line-height: 1.6;
  }

  :global(.prose ul, .prose ol) {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
  }

  :global(.prose li) {
    margin-bottom: 0.5rem;
  }

  :global(.prose pre) {
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
    background-color: #f3f4f6;
    border: 1px solid #e5e7eb;
  }

  :global(.prose code) {
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    background-color: #f3f4f6;
    border: 1px solid #e5e7eb;
  }

  :global(.prose blockquote) {
    border-left: 4px solid #d1d5db;
    padding-left: 1rem;
    font-style: italic;
  }

  /* Dark mode support */
  :global(.dark .prose pre) {
    background-color: #374151;
    border-color: #4b5563;
  }

  :global(.dark .prose code) {
    background-color: #374151;
    border-color: #4b5563;
  }

  :global(.dark .prose blockquote) {
    border-left-color: #6b7280;
  }
</style>