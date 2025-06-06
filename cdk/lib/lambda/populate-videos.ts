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

  /*
   * There is some odd curPage logic in here but the idea is to clean up removed videos by tagging the first 50 videos as pending delete then getting 100 videos.
   * Assuming there are less than 50 videos since the last run there won't be any missed videos during the update.
   * The repopulate flag should be used to check for staleness across all videos from a source.
   */
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
    // Only mark the number of videos we'll actually fetch from YouTube
    await supabaseClient
      .from("videos")
      .update({ pending_delete: true })
      .eq("source", source)
      .order("published_at", { ascending: false })
      .limit(videosToCheck); // This ensures we only mark videos we'll check
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
    if (videoIds) {
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
        const response = await supabaseClient
          .from("videos")
          .upsert(video, { onConflict: "id" });

        if (response.status > 201) {
          console.error(response);
        } else {
          console.log(`Stored video: ${video.title}`);
        }
      }
    } catch (e) {
      console.error(`Unable to save videos to Supabase`, e);
    }

    if (repopulate || curPage <= DEFAULT_NUM_PAGES) {
      curPage++;
      if (!repopulate && curPage === DEFAULT_NUM_PAGES) {
        break;
      }
      pageToken = nextPageToken;
    }
  } while (pageToken);
};
