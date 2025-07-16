<script lang="ts">
  import { Circle, ListVideo, Youtube } from "@lucide/svelte";
  import type { SuperValidated } from "sveltekit-superforms";
  import type { PlaylistSchema } from "../../../routes/playlist/[shortId]/schema";
  import type { BreadcrumbItem } from "$lib/components/breadcrumb-layout.svelte";
  import type { PlaylistVideosFilter } from "$lib/components/content/content-filter";
  import {
    type Playlist,
    type ProfilePlaylist,
    type UserPlaylist,
  } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { HTMLAttributes } from "svelte/elements";
  import SharedContentHeader from "$lib/components/content/shared-content-header.svelte";
  import PlaylistEditDialog from "$lib/components/playlist/playlist-edit-dialog.svelte";
  import { isSource, SOURCE_INFO } from "$lib/constants/source";
  import type { Video } from "$lib/supabase/videos";
  import type { Profile } from "$lib/supabase/profiles";
  import { getMediaQueryState } from "$lib/state/media-query.svelte";
  import PlaylistEditDrawer from "$lib/components/playlist/playlist-edit-drawer.svelte";
  import { getPlaylistState } from "$lib/state/playlist.svelte";

  interface PlaylistHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    contentFilter: PlaylistVideosFilter;
    form: SuperValidated<PlaylistSchema>;
    playlist: ProfilePlaylist | UserPlaylist;
    videos: Video[];
    playlists: Playlist[];
    playlistDuration: { hours: number; minutes: number; seconds: number };
    videosCount: number;
    userProfile: Profile | null;
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
    playlists,
    playlistDuration,
    videosCount,
    currentPage,
    userProfile,
    supabase,
    session,
    ...props
  }: PlaylistHeaderProps = $props();

  const mediaQueryState = getMediaQueryState();
  const playlistState = getPlaylistState();

  let open = $state(false);

  const isPlaylistOwner = $derived(playlist.created_by === session?.user.id);

  $effect(() => {
    if (playlistState.openEditPlaylist) {
      if (!isPlaylistOwner) {
        return;
      }
      open = true;
    }
  });

  const formattedDuration = $derived.by(() => {
    const parts = [];
    if (playlistDuration.hours > 0) parts.push(`${playlistDuration.hours} hr`);
    if (playlistDuration.minutes > 0)
      parts.push(`${playlistDuration.minutes} min`);
    return parts.join(", ");
  });

  const videosLabel = $derived(
    `${videosCount} ${videosCount === 1 ? "video" : "videos"}`,
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
  {playlists}
  bind:currentPage
  {userProfile}
  {supabase}
  {session}
  {...props}
>
  <div class="flex flex-col m-4">
    {#if mediaQueryState.isSm}
      <PlaylistEditDialog {form} {playlist} bind:open>
        {#snippet trigger()}
          <div class="flex flex-col md:flex-row gap-4">
            <div class="flex justify-center">
              {#if playlist.processedImageUrl}
                <div
                  class="flex justify-center items-center h-56 w-56 {isPlaylistOwner &&
                    'cursor-pointer'} border-none bg-transparent p-0"
                >
                  <img
                    src={playlist.processedImageUrl}
                    alt={`Image for playlist: ${playlist.name}`}
                  />
                </div>
              {:else}
                <div
                  class="flex justify-center items-center min-h-32 min-w-32 h-56 w-56 {isPlaylistOwner &&
                    'cursor-pointer'}border-none bg-transparent p-0"
                >
                  <ListVideo size={128} />
                </div>
              {/if}
            </div>

            <div class="flex flex-col relative flex-1 min-w-2xs mt-4">
              <div
                class="flex flex-col {isPlaylistOwner && 'cursor-pointer'} 
          items-start text-left border-none bg-transparent p-0"
              >
                <p class="text-sm text-muted-foreground tracking-tight">
                  {playlist.type === "Public" || playlist.type === "Official"
                    ? "Public Playlist"
                    : "Private Playlist"}
                </p>
                <h2
                  class="header-playlist text-wrap break-anywhere font-extrabold"
                >
                  {playlist.name}
                </h2>

                {#if playlist.description && playlist.description.length > 1}
                  <p class="text-sm text-muted-foreground text-left break-all">
                    {playlist.description}
                  </p>
                {/if}

                <!-- Username, video count and duration moved here for isSm -->
                <div class="flex items-center flex-wrap mt-2">
                  {#if playlist.profile_username}
                    {#if isSource(playlist.profile_username)}
                      {@const sourceInfo =
                        SOURCE_INFO[playlist.profile_username]}
                      <div class="flex items-center gap-2">
                        <img
                          alt={`Official ${sourceInfo.displayName} playlist`}
                          class="h-6 w-6"
                          src={sourceInfo.image}
                        />
                        <p class="text-sm">
                          {sourceInfo.displayName}
                        </p>
                        <Circle
                          size="5"
                          class="shrink-0 stroke-muted-foreground  fill-muted-foreground justify-center"
                        />
                        <a
                          href="https://www.youtube.com/playlist?list={playlist.youtube_id}"
                          class="flex gap-2"
                        >
                          <Youtube
                            size="20"
                            class="shrink-0 stroke-muted-foreground justify-center"
                          />
                          <p class="text-sm">YouTube</p>
                        </a>
                      </div>
                    {:else}
                      <p class="text-sm">{playlist.profile_username}</p>
                    {/if}
                    <Circle
                      size="5"
                      class="shrink-0 stroke-muted-foreground mx-2 fill-muted-foreground justify-center"
                    />
                  {/if}
                  <p class="text-sm text-muted-foreground">
                    {videosLabel}{showComma ? ", " : ""}
                    {formattedDuration}
                  </p>
                </div>
              </div>
            </div>
          </div>
        {/snippet}
      </PlaylistEditDialog>
    {:else}
      <PlaylistEditDrawer
        {form}
        {playlist}
        bind:open={playlistState.openEditPlaylist}
      >
        {#snippet trigger()}
          <div class="flex justify-center">
            {#if playlist.processedImageUrl}
              <div
                class="flex justify-center items-center h-56 w-56 {isPlaylistOwner &&
                  'cursor-pointer'} border-none bg-transparent p-0"
              >
                <img
                  src={playlist.processedImageUrl}
                  alt={`Image for playlist: ${playlist.name}`}
                />
              </div>
            {:else}
              <div
                class="flex justify-center items-center min-h-32 min-w-32 h-56 w-56 {isPlaylistOwner &&
                  'cursor-pointer'}border-none bg-transparent p-0"
              >
                <ListVideo size={128} />
              </div>
            {/if}
          </div>

          <div class="flex flex-col relative flex-1 min-w-2xs mt-8">
            <div
              class="flex flex-col {isPlaylistOwner && 'cursor-pointer'} 
          items-start text-left border-none bg-transparent p-0"
            >
              <p class="text-sm text-muted-foreground tracking-tight">
                {playlist.type === "Public" || playlist.type === "Official"
                  ? "Public Playlist"
                  : "Private Playlist"}
              </p>
              <h2
                class="header-playlist text-wrap break-anywhere font-extrabold"
              >
                {playlist.name}
              </h2>
              {#if playlist.description && playlist.description.length > 1}
                <p
                  class="text-sm text-muted-foreground text-left break-all mb-2"
                >
                  {playlist.description}
                </p>
              {/if}
            </div>
          </div>

          <!-- Username, video count and duration - only shown for non-isSm (else branch) -->
          <div class="flex items-center flex-wrap">
            {#if playlist.profile_username}
              {#if isSource(playlist.profile_username)}
                {@const sourceInfo = SOURCE_INFO[playlist.profile_username]}
                <div class="flex items-center gap-2">
                  <img
                    alt={`Official ${sourceInfo.displayName} playlist`}
                    class="h-6 w-6"
                    src={sourceInfo.image}
                  />
                  <p class="text-sm">
                    {sourceInfo.displayName}
                  </p>
                  <Circle
                    size="5"
                    class="shrink-0 stroke-muted-foreground  fill-muted-foreground justify-center"
                  />
                  <a
                    href="https://www.youtube.com/playlist?list={playlist.youtube_id}"
                    class="flex gap-2"
                  >
                    <Youtube
                      size="20"
                      class="shrink-0 stroke-muted-foreground justify-center"
                    />
                    <p class="text-sm">YouTube</p>
                  </a>
                </div>
              {:else}
                <p class="text-sm">{playlist.profile_username}</p>
              {/if}
              <Circle
                size="5"
                class="shrink-0 stroke-muted-foreground mx-2 fill-muted-foreground justify-center"
              />
            {/if}
            <p class="text-sm text-muted-foreground">
              {videosLabel}{showComma ? ", " : ""}
              {formattedDuration}
            </p>
          </div>
        {/snippet}
      </PlaylistEditDrawer>
    {/if}
  </div>
</SharedContentHeader>
