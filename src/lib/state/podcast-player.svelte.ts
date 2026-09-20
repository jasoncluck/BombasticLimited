import { getContext, setContext } from 'svelte';
import type { PodcastEpisode } from '$lib/supabase/podcasts/types';

/**
 * Global "now playing" state for the persistent player bar
 * (podcast-player-bar.svelte, mounted once in (app)/+layout.svelte).
 *
 * The bar itself is podcast-only — video playback uses YouTube's own
 * default controls. The two still can't both make sound at once, though:
 * youtube-embed.svelte registers a VideoController here so starting a
 * podcast can pause a playing video, and calls notifyVideoPlaying() when
 * the video starts so a playing podcast gets paused in the other
 * direction.
 */
interface VideoController {
  pause: () => void;
}

export interface PodcastPlayerState {
  currentEpisode: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;

  play: (episode: PodcastEpisode) => void;
  togglePlayPause: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  skip: (deltaSeconds: number) => void;
  setVolume: (volume: number) => void;
  close: () => void;

  registerVideoController: (controller: VideoController | null) => void;
  notifyVideoPlaying: () => void;
}

const SKIP_SECONDS = 15;

export class PodcastPlayerStateClass implements PodcastPlayerState {
  currentEpisode = $state<PodcastEpisode | null>(null);
  isPlaying = $state(false);
  currentTime = $state(0);
  duration = $state(0);
  volume = $state(1);

  #videoController: VideoController | null = null;

  registerVideoController = (controller: VideoController | null): void => {
    this.#videoController = controller;
  };

  /** Called by youtube-embed.svelte when a video starts playing, pausing
   * any playing podcast — mirrors play()/togglePlayPause() pausing the
   * video below. */
  notifyVideoPlaying = (): void => {
    this.isPlaying = false;
  };

  /** Starts a new episode, or resumes the current one if it's already loaded. */
  play = (episode: PodcastEpisode): void => {
    this.#videoController?.pause();

    if (this.currentEpisode?.id === episode.id) {
      this.isPlaying = true;
      return;
    }

    this.currentEpisode = episode;
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = true;
  };

  togglePlayPause = (): void => {
    if (!this.currentEpisode) return;
    const next = !this.isPlaying;
    if (next) {
      this.#videoController?.pause();
    }
    this.isPlaying = next;
  };

  pause = (): void => {
    this.isPlaying = false;
  };

  seekTo = (seconds: number): void => {
    const max = this.duration || Infinity;
    this.currentTime = Math.max(0, Math.min(seconds, max));
  };

  skip = (deltaSeconds: number = SKIP_SECONDS): void => {
    this.seekTo(this.currentTime + deltaSeconds);
  };

  setVolume = (volume: number): void => {
    this.volume = Math.max(0, Math.min(1, volume));
  };

  close = (): void => {
    this.currentEpisode = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
  };
}

const DEFAULT_KEY = '$_podcast_player_state';

export function setPodcastPlayerState(
  key = DEFAULT_KEY
): PodcastPlayerStateClass {
  const podcastPlayerState = new PodcastPlayerStateClass();
  return setContext(key, podcastPlayerState);
}

export function getPodcastPlayerState(key = DEFAULT_KEY): PodcastPlayerState {
  return getContext<PodcastPlayerState>(key);
}
