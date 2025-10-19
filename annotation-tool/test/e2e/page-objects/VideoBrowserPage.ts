import { Page, Locator, expect } from '@playwright/test'
import { BasePage } from './base/BasePage.js'

/**
 * Page Object for Video Browser (Home Page).
 * Provides actions and assertions for video selection and navigation.
 */
export class VideoBrowserPage extends BasePage {
  constructor(page: Page) {
    super(page)
  }

  /**
   * Get the Video Browser heading.
   */
  get heading(): Locator {
    return this.page.getByText('Video Browser')
  }

  /**
   * Get the FOVEA app title.
   */
  get appTitle(): Locator {
    return this.page.getByText('FOVEA')
  }

  /**
   * Get the video search input.
   */
  get searchInput(): Locator {
    return this.page.getByPlaceholder(/search videos/i)
  }

  /**
   * Get all video cards.
   */
  get videoCards(): Locator {
    return this.page.locator('.MuiCard-root')
  }

  /**
   * Get the first video card.
   */
  get firstVideoCard(): Locator {
    return this.videoCards.first()
  }

  /**
   * Get the default user display name element.
   */
  get userDisplayName(): Locator {
    return this.page.getByText('Default User')
  }

  /**
   * Get the Save button.
   */
  get saveButton(): Locator {
    return this.page.getByRole('button', { name: /save/i })
  }

  /**
   * Get the Export button.
   */
  get exportButton(): Locator {
    return this.page.getByRole('button', { name: /export/i })
  }

  /**
   * Navigate to the home page (video browser).
   */
  async navigateToHome(): Promise<void> {
    await this.goto('/')
    await this.expectPageLoaded()
  }

  /**
   * Search for videos by name.
   * @param query - Search query string
   */
  async searchVideos(query: string): Promise<void> {
    await this.searchInput.fill(query)
    await this.page.waitForTimeout(500)
  }

  /**
   * Select the first video from the browser.
   * Navigates to annotation workspace.
   */
  async selectFirstVideo(): Promise<void> {
    await expect(this.firstVideoCard).toBeVisible()
    await this.firstVideoCard.click()
    await expect(this.page.getByText(/annotation workspace/i)).toBeVisible({ timeout: 10000 })
  }

  /**
   * Select a video by its title.
   * @param title - Video title to select
   */
  async selectVideoByTitle(title: string): Promise<void> {
    const videoCard = this.page.locator('.MuiCard-root', { hasText: title })
    await expect(videoCard).toBeVisible()
    await videoCard.click()
    await expect(this.page.getByText(/annotation workspace/i)).toBeVisible({ timeout: 10000 })
  }

  /**
   * Get the number of visible video cards.
   */
  async getVideoCount(): Promise<number> {
    return this.videoCards.count()
  }

  /**
   * Assert that the video browser page is loaded.
   */
  async expectPageLoaded(): Promise<void> {
    await expect(this.appTitle).toBeVisible()
    await expect(this.heading).toBeVisible()
  }

  /**
   * Assert that the user is logged in (single-user mode).
   */
  async expectUserLoggedIn(): Promise<void> {
    await expect(this.userDisplayName).toBeVisible()
  }

  /**
   * Assert that login UI is not visible (single-user mode).
   */
  async expectNoLoginUI(): Promise<void> {
    await expect(this.page.getByRole('heading', { name: /sign in/i })).not.toBeVisible()
    await expect(this.page.getByRole('link', { name: /sign in/i })).not.toBeVisible()
    await expect(this.page.getByRole('link', { name: /register/i })).not.toBeVisible()
  }

  /**
   * Assert that action buttons are visible (save, export).
   */
  async expectActionButtonsVisible(): Promise<void> {
    await expect(this.saveButton).toBeVisible()
    await expect(this.exportButton).toBeVisible()
  }

  /**
   * Assert that search input is visible.
   */
  async expectSearchAvailable(): Promise<void> {
    await expect(this.searchInput).toBeVisible()
  }

  /**
   * Assert that at least one video is available.
   */
  async expectVideosAvailable(): Promise<void> {
    const count = await this.getVideoCount()
    expect(count).toBeGreaterThan(0)
  }
}
