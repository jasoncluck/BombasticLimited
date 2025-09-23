export const SOURCES: Array<Database['public']['Enums']['source']> = [
  'giantbomb',
  'jeffgerstmann',
  'nextlander',
  'remap',
] as const;
export type Source = (typeof SOURCES)[number];
import type { Picture } from 'vite-imagetools';

import nextlanderImage from '$lib/assets/nextlander.jpg?enhanced';
import giantbombImage from '$lib/assets/giantbomb.jpg?enhanced';
import jeffgerstmannImage from '$lib/assets/jeffgerstmann.jpg?enhanced';
import remapImage from '$lib/assets/remap.jpg?enhanced';
import type { Database } from '$lib/supabase/database.types';

export type HighlightPlaylist = {
  youtubeId: string;
  name: string;
};

interface SourceInfo {
  displayName: string;
  // Twitch username override for using when twitch
  // username different than source
  twitchUserName?: string;
  urlParam: string;
  image: Picture;
  twitchId: string;
  youtubeId: string;
  youtubeUrl: string;
  highlightedPlaylists: HighlightPlaylist[];
  websiteUrlDomain?: string;
  supportUrl: string;
}

export const SOURCE_INFO: Record<Source, SourceInfo> = {
  giantbomb: {
    displayName: 'Giant Bomb',
    urlParam: 'giantbomb',
    image: giantbombImage,
    twitchId: '504350',
    youtubeId: 'UCmeds0MLhjfkjD_5acPnFlQ',
    youtubeUrl: 'https://www.youtube.com/giantbomb',
    highlightedPlaylists: [
      { name: 'Blight Club', youtubeId: 'PLXlhzeWIuTHIGNBahKzWx9Hy54BXtM8Ef' },
      {
        name: 'Voicemail Dump Truck',
        youtubeId: 'PLXlhzeWIuTHLjtyPTm42V-jPS70IYXOjJ',
      },
    ],
    websiteUrlDomain: 'giantbomb.com',
    supportUrl: 'https://www.giantbomb.com/upgrade/',
  },
  jeffgerstmann: {
    displayName: 'Jeff Gerstmann',
    urlParam: 'jeffgerstmann',
    image: jeffgerstmannImage,
    twitchId: '13831039',
    youtubeId: 'UCR9R2ARN74dCebn1kv06UhA',
    youtubeUrl: 'https://www.youtube.com/@JeffGerstmannShow',
    highlightedPlaylists: [
      {
        name: 'Quick Looks at New Video Games',
        youtubeId: 'PLDKeuvgV0sxZ78sutjkPvhM9sL74WHITb',
      },
      {
        name: 'Ranking the NES!',
        youtubeId: 'PLDKeuvgV0sxZ_xs4zUvQcMEV-LTjSf-Ok',
      },
    ],
    supportUrl: 'https://www.patreon.com/cw/jeffgerstmann',
  },
  nextlander: {
    displayName: 'Nextlander',
    urlParam: 'nextlander',
    image: nextlanderImage,
    twitchId: '689331234',
    youtubeId: 'UCO0gHyqLNeIrCAjwlO2BmiA',
    youtubeUrl: 'https://www.youtube.com/@Nextlander',
    highlightedPlaylists: [
      {
        name: "Patron's Choice Streams",
        youtubeId: 'PL8GKXV8flVOZHp20zbwR6mWXdjVyKdsDD',
      },
      {
        name: "Talkin' Over Things",
        youtubeId: 'PL8GKXV8flVOaonOnH-Am9gz-FEfFGb8xz',
      },
    ],
    supportUrl: 'https://www.patreon.com/nextlander/',
  },
  remap: {
    displayName: 'Remap',
    twitchUserName: 'RemapRadio',
    urlParam: 'remap',
    image: remapImage,
    twitchId: '913491352',
    youtubeId: 'UCpcSq3A3Z4tUJsHKfn8zpnA',
    youtubeUrl: 'https://www.youtube.com/@RemapRadio',
    highlightedPlaylists: [
      {
        name: 'Wheel of GeForce Now',
        youtubeId: 'PLTbM52Fro5psQ2WIdV9M7YgfWMrnv8wLu',
      },
      { name: 'Remap Radio', youtubeId: 'PLTbM52Fro5psVDi5r1StiTdnLxM9McaSO' },
    ],
    websiteUrlDomain: 'remapradio.com',
    supportUrl: 'https://remapradio.com/signup/',
  },
} as const;

export type Sources = keyof typeof SOURCE_INFO;

export function isSourceArray(value: unknown): value is Source[] {
  return (
    value instanceof Array && value.every((item) => typeof item === 'string')
  );
}

export function isSource(value: unknown): value is Source {
  return typeof value === 'string' && Object.keys(SOURCE_INFO).includes(value);
}
