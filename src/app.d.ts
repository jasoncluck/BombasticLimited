import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types';

// MDsveX module declarations
declare module '*.md' {
  import type { ComponentType, SvelteComponent } from 'svelte';

  interface MarkdownMetadata {
    title?: string;
    description?: string;
    date?: string;
    published?: boolean;
    tags?: string[];
    slug?: string;
    author?: string;
    excerpt?: string;
    image?: string;
    category?: string;
    [key: string]: string | number | boolean | string[] | undefined;
  }

  const component: ComponentType<SvelteComponent>;
  export const metadata: MarkdownMetadata;
  export default component;
}

declare module '*.svx' {
  import type { ComponentType, SvelteComponent } from 'svelte';

  interface MarkdownMetadata {
    title?: string;
    description?: string;
    date?: string;
    published?: boolean;
    tags?: string[];
    slug?: string;
    author?: string;
    excerpt?: string;
    image?: string;
    category?: string;
    [key: string]: string | number | boolean | string[] | undefined;
  }

  const component: ComponentType<SvelteComponent>;
  export const metadata: MarkdownMetadata;
  export default component;
}

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      supabase: SupabaseClient<Database>;
      userId: string | null;
    }
    interface PageData {
      flash?: {
        type: 'success' | 'error';
        message: string;
        field?: 'email' | 'username' | 'password' | 'delete' | 'discord';
      };
    }
    // interface PageState {}
    // interface Platform {}
  }

  // Global window extensions
  interface Window {
    Twitch?: TwitchEmbedAPI;
  }
}

export {};
