import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from './database.types';
import type { ContentDisplay } from '$lib/components/content/content';

// Infer types from Supabase RPC functions
type IsUniqueUsernameResponse =
  Database['public']['Functions']['is_unique_username']['Returns'];

export type UserProfile = Tables<'profiles'>;

// Transform function if needed (profiles are simple table queries, so probably not needed)
function transformProfileFromTable(profile: Tables<'profiles'>): UserProfile {
  return profile;
}

export async function checkIfUsernameIsUnique({
  username,
  supabase,
}: {
  username: string;
  supabase: SupabaseClient<Database>;
}): Promise<boolean> {
  const { data: isUnique } = await supabase.rpc('is_unique_username', {
    p_username: username,
  });

  return (isUnique as IsUniqueUsernameResponse) ?? false;
}

export async function getUserProfile({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}) {
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (!claimsData?.claims || claimsError) {
    return { profile: null, error: claimsError };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select()
    .eq('id', claimsData.claims.sub)
    .single();

  if (error) {
    console.error(error);
    return { profile: null, error };
  }

  return {
    profile: profile ? transformProfileFromTable(profile) : null,
    error,
  };
}

export async function getProfileById({
  userId,
  supabase,
}: {
  userId: string | null;
  supabase: SupabaseClient<Database>;
}) {
  if (!userId) {
    return { profile: null };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select()
    .eq('id', userId)
    .single();

  if (error) {
    console.error(error);
    return { profile: null, error };
  }

  return {
    profile: profile ? transformProfileFromTable(profile) : null,
    error,
  };
}

export async function getProfile({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}) {
  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (!data || !data.claims || !data.claims.sub || claimsError) {
    return { profile: null, error: claimsError };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.claims.sub)
    .single();

  if (error) {
    console.error(error);
    return { profile: null, error };
  }

  return {
    profile: profile ? transformProfileFromTable(profile) : null,
    error,
  };
}

export async function getUserDiscordIdentity({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}) {
  try {
    const { data: userIdentities } = await supabase.auth.getUserIdentities();

    if (!userIdentities) {
      return { identity: null, error: 'No identities found' };
    }

    const discordIdentity = userIdentities.identities.find(
      (identity) => identity.provider === 'discord'
    );

    if (!discordIdentity) {
      return { identity: null, error: null }; // No discord identity is not an error
    }

    return { identity: discordIdentity, error: null };
  } catch (err) {
    return {
      identity: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
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
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}) {
  try {
    const { identity: discordIdentity, error } = await getUserDiscordIdentity({
      supabase,
    });

    if (error) {
      return { error: new Error(error) };
    }

    if (!discordIdentity) {
      return { error: new Error('No Discord identity found to unlink') };
    }

    const { error: unlinkError } =
      await supabase.auth.unlinkIdentity(discordIdentity);

    return { error: unlinkError };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function updateProfileContentDisplay({
  contentDisplay,
  supabase,
}: {
  contentDisplay: ContentDisplay;
  supabase: SupabaseClient<Database>;
}) {
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (!claimsData?.claims || claimsError) {
    return { profile: null, error: claimsError };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ content_display: contentDisplay })
    .eq('id', claimsData.claims.sub)
    .select()
    .single();

  if (error) {
    console.error(error);
    return { profile: null, error };
  }

  return {
    profile: profile ? transformProfileFromTable(profile) : null,
    error,
  };
}

export async function updateProfileSources({
  sources,
  supabase,
}: {
  sources: Database['public']['Enums']['source'][];
  supabase: SupabaseClient<Database>;
}) {
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (!claimsData?.claims || claimsError) {
    return { profile: null, error: claimsError };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ sources })
    .eq('id', claimsData.claims.sub)
    .select()
    .single();

  if (error) {
    console.error(error);
    return { profile: null, error };
  }

  return {
    profile: profile ? transformProfileFromTable(profile) : null,
    error,
  };
}

/**
 * Get the linked identity providers for a user
 * This information is managed automatically by database triggers
 * but can be useful for UI display purposes
 */
export async function getUserProviders({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}) {
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (!claimsData?.claims || claimsError) {
    return { providers: [], error: null };
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('providers')
    .eq('id', claimsData.claims.sub)
    .single();

  if (error) {
    console.error('Error fetching user providers:', error);
    return { providers: [], error };
  }

  return { providers: profile?.providers || [], error: null };
}
