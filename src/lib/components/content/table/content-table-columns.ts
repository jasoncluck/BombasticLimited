import { renderComponent } from "$lib/components/ui/data-table";
import type { Video } from "$lib/supabase/videos";
import type { ColumnDef, Row } from "@tanstack/table-core";
import ContentTableTitle from "./content-table-title.svelte";
import ContentTableActions from "./content-table-actions.svelte";
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
  getCanHover,
  getIsSm,
  sectionId,
  supabase,
  session,
}: {
  getPlaylist: () => Playlist | undefined;
  getPlaylists: () => Playlist[];
  getContentFilter: () => CombinedContentFilter;
  getCanHover: () => boolean;
  getIsSm: () => boolean;
  sectionId: string;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}): ColumnDef<Video>[] {
  return [
    // Only show play column if canHover is true
    ...(getCanHover()
      ? [
          {
            accessorKey: "play",
            header: () => {
              return;
            },
            cell: ({ row }: { row: Row<Video> }) => {
              const video = row.original;
              return renderComponent(ContentTablePlay, {
                video,
                playlist: getPlaylist(),
                contentFilter: getContentFilter(),
                sectionId,
              });
            },
          },
        ]
      : []),

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
    // Only show description column if isSm is true (sm and up)
    ...(getIsSm()
      ? [
          {
            accessorKey: "description",
            cell: ({ row }: { row: Row<Video> }) => {
              const video = row.original;
              return renderComponent(ContentTableDescription, {
                video,
                sectionId,
              });
            },
          },
        ]
      : []),
    {
      accessorKey: "id",
      header: () => {
        return;
      },
      cell: ({ row }) => {
        const video = row.original;
        return renderComponent(ContentTableActions, {
          video,
          playlist: getPlaylist(),
          playlists: getPlaylists(),
          sectionId,
          variant: "list-items",
          session,
          supabase,
        });
      },
    },
  ];
}
