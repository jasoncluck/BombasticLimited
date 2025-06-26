<script lang="ts">
  import { Ellipsis, ListVideo } from "@lucide/svelte";
  import type { Infer, SuperValidated } from "sveltekit-superforms";
  import type { PlaylistSchema } from "../../../routes/playlist/[shortId]/schema";
  import type { BreadcrumbItem } from "$lib/components/breadcrumb-layout.svelte";
  import type { PlaylistVideosFilter } from "$lib/components/content/content-filter";
  import type { Playlist } from "$lib/supabase/playlists";
  import type { Session, SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "$lib/supabase/database.types";
  import { getContentState } from "$lib/state/content.svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import SharedContentHeader from "$lib/components/content/shared-content-header.svelte";
  import PlaylistEditDialog from "$lib/components/playlist/playlist-edit-dialog.svelte";
  import { buttonVariants } from "$lib/components/ui/button";
  import { handleDeletePlaylist } from "$lib/components/playlist/playlist-service";

  interface PlaylistHeaderProps extends HTMLAttributes<HTMLDivElement> {
    breadcrumbs: BreadcrumbItem[];
    showFloatingBreadcrumbs: boolean;
    contentFilter: PlaylistVideosFilter;
    form: SuperValidated<Infer<PlaylistSchema>>;
    playlist: Playlist;
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
    playlist,
    playlists,
    playlistDuration,
    videosCount,
    supabase,
    session,
    ...props
  }: PlaylistHeaderProps = $props();

  const contentState = getContentState();

  let playlistImageUrl = $derived(contentState.playlistImages[playlist.id]);
  let open = $state(false);

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
  view="playlist"
  {videosCount}
  {contentFilter}
  {playlist}
  {playlists}
  {supabase}
  {session}
  {...props}
>
  <div class="flex gap-6">
    <PlaylistEditDialog {form} {playlist} bind:open>
      {#if playlistImageUrl}
        <button
          type="button"
          class="flex justify-center items-center min-h-32 min-w-32 max-h-56 max-w-56 cursor-pointer border-none bg-transparent p-0"
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
          class="flex justify-center items-center min-h-16 min-w-16 max-h-56 max-w-56 cursor-pointer border-none bg-transparent p-0"
          onclick={openDialog}
        >
          <ListVideo size={256} />
        </button>
      {/if}
    </PlaylistEditDialog>

    <div class="flex flex-col relative">
      <button
        type="button"
        class="flex flex-col cursor-pointer items-start text-left border-none bg-transparent p-0"
        onclick={openDialog}
        onkeydown={handleKeydown}
      >
        <p class="text-sm text-muted-foreground tracking-tight">
          {playlist.type === "Public" ? "Public Playlist" : "Private Playlist"}
        </p>
        <h2 class="header-primary text-wrap break-words">
          {playlist.name}
        </h2>
        <p class="text-sm text-muted-foreground mb-2 text-left break-words">
          {playlist.description}
        </p>
      </button>

      <p class="text-sm text-muted-foreground tracking-tight">
        {videosCount}
        {videosCount === 1 ? "video" : "videos"}
      </p>

      <p class="text-sm text-muted-foreground">
        {playlistDuration.hours > 0 ? `${playlistDuration.hours} hours,` : null}
        {playlistDuration.minutes > 0 || playlistDuration.hours > 0
          ? `${playlistDuration.minutes} minutes and`
          : null}
        {playlistDuration.seconds > 0 ||
        playlistDuration.minutes > 0 ||
        playlistDuration.hours > 0
          ? `${playlistDuration.seconds} seconds`
          : null}
      </p>
    </div>
  </div>

  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class="cursor-pointer {buttonVariants({
        variant: 'ghost',
        size: 'icon',
      })}"
    >
      <Ellipsis size="16" />
      <span class="sr-only">Playlist Actions</span>
    </DropdownMenu.Trigger>
    <DropdownMenu.Content>
      <DropdownMenu.Group>
        <DropdownMenu.Item class="cursor-pointer" onclick={() => (open = true)}>
          Edit Playlist</DropdownMenu.Item
        >
        <DropdownMenu.Item
          class="cursor-pointer"
          onclick={() => handleDeletePlaylist({ playlist, supabase, session })}
          >Delete Playlist</DropdownMenu.Item
        >
      </DropdownMenu.Group>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
</SharedContentHeader>
