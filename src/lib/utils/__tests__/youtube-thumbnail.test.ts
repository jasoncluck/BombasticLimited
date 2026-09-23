import { describe, it, expect } from 'vitest';
import { getCardThumbnailUrl } from '../youtube-thumbnail';

describe('getCardThumbnailUrl', () => {
  it('downsizes a maxresdefault URL to hqdefault', () => {
    expect(
      getCardThumbnailUrl('https://i.ytimg.com/vi/abc123/maxresdefault.jpg')
    ).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('downsizes on numbered ytimg subdomains', () => {
    expect(
      getCardThumbnailUrl('https://i3.ytimg.com/vi/abc123/maxresdefault.jpg')
    ).toBe('https://i3.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('preserves a query string on the URL', () => {
    expect(
      getCardThumbnailUrl(
        'https://i.ytimg.com/vi/abc123/maxresdefault.jpg?sqp=abc'
      )
    ).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg?sqp=abc');
  });

  it('normalizes any known lower-resolution variant to hqdefault too', () => {
    expect(
      getCardThumbnailUrl('https://i.ytimg.com/vi/abc123/mqdefault.jpg')
    ).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
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
