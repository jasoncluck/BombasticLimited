import { type Page, expect } from '@playwright/test';

export interface PlaylistHelpers {
  createPlaylist(): Promise<void>;
  deletePlaylist(playlistSelector?: string): Promise<void>;
  getPlaylistButton(): ReturnType<Page['getByTestId']>;
  openPlaylistContextMenu(playlistSelector?: string): Promise<void>;
  addCurrentVideoToPlaylist(): Promise<void>;
}

export function createPlaylistHelpers(page: Page): PlaylistHelpers {
  return {
    async createPlaylist(): Promise<void> {
      const createPlaylistButton = page.getByTestId('create-playlist-button');
      await createPlaylistButton.waitFor();
      await createPlaylistButton.click();

      // Wait for the new playlist to appear
      const newPlaylistButton = page.getByTestId('playlist-button');
      await expect(newPlaylistButton).toHaveCount(1);
    },

    async deletePlaylist(playlistSelector = 'playlist-button'): Promise<void> {
      const playlistButton = page.getByTestId(playlistSelector);

      // Right-click to open context menu
      await playlistButton.click({ button: 'right' });

      const playlistContextMenu = page.getByTestId('playlist-context-content');
      await expect(playlistContextMenu).toBeVisible();

      const deleteContextItem = page
        .getByTestId('playlist-context-item')
        .first();

      await deleteContextItem.click();

      // Wait for the playlist to be removed
      await expect(playlistButton).toHaveCount(0);
    },

    getPlaylistButton() {
      return page.getByTestId('playlist-button');
    },

    async openPlaylistContextMenu(
      playlistSelector = 'playlist-button'
    ): Promise<void> {
      const playlistButton = page.getByTestId(playlistSelector);
      await playlistButton.click({ button: 'right' });

      const playlistContextMenu = page.getByTestId('playlist-context-content');
      await expect(playlistContextMenu).toBeVisible();
    },

    async addCurrentVideoToPlaylist(): Promise<void> {
      // This assumes the context menu is already open
      const playlistContextItem = page
        .getByTestId('playlist-context-item')
        .first();

      await playlistContextItem.click();
    },
  };
}

// Alternative approach using a class if you prefer OOP style
export class PlaylistManager {
  constructor(private page: Page) {}

  async createPlaylist(): Promise<void> {
    const createPlaylistButton = this.page.getByTestId(
      'create-playlist-button'
    );
    await createPlaylistButton.waitFor();
    await createPlaylistButton.click();

    const newPlaylistButton = this.page.getByTestId('playlist-button');
    await expect(newPlaylistButton).toHaveCount(1);
  }

  async deletePlaylist(playlistSelector = 'playlist-button'): Promise<void> {
    const playlistButton = this.page.getByTestId(playlistSelector);

    await playlistButton.click({ button: 'right' });

    const playlistContextMenu = this.page.getByTestId(
      'playlist-context-content'
    );
    await expect(playlistContextMenu).toBeVisible();

    const deleteContextItem = this.page
      .getByTestId('playlist-context-item')
      .first();

    await deleteContextItem.click();
    await expect(playlistButton).toHaveCount(0);
  }

  getPlaylistButton() {
    return this.page.getByTestId('playlist-button');
  }

  async openContextMenu(playlistSelector = 'playlist-button'): Promise<void> {
    const playlistButton = this.page.getByTestId(playlistSelector);
    await playlistButton.click({ button: 'right' });

    const playlistContextMenu = this.page.getByTestId(
      'playlist-context-content'
    );
    await expect(playlistContextMenu).toBeVisible();
  }

  async addCurrentVideoToPlaylist(): Promise<void> {
    const playlistContextItem = this.page
      .getByTestId('playlist-context-item')
      .first();

    await playlistContextItem.click();
  }
}
