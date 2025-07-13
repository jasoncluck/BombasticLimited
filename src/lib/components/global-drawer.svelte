<script lang="ts">
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { getDrawerState } from "$lib/state/drawer.svelte";

  const drawerState = getDrawerState();
</script>

{#if drawerState.shouldRender}
  <Drawer.Root bind:open={drawerState.isOpen}>
    <Drawer.Content class="p-0">
      {#if drawerState.hasContent && drawerState.currentComponent}
        {#if drawerState.currentTitle}
          <Drawer.Header>
            <Drawer.Title>{drawerState.currentTitle}</Drawer.Title>
          </Drawer.Header>
        {/if}

        <div class="drawer-content">
          <svelte:component
            this={drawerState.currentComponent}
            {...drawerState.currentProps}
            {drawerState}
          />
        </div>
      {/if}
    </Drawer.Content>
  </Drawer.Root>
{/if}
