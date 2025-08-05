import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from './database.types';
import type { ContentDisplay } from '$lib/components/content/content';

export type UserProfile = Tables<'profiles'>;

export async function checkIfUsernameIsUnique({
  username,
  supabase,
}: {
  username: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data: isUnique } = await supabase.rpc('is_unique_username', {
    p_username: username,
  });

  return isUnique;
}

export async function getUserProfile({
  userId,
  supabase,
}: {
  userId: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select()
    .eq('id', userId)
    .single();

  if (error) {
    console.error(error);
  }
  return { profile, error };
}

export async function getProfile({
  session,
  supabase,
}: {
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    return { profile: null, error: null };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error(error);
  }
  return { profile, error };
}

export async function getUserDiscordIdentity({
  userId,
  supabase,
}: {
  userId: string;
  supabase: SupabaseClient<Database>;
}) {
  // For the initial implementation, we'll return null and implement this after the migration
  // This will be properly implemented once the database functions are deployed
  return { identity: null, error: null };
}

export async function linkDiscordIdentity({
  supabase,
  redirectTo,
}: {
  supabase: SupabaseClient<Database>;
  redirectTo: string;
}) {
  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'discord',
    options: {
      redirectTo,
    },
  });

  return { data, error };
}

export async function unlinkDiscordIdentity({
  userId,
  supabase,
}: {
  userId: string;
  supabase: SupabaseClient<Database>;
}) {
  try {
    // For the initial implementation, return an error indicating this needs to be implemented
    // after the database migration is applied
    return { error: new Error('Discord unlinking will be available after account is linked') };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function updateProfileContentDisplay({
  contentDisplay,
  supabase,
  session,
}: {
  contentDisplay: ContentDisplay;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    return { profile: null, error: null };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ content_display: contentDisplay })
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error(error);
  }
  return { profile, error };
}

export async function updateProfileSources({
  sources,
  supabase,
  session,
}: {
  sources: Database['public']['Enums']['source'][];
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  if (!session) {
    return { profile: null, error: null };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ sources })
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error(error);
  }

  return { profile, error };
}
