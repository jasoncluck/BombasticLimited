import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export async function getActiveStreams({
  supabase,
}: {
  supabase: SupabaseClient<Database>;
}) {
  const { data, error } = await supabase
    .from('active_streams')
    .select('source')
    .eq('is_live', true);

  if (error) {
    console.error('❌ Failed to fetch active streams from database:', error);
    throw error;
  }

  const sources = data.map(({ source }) => source) || [];

  return { sources };
}
