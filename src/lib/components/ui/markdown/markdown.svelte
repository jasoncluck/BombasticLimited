<script lang="ts">
  import { marked } from 'marked';
  import { onMount } from 'svelte';

  interface MarkdownProps {
    content: string;
    class?: string;
  }

  let { content, class: className = '' }: MarkdownProps = $props();
  
  let renderedHtml = $state<string>('');
  let isLoading = $state<boolean>(true);

  onMount(() => {
    // Configure marked for safe HTML rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
    });

    try {
      renderedHtml = marked.parse(content) as string;
    } catch (error) {
      console.error('Error rendering markdown:', error);
      renderedHtml = '<p>Error rendering markdown content</p>';
    } finally {
      isLoading = false;
    }
  });
</script>

<div class="markdown-content {className}">
  {#if isLoading}
    <div class="flex items-center justify-center p-8">
      <div class="text-muted-foreground">Loading...</div>
    </div>
  {:else}
    {@html renderedHtml}
  {/if}
</div>

<style>
  .markdown-content :global(h1) {
    font-size: 2.25rem;
    font-weight: 700;
    margin-bottom: 1.5rem;
    color: hsl(var(--foreground));
    border-bottom: 1px solid hsl(var(--border));
    padding-bottom: 0.5rem;
  }

  .markdown-content :global(h2) {
    font-size: 1.875rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: hsl(var(--foreground));
    margin-top: 2rem;
  }

  .markdown-content :global(h3) {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    color: hsl(var(--foreground));
    margin-top: 1.5rem;
  }

  .markdown-content :global(h4) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: hsl(var(--foreground));
    margin-top: 1rem;
  }

  .markdown-content :global(p) {
    margin-bottom: 1rem;
    color: hsl(var(--foreground));
    line-height: 1.75;
  }

  .markdown-content :global(ul) {
    margin-bottom: 1rem;
    margin-left: 1.5rem;
    list-style-type: disc;
  }

  .markdown-content :global(ol) {
    margin-bottom: 1rem;
    margin-left: 1.5rem;
    list-style-type: decimal;
  }

  .markdown-content :global(li) {
    margin-bottom: 0.5rem;
    color: hsl(var(--foreground));
  }

  .markdown-content :global(a) {
    color: hsl(var(--primary));
    text-decoration: underline;
    transition: color 0.2s ease;
  }

  .markdown-content :global(a:hover) {
    color: hsl(var(--primary) / 0.8);
  }

  .markdown-content :global(code) {
    background-color: hsl(var(--muted));
    padding: 0.125rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  }

  .markdown-content :global(pre) {
    background-color: hsl(var(--muted));
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-bottom: 1rem;
  }

  .markdown-content :global(pre code) {
    background-color: transparent;
    padding: 0;
  }

  .markdown-content :global(blockquote) {
    border-left: 4px solid hsl(var(--primary));
    padding-left: 1rem;
    font-style: italic;
    color: hsl(var(--muted-foreground));
    margin-bottom: 1rem;
  }

  .markdown-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid hsl(var(--border));
    margin-bottom: 1rem;
  }

  .markdown-content :global(th) {
    border: 1px solid hsl(var(--border));
    padding: 0.5rem;
    background-color: hsl(var(--muted));
    font-weight: 600;
    text-align: left;
  }

  .markdown-content :global(td) {
    border: 1px solid hsl(var(--border));
    padding: 0.5rem;
  }

  .markdown-content :global(hr) {
    margin: 2rem 0;
    border-color: hsl(var(--border));
  }
</style>