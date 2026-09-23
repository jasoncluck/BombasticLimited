import { describe, it, expect } from 'vitest';
import { getCardThumbnailUrl } from '../youtube-thumbnail';

describe('getCardThumbnailUrl', () => {
  it('downsizes a maxresdefault URL to mqdefault', () => {
    expect(
      getCardThumbnailUrl('https://i.ytimg.com/vi/abc123/maxresdefault.jpg')
    ).toBe('https://i.ytimg.com/vi/abc123/mqdefault.jpg');
  });

  it('downsizes on numbered ytimg subdomains', () => {
    expect(
      getCardThumbnailUrl('https://i3.ytimg.com/vi/abc123/maxresdefault.jpg')
    ).toBe('https://i3.ytimg.com/vi/abc123/mqdefault.jpg');
  });

  it('preserves a query string on the URL', () => {
    expect(
      getCardThumbnailUrl(
        'https://i.ytimg.com/vi/abc123/maxresdefault.jpg?sqp=abc'
      )
    ).toBe('https://i.ytimg.com/vi/abc123/mqdefault.jpg?sqp=abc');
  });

  it('normalizes a 4:3-canvas variant (hqdefault) to mqdefault too', () => {
    // hqdefault/sddefault/default are a 4:3 canvas — letterboxed for 16:9
    // source video, and plain-black-pillarboxed (no blur fill) for
    // vertical/Shorts source video. mqdefault and maxresdefault are the
    // only variants that are genuinely 16:9.
    expect(
      getCardThumbnailUrl('https://i.ytimg.com/vi/abc123/hqdefault.jpg')
    ).toBe('https://i.ytimg.com/vi/abc123/mqdefault.jpg');
  });

  it('downsizes a live-stream thumbnail while preserving the _live suffix', () => {
    expect(
      getCardThumbnailUrl(
        'https://i.ytimg.com/vi/abc123/maxresdefault_live.jpg'
      )
    ).toBe('https://i.ytimg.com/vi/abc123/mqdefault_live.jpg');
  });

  it('leaves non-YouTube URLs untouched', () => {
    const url = 'https://content-images.bombastic.ltd/playlists/1/foo.webp';
    expect(getCardThumbnailUrl(url)).toBe(url);
  });

  it('returns null for null or undefined input', () => {
    expect(getCardThumbnailUrl(null)).toBeNull();
    expect(getCardThumbnailUrl(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(getCardThumbnailUrl('')).toBeNull();
  });
});
