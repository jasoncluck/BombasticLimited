import type { SupabaseClient, Session } from '@supabase/supabase-js';
import type { ContentDisplay } from '../content/content';
import type { Database } from '$lib/supabase/database.types';
import { updateProfileContentDisplay } from '$lib/supabase/user-profiles';
import { invalidateAll } from '$app/navigation';

export async function handleUpdateProfileContentDisplay(props: {
  contentDisplay: ContentDisplay;
  supabase: SupabaseClient<Database>;
  session: Session | null;
}) {
  await updateProfileContentDisplay(props);
  invalidateAll();
}

export function getUserInitials(username: string | null) {
  if (!username) return '??';

  // Remove common prefixes and clean the username
  const cleaned = username
    .replace(/^[@#]/, '') // Remove @ or # prefixes
    .replace(/[^a-zA-Z0-9]/g, ''); // Keep only alphanumeric characters

  if (cleaned.length === 0) return '??';
  if (cleaned.length === 1) return cleaned.toUpperCase();

  // Try to find two meaningful characters
  const firstChar = cleaned[0];

  // Look for the first uppercase letter after the first character
  // or the first vowel, or just use the second character
  let secondChar = cleaned[1];

  for (let i = 1; i < cleaned.length; i++) {
    const char = cleaned[i];
    // Prefer uppercase letters (camelCase usernames)
    if (char === char.toUpperCase() && char !== char.toLowerCase()) {
      secondChar = char;
      break;
    }
    // Or vowels for better readability
    if (i === 1 && /[aeiouAEIOU]/.test(char)) {
      secondChar = char;
      break;
    }
  }
  return (firstChar + secondChar).toUpperCase();
}
