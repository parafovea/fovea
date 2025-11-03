import { Page, Locator, expect } from '@playwright/test'

/**
 * Component Object for Timeline.
 * Encapsulates timeline visualization, keyframe management, and zoom controls.
 * Reusable across pages that include timeline functionality.
 */
export class TimelineComponent {
  private page: Page

  constructor(page: Page) {
    this.page = page
  }

  /**
   * Get the timeline canvas element.
   */
  get canvas(): Locator {
    return this.page.locator('canvas[data-testid="timeline-canvas"]').or(
      this.page.locator('canvas').first()
    )
  }

  /**
   * Get keyframe marker elements.
   */
  get keyframeMarkers(): Locator {
    return this.page.locator('[data-testid="keyframe-marker"]')
  }

  /**
   * Get the timeline container element (alias for canvas).
   */
  get container(): Locator {
    return this.canvas
  }

  /**
   * Toggle timeline visibility using the 'T' keyboard shortcut or button.
   */
  async toggle(): Promise<void> {
    // Try clicking the Show/Hide Timeline button first
    const timelineButton = this.page.getByRole('button', { name: /timeline/i })
    if (await timelineButton.isVisible().catch(() => false)) {
      await timelineButton.click()
      await this.page.waitForTimeout(1000)
    } else {
      // Fallback to keyboard shortcut
      await this.page.keyboard.press('t')
      await this.page.waitForTimeout(500)
    }
  }

  /**
   * Show the timeline if it's not already visible.
   */
  async show(): Promise<void> {
    // Check if timeline is already visible by looking for the canvas or button state
    const timelineButton = this.page.getByRole('button', { name: /show timeline/i })
    if (await timelineButton.isVisible().catch(() => false)) {
      await timelineButton.click()
      await this.page.waitForTimeout(1000)
    }
  }

  /**
   * Hide the timeline if it's currently visible.
   */
  async hide(): Promise<void> {
    const isVisible = await this.canvas.isVisible().catch(() => false)
    if (isVisible) {
      await this.toggle()
    }
  }

  /**
   * Add a keyframe at the current video position using the 'K' key.
   */
  async addKeyframe(): Promise<void> {
    await this.page.keyboard.press('k')
    await this.page.waitForTimeout(300)
  }

  /**
   * Delete the keyframe at the current position using the Delete key.
   */
  async deleteKeyframe(): Promise<void> {
    await this.page.keyboard.press('Delete')
    await this.page.waitForTimeout(300)
  }

  /**
   * Copy the previous keyframe to the current position using the 'C' key.
   */
  async copyPreviousKeyframe(): Promise<void> {
    await this.page.keyboard.press('c')
    await this.page.waitForTimeout(300)
  }

  /**
   * Toggle visibility at the current frame using the 'V' key.
   */
  async toggleVisibility(): Promise<void> {
    await this.page.keyboard.press('v')
    await this.page.waitForTimeout(300)
  }

  /**
   * Set the zoom level.
   * @param level - Zoom level (e.g., 1, 5, 10)
   */
  async setZoom(level: number): Promise<void> {
    // This is a placeholder - actual implementation depends on UI
    // May need to use zoom buttons or slider
    const zoomButton = this.page.locator(`[data-testid="zoom-${level}x"]`)
    if (await zoomButton.isVisible().catch(() => false)) {
      await zoomButton.click()
    }
    await this.page.waitForTimeout(300)
  }

  /**
   * Zoom in by one level using the '+' key.
   */
  async zoomIn(): Promise<void> {
    await this.page.keyboard.press('+')
    await this.page.waitForTimeout(300)
  }

  /**
   * Zoom out by one level using the '-' key.
   */
  async zoomOut(): Promise<void> {
    await this.page.keyboard.press('-')
    await this.page.waitForTimeout(300)
  }

