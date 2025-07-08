import type { Playlist } from "$lib/supabase/playlists";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import type { Database } from "$lib/supabase/database.types";
import { getContext, setContext } from "svelte";
import { createDragImage } from "$lib/utils/dragdrop";
import {
  handleAddVideosToPlaylist,
  handleUpdatePlaylistPosition,
} from "$lib/components/playlist/playlist-service";
import type { PageState } from "./page.svelte";
import { getContentState, type ContentState } from "./content.svelte";
import { goto } from "$app/navigation";

export interface PlaylistDragDropOptions {
  playlists: Playlist[];
  supabase: SupabaseClient<Database>;
  session: Session | null;
  onPlaylistsUpdate?: (playlists: Playlist[]) => void;
}

export interface PlaylistDragDropHandlers {
  handleDragStart: (event: DragEvent, index: number) => void;
  handleDragOver: (event: DragEvent, index: number) => void;
  handleDragLeave: (event: DragEvent, index: number) => void;
  handleDrop: (event: DragEvent, index: number) => void;
  handleDragEnd: () => void;
}

export interface PlaylistButtonOptions {
  index: number;
  isSelected: boolean;
  itemType: "source" | "playlist";
  isSidebarCollapsed: boolean;
  selectedPlaylistIdParam?: string;
  session?: Session | null;
  playlists?: Playlist[];
}

export interface PlaylistState {
  // Page state dependency
  pageState: PageState;
  contentState: ContentState;

  // Playlist hover state
  hoveredPlaylistIndex: number | null;

  // Playlist drag and drop state
  draggedIndex: number | null;
  targetIndex: number | null;

  // Mouse hover methods
  handleMouseEnter: (index: number) => void;
  handleMouseLeave: (index: number) => void;

  // CSS class helpers
  getPlaylistDragClasses: (index: number) => string;
  getButtonClasses: (options: PlaylistButtonOptions) => string;

  // Drag and drop methods
  createPlaylistDragDrop: (
    options: PlaylistDragDropOptions,
  ) => PlaylistDragDropHandlers;

  // Navigation
  handlePlaylistClick: (playlist: Playlist) => void;

  currentPlaylist: Playlist | null;

  // Helper to get all selected videos across sections
  getAllSelectedVideos: () => { sectionId: string; videos: any[] }[];
}

export class PlaylistStateClass implements PlaylistState {
  pageState: PageState;
  contentState: ContentState;

  hoveredPlaylistIndex = $state<number | null>(null);
  draggedIndex = $state<number | null>(null);
  targetIndex = $state<number | null>(null);
  currentPlaylist = $state<Playlist | null>(null);

  constructor(pageState: PageState, contentState: ContentState) {
    this.pageState = pageState;
    this.contentState = contentState
  }

  // Helper to get all selected videos across sections
  getAllSelectedVideos() {
    const allSelectedVideos: { sectionId: string; videos: any[] }[] = [];

    for (const [sectionId, videos] of Object.entries(this.contentState.selectedVideosBySection)) {
      if (videos && videos.length > 0) {
        allSelectedVideos.push({ sectionId, videos });
      }
    }

    return allSelectedVideos;
  }

  // Mouse hover methods
  handleMouseEnter(index: number) {
    // Only allow hover if not scrolling and not dragging
    if (
      !this.pageState.sidebarScrollState.scrolling &&
      this.draggedIndex === null
    ) {
      this.hoveredPlaylistIndex = index;
    }
  }

  handleMouseLeave(index: number) {
    if (this.hoveredPlaylistIndex === index) {
      this.hoveredPlaylistIndex = null;
    }
  }

  // CSS class helpers
  getPlaylistDragClasses(index: number): string {
    let classes = "relative";

    if (this.draggedIndex === index) {
      classes += " opacity-60";
    }

    if (this.targetIndex === index) {
      if (this.draggedIndex === null || this.draggedIndex < this.targetIndex) {
        // Show indicator at the bottom
        classes +=
          " after:absolute after:left-0 after:bottom-0 after:w-full after:h-[2px] after:bg-primary after:z-10";
      } else {
        // Show indicator at the top
        classes +=
          " before:absolute before:left-0 before:-top-0 before:w-full before:h-[2px] before:bg-primary before:z-10";
      }
    }
    return classes;
  }

  getButtonClasses(options: PlaylistButtonOptions): string {
    const {
      index,
      isSelected,
      itemType,
      isSidebarCollapsed,
      selectedPlaylistIdParam,
      session,
      playlists,
    } = options;

    const contentState = getContentState();
    let classes = "sidebar-full-button active:bg-black/70";

    // Add drag classes for playlists only
    if (itemType === "playlist") {
      classes += ` ${this.getPlaylistDragClasses(index)}`;
    }

    // Manual hover effect (only when appropriate)
    if (
      this.hoveredPlaylistIndex === index &&
      !this.pageState.sidebarScrollState.scrolling &&
      this.draggedIndex === null
    ) {
      if (isSelected) {
        classes += " !hover:bg-secondary brightness-125";
      } else {
        classes += " hover:bg-secondary/25";
      }
    }

    // Selected styling
    if (isSelected) {
      if (itemType === "source") {
        classes += " bg-secondary";
      } else {
        classes += " bg-secondary/65";
      }
    }

    // Sidebar layout classes
    if (!isSidebarCollapsed) {
      classes += " min-w-[150px] justify-normal";
    } else {
      classes += " align-middle";
    }

    // Video drag styling (playlists only)
    if (
      itemType === "playlist" &&
      contentState.dragContentType === "video" &&
      playlists &&
      (playlists[index]?.created_by !== session?.user.id ||
        playlists[index].short_id === selectedPlaylistIdParam)
    ) {
      classes += " opacity-50 border-transparent";
    }

    return classes;
  }

