<script lang="ts">
  import * as Breadcrumb from "$lib/components/ui/breadcrumb";

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
  <Breadcrumb.List>
    {#each breadcrumbs as breadcrumb, i (breadcrumb.label)}
      <Breadcrumb.Item>
        {#if breadcrumb.href}
          <Breadcrumb.Link href={breadcrumb.href} class="text-xs">
            {breadcrumb.label}
          </Breadcrumb.Link>
        {:else}
          <Breadcrumb.Page class="text-xs">{breadcrumb.label}</Breadcrumb.Page>
        {/if}
      </Breadcrumb.Item>
      {#if i < breadcrumbs.length - 1}
        <Breadcrumb.Separator />
      {/if}
    {/each}
  </Breadcrumb.List>
</Breadcrumb.Root>
