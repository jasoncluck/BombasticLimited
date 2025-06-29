<script lang="ts">
  import { Circle, ListVideo } from "@lucide/svelte";
  import type { Infer, SuperValidated } from "sveltekit-superforms";
  import type { PlaylistSchema } from "../../../routes/playlist/[shortId]/schema";
  import type { BreadcrumbItem } from "$lib/components/breadcrumb-layout.svelte";
  import type { PlaylistVideosFilter } from "$lib/components/content/content-filter";
  import type { Playlist, ProfilePlaylist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { HTMLAttributes } from "svelte/elements";
  import SharedContentHeader from "$lib/components/content/shared-content-header.svelte";
  import PlaylistEditDialog from "$lib/components/playlist/playlist-edit-dialog.svelte";
  import { isSource, SOURCE_INFO } from "$lib/constants/source";

  interface PlaylistHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    contentFilter: PlaylistVideosFilter;
    form: SuperValidated<Infer<PlaylistSchema>>;
    profilePlaylist: ProfilePlaylist;
    playlistImageUrl?: string;
    playlists: Playlist[];
    playlistDuration: { hours: number; minutes: number; seconds: number };
    videosCount: number;
    currentPage: number;
    supabase: SupabaseClient<Database>;
    session: Session | null;
  }

  let {
    breadcrumbs,
    showFloatingBreadcrumbs = $bindable(),
    contentFilter,
    form,
    profilePlaylist,
    playlistImageUrl,
    playlists,
    playlistDuration,
    videosCount,
    supabase,
    session,
    ...props
  }: PlaylistHeaderProps = $props();

  let open = $state(false);

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

  function openDialog() {
    open = true;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDialog();
    }
  }
</script>

<SharedContentHeader
  {breadcrumbs}
  bind:showFloatingBreadcrumbs
  bind:open
  view="playlist"
  {videosCount}
  {contentFilter}
  {profilePlaylist}
  {playlists}
  {supabase}
  {session}
  {...props}
>
  <div class="flex flex-col gap-4">
    <!-- Main content row (image + text) -->
    <div class="flex flex-col @md:flex-row gap-6">
      <PlaylistEditDialog {form} playlist={profilePlaylist} bind:open>
        <div class="flex justify-center">
          {#if playlistImageUrl}
            <button
              type="button"
              class="flex justify-center items-center h-56 w-56 cursor-pointer border-none bg-transparent p-0"
              onclick={openDialog}
            >
              <img
                src={playlistImageUrl}
                alt={`Image for playlist: ${profilePlaylist.name}`}
              />
            </button>
          {:else}
            <button
              type="button"
              class="flex justify-center items-center min-h-32 min-w-32 h-56 w-56 cursor-pointer border-none bg-transparent p-0"
              onclick={openDialog}
            >
              <ListVideo size={128} />
            </button>
          {/if}
        </div>
      </PlaylistEditDialog>

      <div class="flex flex-col relative flex-1">
        <button
          type="button"
          class="flex flex-col cursor-pointer items-start text-left border-none bg-transparent p-0"
          onclick={openDialog}
          onkeydown={handleKeydown}
        >
          <p class="text-sm text-muted-foreground tracking-tight">
            {profilePlaylist.type === "Public" ||
            profilePlaylist.type === "Official"
              ? "Public Playlist"
              : "Private Playlist"}
          </p>
          <h2 class="header-primary text-wrap break-anywhere font-extrabold">
            {profilePlaylist.name}
          </h2>
          <p class="text-sm text-muted-foreground mb-2 text-left break-words">
            {profilePlaylist.description}
          </p>
        </button>

        <div class="flex items-center">
          {#if profilePlaylist.profile_username}
            {#if isSource(profilePlaylist.profile_username)}
              {@const sourceInfo =
                SOURCE_INFO[profilePlaylist.profile_username]}
              <div class="flex items-center gap-2">
                <img
                  alt={`Official ${sourceInfo.displayName} playlist`}
                  class="h-6 w-6"
                  src={sourceInfo.image}
                />
                <p class="text-sm">
                  {sourceInfo.displayName}
                </p>
              </div>
            {:else}
              <p class="text-sm">{profilePlaylist.profile_username}</p>
            {/if}
            <Circle
              size="5"
              class="stroke-muted-foreground mx-2 fill-muted-foreground justify-center"
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
</SharedContentHeader>
