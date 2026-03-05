import { type Database } from '../../src/lib/supabase/database.types';

export const CHANNEL_SOURCES: Database['public']['Enums']['source'][] = [
  'giantbomb',
  'jeffgerstmann',
  'nextlander',
  'remap',
] as const;
export type ChannelSource = (typeof CHANNEL_SOURCES)[number];

interface ChannelInfo {
  id: string;
  uploadPlaylistId: string;
}

export const CHANNEL_INFO: Record<ChannelSource, ChannelInfo> = {
  giantbomb: {
    id: 'UCmeds0MLhjfkjD_5acPnFlQ',
    uploadPlaylistId: 'UUmeds0MLhjfkjD_5acPnFlQ',
  },
  jeffgerstmann: {
    id: 'UCR9R2ARN74dCebn1kv06UhA',
    uploadPlaylistId: 'UUR9R2ARN74dCebn1kv06UhA',
  },
  nextlander: {
    id: 'UCO0gHyqLNeIrCAjwlO2BmiA',
    uploadPlaylistId: 'UUO0gHyqLNeIrCAjwlO2BmiA',
  },
  remap: {
    id: 'UCpcSq3A3Z4tUJsHKfn8zpnA',
    uploadPlaylistId: 'UUpcSq3A3Z4tUJsHKfn8zpnA',
  },
} as const;

export type SourceInfo = keyof typeof CHANNEL_INFO;
