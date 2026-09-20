export function formatEpisodeDuration(
  durationSeconds: number | null
): string {
  if (!durationSeconds || durationSeconds <= 0) return '';

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = Math.floor(durationSeconds % 60);
  const paddedSeconds = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

export function formatEpisodePublishedDate(publishedAt: string): string {
  return new Date(publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// RSS descriptions are usually a chunk of HTML (links, <br>s, etc.) — this
// is SSR-safe (no DOM parser), just enough to get a clean text preview.
export function stripHtmlToText(html: string | null): string {
  if (!html) return '';

  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
