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

export function createContentColumns({
  getPlaylist,
  getPlaylists, // Function that returns current playlists
  supabase,
  session,
}: {
  getPlaylist: () => Playlist | undefined;
  getPlaylists: () => Playlist[];
  isSelected: boolean;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}): ColumnDef<Video>[] {
  return [
    {
      accessorKey: "selected",
      header: () => {
        return;
      },
      cell: ({ row }) => {
        const video = row.original;

        return renderComponent(ContentTablePlay, {
          video,
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
          session,
          supabase,
        });
      },
    },
  ];
}
