import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/supabase/database.types'; // import generated types

// MDsveX module declarations
declare module '*.md' {
  import type { ComponentType, SvelteComponent } from 'svelte';
  
  interface MarkdownMetadata {
    title?: string;
    description?: string;
    date?: string;
    published?: boolean;
    [key: string]: any;
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
    [key: string]: any;
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
      safeGetSession: () => Promise<{
        session: Session | null;
        user: User | null;
      }>;
      session: Session | null;
      user: User | null;
    }
    interface PageData {
      session: Session | null;
      flash?: {
        type: 'success' | 'error';
        message: string;
        field?: 'email' | 'username' | 'password' | 'delete' | 'discord';
      };
    }
    // interface PageState {}
    // interface Platform {}
  }
}
export {};
