<script lang="ts">
  import { Circle, ListVideo, Youtube } from '@lucide/svelte';
  import type { SuperValidated } from 'sveltekit-superforms';
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
  import * as Avatar from '$lib/components/ui/avatar';
  import type { PlaylistSchema } from '$lib/schema/playlist-schema';

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
    creatorProfile: UserProfile | null;
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
    creatorProfile,
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
  {contentFilter}
  {playlist}
  {videos}
  bind:currentPage
  {userProfile}
  {supabase}
  {session}
  {...props}
>
  <div class="mb-8 flex flex-col">
    <div class="playlist-header-content min-h-[230px]">
      <!-- Desktop/Hover layout -->
      {#if mediaQueryState.canHover}
        <PlaylistEditDialog
          {form}
          {playlist}
          formId="playlist-dialog-form"
          {session}
          bind:open
        >
          {#snippet trigger()}
            <div class="flex flex-col gap-6 @2xl:flex-row @2xl:items-end">
              <div class="flex justify-center">
                <div
                  class="flex h-56 min-h-32 w-56 min-w-32 items-center justify-center overflow-hidden border-none bg-transparent p-0 {isPlaylistOwner &&
                    'cursor-pointer'}"
                >
                  {#if playlist.image_url}
                    <img
                      src={playlist.image_url}
                      alt={`Image for playlist: ${playlist.name}`}
                      class="h-full w-full object-cover"
                    />
                  {:else}
                    <ListVideo size={120} class="text-muted-foreground" />
                  {/if}
                </div>
              </div>

              <div
                class="min-w-4xs relative mt-4 flex flex-1 flex-col gap-2 {isPlaylistOwner &&
                  'cursor-pointer'} "
              >
                <div
                  class="flex flex-col items-start border-none bg-transparent p-0 text-left"
                >
                  <p class="text-muted-foreground mb-2 text-sm tracking-tight">
                    {playlist.type === 'Public'
                      ? 'Public Playlist'
                      : 'Private Playlist'}
                  </p>
                  <h2 class="header-content">
                    {playlist.name}
                  </h2>

                  {#if playlist.description && playlist.description.length > 1}
                    <p
                      class="text-muted-foreground my-2 text-left text-sm break-all"
                    >
                      {playlist.description}
                    </p>
                  {/if}
                </div>

                <!-- Username, video count and duration - kept in original position for hover -->
                <div class="mt-0 flex flex-wrap items-center gap-2">
                  {#if playlist.profile_username}
                    {#if isSource(playlist.profile_username)}
                      {@const sourceInfo =
                        SOURCE_INFO[playlist.profile_username]}
                      <div class="flex items-center gap-2">
                        <img
                          alt={`${sourceInfo.displayName} playlist`}
                          class="h-6 w-6"
                          src={sourceInfo.image.img.src}
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
                      <div class="flex items-center gap-2">
                        <Avatar.Root class="h-7 w-7">
                          <Avatar.Image
                            src={creatorProfile?.avatar_url}
                            alt="{playlist.profile_username} avatar"
                          />
                          <Avatar.Fallback class="text-xs">
                            {playlist.profile_username
                              ?.slice(0, 2)
                              .toUpperCase()}
                          </Avatar.Fallback>
                        </Avatar.Root>
                        <p class="text-sm">{playlist.profile_username}</p>
                      </div>
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
          {/snippet}
        </PlaylistEditDialog>

        <!-- Mobile/Touch layout -->
      {:else}
        <div class="touch-layout">
          <PlaylistEditDrawer
            {form}
            {playlist}
            formId="playlist-drawer-form"
            {session}
            bind:open={drawerOpen}
          >
            {#snippet trigger()}
              <div class="flex flex-col items-center gap-4">
                <div class="flex justify-center">
                  <div
                    class="flex h-56 min-h-32 w-56 min-w-32 items-center justify-center overflow-hidden rounded-lg border-none bg-transparent p-0 {isPlaylistOwner &&
                      'cursor-pointer'}"
                  >
                    {#if playlist.image_url}
                      <img
                        src={playlist.image_url}
                        alt={`Image for playlist: ${playlist.name}`}
                        class="h-full w-full object-cover"
                      />
                    {:else}
                      <div
                        class="flex h-full w-full items-center justify-center bg-transparent"
                      >
                        <ListVideo
                          class="text-muted-foreground h-full w-full p-12"
                        />
                      </div>
                    {/if}
                  </div>
                </div>

                <div class="relative flex min-w-2xs flex-1 flex-col">
                  <div
                    class="flex flex-col {isPlaylistOwner && 'cursor-pointer'} 
            items-start border-none bg-transparent p-0 text-left"
                  >
                    <p
                      class="text-muted-foreground mb-1 text-sm tracking-tight"
                    >
                      {playlist.type === 'Public'
                        ? 'Public Playlist'
                        : 'Private Playlist'}
                    </p>
                    <h2
                      class="header-content break-anywhere font-extrabold text-wrap"
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

                  <!-- Username, video count and duration for mobile -->
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    {#if playlist.profile_username}
                      {#if isSource(playlist.profile_username)}
                        {@const sourceInfo =
                          SOURCE_INFO[playlist.profile_username]}
                        <div class="flex items-center gap-2">
                          <img
                            alt={`${sourceInfo.displayName} playlist`}
                            class="h-6 w-6"
                            src={sourceInfo.image.img.src}
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
                        <div class="flex items-center gap-2">
                          <Avatar.Root class="h-6 w-6">
                            <Avatar.Image
                              src={creatorProfile?.avatar_url}
                              alt="{playlist.profile_username} avatar"
                            />
                            <Avatar.Fallback class="text-xs">
                              {playlist.profile_username
                                ?.slice(0, 2)
                                .toUpperCase()}
                            </Avatar.Fallback>
                          </Avatar.Root>
                          <p class="text-sm">{playlist.profile_username}</p>
                        </div>
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
            {/snippet}
          </PlaylistEditDrawer>
        </div>
      {/if}
    </div>
  </div>
</SharedContentHeader>
