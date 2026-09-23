import type { ContentDisplay } from '../content/content';
import { invalidateAll, invalidate } from '$app/navigation';
import type { Source } from '$lib/constants/source';

export async function handleUpdateProfileContentDisplay(props: {
  contentDisplay: ContentDisplay;
}) {
  await fetch('/api/profile/content-display', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(props),
  });
  invalidateAll();
}

/**
 * Persists the user's enabled/ordered source list (profiles.sources) — the
 * same column the sidebar's drag-to-reorder writes to, so toggling a source
 * here and reordering in the sidebar stay consistent. Order among enabled
 * sources is preserved; a newly re-enabled source is appended at the end
 * rather than restored to its previous position.
 */
export async function handleUpdateProfileSources(props: {
  sources: Source[];
}): Promise<{ error?: unknown }> {
  try {
    const response = await fetch('/api/profile/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(props),
    });

    if (!response.ok) {
      return { error: new Error('Failed to update sources') };
    }

    await Promise.all([
      invalidate('app:profile'),
      invalidate('neon:db:profiles'),
    ]);

    return {};
  } catch (error) {
    return { error };
  }
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
