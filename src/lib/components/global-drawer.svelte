<script lang="ts">
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { buttonVariants } from "$lib/components/ui/button";
  import { getDrawerState } from "$lib/state/drawer.svelte";
  import { Loader } from "@lucide/svelte";

  const drawerState = getDrawerState();

  // Create a local state that syncs with drawer state but allows for animation delays
  let internalOpen = $state(false);
  let isClosing = $state(false);

  // Sync internal state with drawer state
  $effect(() => {
    if (drawerState.isOpen && !internalOpen) {
      // Opening - immediate
      internalOpen = true;
      isClosing = false;
    } else if (!drawerState.isOpen && internalOpen && !isClosing) {
      // Closing - let animation complete first
      isClosing = true;
      // Don't immediately set internalOpen to false - let handleOpenChange do it
    }
  });

  function handleOpenChange(open: boolean) {
    if (!open && internalOpen) {
      // Animation is complete, now we can safely close
      internalOpen = false;
      isClosing = false;

      // Only call close if we still have drawers (avoid double-closing)
      if (drawerState.isOpen) {
        drawerState.close();
      }
    }
  }

  function handleCloseClick() {
    // Start the closing process
    drawerState.close();
  }

  $effect(() => {
    if (drawerState.options) {
      console.log(drawerState.options);
    }
  });
</script>

{#if drawerState.shouldRender}
  <Drawer.Root
    open={internalOpen}
    onOpenChange={handleOpenChange}
    handleOnly={drawerState.options.handleOnly}
    nested={drawerState.options.nested}
  >
    <!-- Rest of your component stays the same, just replace Drawer.Close with buttons -->
    {#if drawerState.options.fullHeight}
      <!-- Full height drawer layout -->
      <Drawer.Content class="bg-background flex flex-col min-h-[100%] drawer">
        <div class="flex-shrink-0 p-4 pb-0">
          <Drawer.Header class="px-0">
            {#if drawerState.currentTitle}
              <Drawer.Title class="text-xl"
                >{drawerState.currentTitle}</Drawer.Title
              >
            {/if}
            {#if drawerState.currentSubtitle}
              <p class="text-sm text-muted-foreground mt-1">
                {drawerState.currentSubtitle}
              </p>
            {/if}
          </Drawer.Header>
        </div>

        <div class="flex-1 overflow-y-auto p-1 min-h-0">
          {#if drawerState.hasContent && drawerState.currentComponent}
            {@const Component = drawerState.currentComponent}
            <Component {...drawerState.currentProps} {drawerState} />
          {/if}
        </div>

        <div class="flex-shrink-0 p-4 pt-2 border-t bg-background">
          <div class="flex flex-col gap-2">
            {#if drawerState.options.showSubmitButton && drawerState.options.formId}
              <button
                type="submit"
                form={drawerState.options.formId}
                class={buttonVariants({
                  class: "drawer-button-footer",
                  variant: drawerState.options.submitButtonVariant,
                })}
                disabled={drawerState.options.isSubmitting}
              >
                {#if drawerState.options.isSubmitting}
                  <Loader class="animate-spin h-4 w-4 mr-2" />
                {/if}
                {drawerState.options.submitButtonText}
              </button>
            {/if}

            {#if drawerState.options.showCloseButton}
              <button
                type="button"
                onclick={handleCloseClick}
                class={buttonVariants({
                  class: "drawer-button-footer",
                  variant: drawerState.options.closeButtonVariant,
                })}
              >
                {drawerState.options.closeButtonText}
              </button>
            {/if}
          </div>
        </div>
      </Drawer.Content>
    {:else}
      <!-- Standard drawer layout with same button fixes -->
      <Drawer.Content class="p-0">
        {#if drawerState.currentTitle}
          <Drawer.Header>
            <Drawer.Title>{drawerState.currentTitle}</Drawer.Title>
            {#if drawerState.currentSubtitle}
              <p class="text-sm text-muted-foreground mt-1">
                {drawerState.currentSubtitle}
              </p>
            {/if}
          </Drawer.Header>
        {/if}

        <div class="drawer-content-wrapper">
          {#if drawerState.hasContent && drawerState.currentComponent}
            {@const Component = drawerState.currentComponent}
            <Component {...drawerState.currentProps} {drawerState} />
          {/if}
        </div>

        <div class="p-4 pt-2 border-t bg-background">
          <div class="flex flex-col gap-2">
            {#if drawerState.options.showSubmitButton && drawerState.options.formId}
              <button
                type="submit"
                form={drawerState.options.formId}
                class={buttonVariants({
                  class: "drawer-button-footer",
                  variant: drawerState.options.submitButtonVariant,
                })}
                disabled={drawerState.options.isSubmitting}
              >
                {#if drawerState.options.isSubmitting}
                  <Loader class="animate-spin h-4 w-4 mr-2" />
                {/if}
                {drawerState.options.submitButtonText}
              </button>
            {/if}

            {#if drawerState.options.showCloseButton}
              <button
                type="button"
                onclick={handleCloseClick}
                class={buttonVariants({
                  class: "drawer-button-footer",
                  variant: drawerState.options.closeButtonVariant,
                })}
              >
                {drawerState.options.closeButtonText}
              </button>
            {/if}
          </div>
        </div>
      </Drawer.Content>
    {/if}
  </Drawer.Root>
{/if}