  // Drag and drop methods
  createPlaylistDragDrop(
    options: PlaylistDragDropOptions,
  ): PlaylistDragDropHandlers {
    const contentState = getContentState();

    const handleDragStart = (event: DragEvent, index: number) => {
      this.draggedIndex = index;
      contentState.dragContentType = "playlist";

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }

      this.hoveredPlaylistIndex = null;
      createDragImage(event, options.playlists[index].name);
    };

    const handleDragOver = (event: DragEvent, index: number) => {
      event.preventDefault();

      // Handle video drop zones
      if (contentState.dragContentType === "video") {
        const playlist = options.playlists[index];
        if (event.currentTarget instanceof HTMLElement) {
          const classes = contentState.getVideoDropzoneClasses(
            playlist,
            options.session,
          );
          event.currentTarget.classList.add(...classes);
          event.currentTarget.classList.remove(
            ...contentState.getEndDropzoneClasses(),
          );
        }
      }

      // Handle playlist reordering
      if (
        this.draggedIndex !== null &&
        this.draggedIndex !== index &&
        this.targetIndex !== index
      ) {
        this.targetIndex = index;
      }
    };

    const handleDragLeave = (event: DragEvent, index: number) => {
      const relatedTarget = event.relatedTarget as Node;
      if (
        event.currentTarget instanceof HTMLElement &&
        !event.currentTarget.contains(relatedTarget)
      ) {
        // Clear target index for playlist reordering
        if (contentState.dragContentType === "playlist") {
          this.targetIndex = null;
        }

        // Handle video drop zone styling
        if (contentState.dragContentType === "video") {
          const playlist = options.playlists[index];
          const classes = contentState.getVideoDropzoneClasses(
            playlist,
            options.session,
          );
          event.currentTarget.classList.remove(...classes);
          event.currentTarget.classList.add(
            ...contentState.getEndDropzoneClasses(),
          );
        }
      }
    };

    const handleDrop = async (
      event: DragEvent,
      playlistTargetIndex: number,
    ) => {
      if (!options.session) {
        return;
      }

      if (event.currentTarget instanceof HTMLElement) {
        const classes = contentState.getVideoDropzoneClasses(
          options.playlists[playlistTargetIndex],
          options.session,
        );
        event.currentTarget.classList.remove(...classes);
        event.currentTarget.classList.add(
          ...contentState.getEndDropzoneClasses(),
        );
      }

      if (contentState.dragContentType === "video") {
        // Get all selected videos from all sections
        const allSelectedVideos = this.getAllSelectedVideos();

        // Combine all videos into a single array for the playlist operation
        const allVideos = allSelectedVideos.flatMap(section => section.videos);

        if (allVideos.length > 0) {
          await handleAddVideosToPlaylist({
            playlist: options.playlists[playlistTargetIndex],
            videos: allVideos,
            supabase: options.supabase,
            session: options.session,
          });

          // Clear selected videos from all sections after successful drop
          for (const section of allSelectedVideos) {
            contentState.selectedVideosBySection[section.sectionId] = [];
          }
        }
      } else if (contentState.dragContentType === "playlist") {
        if (this.draggedIndex === null || this.draggedIndex < 0) {
          return;
        }

        await handleUpdatePlaylistPosition({
          playlist: options.playlists[this.draggedIndex],
          position: options.playlists.length - playlistTargetIndex,
          supabase: options.supabase,
          session: options.session,
        });

        const updatedPlaylists = [...options.playlists];
        const [movedItem] = updatedPlaylists.splice(this.draggedIndex, 1);
        updatedPlaylists.splice(playlistTargetIndex, 0, movedItem);
        options.onPlaylistsUpdate?.(updatedPlaylists);
      }
    };

    const handleDragEnd = () => {
      this.draggedIndex = null;
      this.targetIndex = null;
      this.hoveredPlaylistIndex = null;
      contentState.dragContentType = null; // Reset drag content type
    };

    return {
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleDragEnd,
    };
  }

  // Navigation
  handlePlaylistClick(playlist: Playlist) {
    goto(`/playlist/${encodeURI(playlist.short_id)}`);
  }
}

const DEFAULT_KEY = "$_playlist_state";

export function setPlaylistState(pageState: PageState, contentState: ContentState, key = DEFAULT_KEY) {
  const playlistState = new PlaylistStateClass(pageState, contentState);
  return setContext(key, playlistState);
}

export function getPlaylistState(key = DEFAULT_KEY) {
  return getContext<PlaylistState>(key);
}
