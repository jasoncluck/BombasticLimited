/**
 * Test data helpers for creating consistent test data across test files
 */
export class TestDataHelpers {
  /**
   * Common content indicators for the main page
   */
  static getMainPageContentIndicators() {
    return {
      text: ['Latest Videos'],
      selectors: [
        '[data-testid="latest-videos-section"]',
        '.video-grid',
        'header nav'
      ]
    };
  }

  /**
   * Content indicators for video pages
   */
  static getVideoPageContentIndicators() {
    return {
      selectors: [
        '[data-testid="video-player"]',
        '[data-testid="video-title"]',
        '[data-testid="video-description"]'
      ]
    };
  }

  /**
   * Content indicators for playlist pages
   */
  static getPlaylistPageContentIndicators() {
    return {
      text: ['Playlist'],
      selectors: [
        '[data-testid="playlist-title"]',
        '[data-testid="playlist-videos"]'
      ]
    };
  }

  /**
   * Content indicators for user profile pages
   */
  static getUserProfileContentIndicators() {
    return {
      selectors: [
        '[data-testid="user-profile"]',
        '[data-testid="user-avatar"]',
        '[data-testid="user-playlists"]'
      ]
    };
  }

  /**
   * Content indicators for authentication pages
   */
  static getAuthPageContentIndicators() {
    return {
      text: ['Sign In', 'Sign Up'],
      selectors: [
        '[data-testid="auth-form"]',
        'input[type="email"]',
        'input[type="password"]'
      ]
    };
  }

  /**
   * Content indicators for loading states
   */
  static getLoadingContentIndicators() {
    return {
      selectors: [
        '[data-testid="loading-spinner"]',
        '.loading',
        '[aria-label="Loading"]'
      ]
    };
  }

  /**
   * Content indicators that suggest content has finished loading
   */
  static getContentLoadedIndicators() {
    return {
      selectors: [
        '[data-testid="content-loaded"]',
        '.content-ready',
        ':not([data-testid="loading-spinner"])'
      ]
    };
  }
}