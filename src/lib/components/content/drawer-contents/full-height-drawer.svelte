<script lang="ts">
  import { buttonVariants } from "$lib/components/ui/button";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { type Snippet } from "svelte";

  let {
    title,
    subtitle,
    onClose,
    triggerClass = "drawer-button",
    triggerVariant = "ghost",
    handleOnly = true,
    trigger,
    header,
    children,
    footer,
  }: {
    title: string;
    subtitle?: string;
    onClose?: () => void;
    triggerClass?: string;
    triggerVariant?:
      | "default"
      | "destructive"
      | "outline"
      | "secondary"
      | "ghost"
      | "link";
    handleOnly?: boolean;
    trigger: Snippet;
    header?: Snippet;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  let open = $state(false);
</script>

<Drawer.NestedRoot bind:open {onClose} {handleOnly}>
  <Drawer.Trigger
    class={buttonVariants({
      variant: triggerVariant,
      class: triggerClass,
    })}
  >
    {@render trigger()}
  </Drawer.Trigger>

  <Drawer.Content class="bg-background flex flex-col min-h-[100%] drawer">
    <!-- Header Section -->
    <div class="flex-shrink-0 p-4 pb-0">
      <Drawer.Header class="px-0">
        <Drawer.Title class="text-xl">{title}</Drawer.Title>
        {#if subtitle}
          <p class="text-sm text-muted-foreground mt-1">{subtitle}</p>
        {/if}
        {#if header}
          {@render header()}
        {/if}
      </Drawer.Header>
    </div>

    <!-- Body Section - Scrollable -->
    <div class="flex-1 overflow-y-auto p-1 min-h-0">
      {@render children()}
    </div>

    <!-- Footer Section -->
    <div class="flex-shrink-0 p-4 pt-2 border-t bg-background">
      <div class="flex flex-col gap-2">
        {#if footer}
          {@render footer()}
        {:else}
          <Drawer.Close
            class={buttonVariants({
              class: "drawer-button-footer",
              variant: "outline",
            })}
          >
            Close
          </Drawer.Close>
        {/if}
      </div>
    </div>
  </Drawer.Content>
</Drawer.NestedRoot>
