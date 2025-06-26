import { renderComponent, renderSnippet } from "$lib/components/ui/data-table";
import type { Video } from "$lib/supabase/videos";
import type { ColumnDef } from "@tanstack/table-core";
import { createRawSnippet } from "svelte";
import ContentDropdown from "../content-dropdown.svelte";
import ContentTableTitle from "./content-table-title.svelte";
import ContentTableImage from "./content-table-image.svelte";
import type { Database } from "$lib/supabase/database.types";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Playlist } from "$lib/supabase/playlists";

export function createContentColumns({
  getPlaylist,
  getPlaylists, // Function that returns current playlists
  supabase,
  session,
}: {
  getPlaylist: () => Playlist;
  getPlaylists: () => Playlist[];
  session: Session | null;
  supabase: SupabaseClient<Database>;
}): ColumnDef<Video>[] {
  return [
    {
      accessorKey: "thumbnail_maxres_url",
      cell: ({ row }) => {
        const video = row.original;

        return renderComponent(ContentTableImage, {
          video,
        });
      },
      size: 120,
      enableSorting: false,
    },
    {
      accessorKey: "title",
      cell: ({ row }) => {
        const video = row.original;

        return renderComponent(ContentTableTitle, {
          video,
        });
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
                <p class="@2xl:line-clamp-2 hidden text-sm text-muted-foreground leading-relaxed break-words whitespace-normal"> ${row.getValue("description")} </p>
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
          playlist: getPlaylist(),
          playlists: getPlaylists(),
          session,
          supabase,
        });
      },
    },
  ];
}
