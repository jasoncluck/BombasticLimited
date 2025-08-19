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
    @apply text-4xl font-bold mb-6 text-foreground border-b border-border pb-2;
  }

  .markdown-content :global(h2) {
    @apply text-3xl font-semibold mb-4 text-foreground mt-8;
  }

  .markdown-content :global(h3) {
    @apply text-2xl font-semibold mb-3 text-foreground mt-6;
  }

  .markdown-content :global(h4) {
    @apply text-xl font-semibold mb-2 text-foreground mt-4;
  }

  .markdown-content :global(p) {
    @apply mb-4 text-foreground leading-7;
  }

  .markdown-content :global(ul) {
    @apply mb-4 ml-6 list-disc;
  }

  .markdown-content :global(ol) {
    @apply mb-4 ml-6 list-decimal;
  }

  .markdown-content :global(li) {
    @apply mb-2 text-foreground;
  }

  .markdown-content :global(a) {
    @apply text-primary hover:text-primary/80 underline;
  }

  .markdown-content :global(code) {
    @apply bg-muted px-2 py-1 rounded text-sm font-mono;
  }

  .markdown-content :global(pre) {
    @apply bg-muted p-4 rounded-lg overflow-x-auto mb-4;
  }

  .markdown-content :global(pre code) {
    @apply bg-transparent p-0;
  }

  .markdown-content :global(blockquote) {
    @apply border-l-4 border-primary pl-4 italic text-muted-foreground mb-4;
  }

  .markdown-content :global(table) {
    @apply w-full border-collapse border border-border mb-4;
  }

  .markdown-content :global(th) {
    @apply border border-border p-2 bg-muted font-semibold text-left;
  }

  .markdown-content :global(td) {
    @apply border border-border p-2;
  }

  .markdown-content :global(hr) {
    @apply my-8 border-border;
  }
</style>