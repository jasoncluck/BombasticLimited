#!/usr/bin/env node
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import * as dotenv from "dotenv";
import { CHANNEL_SOURCES } from "../lib/channel";

dotenv.config();

const lambda = new LambdaClient({
  region: process.env.AWS_REGION || "us-west-2",
});

const VIDEOS_FUNCTION_NAME =
  process.env.LAMBDA_FUNCTION_NAME || "BombifyPopulateVideos";
const PLAYLISTS_FUNCTION_NAME =
  process.env.PLAYLISTS_LAMBDA_FUNCTION_NAME || "BombifyPopulatePlaylists";

async function invokeLambdaSync(
  functionName: string,
  payload: any,
): Promise<{ success: boolean; duration: number; error?: string }> {
  const startTime = Date.now();

  try {
    const command = new InvokeCommand({
      FunctionName: functionName,
      Payload: JSON.stringify(payload),
      InvocationType: "RequestResponse",
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
    .filter((arg) => !arg.startsWith("--") && arg !== "--");
  const specificSource = args[0]; // First non-flag argument

  const videosOnly = process.argv.includes("--videos-only");
  const playlistsOnly = process.argv.includes("--playlists-only");

  // Validate specificSource if provided
  let sources;
  if (specificSource) {
    if (!CHANNEL_SOURCES.includes(specificSource as any)) {
      console.error(`❌ Invalid source: ${specificSource}`);
      console.error(`   Valid sources are: ${CHANNEL_SOURCES.join(", ")}`);
      process.exit(1);
    }
    sources = [specificSource];
  } else {
    sources = CHANNEL_SOURCES;
  }

  if (videosOnly && playlistsOnly) {
    console.error(
      "❌ Cannot use both --videos-only and --playlists-only flags",
    );
    process.exit(1);
  }

  const operations = [];
  if (!playlistsOnly) operations.push("videos");
  if (!videosOnly) operations.push("playlists");

  console.log(
    `🚀 Starting sequential repopulation (${operations.join(" → ")}) for: ${sources.join(", ")}`,
  );
  console.log(`🔧 Videos Function: ${VIDEOS_FUNCTION_NAME}`);
  console.log(`🔧 Playlists Function: ${PLAYLISTS_FUNCTION_NAME}`);
  console.log(`🌍 Region: ${process.env.AWS_REGION || "us-west-2"}`);
  console.log(
    `⏱️  Estimated total time: ${sources.length * operations.length * 2} minutes`,
  );
  console.log(`📅 Started at: ${new Date().toISOString()}\n`);

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
    console.log(`📹 PHASE 1: VIDEOS REPOPULATION`);
    console.log(`${"=".repeat(50)}\n`);

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      console.log(
        `[${i + 1}/${sources.length}] 📹 Starting video repopulate for: ${source}`,
      );

      const result = await invokeLambdaSync(VIDEOS_FUNCTION_NAME, {
        source,
        repopulate: true,
      });

      results.videos.push({ source, ...result });

      if (result.success) {
        console.log(
          `✅ [${source}] Videos completed successfully in ${result.duration}s`,
        );
      } else {
        console.log(`❌ [${source}] Videos failed after ${result.duration}s`);
        console.log(`   Error: ${result.error}`);
      }

      // Small delay between sources
      if (i < sources.length - 1) {
        console.log(`⏳ Waiting 10 seconds before next source...\n`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }

    // Summary of videos phase
    const videoSuccesses = results.videos.filter((r) => r.success).length;
    const videoFailures = results.videos.filter((r) => !r.success).length;

    console.log(`\n📊 VIDEOS PHASE COMPLETE`);
    console.log(`✅ Successful: ${videoSuccesses}/${sources.length}`);
    console.log(`❌ Failed: ${videoFailures}/${sources.length}`);

    if (videoFailures > 0) {
      console.log(`\n❌ Failed video sources:`);
      results.videos
        .filter((r) => !r.success)
        .forEach((r) => {
          console.log(`   - ${r.source}: ${r.error}`);
        });
    }

    if (!videosOnly) {
      console.log(
        `\n⏳ Waiting 10 seconds before starting playlists phase...\n`,
      );
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  // Phase 2: Playlists (if not videos-only)
  if (!videosOnly) {
    console.log(`🎵 PHASE 2: PLAYLISTS REPOPULATION`);
    console.log(`${"=".repeat(50)}\n`);

    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      console.log(
        `[${i + 1}/${sources.length}] 🎵 Starting playlist repopulate for: ${source}`,
      );

      const result = await invokeLambdaSync(PLAYLISTS_FUNCTION_NAME, {
        source,
        repopulate: true,
      });

      results.playlists.push({ source, ...result });

      if (result.success) {
        console.log(
          `✅ [${source}] Playlists completed successfully in ${result.duration}s`,
        );
      } else {
        console.log(
          `❌ [${source}] Playlists failed after ${result.duration}s`,
        );
        console.log(`   Error: ${result.error}`);
      }

      // Small delay between sources
      if (i < sources.length - 1) {
        console.log(`⏳ Waiting 10 seconds before next source...\n`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
  }

  // Final Summary
  console.log(`\n🎉 REPOPULATION COMPLETE`);
  console.log(`${"=".repeat(50)}`);
  console.log(`📅 Completed at: ${new Date().toISOString()}`);

  if (!playlistsOnly) {
    const videoSuccesses = results.videos.filter((r) => r.success).length;
    const videoFailures = results.videos.filter((r) => !r.success).length;
    const videoTotalTime = Math.round(
      results.videos.reduce((sum, r) => sum + r.duration, 0) / 60,
    );

    console.log(`\n📹 Videos Summary:`);
    console.log(`   ✅ Successful: ${videoSuccesses}/${sources.length}`);
    console.log(`   ❌ Failed: ${videoFailures}/${sources.length}`);
    console.log(`   ⏱️  Total time: ${videoTotalTime} minutes`);
  }

  if (!videosOnly) {
    const playlistSuccesses = results.playlists.filter((r) => r.success).length;
    const playlistFailures = results.playlists.filter((r) => !r.success).length;
    const playlistTotalTime = Math.round(
      results.playlists.reduce((sum, r) => sum + r.duration, 0) / 60,
    );

    console.log(`\n🎵 Playlists Summary:`);
    console.log(`   ✅ Successful: ${playlistSuccesses}/${sources.length}`);
    console.log(`   ❌ Failed: ${playlistFailures}/${sources.length}`);
    console.log(`   ⏱️  Total time: ${playlistTotalTime} minutes`);
  }

  const overallTotalTime = Math.round(
    (results.videos.reduce((sum, r) => sum + r.duration, 0) +
      results.playlists.reduce((sum, r) => sum + r.duration, 0)) /
      60,
  );

  console.log(`\n⏱️  Overall total time: ${overallTotalTime} minutes`);

  // CloudWatch links
  console.log(`\n📊 Monitor Logs:`);
  if (!playlistsOnly) {
    console.log(
      `   📹 Videos: https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION || "us-west-2"}#logsV2:log-groups/log-group/$252Faws$252Flambda$252F${VIDEOS_FUNCTION_NAME}`,
    );
  }
  if (!videosOnly) {
    console.log(
      `   🎵 Playlists: https://console.aws.amazon.com/cloudwatch/home?region=${process.env.AWS_REGION || "us-west-2"}#logsV2:log-groups/log-group/$252Faws$252Flambda$252F${PLAYLISTS_FUNCTION_NAME}`,
    );
  }
}

triggerRepopulateCombined().catch(console.error);
