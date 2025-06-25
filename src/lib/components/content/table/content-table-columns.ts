import { renderComponent, renderSnippet } from "$lib/components/ui/data-table";
import type { Video } from "$lib/supabase/videos";
import type { ColumnDef } from "@tanstack/table-core";
import { createRawSnippet } from "svelte";
import ContentDropdown from "../content-dropdown.svelte";
import type { Database } from "$lib/supabase/database.types";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Playlist } from "$lib/supabase/playlists";

export function createContentColumns({
  playlist,
  playlists,
  supabase,
  session,
}: {
  playlist: Playlist | undefined;
  playlists: Playlist[];
  session: Session | null;
  supabase: SupabaseClient<Database>;
}): ColumnDef<Video>[] {
  return [
    {
      accessorKey: "thumbnail_maxres_url",
      cell: ({ row }) => {
        const videoThumbnailSnippet = createRawSnippet<[string]>(() => {
          return {
            render: () =>
              `
              <div class="w-24  flex-shrink-0">
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
      cell: ({ row }) => {
        const snippet = createRawSnippet<[string]>(() => {
          return {
            render: () =>
              `
              <div class="min-w-[100px] max-w-xs">
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
      cell: ({ row }) => {
        const videoDescriptionSnippet = createRawSnippet<[string]>(() => {
          return {
            render: () =>
              `
              <div class="min-w-0 max-w-xs">
                <p class="@lg:line-clamp-2 hidden text-sm text-muted-foreground leading-relaxed break-words whitespace-normal"> ${row.getValue("description")} </p>
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
        const video = row.original;

        return renderComponent(ContentDropdown, {
          videos: [video],
          playlist,
          playlists,
          session,
          supabase,
        });
      },
    },
  ];
}
