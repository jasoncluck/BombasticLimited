<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb';

  export type BreadcrumbItem = {
    label: string;
    href?: string;
  };

  interface BreadcrumbProps {
    breadcrumbs: BreadcrumbItem[];
  }
  const { breadcrumbs }: BreadcrumbProps = $props();
</script>

<Breadcrumb.Root>
  <Breadcrumb.List class="overflow-hidden">
    {#each breadcrumbs as breadcrumb, i (breadcrumb.label)}
      <Breadcrumb.Item class="overflow-hidden">
        {#if breadcrumb.href}
          <Breadcrumb.Link
            href={breadcrumb.href}
            class="block max-w-full overflow-hidden text-xs text-ellipsis whitespace-nowrap"
          >
            {breadcrumb.label}
          </Breadcrumb.Link>
        {:else}
          <Breadcrumb.Page
            class="block max-w-full overflow-hidden text-xs text-ellipsis whitespace-nowrap"
          >
            {breadcrumb.label}
          </Breadcrumb.Page>
        {/if}
      </Breadcrumb.Item>
      {#if i < breadcrumbs.length - 1}
        <Breadcrumb.Separator />
      {/if}
    {/each}
  </Breadcrumb.List>
</Breadcrumb.Root>
