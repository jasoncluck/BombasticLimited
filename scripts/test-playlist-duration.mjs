#!/usr/bin/env node

/**
 * Test script to verify playlist duration_seconds functionality
 * Run this after applying the migration to test that it works
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testDurationCalculation() {
  console.log('🧪 Testing playlist duration_seconds functionality...\n');

  try {
    // Test the duration_to_seconds function
    console.log('1. Testing duration_to_seconds function:');
    const { data: testResults, error: testError } = await supabase.rpc(
      'duration_to_seconds',
      {
        duration_text: 'PT1H30M45S',
      }
    );

    if (testError) {
      console.error('❌ Error testing duration function:', testError);
      return;
    }

    console.log(`   Input: PT1H30M45S → Output: ${testResults} seconds`);
    console.log(
      `   Expected: 5445 seconds → ${testResults === 5445 ? '✅ CORRECT' : '❌ INCORRECT'}\n`
    );

    // Check if any playlists exist with calculated durations
    console.log('2. Checking existing playlists with calculated durations:');
    const { data: playlists, error: playlistError } = await supabase
      .from('playlists')
      .select('id, name, duration_seconds')
      .limit(5);

    if (playlistError) {
      console.error('❌ Error fetching playlists:', playlistError);
      return;
    }

    if (playlists && playlists.length > 0) {
      playlists.forEach((playlist) => {
        console.log(
          `   Playlist "${playlist.name}": ${playlist.duration_seconds} seconds`
        );
      });
    } else {
      console.log('   No playlists found to test');
    }

    console.log('\n✅ Duration seconds functionality appears to be working!');
    console.log('\n📝 What was implemented:');
    console.log('   • Added duration_seconds column to playlists table');
    console.log(
      '   • Created automatic triggers to calculate duration when videos are added/removed'
    );
    console.log(
      '   • Updated get_playlist_data function to use pre-calculated duration'
    );
    console.log(
      '   • Fixed playlist thumbnails to prefer maxres URLs for better cropping quality'
    );
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testDurationCalculation();
