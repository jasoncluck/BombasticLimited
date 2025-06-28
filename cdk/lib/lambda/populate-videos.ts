import { youtube } from "@googleapis/youtube";
import { createClient } from "@supabase/supabase-js";
import { CHANNEL_INFO, ChannelSource } from "../channel";

const MAX_RESULTS = 50;
const DEFAULT_NUM_PAGES = 2;

/**
 * This function will search YouTube for videos and place them in a DynamoDB table
 * repopulate will retrieve every video for the channel instead of the default which only returns a single response
 */
export const populateVideos = async ({
  source,
  repopulate = false,
}: {
  source: ChannelSource;
  repopulate: boolean;
}) => {
  const supabaseApiKey = process.env.SUPABASE_SERVICE_API_KEY_PROD;
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL_PROD;
  if (!supabaseApiKey || !supabaseUrl) {
    throw new Error("Could not find Supabase env.");
  }

  const supabaseClient = createClient(supabaseUrl, supabaseApiKey);

  if (!source) {
    throw new Error("Request body must contain the source of the content.");
  }
  const { uploadPlaylistId } = CHANNEL_INFO[source];

  const youtubeClient = youtube({
    version: "v3",
    auth: process.env.GOOGLE_API_KEY,
  });

  let curPage = 1;
  const videosToCheck = repopulate
    ? Number.MAX_SAFE_INTEGER
    : DEFAULT_NUM_PAGES * MAX_RESULTS;

  // Set pending_delete to true only for videos we'll actually check
  if (repopulate) {
    await supabaseClient
      .from("videos")
      .update({ pending_delete: true })
      .eq("source", source);
  } else {
    // First, get the IDs of the videos we want to mark as pending_delete
    const { data: videosToMark, error } = await supabaseClient
      .from("videos")
      .select("id")
      .eq("source", source)
      .order("published_at", { ascending: false })
      .limit(videosToCheck / 2);

    if (error) {
      console.error("Error fetching videos to mark:", error);
      throw new Error("Failed to fetch videos for marking");
    }

    // Only mark videos as pending_delete if we found any
    if (videosToMark && videosToMark.length > 0) {
      const videoIds = videosToMark.map((video) => video.id);

      const { error: updateError } = await supabaseClient
        .from("videos")
        .update({ pending_delete: true })
        .eq("source", source)
        .in("id", videoIds);

      if (updateError) {
        console.error("Error marking videos as pending delete:", updateError);
        throw new Error("Failed to mark videos as pending delete");
      }

      console.log(
        `Marked ${videoIds.length} videos as pending delete for source: ${source}`,
      );
    }
  }

  let pageToken: string | null | undefined;
  do {
    const { data } = await youtubeClient.playlistItems.list({
      part: ["id", "snippet", "contentDetails"],
      playlistId: uploadPlaylistId,
      maxResults: 50,
      ...(pageToken && { pageToken }),
    });

    const { nextPageToken, items } = data;

    if (!items) {
      throw new Error(`No items found for: ${source}, stopping.`);
    }

    // Extract video IDs and fetch additional details including duration
    const videoIds = items
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => !!id);

    let videoDetails: { id: string; duration: string }[] = [];
    if (videoIds.length > 0) {
      const { data: videoData } = await youtubeClient.videos.list({
        part: ["id", "contentDetails"],
        id: videoIds,
      });
      videoDetails =
        videoData.items?.map((video) => {
          if (!video.id || !video.contentDetails?.duration) {
            throw new Error(
              "Unexpected error - could not find duration of a video. ",
            );
          }
          return {
            id: video.id,
            duration: video.contentDetails.duration, // ISO 8601 duration format
          };
        }) ?? [];
    }

    // Helper to remove "_live" suffix from thumbnail URLs
    const removeLiveSuffix = (url?: string | null) =>
      url ? url.replace(/_live(\.\w+)$/, "$1") : url;

    // Combine the video details with playlist data
    const videos = items.map((item) => {
      const videoDetail = videoDetails.find(
        (v) => v.id === item.contentDetails?.videoId,
      );
      return {
        id: item.contentDetails?.videoId,
        source: source,
        title: item.snippet?.title,
        description: item.snippet?.description,
        published_at: item.snippet?.publishedAt,
        thumbnail_url: removeLiveSuffix(item.snippet?.thumbnails?.medium?.url),
        thumbnail_maxres_url: removeLiveSuffix(
          item.snippet?.thumbnails?.maxres?.url,
        ),
        duration: videoDetail?.duration,
        pending_delete: false, // Set pending_delete to false for updated videos
      };
    });

    try {
      for (const video of videos) {
        const { error } = await supabaseClient
          .from("videos")
          .upsert(video, { onConflict: "id" });

        if (error) {
          console.error("Error upserting video:", error);
        } else {
          console.log(`Stored video: ${video.title}`);
        }
      }
    } catch (e) {
      console.error(`Unable to save videos to Supabase`, e);
    }

    if (repopulate || curPage <= DEFAULT_NUM_PAGES) {
      curPage++;
      if (!repopulate && curPage > DEFAULT_NUM_PAGES) {
        break;
      }
      pageToken = nextPageToken;
    }
  } while (pageToken);

  // At the end, you should clean up videos that are still marked as pending_delete
  // This is the final step that actually removes videos that are no longer in the YouTube playlist
  const { error: deleteError } = await supabaseClient
    .from("videos")
    .delete()
    .eq("source", source)
    .eq("pending_delete", true);

  if (deleteError) {
    console.error(
      "Error deleting videos marked as pending_delete:",
      deleteError,
    );
  } else {
    console.log(
      `Cleaned up videos marked as pending_delete for source: ${source}`,
    );
  }
};
