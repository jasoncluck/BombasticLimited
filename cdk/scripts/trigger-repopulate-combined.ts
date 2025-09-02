#!/usr/bin/env node
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import * as dotenv from 'dotenv';
import { CHANNEL_SOURCES } from '../lib/channel';

dotenv.config();

const lambda = new LambdaClient({
  region: process.env.AWS_REGION || 'us-west-2',
});

// Detect staging flag
const isStaging = process.argv.includes('--staging');

// Helper function to get function name with staging suffix if needed
function getFunctionName(baseName: string, envVarName?: string): string {
  // Environment variables take precedence
  if (envVarName && process.env[envVarName]) {
    return process.env[envVarName]!;
  }

  // Add staging suffix if staging flag is present
  return isStaging ? `${baseName}-Staging` : baseName;
}

const VIDEOS_FUNCTION_NAME = getFunctionName(
  'BombasticPopulateVideos',
  'LAMBDA_FUNCTION_NAME'
);
const PLAYLISTS_FUNCTION_NAME = getFunctionName(
  'BombasticPopulatePlaylists',
  'PLAYLISTS_LAMBDA_FUNCTION_NAME'
);

async function invokeLambdaSync(
  functionName: string,
  payload: any
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();

  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
      InvocationType: 'RequestResponse',
    });

    const response = await lambda.send(command);
    const duration = Math.round((Date.now() - startTime) / 1000);

    if (response.FunctionError) {
      return {
        success: false,
        duration,
        error: response.FunctionError,
      };
    }

    return { success: true, duration };
  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    return {
      success: false,
      duration,
      error: (error as Error).message,
    };
  }
}

async function triggerRepopulateCombined() {
  // Filter out arguments that start with '--' and the '--' separator
  const args = process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith('--') && arg !== '--');
  const specificSource = args[0]; // First non-flag argument

  const videosOnly = process.argv.includes('--videos-only');
  const playlistsOnly = process.argv.includes('--playlists-only');

  // Validate specificSource if provided
  let sources;
  if (specificSource) {
    if (!CHANNEL_SOURCES.includes(specificSource as any)) {
      console.error(`❌ Invalid source: ${specificSource}`);
      console.error(`   Valid sources are: ${CHANNEL_SOURCES.join(', ')}`);
      process.exit(1);
    }
    sources = [specificSource];
  } else {
    sources = CHANNEL_SOURCES;
  }

  if (videosOnly && playlistsOnly) {
    console.error(
      '❌ Cannot use both --videos-only and --playlists-only flags'
    );
    process.exit(1);
  }

  const operations = [];
  if (!playlistsOnly) operations.push('videos');
  if (!videosOnly) operations.push('playlists');


  const results = {
    videos: [] as Array<{
      source: string;
      success: boolean;
      duration: number;
      error?: string;
    }>,
    playlists: [] as Array<{
      source: string;
      success: boolean;
      duration: number;
      error?: string;
    }>,
  };

  // Phase 1: Videos (if not playlists-only)
  if (!playlistsOnly) {

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];

      const result = await invokeLambdaSync(VIDEOS_FUNCTION_NAME, {
        source,
        repopulate: true,
      });

      results.videos.push({ source, ...result });

      if (result.success) {
      } else {
      }

      // Small delay between sources
      if (i < sources.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }

    // Summary of videos phase
    const videoSuccesses = results.videos.filter((r) => r.success).length;
    const videoFailures = results.videos.filter((r) => !r.success).length;


    if (videoFailures > 0) {
      results.videos
        .filter((r) => !r.success)
        .forEach((r) => {
        });
    }

    if (!videosOnly) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  // Phase 2: Playlists (if not videos-only)
  if (!videosOnly) {

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];

      const result = await invokeLambdaSync(PLAYLISTS_FUNCTION_NAME, {
        source,
        repopulate: true,
      });

      results.playlists.push({ source, ...result });

      if (result.success) {
      } else {
      }

      // Small delay between sources
      if (i < sources.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }

  // Final Summary

  if (!playlistsOnly) {
    const videoSuccesses = results.videos.filter((r) => r.success).length;
    const videoFailures = results.videos.filter((r) => !r.success).length;
    const videoTotalTime = Math.round(
      results.videos.reduce((sum, r) => sum + r.duration, 0) / 60
    );

  }

  if (!videosOnly) {
    const playlistSuccesses = results.playlists.filter((r) => r.success).length;
    const playlistFailures = results.playlists.filter((r) => !r.success).length;
    const playlistTotalTime = Math.round(
      results.playlists.reduce((sum, r) => sum + r.duration, 0) / 60
    );

  }

  const overallTotalTime = Math.round(
    (results.videos.reduce((sum, r) => sum + r.duration, 0) +
      results.playlists.reduce((sum, r) => sum + r.duration, 0)) /
      60
  );


  // CloudWatch links
  if (!playlistsOnly) {
  }
  if (!videosOnly) {
  }
}

triggerRepopulateCombined().catch(console.error);
