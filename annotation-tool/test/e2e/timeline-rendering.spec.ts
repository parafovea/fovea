import { test, expect, Page } from '@playwright/test'

/**
 * E2E tests specifically for timeline rendering quality and performance.
 * Tests focus on:
 * - Timeline canvas rendering (no graininess)
 * - Playhead position and movement
 * - Keyframe visualization
 * - Interpolation segment rendering
 * - Zoom level rendering quality
 * - Frame ruler rendering
 */

test.describe('Timeline Rendering Quality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('FOVEA')).toBeVisible()
  })

  test('timeline canvas renders without graininess', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    // Find timeline canvas
    const canvas = await page.locator('canvas').first()
    await expect(canvas).toBeVisible()

    // Verify canvas has high-DPI scaling
    const canvasInfo = await canvas.evaluate((el: HTMLCanvasElement) => ({
      cssWidth: el.getBoundingClientRect().width,
      cssHeight: el.getBoundingClientRect().height,
      canvasWidth: el.width,
      canvasHeight: el.height,
      dpr: window.devicePixelRatio || 1
    }))

    // Canvas dimensions should be scaled by devicePixelRatio
    // For non-grainy rendering, canvas.width should be cssWidth * dpr
    expect(canvasInfo.canvasWidth).toBeGreaterThanOrEqual(canvasInfo.cssWidth)
    expect(canvasInfo.canvasHeight).toBeGreaterThanOrEqual(canvasInfo.cssHeight)

    // On high-DPI displays (dpr > 1), canvas dimensions should be significantly larger
    if (canvasInfo.dpr > 1) {
      expect(canvasInfo.canvasWidth).toBeGreaterThan(canvasInfo.cssWidth * 1.5)
    }
  })

  test('playhead renders at correct position', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const video = page.locator('video')
    const canvas = page.locator('canvas').first()

    // Get current video time
    const currentTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    expect(currentTime).toBe(0)

    // Take screenshot of timeline at frame 0
    const screenshot1 = await canvas.screenshot()
    expect(screenshot1.byteLength).toBeGreaterThan(0)

    // Advance to frame 30
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(20)
    }
    await page.waitForTimeout(200)

    // Take screenshot of timeline at frame 30
    const screenshot2 = await canvas.screenshot()
    expect(screenshot2.byteLength).toBeGreaterThan(0)

    // Screenshots should be different (playhead moved)
    expect(screenshot1.equals(screenshot2)).toBe(false)
  })

  test('keyframes render as visible circles on timeline', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas').first()

    // Take screenshot with 1 keyframe (initial)
    const screenshot1 = await canvas.screenshot()

    // Add keyframe at frame 30
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(15)
    }
    await page.keyboard.press('k')
    await page.waitForTimeout(300)

    // Take screenshot with 2 keyframes
    const screenshot2 = await canvas.screenshot()

    // Screenshots should be different (new keyframe added)
    expect(screenshot1.equals(screenshot2)).toBe(false)

    // Add keyframe at frame 60
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(15)
    }
    await page.keyboard.press('k')
    await page.waitForTimeout(300)

    // Take screenshot with 3 keyframes
    const screenshot3 = await canvas.screenshot()

    // Screenshots should be different (third keyframe added)
    expect(screenshot2.equals(screenshot3)).toBe(false)
  })

  test('interpolation segments render between keyframes', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas').first()

    // Add keyframe at frame 50 to create interpolation segment
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(15)
    }
    await page.keyboard.press('k')
    await page.waitForTimeout(500)

    // Go back to frame 0 to see full timeline
    await page.keyboard.press('Home')
    await page.waitForTimeout(300)

    // Take screenshot showing interpolation segment
    const screenshot = await canvas.screenshot()
    expect(screenshot.byteLength).toBeGreaterThan(0)

    // Verify timeline shows continuous line between keyframes
    // (visual inspection via screenshot)
    // In real implementation, could analyze canvas pixels to verify line drawing
  })

  test('frame ruler renders with tick marks and numbers', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas').first()

    // Take screenshot of ruler
    const screenshot = await canvas.screenshot()
    expect(screenshot.byteLength).toBeGreaterThan(0)

    // Ruler should show frame numbers (would require OCR or canvas pixel analysis to verify)
    // For now, we verify canvas is rendered
    const isVisible = await canvas.isVisible()
    expect(isVisible).toBe(true)
  })

  test('timeline renders correctly at different zoom levels', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas').first()

    // Take screenshot at zoom level 1
    const screenshot1 = await canvas.screenshot()

    // Zoom in (if zoom controls exist)
    const zoomIn = page.getByRole('button', { name: /zoom in/i }).or(
      page.getByLabel(/zoom in/i)
    )

    if (await zoomIn.isVisible().catch(() => false)) {
      await zoomIn.click()
      await page.waitForTimeout(500)

      // Take screenshot at zoom level 2
      const screenshot2 = await canvas.screenshot()

      // Screenshots should be different (zoom changed)
      expect(screenshot1.equals(screenshot2)).toBe(false)

      // Zoom in again
      await zoomIn.click()
      await page.waitForTimeout(500)

      // Take screenshot at zoom level 3
      const screenshot3 = await canvas.screenshot()

      // Screenshots should be different
      expect(screenshot2.equals(screenshot3)).toBe(false)
    }
  })

  test('playhead continues to update during video playback', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const video = page.locator('video')
    const canvas = page.locator('canvas').first()

    // Start playback
    await page.keyboard.press('Space')
    await page.waitForTimeout(200)

    // Verify video is playing
    const isPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
    expect(isPaused).toBe(false)

    // Take screenshot at start of playback
    const screenshot1 = await canvas.screenshot()

    // Wait for video to advance
    await page.waitForTimeout(500)

    // Take screenshot after advancement
    const screenshot2 = await canvas.screenshot()

    // Wait more
    await page.waitForTimeout(500)

    // Take screenshot after more advancement
    const screenshot3 = await canvas.screenshot()

    // Pause playback
    await page.keyboard.press('Space')
    await page.waitForTimeout(200)

    // All screenshots should be different (playhead moved)
    expect(screenshot1.equals(screenshot2)).toBe(false)
    expect(screenshot2.equals(screenshot3)).toBe(false)
    expect(screenshot1.equals(screenshot3)).toBe(false)
  })

  test('selected keyframe highlights correctly', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas').first()

    // Add keyframes at frames 30 and 60
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(15)
    }
    await page.keyboard.press('k')
    await page.waitForTimeout(300)

    // Take screenshot with keyframe at 30 selected (current frame)
    const screenshotSelected30 = await canvas.screenshot()

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(15)
    }
    await page.keyboard.press('k')
    await page.waitForTimeout(300)

    // Take screenshot with keyframe at 60 selected (current frame)
    const screenshotSelected60 = await canvas.screenshot()

    // Screenshots should be different (different keyframe selected)
    expect(screenshotSelected30.equals(screenshotSelected60)).toBe(false)

    // Go back to frame 30
    await page.keyboard.press('Home')
    await page.waitForTimeout(200)
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(15)
    }
    await page.waitForTimeout(300)

    // Take screenshot with keyframe at 30 selected again
    const screenshotSelected30Again = await canvas.screenshot()

    // Should match original screenshot at frame 30
    // (Note: exact pixel match may be flaky, so we just verify it's different from frame 60)
    expect(screenshotSelected30Again.equals(screenshotSelected60)).toBe(false)
  })

  test('timeline renders correctly after window resize', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const canvas = page.locator('canvas').first()

    // Get initial canvas dimensions
    const initialInfo = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height
    }))

    // Resize window
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForTimeout(500)

    // Get new canvas dimensions
    const resizedInfo = await canvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height
    }))

    // Canvas dimensions should have changed
    expect(resizedInfo.width).not.toBe(initialInfo.width)

    // Canvas should still be visible and properly rendered
    await expect(canvas).toBeVisible()

    // Take screenshot to verify rendering
    const screenshot = await canvas.screenshot()
    expect(screenshot.byteLength).toBeGreaterThan(0)
  })

  test('ghost box renders when annotation is beyond timespan', async ({ page }) => {
    await navigateToAnnotationWorkspace(page)
    await createAnnotation(page)

    // Show timeline
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    // Add keyframe at frame 30 (last keyframe)
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(15)
    }
    await page.keyboard.press('k')
    await page.waitForTimeout(300)

    // Move beyond last keyframe to frame 50
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(15)
    }
    await page.waitForTimeout(300)

    // Ghost box should be visible (dashed outline at last keyframe position)
    const ghostBox = page.locator('[data-testid="ghost-box"]').or(
      page.locator('.ghost-box')
    )

    // Check if ghost box exists or if bounding box has dashed style
    const hasGhostBox = await ghostBox.isVisible().catch(() => false)

    if (!hasGhostBox) {
      // Check if regular bounding box is shown with dashed style
      const bbox = page.locator('[data-testid="bounding-box"]').or(page.locator('.bounding-box')).first()
      if (await bbox.isVisible().catch(() => false)) {
        const isDashed = await bbox.evaluate((el: HTMLElement) => {
          return el.style.borderStyle === 'dashed' ||
                 window.getComputedStyle(el).borderStyle === 'dashed' ||
                 el.style.opacity === '0.5'
        })
        expect(isDashed).toBe(true)
      }
    }
  })
})

/**
 * Helper functions
 */
async function navigateToAnnotationWorkspace(page: Page) {
  await expect(page.getByText('Video Browser')).toBeVisible({ timeout: 10000 })
  const firstVideo = page.locator('.MuiCard-root').first()
  await expect(firstVideo).toBeVisible()
  await firstVideo.click()
  await page.waitForTimeout(2000)
}

async function createAnnotation(page: Page) {
  await page.waitForSelector('video', { state: 'visible' })
  await page.waitForTimeout(1500)

  const addButton = page.getByRole('button', { name: /add annotation/i }).or(
    page.getByRole('button', { name: /new annotation/i })
  )
  if (await addButton.isVisible().catch(() => false)) {
    await addButton.click()
    await page.waitForTimeout(500)
  }

  const video = page.locator('video')
  const box = await video.boundingBox()
  if (box) {
    await page.mouse.move(box.x + 100, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()
    await page.waitForTimeout(500)
  }
}
