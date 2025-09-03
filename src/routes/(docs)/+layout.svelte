<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import '../../app.css';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<ScrollArea type="scroll" class="h-full grow" data-scroll-area="sidebar">
  <div class="bg-background-lighter text-foreground min-h-screen">
    <main class="prose prose-invert container mx-auto max-w-4xl! py-8">
      {@render children()}
    </main>
  </div>
</ScrollArea>

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

    /* Improve line spacing and text flow */
    line-height: 1.25;
    white-space: pre-wrap;
    max-width: none;
  }

  /* Integrate existing header styles from the design system */
  :global(.prose h1) {
    font-size: 1.875rem;
    font-weight: 600;
    transition: color 0.15s ease-in-out;
    color: var(--color-foreground);
    margin: 0 0 1rem 0;
  }

  @media (min-width: 1024px) {
    :global(.prose h1) {
      font-size: 2.25rem; /* lg:text-4xl */
    }
  }

  :global(.prose h2) {
    margin: 0.5rem 0 0 0;
    font-size: 1.5rem;
    font-weight: 600;
    transition: color 0.15s ease-in-out;
    color: var(--color-foreground);
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 0.25rem;
  }

  @media (min-width: 1024px) {
    :global(.prose h2) {
      font-size: 1.875rem; /* lg:text-3xl */
    }
  }

  :global(.prose h3) {
    margin: 0.5rem 0 0 0;
    font-size: 1.25rem; /* text-xl */
    font-weight: 600; /* font-semibold */
    transition: color 0.15s ease-in-out;
    color: var(--color-foreground);
  }

  @media (min-width: 1024px) {
    :global(.prose h3) {
      font-size: 1.5rem; /* lg:text-2xl */
    }
  }

  :global(.prose h4) {
    margin: 0.5rem 0 0 0;
    font-size: 1.125rem; /* text-lg */
    font-weight: 600;
    transition: color 0.15s ease-in-out;
    color: var(--color-foreground);
  }

  @media (min-width: 1024px) {
    :global(.prose h4) {
      font-size: 1.25rem; /* lg:text-xl */
    }
  }

  /* Improve paragraph spacing and preserve line breaks */
  :global(.prose p) {
    word-wrap: break-word;
  }

  /* Default list styling for regular content lists */
  :global(.prose ul, .prose ol) {
    padding-left: 1.5rem;
  }

  /* Ensure list style types are preserved */
  :global(.prose ul) {
    list-style-type: disc; /* Explicitly set bullet style */
  }

  :global(.prose ol) {
    list-style-type: decimal; /* Explicitly set number style */
  }

  :global(.prose li) {
    display: list-item; /* Ensure proper list item display */
  }

  /* Nested list styling for regular content */
  :global(.prose ul ul, .prose ol ol, .prose ul ol, .prose ol ul) {
    padding-left: 1.25rem;
  }

  /* Nested list style types */
  :global(.prose ul ul) {
    list-style-type: circle;
  }

  :global(.prose ul ul ul) {
    list-style-type: square;
  }

  :global(.prose ol ol) {
    list-style-type: lower-alpha;
  }

  :global(.prose ol ol ol) {
    list-style-type: lower-roman;
  }

  /* List marker styling */
  :global(.prose ul > li::marker) {
    color: var(--color-primary);
    font-size: 1em;
  }

  :global(.prose ol > li::marker) {
    color: var(--color-primary);
    font-weight: 600;
    font-size: 1em;
  }

  /* Special styling for Table of Contents */
  /* Target the first unordered list after an h2 (Table of Contents) */
  :global(.prose h2 + ul) {
    padding-left: 0;
    line-height: 0.9;
    list-style-type: none;
    border-left: 2px solid var(--color-border);
    padding: 1rem;
  }

  :global(.prose h2 + ul li) {
    margin: 0; /* Tight spacing between TOC items */
    position: relative;
  }

  :global(.prose h2 + ul li::before) {
    content: '•';
    color: var(--color-primary); /* Primary color for all TOC bullets */
    margin-right: 0.5rem;
    font-weight: bold;
  }

  /* Nested items in TOC */
  :global(.prose h2 + ul ul) {
    list-style-type: none;
    border-left: 1px solid var(--color-border);
    background-color: transparent;
    border-radius: 0;
    padding: 0.75rem 0 0 0.5rem;
  }

  :global(.prose h2 + ul ul li::before) {
    content: '•';
    color: var(--color-primary); /* Primary color for nested bullets too */
    font-weight: normal;
  }

  /* Third level nesting in TOC */
  :global(.prose h2 + ul ul ul) {
    border-left: 1px solid var(--color-border);
    margin: 0.125rem 0 0.125rem 0; /* Consistent tight spacing */
    padding: 0.75rem 0 0 0.5rem;
  }

  :global(.prose h2 + ul ul ul li::before) {
    content: '•';
    color: var(--color-primary); /* Primary color for third level too */
    font-weight: normal;
  }

  /* TOC links styling */
  :global(.prose h2 + ul a) {
    color: var(--color-foreground);
    text-decoration: none;
    font-weight: 500;
    transition: color 0.15s ease-in-out;
  }

  :global(.prose h2 + ul a:hover) {
    color: var(--color-primary);
    text-decoration: underline;
  }

  /* Code blocks with design system integration */
  :global(.prose pre) {
    background-color: var(--color-muted) !important;
    border: 1px solid var(--color-border);
    color: var(--color-foreground) !important;
    margin: 1rem 0;
    border-radius: 0.5rem;
    overflow-x: auto;
    padding: 1rem;
  }

  :global(.prose code) {
    background-color: var(--color-muted) !important;
    color: var(--color-foreground) !important;
    border: 1px solid var(--color-border);
    border-radius: 0.25rem;
    padding: 0.125rem 0.375rem;
    font-size: 0.875em;
    font-weight: 500;
  }

  /* Don't double-style code inside pre blocks */
  :global(.prose pre code) {
    background-color: transparent !important;
    border: none !important;
    padding: 0 !important;
    font-size: inherit;
    font-weight: inherit;
  }

  /* Better blockquote styling */
  :global(.prose blockquote) {
    border-left: 4px solid var(--color-primary);
    background-color: var(--color-muted);
    padding: 0.75rem 1rem;
    margin: 1rem 0;
    border-radius: 0.5rem;
    font-style: italic;
  }

  :global(.prose blockquote p) {
    margin: 0; /* No margins inside blockquotes */
  }

  /* Table improvements */
  :global(.prose table) {
    margin: 1rem 0;
    border-collapse: collapse;
    width: 100%;
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--color-border);
  }

  :global(.prose th, .prose td) {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border);
    text-align: left;
  }

  :global(.prose th) {
    background-color: var(--color-muted);
    font-weight: 600;
    border-bottom: 2px solid var(--color-border);
  }

  :global(.prose tbody tr:hover) {
    background-color: var(--color-muted);
  }

  /* Horizontal rule styling */
  :global(.prose hr) {
    margin: 2rem 0;
    border: none;
    height: 1px;
    background-color: var(--color-border);
  }

  /* Link styling improvements */
  :global(.prose a) {
    color: var(--color-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color 0.15s ease-in-out;
    font-weight: 500;
  }

  :global(.prose a:hover) {
    color: var(--color-primary);
    opacity: 0.8;
  }

  /* Strong and emphasis styling */
  :global(.prose strong) {
    color: var(--color-foreground);
    font-weight: 700;
  }

  :global(.prose em) {
    color: var(--color-foreground);
    font-style: italic;
  }

  /* Better spacing for the flex container in your markdown */
  :global(.prose .flex) {
    margin: 0; /* No extra margins for flex containers */
  }

  :global(.prose .flex.flex-col.gap-2) {
    gap: 0.5rem;
  }

  /* Remove default prose margins that conflict with our custom spacing */
  :global(.prose > :first-child) {
    margin-top: 0;
  }

  :global(.prose > :last-child) {
    margin-bottom: 0;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    :global(.prose h1) {
      font-size: 1.75rem;
    }

    :global(.prose h2) {
      font-size: 1.375rem;
    }

    :global(.prose h3) {
      font-size: 1.125rem;
    }

    :global(.prose h4) {
      font-size: 1rem;
    }
  }

  /* Print styles */
  @media print {
    :global(.prose) {
      color: black;
    }

    :global(.prose h1, .prose h2, .prose h3, .prose h4) {
      color: black;
      page-break-after: avoid;
    }

    :global(.prose a) {
      color: black;
      text-decoration: underline;
    }

    :global(.prose p) {
      margin-bottom: 0.375rem;
    }

    /* Hide TOC styling for print */
    :global(.prose h2 + ul) {
      background-color: transparent;
      border: none;
      padding: 0;
    }
  }
</style>
