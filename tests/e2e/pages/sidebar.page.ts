import type { Page, Locator } from '@playwright/test';

export class SidebarPage {
  readonly page: Page;
  readonly menuButton: Locator;
  readonly addPlaylistButton: Locator;
  readonly playlistItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.menuButton = page.locator('[data-testid="menu-button"]');
    this.addPlaylistButton = page.locator('text=Add Playlist');
    this.playlistItems = page.locator('[data-testid="playlist-item"]');
  }

  async openSidebar() {
    await this.menuButton.click();
  }

  async createPlaylist(name: string, description?: string) {
    await this.addPlaylistButton.click();
    await this.page.fill('input[name="name"]', name);
    if (description) {
      await this.page.fill('textarea[name="description"]', description);
    }
    await this.page.click('button[type="submit"]');
  }
}
