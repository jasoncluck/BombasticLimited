<script lang="ts">
  import { buttonVariants } from '$lib/components/ui/button';
  import * as Drawer from '$lib/components/ui/drawer/index.js';
  import { type Snippet } from 'svelte';

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
  }: {
    title: string;
    subtitle?: string;
    nested?: boolean;
    onClose?: () => void;
    open: boolean;
    triggerClass?: string;
    triggerVariant?:
      | 'default'
      | 'destructive'
      | 'outline'
      | 'secondary'
      | 'ghost'
      | 'link';
    handleOnly?: boolean;
    trigger: Snippet;
    header?: Snippet;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<Drawer.Root bind:open {onClose} {handleOnly} {nested}>
  <Drawer.Trigger class="outline-hiddden">
    {@render trigger()}
  </Drawer.Trigger>

  <Drawer.Content class="bg-background drawer flex min-h-[100%] flex-col">
    <div class="flex-shrink-0 p-4 pb-0">
      <Drawer.Header class="px-0">
        <Drawer.Title class="text-xl">{title}</Drawer.Title>
        {#if subtitle}
          <p class="text-muted-foreground mt-1 text-sm">{subtitle}</p>
        {/if}
        {#if header}
          {@render header()}
        {/if}
      </Drawer.Header>
    </div>

    <div class="min-h-0 overflow-auto">
      {@render children()}
    </div>

    <div class="bg-background flex-shrink-0 border-t p-4 pt-2">
      <div class="flex flex-col gap-2">
        {#if footer}
          {@render footer()}
        {:else}
          <Drawer.Footer class="drawer-footer">
            <Drawer.Close
              class={buttonVariants({
                class: 'drawer-button-footer',
                variant: 'outline',
              })}
            >
              Close
            </Drawer.Close>
          </Drawer.Footer>
        {/if}
      </div>
    </div>
  </Drawer.Content>
</Drawer.Root>
