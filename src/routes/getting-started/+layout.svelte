<script lang="ts">
  import '../../app.css';
  
  let { children } = $props();
</script>

<svelte:head>
  <title>Getting Started - Bombastic</title>
  <meta name="description" content="Getting started guide for Bombastic" />
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
  <main class="container mx-auto px-4 py-8 max-w-4xl">
    {@render children()}
  </main>
</div>