import type { Playlist } from '$lib/supabase/playlists';
import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';
import { getContext, setContext } from 'svelte';
import { createDragImage } from '$lib/utils/dragdrop';
import {
  handleAddVideosToPlaylist,
  handleUpdatePlaylistPosition,
} from '$lib/components/playlist/playlist-service';
import type { PageState } from './page.svelte';
import { type ContentState } from './content.svelte';
import type { SidebarState } from './sidebar.svelte';

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
  itemType: 'source' | 'playlist';
  isSidebarCollapsed: boolean;
  selectedPlaylistIdParam?: string;
  session?: Session | null;
  playlists?: Playlist[];
}

export class PlaylistStateClass {
  // Page state dependency
  pageState: PageState;
  contentState: ContentState;
  sidebarState: SidebarState;

  openEditPlaylist = $state(false);

  // Playlist hover state
  hoveredPlaylistIndex = $state<number | null>(null);

  // Playlist drag and drop state
  draggedIndex = $state<number | null>(null);
  targetIndex = $state<number | null>(null);
  currentPlaylist = $state<Playlist | null>(null);

  constructor(
    pageState: PageState,
    contentState: ContentState,
    sidebarState: SidebarState
  ) {
    this.pageState = pageState;
    this.contentState = contentState;
    this.sidebarState = sidebarState;
  }

