import { getContext, setContext } from 'svelte';
import type { PodcastEpisode } from '$lib/supabase/podcasts/types';

/**
 * Global "now playing" state for the persistent podcast player bar
 * (podcast-player-bar.svelte, mounted once in (app)/+layout.svelte). This
 * class is the source of truth; the single shared <audio> element in the bar
 * reacts to it (and writes playback progress back into it) so starting an
 * episode from any page keeps playing across client-side navigation, the
 * same way navigation/sidebar state already survives navigation.
 */
export interface PodcastPlayerState {
  currentEpisode: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;

  play: (episode: PodcastEpisode) => void;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => void;
  skip: (deltaSeconds: number) => void;
  setVolume: (volume: number) => void;
  close: () => void;
}

const SKIP_SECONDS = 15;

export class PodcastPlayerStateClass implements PodcastPlayerState {
  currentEpisode = $state<PodcastEpisode | null>(null);
  isPlaying = $state(false);
  currentTime = $state(0);
  duration = $state(0);
  volume = $state(1);

  /** Starts a new episode, or resumes the current one if it's already loaded. */
  play = (episode: PodcastEpisode): void => {
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
    this.isPlaying = !this.isPlaying;
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
