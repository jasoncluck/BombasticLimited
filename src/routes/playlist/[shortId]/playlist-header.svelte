<script lang="ts">
  import { Circle, Ellipsis, ListVideo, Play } from "@lucide/svelte";
  import type { Infer, SuperValidated } from "sveltekit-superforms";
  import type { PlaylistSchema } from "../../../routes/playlist/[shortId]/schema";
  import type { BreadcrumbItem } from "$lib/components/breadcrumb-layout.svelte";
  import type { PlaylistVideosFilter } from "$lib/components/content/content-filter";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import type { HTMLAttributes } from "svelte/elements";
  import SharedContentHeader from "$lib/components/content/shared-content-header.svelte";
  import PlaylistEditDialog from "$lib/components/playlist/playlist-edit-dialog.svelte";
  import type { Profile } from "$lib/supabase/accounts";

  interface PlaylistHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    contentFilter: PlaylistVideosFilter;
    form: SuperValidated<Infer<PlaylistSchema>>;
    playlist: Playlist;
    playlistImageUrl?: string;
    playlists: Playlist[];
    playlistCreatorProfile: Profile | null;
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
    playlist,
    playlistImageUrl,
    playlists,
    playlistCreatorProfile,
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

  const hasDuration =
    playlistDuration.hours > 0 ||
    playlistDuration.minutes > 0 ||
    playlistDuration.seconds > 0;

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
  {playlist}
  {playlists}
  {supabase}
  {session}
  {...props}
>
  <div class="flex flex-col gap-4">
    <!-- Main content row (image + text) -->
    <div class="flex flex-col @md:flex-row gap-6">
      <PlaylistEditDialog {form} {playlist} bind:open>
        <div class="flex justify-center">
          {#if playlistImageUrl}
            <button
              type="button"
              class="flex justify-center items-center h-56 w-56 cursor-pointer border-none bg-transparent p-0"
              onclick={openDialog}
            >
              <img
                src={playlistImageUrl}
                alt={`Image for playlist: ${playlist.name}`}
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
            {playlist.type === "Public"
              ? "Public Playlist"
              : "Private Playlist"}
          </p>
          <h2 class="header-primary text-wrap break-anywhere font-extrabold">
            {playlist.name}
          </h2>
          <p class="text-sm text-muted-foreground mb-2 text-left break-words">
            {playlist.description}
          </p>
        </button>

        <div class="flex items-center">
          <p class="text-sm">{playlistCreatorProfile?.username}</p>
          <Circle
            size="5"
            class="stroke-muted-foreground mx-2 fill-muted-foreground justify-center"
          />
          <p class="text-sm text-muted-foreground">
            {videosLabel}{showComma ? ", " : ""}
            {formattedDuration}
          </p>
        </div>
      </div>
    </div>
  </div>
</SharedContentHeader>
