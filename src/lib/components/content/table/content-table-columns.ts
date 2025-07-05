import { renderComponent } from "$lib/components/ui/data-table";
import type { Video } from "$lib/supabase/videos";
import type { ColumnDef } from "@tanstack/table-core";
import ContentActionsDropdown from "../content-actions-dropdown.svelte";
import ContentTableTitle from "./content-table-title.svelte";
import ContentTableImage from "./content-table-image.svelte";
import type { Database } from "$lib/supabase/database.types";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Playlist } from "$lib/supabase/playlists";
import ContentTableDescription from "./content-table-description.svelte";
import ContentTablePlay from "./content-table-play.svelte";
import type { CombinedContentFilter } from "../content-filter";

export function createContentColumns({
  getPlaylist,
  getPlaylists,
  getContentFilter,
  supabase,
  session,
}: {
  getPlaylist: () => Playlist | undefined;
  getPlaylists: () => Playlist[];
  getContentFilter: () => CombinedContentFilter;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}): ColumnDef<Video>[] {
  return [
    {
      accessorKey: "play",
      header: () => {
        return;
      },
      cell: ({ row }) => {
        const video = row.original;

        return renderComponent(ContentTablePlay, {
          video,
          playlist: getPlaylist(),
          contentFilter: getContentFilter(),
        });
      },
    },
    {
      accessorKey: "thumbnail_maxres_url",
      cell: ({ row }) => {
        const video = row.original;

        return renderComponent(ContentTableImage, {
          video,
        });
      },
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
        const video = row.original;

        return renderComponent(ContentTableDescription, {
          video,
        });
      },
    },
    {
      accessorKey: "id",
      header: () => {
        return;
      },
      cell: ({ row }) => {
        const video = row.original;

        return renderComponent(ContentActionsDropdown, {
          videos: [video],
          playlist: getPlaylist(),
          playlists: getPlaylists(),
          variant: "list-items",
          session,
          supabase,
        });
      },
    },
  ];
}
