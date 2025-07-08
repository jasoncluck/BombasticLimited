export const SOURCES: Array<Database["public"]["Enums"]["source"]> = [
  "nextlander",
  "giantbomb",
  "remap",
] as const;
export type Source = (typeof SOURCES)[number];

import nextlanderImage from "$lib/assets/nextlander.jpg";
import giantbombImage from "$lib/assets/giantbomb.jpg";
import remapImage from "$lib/assets/remap.jpg";
import type { Database } from "$lib/supabase/database.types";

type HighlightPlaylist = {
  youtubeId: string;
  name: string;
};

interface SourceInfo {
  displayName: string;
  urlParam: string;
  image: string;
  twitchId: string;
  youtubeId: string;
  youtubeUrl: string;
  highlightedPlaylists: HighlightPlaylist[];
  websiteUrlDomain?: string;
  supportUrl: string;
}

export const SOURCE_INFO: Record<Source, SourceInfo> = {
  nextlander: {
    displayName: "Nextlander",
    urlParam: "nextlander",
    image: nextlanderImage,
    twitchId: "689331234",
    youtubeId: "UCO0gHyqLNeIrCAjwlO2BmiA",
    youtubeUrl: "https://www.youtube.com/@Nextlander",
    highlightedPlaylists: [],
    supportUrl: "https://www.patreon.com/nextlander/",
  },
  giantbomb: {
    displayName: "Giant Bomb",
    urlParam: "giantbomb",
    image: giantbombImage,
    twitchId: "504350",
    youtubeId: "UCmeds0MLhjfkjD_5acPnFlQ",
    youtubeUrl: "https://www.youtube.com/giantbomb",
    highlightedPlaylists: [
      { name: "Blight Club", youtubeId: "PLXlhzeWIuTHIGNBahKzWx9Hy54BXtM8Ef" },
      {
        name: "Voicemail Dump Truck",
        youtubeId: "PLXlhzeWIuTHLjtyPTm42V-jPS70IYXOjJ",
      },
    ],
    websiteUrlDomain: "giantbomb.com",
    supportUrl: "https://www.giantbomb.com/upgrade/",
  },
  remap: {
    displayName: "Remap",
    urlParam: "remap",
    image: remapImage,
    twitchId: "913491352",
    youtubeId: "UCpcSq3A3Z4tUJsHKfn8zpnA",
    youtubeUrl: "https://www.youtube.com/@RemapRadio",
    highlightedPlaylists: [
      { name: "Remap Radio", youtubeId: "PLTbM52Fro5psVDi5r1StiTdnLxM9McaSO" },
    ],
    websiteUrlDomain: "remapradio.com",
    supportUrl: "https://remapradio.com/signup/",
  },
} as const;

export type Sources = keyof typeof SOURCE_INFO;

export function isSourceArray(value: unknown): value is Source[] {
  return (
    value instanceof Array && value.every((item) => typeof item === "string")
  );
}

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && Object.keys(SOURCE_INFO).includes(value);
}
