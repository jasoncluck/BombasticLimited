<script lang="ts">
  import GettingStarted from './getting-started.svx';
</script>

<div class="getting-started-page">
  <!-- Header -->
  <header class="border-border mb-8 border-b pb-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-foreground mb-2 text-4xl font-bold">Getting Started</h1>
        <p class="text-muted-foreground text-lg">
          Everything you need to know to master Bombastic
        </p>
      </div>

      <div class="flex gap-2">
        <a
          href="/"
          class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center rounded-md px-4 py-2 transition-colors"
        >
          ← Back to Bombastic
        </a>
      </div>
    </div>
  </header>

  <!-- Table of Contents -->
  <aside class="bg-muted/30 mb-8 rounded-lg p-6">
    <h2 class="text-foreground mb-4 text-xl font-semibold">
      Table of Contents
    </h2>
    <nav class="space-y-2">
      <a
        href="#quick-start"
        class="text-primary hover:text-primary/80 block transition-colors"
        >🚀 Quick Start</a
      >
      <a
        href="#key-features"
        class="text-primary hover:text-primary/80 block transition-colors"
        >📋 Key Features</a
      >
      <a
        href="#getting-the-most"
        class="text-primary hover:text-primary/80 block transition-colors"
        >🎯 Getting the Most Out of Bombastic</a
      >
      <a
        href="#advanced-features"
        class="text-primary hover:text-primary/80 block transition-colors"
        >🛠️ Advanced Features</a
      >
      <a
        href="#settings"
        class="text-primary hover:text-primary/80 block transition-colors"
        >🔧 Settings and Preferences</a
      >
      <a
        href="#community"
        class="text-primary hover:text-primary/80 block transition-colors"
        >🤝 Community and Support</a
      >
      <a
        href="#tips"
        class="text-primary hover:text-primary/80 block transition-colors"
        >🚨 Tips for Success</a
      >
      <a
        href="#mobile"
        class="text-primary hover:text-primary/80 block transition-colors"
        >📱 Mobile Experience</a
      >
      <a
        href="#privacy"
        class="text-primary hover:text-primary/80 block transition-colors"
        >🔐 Privacy and Security</a
      >
      <a
        href="#whats-next"
        class="text-primary hover:text-primary/80 block transition-colors"
        >🎉 What's Next?</a
      >
    </nav>
  </aside>

  <!-- Main Content -->
  <article class="prose prose-slate dark:prose-invert max-w-none">
    {GettingStarted}
  </article>

  <!-- Footer -->
  <footer class="border-border mt-12 border-t pt-8">
    <div
      class="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center"
    >
      <div>
        <p class="text-muted-foreground text-sm">
          Need more help? Check out our
          <a href="/support" class="text-primary hover:text-primary/80"
            >support center</a
          >
          or
          <a href="/contact" class="text-primary hover:text-primary/80"
            >contact us</a
          >.
        </p>
      </div>

      <div class="flex gap-4 text-sm">
        <a
          href="/docs"
          class="text-muted-foreground hover:text-foreground transition-colors"
          >Documentation</a
        >
        <a
          href="/api"
          class="text-muted-foreground hover:text-foreground transition-colors"
          >API Reference</a
        >
        <a
          href="/changelog"
          class="text-muted-foreground hover:text-foreground transition-colors"
          >Changelog</a
        >
      </div>
    </div>
  </footer>
</div>

<!-- <style> -->
<!--   .getting-started-page { -->
<!--     min-height: 100vh; -->
<!--   } -->
<!---->
<!--   /* Ensure the markdown content is responsive */ -->
<!--   :global(.markdown-content) { -->
<!--     width: 100%; -->
<!--   } -->
<!---->
<!--   /* Style the table of contents links */ -->
<!--   aside nav a { -->
<!--     padding-left: 1rem; -->
<!--     border-left: 2px solid transparent; -->
<!--     transition: border-color 0.2s ease; -->
<!--   } -->
<!---->
<!--   aside nav a:hover { -->
<!--     border-left-color: hsl(var(--primary) / 0.3); -->
<!--   } -->
<!---->
<!--   /* Responsive adjustments */ -->
<!--   @media (max-width: 768px) { -->
<!--     .getting-started-page header { -->
<!--       text-align: center; -->
<!--     } -->
<!---->
<!--     .getting-started-page header .flex { -->
<!--       flex-direction: column; -->
<!--       align-items: center; -->
<!--     } -->
<!--   } -->
<!-- </style> -->