  /**
   * Get the canvas rendering information.
   * Useful for verifying high-DPI rendering.
   */
  async getCanvasInfo(): Promise<{
    cssWidth: number
    cssHeight: number
    canvasWidth: number
    canvasHeight: number
    dpr: number
  }> {
    return this.canvas.evaluate((el: HTMLCanvasElement) => ({
      cssWidth: el.getBoundingClientRect().width,
      cssHeight: el.getBoundingClientRect().height,
      canvasWidth: el.width,
      canvasHeight: el.height,
      dpr: window.devicePixelRatio || 1
    }))
  }

  /**
   * Take a screenshot of the timeline canvas.
   * Waits briefly to ensure canvas is updated.
   */
  async screenshot(): Promise<Buffer> {
    // Wait for animation frames to ensure canvas is repainted
    await this.page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve(undefined))
      })
    }))
    await this.page.waitForTimeout(50)

    const screenshot = await this.canvas.screenshot()

    // Ensure canvas doesn't retain focus, which can prevent keyboard events
    // from propagating to document-level listeners
    await this.page.evaluate(() => {
      const canvas = document.querySelector('canvas[data-testid="timeline-canvas"]') as HTMLElement
      if (canvas && canvas === document.activeElement) {
        document.body.focus()
      }
    })

    // Small stabilization wait to ensure focus change completes
    await this.page.waitForTimeout(100)

    return screenshot
  }

  /**
   * Click on the timeline at a specific frame position.
   * @param frame - Frame number to click
   * @param totalFrames - Total number of frames in the video
   */
  async clickAtFrame(frame: number, totalFrames: number): Promise<void> {
    const box = await this.canvas.boundingBox()
    if (box) {
      const x = box.x + (frame / totalFrames) * box.width
      const y = box.y + box.height / 2
      await this.page.mouse.click(x, y)
    }
    await this.page.waitForTimeout(100)
  }

  /**
   * Get the number of keyframes visible on the timeline.
   */
  async getKeyframeCount(): Promise<number> {
    // Try to count keyframe markers first
    const markers = await this.keyframeMarkers.count().catch(() => 0)
    if (markers > 0) {
      return markers
    }

    // Fallback: analyze canvas if markers not available
    return this.page.evaluate(() => {
      // This is a placeholder - actual implementation would need access to timeline state
      return 0
    })
  }

  /**
   * Assert that the timeline canvas is visible.
   */
  async expectVisible(): Promise<void> {
    await expect(this.canvas).toBeVisible()
  }

  /**
   * Assert that the timeline canvas is not visible.
   */
  async expectHidden(): Promise<void> {
    await expect(this.canvas).not.toBeVisible()
  }

  /**
   * Assert that the timeline has a specific number of keyframes.
   * @param count - Expected number of keyframes
   */
  async expectKeyframeCount(count: number): Promise<void> {
    const markers = this.keyframeMarkers
    if (await markers.count().then(c => c > 0).catch(() => false)) {
      await expect(markers).toHaveCount(count)
    } else {
      // If markers not available, use alternative verification
      const actualCount = await this.getKeyframeCount()
      expect(actualCount).toBe(count)
    }
  }

  /**
   * Assert that the timeline canvas has high-DPI rendering.
   * Verifies that canvas dimensions are scaled by devicePixelRatio.
   */
  async expectHighDPIRendering(): Promise<void> {
    const info = await this.getCanvasInfo()

    // Allow 1px tolerance for rounding differences
    expect(info.canvasWidth).toBeGreaterThanOrEqual(info.cssWidth - 1)
    expect(info.canvasHeight).toBeGreaterThanOrEqual(info.cssHeight - 1)

    if (info.dpr > 1) {
      expect(info.canvasWidth).toBeGreaterThan(info.cssWidth * 1.5)
    }
  }

  /**
   * Assert that two timeline screenshots are different.
   * Useful for verifying that the playhead has moved.
   * @param screenshot1 - First screenshot buffer
   * @param screenshot2 - Second screenshot buffer
   */
  expectScreenshotsDifferent(screenshot1: Buffer, screenshot2: Buffer): void {
    expect(screenshot1.equals(screenshot2)).toBe(false)
  }
}
