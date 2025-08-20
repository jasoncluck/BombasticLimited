<script lang="ts">
  import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
  import '../../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>Getting Started - Bombastic</title>
  <meta name="description" content="Bombastic - Getting Started" />
</svelte:head>

<ScrollArea type="scroll" class="h-full grow" data-scroll-area="sidebar">
  <div class="bg-background-lighter text-foreground min-h-screen">
    <main class="container mx-auto max-w-4xl px-4 py-8">
      {@render children()}
    </main>
  </div>
</ScrollArea>
