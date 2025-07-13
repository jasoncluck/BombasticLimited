<script lang="ts">
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { buttonVariants } from "$lib/components/ui/button";
  import { getDrawerState } from "$lib/state/drawer.svelte";
  import { Loader } from "@lucide/svelte";

  const drawerState = getDrawerState();

  function handleOpenChange(open: boolean) {
    if (!open && drawerState.isOpen) {
      drawerState.onClosed();
    }
  }
</script>

{#if drawerState.shouldRender}
  <Drawer.Root
    bind:open={drawerState.isOpen}
    onOpenChange={handleOpenChange}
    handleOnly={drawerState.options.handleOnly}
    nested={drawerState.options.nested}
  >
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
            <svelte:component
              this={drawerState.currentComponent}
              {...drawerState.currentProps}
              {drawerState}
            />
          {/if}
        </div>

        <!-- Always render footer for full height -->
        <div class="flex-shrink-0 p-4 pt-2 border-t bg-background">
          <div class="flex flex-col gap-2">
            <!-- Submit button (if form is present) -->
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

            <!-- Close button -->
            {#if drawerState.options.showCloseButton}
              <Drawer.Close
                class={buttonVariants({
                  class: "drawer-button-footer",
                  variant: drawerState.options.closeButtonVariant,
                })}
              >
                {drawerState.options.closeButtonText}
              </Drawer.Close>
            {/if}
          </div>
        </div>
      </Drawer.Content>
    {:else}
      <!-- Standard drawer layout -->
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
            <svelte:component
              this={drawerState.currentComponent}
              {...drawerState.currentProps}
              {drawerState}
            />
          {/if}
        </div>

        <!-- Footer for standard layout -->
        <div class="p-4 pt-2 border-t bg-background">
          <div class="flex flex-col gap-2">
            <!-- Submit button (if form is present) -->
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

            <!-- Close button -->
            {#if drawerState.options.showCloseButton}
              <Drawer.Close
                class={buttonVariants({
                  class: "drawer-button-footer",
                  variant: drawerState.options.closeButtonVariant,
                })}
              >
                {drawerState.options.closeButtonText}
              </Drawer.Close>
            {/if}
          </div>
        </div>
      </Drawer.Content>
    {/if}
  </Drawer.Root>
{/if}
