<script lang="ts">
  import { Circle, ListVideo, Youtube } from '@lucide/svelte';
  import type { SuperValidated } from 'sveltekit-superforms';
  import type { PlaylistSchema } from '../../../routes/playlist/[shortId]/schema';
  import type { BreadcrumbItem } from '$lib/components/breadcrumb-layout.svelte';
  import type { PlaylistVideosFilter } from '$lib/components/content/content-filter';
  import {
    type ProfilePlaylist,
    type UserPlaylist,
  } from '$lib/supabase/playlists';
  import type { Session, SupabaseClient } from '@supabase/supabase-js';
  import type { Database } from '$lib/supabase/database.types';
  import type { HTMLAttributes } from 'svelte/elements';
  import SharedContentHeader from '$lib/components/content/shared-content-header.svelte';
  import PlaylistEditDialog from '$lib/components/playlist/playlist-edit-dialog.svelte';
  import { isSource, SOURCE_INFO } from '$lib/constants/source';
  import type { Video } from '$lib/supabase/videos';
  import type { UserProfile } from '$lib/supabase/user-profiles';
  import PlaylistEditDrawer from '$lib/components/playlist/playlist-edit-drawer.svelte';
  import { getPlaylistState } from '$lib/state/playlist.svelte';
  import { getMediaQueryState } from '$lib/state/media-query.svelte';

  interface PlaylistHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    contentFilter: PlaylistVideosFilter;
    form: SuperValidated<PlaylistSchema>;
    playlist: ProfilePlaylist | UserPlaylist;
    videos: Video[];
    playlistDuration: { hours: number; minutes: number; seconds: number };
    videosCount: number;
    userProfile: UserProfile | null;
    currentPage: number;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  }

  let {
    breadcrumbs,
    showFloatingBreadcrumbs = $bindable(),
    contentFilter,
    form,
    playlist,
    videos,
    playlistDuration,
    videosCount,
    currentPage,
    userProfile,
    supabase,
    session,
    ...props
  }: PlaylistHeaderProps = $props();

  const playlistState = getPlaylistState();
  const mediaQueryState = getMediaQueryState();

  let open = $state(false);
  let drawerOpen = $state(false);

  const isPlaylistOwner = $derived(playlist?.created_by === session?.user.id);

  $effect(() => {
    if (playlistState.openEditPlaylist) {
      if (!isPlaylistOwner) {
        return;
      }
      if (mediaQueryState.canHover) {
        open = true;
      }
      drawerOpen = true;
    }
  });

  const formattedDuration = $derived.by(() => {
    const parts = [];
    if (playlistDuration.hours > 0) parts.push(`${playlistDuration.hours} hr`);
    if (playlistDuration.minutes > 0)
      parts.push(`${playlistDuration.minutes} min`);
    return parts.join(', ');
  });

  const videosLabel = $derived(
    `${videosCount} ${videosCount === 1 ? 'video' : 'videos'}`
  );
  const showComma = $derived(formattedDuration.length > 0);
</script>

<SharedContentHeader
  {breadcrumbs}
  bind:showFloatingBreadcrumbs
  bind:open
  view="playlist"
  {videosCount}
  {contentFilter}
  {playlist}
  {videos}
  bind:currentPage
  {userProfile}
  {supabase}
  {session}
  {...props}
