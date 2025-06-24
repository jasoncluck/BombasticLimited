import { renderSnippet } from "$lib/components/ui/data-table";
import type { Video } from "$lib/supabase/videos";
import type { ColumnDef } from "@tanstack/table-core";
import { createRawSnippet } from "svelte";

// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type Payment = {
  id: string;
  amount: number;
  status: "pending" | "processing" | "success" | "failed";
  email: string;
};

export const columns: ColumnDef<Video>[] = [
  {
    accessorKey: "thumbnail_maxres_url",
    header: () => {
      return;
    },
    cell: ({ row }) => {
      const videoThumbnailSnippet = createRawSnippet<[string]>(() => {
        return {
          render: () =>
            `
            <div class="h-auto w-24 aspect-[16/9] flex-shrink-0">
                <img src="${row.getValue("thumbnail_maxres_url")}" class="w-full h-full object-cover rounded" alt="Video thumbnail" loading="lazy" />
            </div>
            `,
        };
      });

      return renderSnippet(videoThumbnailSnippet);
    },
    size: 120,
    enableSorting: false,
  },
  {
    accessorKey: "title",
    header: () => {
      const snippet = createRawSnippet<[string]>(() => {
        return {
          render: () =>
            `
              <span class="text-xs"> Title</span>
            `,
        };
      });

      return renderSnippet(snippet);
    },
    cell: ({ row }) => {
      const snippet = createRawSnippet<[string]>(() => {
        return {
          render: () =>
            `
            <div class="min-w-[200px] max-w-xs">
              <p class="text-sm  break-words whitespace-normal"> ${row.getValue("title")} </p>
            </div>
            `,
        };
      });

      return renderSnippet(snippet);
    },
  },
  {
    accessorKey: "description",

    header: () => {
      const snippet = createRawSnippet<[string]>(() => {
        return {
          render: () =>
            `
              <span class="text-xs">Description</span>
            `,
        };
      });
      return renderSnippet(snippet);
    },
    cell: ({ row }) => {
      const videoDescriptionSnippet = createRawSnippet<[string]>(() => {
        return {
          render: () =>
            `
            <div class="min-w-0 max-w-xs">
              <p class="text-sm text-muted-foreground leading-relaxed break-words whitespace-normal line-clamp-2"> ${row.getValue("description")} </p>
            </div>
            `,
        };
      });

      return renderSnippet(videoDescriptionSnippet);
    },
  },
  {
    accessorKey: "id",
    header: () => {
      return;
    },
    cell: ({ row }) => {
      const snippet = createRawSnippet<[string]>(() => {
        return {
          render: () =>
            `
            <Ellipsis />
            `,
        };
      });

      return renderSnippet(snippet);
    },
  },
];
