import { test, expect } from '../../fixtures/test-context.js'

/**
 * E2E tests for timeline rendering quality and performance.
 * Tests focus on:
 * - Timeline canvas rendering (no graininess)
 * - Playhead position and movement
 * - Keyframe visualization
 * - Interpolation segment rendering
 * - Zoom level rendering quality
 * - Frame ruler rendering
 */

test.describe('Timeline Rendering Quality', () => {
  test.beforeEach(async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()
  })

  test('timeline canvas renders without graininess', async ({ annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()
    await annotationWorkspace.timeline.expectVisible()

    await annotationWorkspace.timeline.expectHighDPIRendering()
  })

  test('playhead renders at correct position', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    await annotationWorkspace.video.expectCurrentFrame(0)

    const screenshot1 = await annotationWorkspace.timeline.screenshot()
    expect(screenshot1.byteLength).toBeGreaterThan(0)

    // Use direct seek to frame 30 instead of iterative seeking
    await annotationWorkspace.video.seekToFrame(30)

    // Wait for React to re-render with new frame position
    await page.waitForTimeout(300)
    await annotationWorkspace.video.expectCurrentFrame(30)

    const screenshot2 = await annotationWorkspace.timeline.screenshot()
    expect(screenshot2.byteLength).toBeGreaterThan(0)

    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot1, screenshot2)
  })

  test('keyframes render as visible circles on timeline', async ({ annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    const screenshot1 = await annotationWorkspace.timeline.screenshot()

    // Use direct seek instead of iterative seeking
    await annotationWorkspace.video.seekToFrame(30)
    await annotationWorkspace.timeline.addKeyframe()

    // Wait for React to re-render with new keyframe
    await annotationWorkspace.page.waitForTimeout(300)

    const screenshot2 = await annotationWorkspace.timeline.screenshot()
    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot1, screenshot2)

    // Use direct seek instead of iterative seeking
    await annotationWorkspace.video.seekToFrame(60)
    await annotationWorkspace.timeline.addKeyframe()

    const screenshot3 = await annotationWorkspace.timeline.screenshot()
    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot2, screenshot3)
  })

  test('interpolation segments render between keyframes', async ({ annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    for (let i = 0; i < 50; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await annotationWorkspace.timeline.addKeyframe()

    await annotationWorkspace.video.jumpToStart()

    const screenshot = await annotationWorkspace.timeline.screenshot()
    expect(screenshot.byteLength).toBeGreaterThan(0)
  })

  test('frame ruler renders with tick marks and numbers', async ({ annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    const screenshot = await annotationWorkspace.timeline.screenshot()
    expect(screenshot.byteLength).toBeGreaterThan(0)

    await annotationWorkspace.timeline.expectVisible()
  })

  test('timeline renders correctly at different zoom levels', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    const screenshot1 = await annotationWorkspace.timeline.screenshot()

    const zoomIn = page.getByRole('button', { name: /zoom in/i }).or(
      page.getByLabel(/zoom in/i)
    )

    if (await zoomIn.isVisible().catch(() => false)) {
      await zoomIn.click()
      await page.waitForTimeout(500)

      const screenshot2 = await annotationWorkspace.timeline.screenshot()
      annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot1, screenshot2)

      await zoomIn.click()
      await page.waitForTimeout(500)

      const screenshot3 = await annotationWorkspace.timeline.screenshot()
      annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot2, screenshot3)
    }
  })

  test('playhead continues to update during video playback', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    await annotationWorkspace.video.play()
    await page.waitForTimeout(300)

    await annotationWorkspace.video.expectPlaying()

    const screenshot1 = await annotationWorkspace.timeline.screenshot()
    await page.waitForTimeout(800)

    const screenshot2 = await annotationWorkspace.timeline.screenshot()
    await page.waitForTimeout(800)

    const screenshot3 = await annotationWorkspace.timeline.screenshot()

    await annotationWorkspace.video.pause()

    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot1, screenshot2)
    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot2, screenshot3)
    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot1, screenshot3)
  })

  test('selected keyframe highlights correctly', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    // Use direct seek instead of iterative seeking
    await annotationWorkspace.video.seekToFrame(30)
    await page.waitForTimeout(200)
    await annotationWorkspace.video.expectCurrentFrame(30)
    await annotationWorkspace.timeline.addKeyframe()
    await page.waitForTimeout(300)

    const screenshotSelected30 = await annotationWorkspace.timeline.screenshot()

    // Use direct seek instead of iterative seeking
    await annotationWorkspace.video.seekToFrame(60)
    await page.waitForTimeout(200)
    await annotationWorkspace.video.expectCurrentFrame(60)
    await annotationWorkspace.timeline.addKeyframe()
    await page.waitForTimeout(300)

    const screenshotSelected60 = await annotationWorkspace.timeline.screenshot()

    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshotSelected30, screenshotSelected60)

    // Use direct seek instead of iterative seeking
    await annotationWorkspace.video.seekToFrame(30)
    await page.waitForTimeout(300)
    await annotationWorkspace.video.expectCurrentFrame(30)

    const screenshotSelected30Again = await annotationWorkspace.timeline.screenshot()

    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshotSelected30Again, screenshotSelected60)
  })

  test('timeline renders correctly after window resize', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    const initialInfo = await annotationWorkspace.timeline.getCanvasInfo()

    await page.setViewportSize({ width: 1200, height: 800 })
    await page.waitForTimeout(500)

    const resizedInfo = await annotationWorkspace.timeline.getCanvasInfo()

    expect(resizedInfo.canvasWidth).not.toBe(initialInfo.canvasWidth)

    await annotationWorkspace.timeline.expectVisible()

    const screenshot = await annotationWorkspace.timeline.screenshot()
    expect(screenshot.byteLength).toBeGreaterThan(0)
  })

  test('ghost box renders when annotation is beyond timespan', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.timeline.show()

    await annotationWorkspace.video.seekToFrame(30)
    await page.waitForTimeout(300)
    await annotationWorkspace.timeline.addKeyframe()
    await page.waitForTimeout(300)

    // Click on the box to select the annotation
    const bbox = page.locator('[data-testid="bounding-box"]').first()
    await bbox.click({ force: true })
    await page.waitForTimeout(300)

    // Seek beyond the annotation timespan (beyond frame 30)
    await annotationWorkspace.video.seekToFrame(50)
    await page.waitForTimeout(500)

    // Box should still be visible as a ghost box with reduced opacity
    const isVisible = await bbox.isVisible().catch(() => false)
    expect(isVisible).toBe(true)

    // Ghost box should have strokeDasharray (dashed outline)
    const hasDasharray = await bbox.evaluate((el: SVGElement) => {
      const rect = el.querySelector('rect')
      if (!rect) return false
      const strokeDasharray = rect.getAttribute('stroke-dasharray')
      return strokeDasharray !== null && strokeDasharray !== '' && strokeDasharray !== 'none'
    })
    expect(hasDasharray).toBe(true)
  })
})