>
  <div class="m-4 mb-8 flex flex-col">
    <div class="playlist-header-content">
      <!-- Desktop/Hover layout -->
      {#if mediaQueryState.canHover}
        <div class="hover-layout">
          <div class="flex flex-col gap-4 md:flex-row">
            <div class="flex justify-center">
              <PlaylistEditDialog
                {form}
                {playlist}
                formId="playlist-dialog-image-form"
                {session}
                bind:open
              >
                {#snippet trigger()}
                  {#if playlist.processedImageUrl}
                    <div
                      class="flex h-56 w-56 items-center justify-center {isPlaylistOwner &&
                        'cursor-pointer'} border-none bg-transparent p-0"
                    >
                      <img
                        src={playlist.processedImageUrl}
                        alt={`Image for playlist: ${playlist.name}`}
                      />
                    </div>
                  {:else}
                    <div
                      class="flex h-56 min-h-32 w-56 min-w-32 items-center justify-center {isPlaylistOwner &&
                        'cursor-pointer'}border-none bg-transparent p-0"
                    >
                      <ListVideo size={128} />
                    </div>
                  {/if}
                {/snippet}
              </PlaylistEditDialog>
            </div>

            <div class="relative mt-4 flex min-w-2xs flex-1 flex-col">
              <PlaylistEditDialog
                {form}
                {playlist}
                {session}
                formId="playlist-dialog-description-form"
                bind:open
              >
                {#snippet trigger()}
                  <div
                    class="flex flex-col {isPlaylistOwner && 'cursor-pointer'} 
            items-start border-none bg-transparent p-0 text-left"
                  >
                    <p class="text-muted-foreground text-sm tracking-tight">
                      {playlist.type === 'Public'
                        ? 'Public Playlist'
                        : 'Private Playlist'}
                    </p>
                    <h2
                      class="header-playlist break-anywhere font-extrabold tracking-tight text-wrap"
                    >
                      {playlist.name}
                    </h2>

                    {#if playlist.description && playlist.description.length > 1}
                      <p
                        class="text-muted-foreground mb-2 text-left text-sm break-all"
                      >
                        {playlist.description}
                      </p>
                    {/if}
                  </div>
                {/snippet}
              </PlaylistEditDialog>

              <!-- Username, video count and duration - kept in original position for hover -->
              <div class="mt-0 flex flex-wrap items-start gap-2">
                {#if playlist.profile_username}
                  {#if isSource(playlist.profile_username)}
                    {@const sourceInfo = SOURCE_INFO[playlist.profile_username]}
                    <div class="flex items-center gap-2">
                      <img
                        alt={`${sourceInfo.displayName} playlist`}
                        class="h-6 w-6"
                        src={sourceInfo.image}
                      />
                      <p class="text-sm">
                        {sourceInfo.displayName}
                      </p>
                      <Circle
                        size="5"
                        class="stroke-muted-foreground fill-muted-foreground shrink-0 justify-center self-center"
                      />
                      <a
                        href="https://www.youtube.com/playlist?list={playlist.youtube_id}"
                        class="flex gap-2 hover:underline"
                      >
                        <Youtube
                          size="20"
                          class="stroke-muted-foreground shrink-0 justify-center"
                        />
                        <p class="text-sm">YouTube</p>
                      </a>
                    </div>
                  {:else}
                    <p class="text-sm">{playlist.profile_username}</p>
                  {/if}
                  <Circle
                    size="5"
                    class="stroke-muted-foreground fill-muted-foreground shrink-0 self-center"
                  />
                {/if}
                <p class="text-muted-foreground text-sm">
                  {videosLabel}{showComma ? ', ' : ''}
                  {formattedDuration}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Mobile/Touch layout -->
      {:else}
        <div class="touch-layout">
          <div class="flex flex-col gap-4">
            <div class="flex justify-center">
              <PlaylistEditDrawer
                {form}
                {playlist}
                formId="playlist-drawer-image-form"
                {session}
                bind:open={drawerOpen}
              >
                {#snippet trigger()}
                  {#if playlist.processedImageUrl}
                    <div
                      class="flex h-56 w-56 items-center justify-center {isPlaylistOwner &&
                        'cursor-pointer'} border-none bg-transparent p-0"
                    >
                      <img
                        src={playlist.processedImageUrl}
                        alt={`Image for playlist: ${playlist.name}`}
                      />
                    </div>
                  {:else}
                    <div
                      class="flex h-56 min-h-32 w-56 min-w-32 items-center justify-center {isPlaylistOwner &&
                        'cursor-pointer'}border-none bg-transparent p-0"
                    >
                      <ListVideo size={128} />
                    </div>
                  {/if}
                {/snippet}
              </PlaylistEditDrawer>
            </div>

            <div class="relative flex min-w-2xs flex-1 flex-col">
              <PlaylistEditDrawer
                {form}
                {playlist}
                formId="playlist-drawer-description-form"
                {session}
                bind:open={drawerOpen}
              >
                {#snippet trigger()}
                  <div
                    class="flex flex-col {isPlaylistOwner && 'cursor-pointer'} 
            items-start border-none bg-transparent p-0 text-left"
                  >
                    <p class="text-muted-foreground text-sm tracking-tight">
                      {playlist.type === 'Public'
                        ? 'Public Playlist'
                        : 'Private Playlist'}
                    </p>
                    <h2
                      class="header-playlist break-anywhere font-extrabold text-wrap"
                    >
                      {playlist.name}
                    </h2>
                    {#if playlist.description && playlist.description.length > 1}
                      <p
                        class="text-muted-foreground text-left text-sm break-all"
                      >
                        {playlist.description}
                      </p>
                    {/if}
                  </div>
                {/snippet}
              </PlaylistEditDrawer>

              <!-- Username, video count and duration for mobile -->
              <div class="mt-2 flex flex-wrap items-start gap-2">
                {#if playlist.profile_username}
                  {#if isSource(playlist.profile_username)}
                    {@const sourceInfo = SOURCE_INFO[playlist.profile_username]}
                    <div class="flex items-center gap-2">
                      <img
                        alt={`${sourceInfo.displayName} playlist`}
                        class="h-6 w-6"
                        src={sourceInfo.image}
                      />
                      <p class="text-sm">
                        {sourceInfo.displayName}
                      </p>
                      <Circle
                        size="5"
                        class="stroke-muted-foreground fill-muted-foreground shrink-0 justify-center self-center"
                      />
                      <a
                        href="https://www.youtube.com/playlist?list={playlist.youtube_id}"
                        class="flex gap-2"
                      >
                        <Youtube
                          size="20"
                          class="stroke-muted-foreground shrink-0 justify-center"
                        />
                        <p class="text-sm">YouTube</p>
                      </a>
                    </div>
                  {:else}
                    <p class="text-sm">{playlist.profile_username}</p>
                  {/if}
                  <Circle
                    size="5"
                    class="stroke-muted-foreground fill-muted-foreground shrink-0 self-center"
                  />
                {/if}
                <p class="text-muted-foreground text-sm">
                  {videosLabel}{showComma ? ', ' : ''}
                  {formattedDuration}
                </p>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</SharedContentHeader>