  // Helper to get all selected videos across sections
  getAllSelectedVideos() {
    const allSelectedVideos: { sectionId: string; videos: any[] }[] = [];

    for (const [sectionId, videos] of Object.entries(
      this.contentState.selectedVideosBySection
    )) {
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
    let classes = 'relative';

    if (this.draggedIndex === index) {
      classes += ' opacity-60';
    }

    if (this.targetIndex === index) {
      if (this.draggedIndex === null || this.draggedIndex < this.targetIndex) {
        // Show indicator at the bottom
        classes +=
          ' after:absolute after:left-0 after:bottom-0 after:w-full after:h-[2px] after:bg-primary after:z-10';
      } else {
        // Show indicator at the top
        classes +=
          ' before:absolute before:left-0 before:-top-0 before:w-full before:h-[2px] before:bg-primary before:z-10';
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

    let classes = 'sidebar-full-button transition-all duration-200 ease-in-out';

    // Add drag classes for playlists only
    if (itemType === 'playlist') {
      classes += ` ${this.getPlaylistDragClasses(index)}`;
    }

    // Active state (only when not dragging)
    if (this.draggedIndex === null) {
      classes += ' active:bg-secondary/70 active:scale-95 active:brightness-90';
    }

    // Enhanced hover effect when manually tracking hover state
    const isHovered =
      this.hoveredPlaylistIndex === index &&
      !this.pageState.sidebarScrollState.scrolling &&
      this.draggedIndex === null;

    // Apply hover styling only through JavaScript state, not CSS hover
    if (isHovered) {
      if (isSelected) {
        classes += ' !brightness-120 !bg-secondary';
      } else {
        classes += ' bg-secondary/50 brightness-110';
      }
    }

    // Selected styling
    if (isSelected) {
      if (itemType === 'source') {
        classes += ' bg-secondary text-secondary-foreground';
      } else {
        classes += ' bg-secondary/65 text-secondary-foreground';
      }
      // Apply hover effect for selected items only via JavaScript state
      if (isHovered) {
        classes += ' brightness-110';
      }
    }

    // Sidebar layout classes
    if (!isSidebarCollapsed) {
      classes += ' min-w-[150px] justify-normal';
    } else {
      classes += ' align-middle';
    }

    // Video drag styling (playlists only)
    if (
      itemType === 'playlist' &&
      this.contentState.dragContentType === 'video' &&
      playlists &&
      (playlists[index]?.created_by !== session?.user.id ||
        playlists[index].short_id === selectedPlaylistIdParam)
    ) {
      classes += ' opacity-50 border-transparent';
    }

    return classes;
  }

  // Drag and drop methods
  createPlaylistDragDrop(
    options: PlaylistDragDropOptions
  ): PlaylistDragDropHandlers {
    const handleDragStart = (event: DragEvent, index: number) => {
      this.draggedIndex = index;
      this.contentState.dragContentType = 'playlist';

      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
      }

      // Clear hover states to prevent conflicts during drag
      this.hoveredPlaylistIndex = null;
      this.contentState.clearHoverStatesDuringDrag();

      // Add global dragging class for state coordination
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('dragging');
      }

      createDragImage(event, options.playlists[index].name);
    };

    const handleDragOver = (event: DragEvent, index: number) => {
      event.preventDefault();

      // Handle video drop zones
      if (this.contentState.dragContentType === 'video') {
        const playlist = options.playlists[index];
        if (event.currentTarget instanceof HTMLElement) {
          const classes = this.contentState.getVideoDropzoneClasses(
            playlist,
            options.session
          );
          event.currentTarget.classList.add(...classes);
          event.currentTarget.classList.remove(
            ...this.contentState.getEndDropzoneClasses()
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
        if (this.contentState.dragContentType === 'playlist') {
          this.targetIndex = null;
        }

        // Handle video drop zone styling
        if (this.contentState.dragContentType === 'video') {
          const playlist = options.playlists[index];
          const classes = this.contentState.getVideoDropzoneClasses(
            playlist,
            options.session
          );
          event.currentTarget.classList.remove(...classes);
          event.currentTarget.classList.add(
            ...this.contentState.getEndDropzoneClasses()
          );
        }
      }
    };

    const handleDrop = async (
      event: DragEvent,
      playlistTargetIndex: number
    ) => {
      if (!options.session) {
        return;
      }

      if (event.currentTarget instanceof HTMLElement) {
        const classes = this.contentState.getVideoDropzoneClasses(
          options.playlists[playlistTargetIndex],
          options.session
        );
        event.currentTarget.classList.remove(...classes);
        event.currentTarget.classList.add(
          ...this.contentState.getEndDropzoneClasses()
        );
      }

      if (this.contentState.dragContentType === 'video') {
        // Get all selected videos from all sections
        const allSelectedVideos = this.getAllSelectedVideos();

        // Combine all videos into a single array for the playlist operation
        const allVideos = allSelectedVideos.flatMap(
          (section) => section.videos
        );

        if (allVideos.length > 0) {
          await handleAddVideosToPlaylist({
            playlist: options.playlists[playlistTargetIndex],
            videos: allVideos,
            sidebarState: this.sidebarState,
            supabase: options.supabase,
            session: options.session,
          });
        }
      } else if (this.contentState.dragContentType === 'playlist') {
        if (this.draggedIndex === null || this.draggedIndex < 0) {
          return;
        }

        // Store original state for potential rollback
        const originalPlaylists = [...options.playlists];

        // Update local state immediately for responsive UI
        const updatedPlaylists = [...options.playlists];
        const [movedItem] = updatedPlaylists.splice(this.draggedIndex, 1);
        updatedPlaylists.splice(playlistTargetIndex, 0, movedItem);
        options.onPlaylistsUpdate?.(updatedPlaylists);

        // Then update database
        handleUpdatePlaylistPosition({
          playlist: options.playlists[this.draggedIndex],
          position: options.playlists.length - playlistTargetIndex,
          supabase: options.supabase,
          session: options.session,
        });
      }
    };

    const handleDragEnd = () => {
      this.draggedIndex = null;
      this.targetIndex = null;
      this.hoveredPlaylistIndex = null;
      this.contentState.dragContentType = null; // Reset drag content type

      // Remove global dragging class
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('dragging');
      }

      // Re-enable hover states after drag operation completes
      this.contentState.enableHoverStatesAfterDrag();
    };

    return {
      handleDragStart,
      handleDragOver,
      handleDragLeave,
      handleDrop,
      handleDragEnd,
    };
  }
}

// Export the class type for use elsewhere
export type PlaylistState = PlaylistStateClass;

const DEFAULT_KEY = '$_playlist_state';

export function setPlaylistState(
  pageState: PageState,
  contentState: ContentState,
  sidebarState: SidebarState,
  key = DEFAULT_KEY
) {
  const playlistState = new PlaylistStateClass(
    pageState,
    contentState,
    sidebarState
  );
  return setContext(key, playlistState);
}

export function getPlaylistState(key = DEFAULT_KEY) {
  return getContext<PlaylistState>(key);
}
