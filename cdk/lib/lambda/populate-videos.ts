import { youtube, youtube_v3 } from "@googleapis/youtube";
import { createClient } from "@supabase/supabase-js";
import { CHANNEL_INFO, ChannelSource } from "../channel";

const MAX_RESULTS = 50;
const DEFAULT_NUM_PAGES = 2;

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
    const errMsg = "Could not find Supabase env.";
    console.error(JSON.stringify({ stage: "init", error: errMsg }));
    throw new Error(errMsg);
  }

  const supabaseClient = createClient(supabaseUrl, supabaseApiKey);

  if (!source) {
    const errMsg = "Request body must contain the source of the content.";
    console.error(JSON.stringify({ stage: "init", error: errMsg }));
    throw new Error(errMsg);
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

  try {
    if (repopulate) {
      await supabaseClient
        .from("videos")
        .update({ pending_delete: true })
        .eq("source", source);
    } else {
      const { data: videosToMark, error } = await supabaseClient
        .from("videos")
        .select("id")
        .eq("source", source)
        .order("published_at", { ascending: false })
        .limit(videosToCheck / 2);

      if (error) {
        console.error(
          JSON.stringify({
            stage: "mark_pending_delete",
            source,
            error,
          }),
        );
        throw new Error("Failed to fetch videos for marking");
      }
      if (videosToMark && videosToMark.length > 0) {
        const videoIds = videosToMark.map((video) => video.id);

        const { error: updateError } = await supabaseClient
          .from("videos")
          .update({ pending_delete: true })
          .eq("source", source)
          .in("id", videoIds);

        if (updateError) {
          console.error(
            JSON.stringify({
              stage: "mark_pending_delete_update",
              source,
              videoIds,
              error: updateError,
            }),
          );
          throw new Error("Failed to mark videos as pending delete");
        }

        console.log(
          JSON.stringify({
            stage: "mark_pending_delete_update",
            message: `Marked ${videoIds.length} videos as pending delete for source: ${source}`,
          }),
        );
      }
    }

    let pageToken: string | null | undefined;
    do {
      let items: youtube_v3.Schema$PlaylistItem[] | undefined;
      try {
        const { data } = await youtubeClient.playlistItems.list({
          part: ["id", "snippet", "contentDetails"],
          playlistId: uploadPlaylistId,
          maxResults: 50,
          ...(pageToken && { pageToken }),
        });

        ({ nextPageToken: pageToken, items } = data);

        if (!items) {
          throw new Error(
            `No items found for: ${source}, stopping. PlaylistID: ${uploadPlaylistId}`,
          );
        }
      } catch (e) {
        console.error(
          JSON.stringify({
            stage: "fetch_youtube_playlist_items",
            source,
            playlistId: uploadPlaylistId,
            error: e,
          }),
        );
        throw e;
      }

      // Extract video IDs and fetch additional details including duration
      const videoIds = items
        .map((item) => item.contentDetails?.videoId)
        .filter((id): id is string => !!id);

      let videoDetails: { id: string; duration: string }[] = [];
      if (videoIds.length > 0) {
        try {
          const { data: videoData } = await youtubeClient.videos.list({
            part: ["id", "contentDetails"],
            id: videoIds,
          });
          videoDetails =
            videoData.items?.map((video) => {
              if (!video.id || !video.contentDetails?.duration) {
                throw new Error(
                  "Unexpected error - could not find duration of a video.",
                );
              }
              return {
                id: video.id,
                duration: video.contentDetails.duration,
              };
            }) ?? [];
        } catch (e) {
          console.error(
            JSON.stringify({
              stage: "fetch_youtube_video_details",
              source,
              videoIds,
              error: e,
            }),
          );
          throw e;
        }
      }

      // Helper to remove "_live" suffix from thumbnail URLs
      const removeLiveSuffix = (url?: string | null) =>
        url ? url.replace(/_live(\.\w+)$/, "$1") : url;

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
          thumbnail_url: removeLiveSuffix(
            item.snippet?.thumbnails?.medium?.url,
          ),
          thumbnail_maxres_url: removeLiveSuffix(
            item.snippet?.thumbnails?.maxres?.url,
          ),
          duration: videoDetail?.duration,
          pending_delete: false,
        };
      });

      for (const video of videos) {
        const { error } = await supabaseClient
          .from("videos")
          .upsert(video, { onConflict: "id" });
        if (error) {
          console.error(
            JSON.stringify({
              stage: "upsert_video",
              source,
              videoId: video.id,
              error,
            }),
          );
        } else {
          console.log(
            JSON.stringify({
              stage: "upsert_video",
              message: `Stored video: ${video.title}`,
              videoId: video.id,
              source,
            }),
          );
        }
      }

      if (repopulate || curPage <= DEFAULT_NUM_PAGES) {
        curPage++;
        if (!repopulate && curPage > DEFAULT_NUM_PAGES) {
          break;
        }
      }
    } while (pageToken);

    // Clean up videos marked as pending_delete
    const { error: deleteError } = await supabaseClient
      .from("videos")
      .delete()
      .eq("source", source)
      .eq("pending_delete", true);

    if (deleteError) {
      console.error(
        JSON.stringify({
          stage: "delete_pending_delete",
          source,
          error: deleteError,
        }),
      );
      throw new Error("Failed to delete videos marked as pending_delete");
    } else {
      console.log(
        JSON.stringify({
          stage: "delete_pending_delete",
          message: `Cleaned up videos marked as pending_delete for source: ${source}`,
        }),
      );
    }
  } catch (e) {
    // Final catch-all for unhandled errors
    console.error(
      JSON.stringify({
        stage: "final",
        source,
        error: e instanceof Error ? e.message : e,
        stack: e instanceof Error ? e.stack : undefined,
      }),
    );
    throw e; // Rethrow to signal Lambda failure
  }
};
