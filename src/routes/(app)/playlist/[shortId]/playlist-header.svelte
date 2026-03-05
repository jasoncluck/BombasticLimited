<script lang="ts">
  import { Circle, ListVideo, Youtube } from '@lucide/svelte';
  import type { SuperValidated } from 'sveltekit-superforms';
  import type { BreadcrumbItem } from '$lib/components/breadcrumb-layout.svelte';
  import type { PlaylistVideosFilter } from '$lib/components/content/content-filter';
  import { type Playlist, type UserPlaylist } from '$lib/supabase/playlists';
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
  import { getUserInitials } from '$lib/components/profile/profile-service';
  import { convertUTCToLocal } from '$lib/utils/datetime';
  import { SvelteDate } from 'svelte/reactivity';

  interface PlaylistHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    contentFilter: PlaylistVideosFilter;
    form: SuperValidated<PlaylistSchema>;
    playlist: Playlist | UserPlaylist;
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

  const deletionMessage = $derived.by(() => {
    if (!playlist.deleted_at) return null;

    // Parse the deletion timestamp and convert to UTC
    const deletedDate = new Date(convertUTCToLocal(playlist.deleted_at));

    // Create cleanup date: add 14 days to deletion date and set to midnight UTC
    // This matches the SQL: date_trunc('day', (deletion_timestamp AT TIME ZONE 'UTC')::date + INTERVAL '14 days') AT TIME ZONE 'UTC'
    const cleanupDate = new SvelteDate(deletedDate);
    cleanupDate.setUTCDate(cleanupDate.getUTCDate() + 13);
    cleanupDate.setUTCHours(0, 0, 0, 0);

    const month = cleanupDate.toLocaleDateString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    const day = cleanupDate.getUTCDate();
    const year = cleanupDate.getUTCFullYear();

    return `The playlist owner has deleted this playlist and it will no longer be available starting: ${month} ${day}, ${year}`;
  });

  const videosLabel = $derived(
    `${videosCount} ${videosCount === 1 ? 'video' : 'videos'}`
  );
  const showComma = $derived(formattedDuration.length > 0);

  function handleEditClick(): void {
    if (!isPlaylistOwner) return;

    if (mediaQueryState.canHover) {
      open = true;
    } else {
      drawerOpen = true;
    }
  }
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
  <div class="mb-2 flex flex-col">
    <div class="playlist-header-content min-h-[230px]">
      <!-- Unified layout for both desktop and mobile -->
      <div
        class="flex w-full flex-col items-center gap-6 @2xl:max-w-fit @2xl:flex-row @2xl:items-end"
      >
        <div class="flex justify-center">
          <!-- Image container with individual click handler -->
          <button
            type="button"
            class="flex h-56 min-h-32 w-56 min-w-32 items-center justify-center overflow-hidden {mediaQueryState.canHover
              ? ''
              : 'rounded-lg'} border-none bg-transparent p-0 {isPlaylistOwner
              ? 'cursor-pointer transition-opacity hover:opacity-80'
              : ''}"
            onclick={handleEditClick}
            disabled={!isPlaylistOwner}
            aria-label={isPlaylistOwner ? 'Edit playlist' : undefined}
          >
            {#if playlist.image_url}
              <img
                src={playlist.image_url}
                alt={`Image for playlist: ${playlist.name}`}
                class="h-full w-full object-cover"
              />
            {:else if mediaQueryState.canHover}
              <ListVideo size={120} class="text-muted-foreground" />
            {:else}
              <div
                class="flex h-full w-full items-center justify-center bg-transparent"
              >
                <ListVideo class="text-muted-foreground h-full w-full p-12" />
              </div>
            {/if}
          </button>
        </div>

        <div
          class="relative flex w-full flex-col justify-start {mediaQueryState.canHover
            ? 'min-w-4xs  '
            : 'min-w-2xs'}"
        >
          <div class="flex w-full flex-col items-start text-left">
            <!-- Public/Private playlist type as clickable if owner -->
            {#if isPlaylistOwner}
              <button
                type="button"
                class="flex w-full cursor-pointer items-start border-none bg-transparent p-0 text-left transition-opacity hover:opacity-80"
                onclick={handleEditClick}
                aria-label="Edit playlist settings"
              >
                <p class="text-muted-foreground text-sm tracking-tight">
                  {playlist.type === 'Public'
                    ? 'Public Playlist'
                    : 'Private Playlist'}
                </p>
              </button>
            {:else}
              <p class="text-muted-foreground text-sm tracking-tight">
                {playlist.type === 'Public'
                  ? 'Public Playlist'
                  : 'Private Playlist'}
              </p>
            {/if}

            <!-- Playlist name as clickable button -->
            {#if isPlaylistOwner}
              <button
                type="button"
                class="flex w-full cursor-pointer items-start border-none bg-transparent p-0 text-left transition-opacity hover:opacity-80"
                onclick={handleEditClick}
                aria-label="Edit playlist name"
              >
                <h2
                  class="header-content {mediaQueryState.canHover
                    ? ''
                    : 'break-anywhere font-extrabold'} text-wrap"
                >
                  {playlist.name}
                </h2>
              </button>
            {:else}
              <h2
                class="header-content {mediaQueryState.canHover
                  ? ''
                  : 'break-anywhere font-extrabold'} text-wrap"
              >
                {playlist.name}
              </h2>
            {/if}

            <!-- Description as clickable if owner -->
            {#if playlist.description && playlist.description.length > 1}
              {#if isPlaylistOwner}
                <button
                  type="button"
                  class="mb-2 flex w-full max-w-xl cursor-pointer items-start border-none bg-transparent p-0 text-left transition-opacity hover:opacity-80"
                  onclick={handleEditClick}
                  aria-label="Edit playlist description"
                >
                  <p class="text-muted-foreground text-sm break-all">
                    {playlist.description}
                  </p>
                </button>
              {:else}
                <p
                  class="text-muted-foreground mb-2 text-left text-sm break-all"
                >
                  {playlist.description}
                </p>
              {/if}
            {/if}
          </div>

          <!-- Username, video count and duration - non-interactive metadata -->
          <div class="mt-0 flex flex-wrap items-center gap-2">
            {#if playlist.profile_username}
              {#if isSource(playlist.profile_username)}
                {@const sourceInfo = SOURCE_INFO[playlist.profile_username]}
                <div class="flex items-center gap-2">
                  <Avatar.Root class="h-6 w-6">
                    <Avatar.Image
                      src={sourceInfo.image.img.src}
                      alt={`${sourceInfo.displayName} playlist`}
                    />
                  </Avatar.Root>
                  <p class="text-sm">
                    {sourceInfo.displayName}
                  </p>
                  <Circle
                    size="5"
                    class="stroke-muted-foreground fill-muted-foreground shrink-0 justify-center self-center"
                  />
                  <a
                    href="https://www.youtube.com/playlist?list={playlist.youtube_id}"
                    class="flex gap-2 {mediaQueryState.canHover
                      ? 'hover:underline'
                      : ''}"
                  >
                    <Youtube
                      size="20"
                      class="stroke-muted-foreground shrink-0 justify-center"
                    />
                    <p class="text-sm">YouTube</p>
                  </a>
                </div>
              {:else}
                <!-- Username and avatar - non-interactive -->
                <div class="flex items-center gap-2">
                  <Avatar.Root
                    class={mediaQueryState.canHover ? 'h-7 w-7' : 'h-6 w-6'}
                  >
                    <Avatar.Image src={playlist?.profile_avatar_url} />
                    <Avatar.Fallback class="text-xs">
                      {getUserInitials(playlist.profile_username)}
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

            <!-- Video count and duration - non-interactive -->
            <p class="text-muted-foreground text-sm">
              {videosLabel}{showComma ? ', ' : ''}
              {formattedDuration}
            </p>
          </div>
          {#if deletionMessage}
            <p class="mt-2 text-sm">
              {deletionMessage}
            </p>
          {/if}
        </div>
      </div>

      <!-- Hidden dialog for desktop -->
      {#if mediaQueryState.canHover}
        <PlaylistEditDialog
          {form}
          {playlist}
          formId="playlist-dialog-form"
          {session}
          bind:open
        >
          {#snippet trigger()}
            <!-- Empty trigger since we handle clicks directly -->
            <div style="display: none;"></div>
          {/snippet}
        </PlaylistEditDialog>
      {:else}
        <!-- Hidden drawer for mobile -->
        <PlaylistEditDrawer
          {form}
          {playlist}
          formId="playlist-drawer-form"
          {session}
          bind:open={drawerOpen}
        >
          {#snippet trigger()}
            <!-- Empty trigger since we handle clicks directly -->
            <div class="hidden"></div>
          {/snippet}
        </PlaylistEditDrawer>
      {/if}
    </div>
  </div>
</SharedContentHeader>
