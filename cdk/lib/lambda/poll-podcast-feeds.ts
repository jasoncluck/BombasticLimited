import { Client } from 'pg';
import { XMLParser } from 'fast-xml-parser';

// Polls every podcast_feeds row (free-tier + per-user premium), parses each
// feed's RSS XML, and upserts episodes into podcast_episodes. One feed
// failing (bad URL, expired premium token, malformed XML) never blocks the
// others — each feed is fetched/parsed/upserted in its own try/catch.

const FETCH_TIMEOUT_MS = 15000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

interface FeedRow {
  id: number;
  source: string;
  tier: 'free' | 'premium';
  feed_url: string;
}

interface EpisodeRow {
  feed_id: number;
  guid: string;
  title: string;
  description: string | null;
  audio_url: string;
  image_url: string | null;
  duration_seconds: number | null;
  published_at: string;
}

// RSS item.guid can be a plain string or an object ({ '#text', '@_isPermaLink' }).
function extractText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text']);
  }
  return null;
}

// iTunes duration can be plain seconds ("1830"), "MM:SS", or "HH:MM:SS".
function parseDurationSeconds(raw: unknown): number | null {
  const text = extractText(raw);
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    return parseInt(text, 10);
  }

  const parts = text.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}

async function fetchFeedXml(feedUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Bombastic Podcast Poller/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseFeedEpisodes(feedId: number, xml: string): EpisodeRow[] {
  const parsed = xmlParser.parse(xml);
  const channel = parsed?.rss?.channel;
  if (!channel) {
    throw new Error('Feed is missing an rss/channel element');
  }

  const rawItems = channel.item;
  const items: unknown[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  const episodes: EpisodeRow[] = [];

  for (const rawItem of items) {
    const item = rawItem as Record<string, unknown>;

    const enclosure = item.enclosure as Record<string, unknown> | undefined;
    const audioUrl = enclosure?.['@_url'] as string | undefined;
    if (!audioUrl) continue; // not a real episode (no audio) — skip

    const guid = extractText(item.guid) ?? audioUrl;
    const title = extractText(item.title);
    if (!title) continue;

    const pubDateText = extractText(item.pubDate);
    const publishedAt = pubDateText ? new Date(pubDateText) : null;
    if (!publishedAt || Number.isNaN(publishedAt.getTime())) continue;

    const itunesImage = item['itunes:image'] as Record<string, unknown> | undefined;

    episodes.push({
      feed_id: feedId,
      guid,
      title,
      description: extractText(item.description ?? item['itunes:summary']),
      audio_url: audioUrl,
      image_url: (itunesImage?.['@_href'] as string | undefined) ?? null,
      duration_seconds: parseDurationSeconds(item['itunes:duration']),
      published_at: publishedAt.toISOString(),
    });
  }

  return episodes;
}

async function upsertEpisodes(client: Client, episodes: EpisodeRow[]): Promise<void> {
  if (episodes.length === 0) return;

  const columns = [
    'feed_id',
    'guid',
    'title',
    'description',
    'audio_url',
    'image_url',
    'duration_seconds',
    'published_at',
  ];
  const values: unknown[] = [];
  const rowPlaceholders = episodes.map((episode, rowIndex) => {
    const placeholders = columns.map((_, colIndex) => {
      values.push(
        [
          episode.feed_id,
          episode.guid,
          episode.title,
          episode.description,
          episode.audio_url,
          episode.image_url,
          episode.duration_seconds,
          episode.published_at,
        ][colIndex]
      );
      return `$${rowIndex * columns.length + colIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  await client.query(
    `INSERT INTO public.podcast_episodes (${columns.join(', ')})
     VALUES ${rowPlaceholders.join(', ')}
     ON CONFLICT (feed_id, guid) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       audio_url = EXCLUDED.audio_url,
       image_url = EXCLUDED.image_url,
       duration_seconds = EXCLUDED.duration_seconds,
       published_at = EXCLUDED.published_at`,
    values
  );
}

export interface PollPodcastFeedsResponse {
  success: boolean;
  feedsProcessed: number;
  feedsFailed: number;
  episodesUpserted: number;
  timestamp: string;
  duration?: number;
}

export const handler = async (): Promise<PollPodcastFeedsResponse> => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  const encryptionKey = process.env.PODCAST_FEED_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('Missing required PODCAST_FEED_ENCRYPTION_KEY environment variable');
  }

  const pgClient = new Client({ connectionString: process.env.NEON_DATABASE_URL });
  await pgClient.connect();

  try {
    const { rows: feeds } = await pgClient.query<FeedRow>(
      `SELECT id, source, tier,
              extensions.pgp_sym_decrypt(feed_url_encrypted, $1)::text AS feed_url
       FROM public.podcast_feeds`,
      [encryptionKey]
    );

    let feedsFailed = 0;
    let episodesUpserted = 0;

    for (const feed of feeds) {
      try {
        const xml = await fetchFeedXml(feed.feed_url);
        const episodes = parseFeedEpisodes(feed.id, xml);
        await upsertEpisodes(pgClient, episodes);
        episodesUpserted += episodes.length;

        await pgClient.query(
          `UPDATE public.podcast_feeds
           SET last_fetched_at = now(), last_fetch_status = 'success', last_fetch_error = NULL, updated_at = now()
           WHERE id = $1`,
          [feed.id]
        );

        console.log(
          JSON.stringify({
            stage: 'feed_synced',
            feedId: feed.id,
            source: feed.source,
            tier: feed.tier,
            episodeCount: episodes.length,
          })
        );
      } catch (error) {
        feedsFailed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        console.error(
          JSON.stringify({
            stage: 'feed_sync_failed',
            feedId: feed.id,
            source: feed.source,
            tier: feed.tier,
            error: errorMessage,
          })
        );

        try {
          await pgClient.query(
            `UPDATE public.podcast_feeds
             SET last_fetched_at = now(), last_fetch_status = 'failed', last_fetch_error = $2, updated_at = now()
             WHERE id = $1`,
            [feed.id, errorMessage]
          );
        } catch (updateError) {
          console.error(
            JSON.stringify({
              stage: 'feed_status_update_failed',
              feedId: feed.id,
              error: updateError instanceof Error ? updateError.message : 'Unknown error',
            })
          );
        }
      }
    }

    return {
      success: true,
      feedsProcessed: feeds.length - feedsFailed,
      feedsFailed,
      episodesUpserted,
      timestamp,
      duration: Date.now() - startTime,
    };
  } finally {
    await pgClient.end();
  }
};
