/**
 * `videos.thumbnail_url` always stores YouTube's `maxresdefault` (1280x720)
 * variant (chosen back when a since-removed image-processing pipeline fed
 * off it — see CLAUDE.md's Image Processing section). Card/table/drawer
 * contexts render well under 480px wide, so swap to the `hqdefault`
 * (480x360) variant YouTube already hosts for free at the same predictable
 * URL shape — no extra processing, a fraction of the download size.
 */
const YOUTUBE_THUMBNAIL_VARIANT =
  /\/(?:default|mqdefault|hqdefault|sddefault|maxresdefault|hq720|sd720|mq1|mq2|mq3|hq1|hq2|hq3)(\.\w+)(\?.*)?$/i;

export function getCardThumbnailUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  if (!url.includes('ytimg.com')) return url;
  return url.replace(YOUTUBE_THUMBNAIL_VARIANT, '/hqdefault$1$2');
}
