import { getContext, setContext } from 'svelte';
import type { PodcastEpisode } from '$lib/supabase/podcasts/types';

/**
 * Global "now playing" state for the persistent player bar
 * (podcast-player-bar.svelte, mounted once in (app)/+layout.svelte).
 *
 * Coordinates two things that can't both make sound at once: podcast
 * episodes (played entirely through this class + the bar's <audio>
 * element, so they survive client-side navigation) and the YouTube video
 * player (which only exists while youtube-embed.svelte is mounted on a
 * video page — it registers itself here via registerVideoController so
 * starting a podcast can pause it, and reports its own play/pause/time via
 * updateVideoState so starting the video can pause the podcast and the bar
 * can show the video's title/length while it's playing).
 */
export interface NowPlayingVideo {
  id: string;
  title: string;
  channelName: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

interface VideoController {
  play: () => void;
  pause: () => void;
  seek: (deltaSeconds: number) => void;
  seekTo: (seconds: number) => void;
}

export interface PodcastPlayerState {
  currentEpisode: PodcastEpisode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  nowPlayingVideo: NowPlayingVideo | null;
  activeMedia: 'podcast' | 'video' | null;

  play: (episode: PodcastEpisode) => void;
  togglePlayPause: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
  skip: (deltaSeconds: number) => void;
  setVolume: (volume: number) => void;
  close: () => void;

  registerVideoController: (controller: VideoController | null) => void;
  updateVideoState: (video: NowPlayingVideo | null) => void;
  toggleVideoPlayPause: () => void;
  skipVideo: (deltaSeconds: number) => void;
  seekVideoTo: (seconds: number) => void;
}

const SKIP_SECONDS = 15;

export class PodcastPlayerStateClass implements PodcastPlayerState {
  currentEpisode = $state<PodcastEpisode | null>(null);
  isPlaying = $state(false);
  currentTime = $state(0);
  duration = $state(0);
  volume = $state(1);

  nowPlayingVideo = $state<NowPlayingVideo | null>(null);
  activeMedia = $state<'podcast' | 'video' | null>(null);

  #videoController: VideoController | null = null;

  registerVideoController = (controller: VideoController | null): void => {
    this.#videoController = controller;
  };

  /**
   * Called by youtube-embed.svelte whenever the video's ready state,
   * play/pause state, or current time changes. Starting video playback
   * pauses the podcast, mirroring the other direction in play()/
   * togglePlayPause() below.
   */
  updateVideoState = (video: NowPlayingVideo | null): void => {
    this.nowPlayingVideo = video;

    if (!video) {
      if (this.activeMedia === 'video') {
        this.activeMedia = null;
      }
      return;
    }

    if (video.isPlaying) {
      this.isPlaying = false;
      this.activeMedia = 'video';
    }
  };

  toggleVideoPlayPause = (): void => {
    // No early return on a missing nowPlayingVideo: that's the state
    // before the video has ever reported in (e.g. the very first click on
    // a freshly loaded page, before onStateChange has fired once) — with
    // native YouTube controls hidden, this is the only way to start it.
    if (this.nowPlayingVideo?.isPlaying) {
      this.#videoController?.pause();
    } else {
      this.activeMedia = 'video';
      this.#videoController?.play();
    }
  };

  skipVideo = (deltaSeconds: number = SKIP_SECONDS): void => {
    this.#videoController?.seek(deltaSeconds);
  };

  seekVideoTo = (seconds: number): void => {
    this.#videoController?.seekTo(Math.max(0, seconds));
  };

  /** Starts a new episode, or resumes the current one if it's already loaded. */
  play = (episode: PodcastEpisode): void => {
    this.#videoController?.pause();
    this.activeMedia = 'podcast';

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
      this.activeMedia = 'podcast';
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
