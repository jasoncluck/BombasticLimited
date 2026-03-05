import { renderComponent } from '$lib/components/ui/data-table';
import type { Video } from '$lib/supabase/videos';
import type { ColumnDef, Row } from '@tanstack/table-core';
import ContentTableTitle from './content-table-title.svelte';
import ContentTableActions from './content-table-actions.svelte';
import ContentTableImage from './content-table-image.svelte';
import type { Database } from '$lib/supabase/database.types';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Playlist } from '$lib/supabase/playlists';
import ContentTableDescription from './content-table-description.svelte';
import ContentTablePlay from './content-table-play.svelte';
import type { CombinedContentFilter } from '../content-filter';

export function createContentColumns({
  getPlaylist,
  getPlaylists,
  getContentFilter,
  getCanHover,
  getIsSm,
  getIsContinueVideos,
  sectionId,
  supabase,
  session,
}: {
  getPlaylist: () => Playlist | undefined;
  getPlaylists: () => Playlist[];
  getVideos: () => Video[];
  getCanHover: () => boolean;
  getIsSm: () => boolean;
  getIsContinueVideos: () => boolean;
  getContentFilter: () => CombinedContentFilter;
  sectionId: string;
  session: Session | null;
  supabase: SupabaseClient<Database>;
}): ColumnDef<Video>[] {
  return [
    ...(getCanHover()
      ? [
          {
            accessorKey: 'play',
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
      accessorKey: 'image_url',
      id: 'image',
      cell: ({ row }) => {
        const video = row.original;
        return renderComponent(ContentTableImage, {
          video,
          supabase,
          index: row.index,
        });
      },
      enableSorting: false,
    },
    {
      accessorKey: 'title',
      cell: ({ row }) => {
        const video = row.original;
        return renderComponent(ContentTableTitle, {
          video,
          isContinueVideos: getIsContinueVideos(),
        });
      },
    },
    ...(getIsSm()
      ? [
          {
            accessorKey: 'description',
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
      accessorKey: 'id',
      header: () => {
        return;
      },
      cell: ({ row }) => {
        const video = row.original;
        return renderComponent(ContentTableActions, {
          videos: [video],
          playlist: getPlaylist(),
          playlists: getPlaylists(),
          sectionId,
          session,
          supabase,
        });
      },
    },
  ];
}
