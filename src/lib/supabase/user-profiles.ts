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
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}) {
  const { data: userIdentities } = await supabase.auth.getUserIdentities();

  if (!userIdentities) {
    throw new Error('Unable to unlink discord identity, no identities found.');
  }

  const discordIdentity = userIdentities.identities.find(
    (identity) => identity.provider === 'discord'
  );

  if (!discordIdentity) {
    throw new Error(
      'Unable to unlink discord identity, no discord identity found.'
    );
  }

  return discordIdentity;
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
  supabase,
}: {
  userId: string;
  supabase: SupabaseClient<Database>;
}) {
  try {
    const discordIdentity = await getUserDiscordIdentity({ supabase });

    const { error } = await supabase.auth.unlinkIdentity(discordIdentity);

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

/**
 * Get the linked identity providers for a user
 * This information is managed automatically by database triggers
 * but can be useful for UI display purposes
 */
export async function getUserProviders({
  userId,
  supabase,
}: {
  userId: string;
  supabase: SupabaseClient<Database>;
}) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('providers')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching user providers:', error);
    return { providers: [], error };
  }

  return { providers: profile?.providers || [], error: null };
}
