import { type Database } from "../../src/lib/supabase/database.types";

export const CHANNEL_SOURCES: Database["public"]["Enums"]["source"][] = [
  "nextlander",
  "giantbomb",
  "remap",
] as const;
export type ChannelSource = (typeof CHANNEL_SOURCES)[number];

interface ChannelInfo {
  id: string;
  uploadPlaylistId: string;
}

export const CHANNEL_INFO: Record<ChannelSource, ChannelInfo> = {
  nextlander: {
    id: "UCO0gHyqLNeIrCAjwlO2BmiA",
    uploadPlaylistId: "UUO0gHyqLNeIrCAjwlO2BmiA",
  },
  giantbomb: {
    id: "UCmeds0MLhjfkjD_5acPnFlQ",
    uploadPlaylistId: "UUmeds0MLhjfkjD_5acPnFlQ",
  },
  remap: {
    id: "UCpcSq3A3Z4tUJsHKfn8zpnA",
    uploadPlaylistId: "UUpcSq3A3Z4tUJsHKfn8zpnA",
  },
} as const;

export type SourceInfo = keyof typeof CHANNEL_INFO;
