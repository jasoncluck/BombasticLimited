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
  try {
    // Try to use the RPC function to get user identities
    // Note: This will fail initially until the migration is applied
    const result = await supabase.rpc('get_user_identities' as any, {
      user_id: userId,
    });

    if (result.error) {
      console.error('Error fetching Discord identity:', result.error);
      return { identity: null, error: result.error };
    }

    if (!result.data) {
      return { identity: null, error: null };
    }

    // Parse the JSON response and find Discord identity
    let identitiesArray: any[] = [];
    if (Array.isArray(result.data)) {
      identitiesArray = result.data;
    } else if (typeof result.data === 'string') {
      try {
        identitiesArray = JSON.parse(result.data);
      } catch {
        identitiesArray = [];
      }
    }

    const discordIdentity = identitiesArray.find(
      (identity: any) => identity.provider === 'discord'
    );
    return { identity: discordIdentity || null, error: null };
  } catch (err) {
    // If RPC function doesn't exist yet, return null gracefully
    console.log('RPC function get_user_identities not yet available:', err);
    return { identity: null, error: null };
  }
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
    // Get the Discord identity first
    const { identity, error: fetchError } = await getUserDiscordIdentity({
      userId,
      supabase,
    });

    if (fetchError || !identity) {
      return { error: fetchError || new Error('No Discord identity found') };
    }

    // Use the correct parameters for unlinkIdentity based on Supabase documentation
    const { error } = await supabase.auth.unlinkIdentity({
      provider: 'discord',
      user_id: userId,
      identity_id: identity.id,
    } as any);

    return { error };
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
