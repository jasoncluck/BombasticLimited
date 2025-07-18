<script lang="ts">
  import { buttonVariants } from "$lib/components/ui/button";
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import { type Snippet } from "svelte";

  let {
    title,
    subtitle,
    onClose,
    handleOnly = true,
    nested = false,
    trigger,
    open = $bindable(false),
    header,
    children,
    footer,
    disabled = false,
    formProps = null, // Add this prop for form attributes
  }: {
    title: string;
    subtitle?: string;
    nested?: boolean;
    onClose?: () => void;
    open: boolean;
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
    disabled?: boolean;
    formProps?: {
      method: string;
      action?: string;
      use?: any;
      id?: string;
    } | null;
  } = $props();
</script>

<Drawer.Root bind:open {onClose} {handleOnly} {nested}>
  {#if disabled}
    <div class="outline-none">
      {@render trigger()}
    </div>
  {:else}
    <Drawer.Trigger class="outline-none">
      {@render trigger()}
    </Drawer.Trigger>
  {/if}

  <Drawer.Content class="bg-background flex flex-col min-h-[100%] drawer">
    {#if formProps}
      <form {...formProps} class="flex flex-col h-full">
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

        <div class="flex-1 overflow-y-auto p-1 min-h-0">
          {@render children()}
        </div>

        <div class="flex-shrink-0 p-4 pt-2 border-t bg-background">
          <div class="flex flex-col gap-2">
            {#if footer}
              {@render footer()}
            {:else}
              <Drawer.Footer class="drawer-footer">
                <Drawer.Close
                  class={buttonVariants({
                    class: "drawer-button-footer",
                    variant: "outline",
                  })}
                >
                  Close
                </Drawer.Close>
              </Drawer.Footer>
            {/if}
          </div>
        </div>
      </form>
    {:else}
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

      <div class="flex-1 overflow-y-auto p-1 min-h-0">
        {@render children()}
      </div>

      <div class="flex-shrink-0 p-4 pt-2 border-t bg-background">
        <div class="flex flex-col gap-2">
          {#if footer}
            {@render footer()}
          {:else}
            <Drawer.Footer class="drawer-footer">
              <Drawer.Close
                class={buttonVariants({
                  class: "drawer-button-footer",
                  variant: "outline",
                })}
              >
                Close
              </Drawer.Close>
            </Drawer.Footer>
          {/if}
        </div>
      </div>
    {/if}
  </Drawer.Content>
</Drawer.Root>
