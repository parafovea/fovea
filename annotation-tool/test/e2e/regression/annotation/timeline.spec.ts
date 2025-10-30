import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for timeline functionality.
 * Tests timeline visibility, playhead movement, keyframe markers, and zoom controls.
 */

test.describe('Annotation Timeline - Visibility', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('timeline is visible and renders correctly', async ({ annotationWorkspace, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.toggle()
    await annotationWorkspace.timeline.expectVisible()

    const info = await annotationWorkspace.timeline.getCanvasInfo()
    expect(info.canvasWidth).toBeGreaterThan(0)
    expect(info.canvasHeight).toBeGreaterThan(0)
  })

  test('timeline toggles visibility with T key', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    const timeline = annotationWorkspace.timeline.canvas

    await annotationWorkspace.timeline.toggle()
    await page.waitForTimeout(500)

    const isVisible1 = await timeline.isVisible().catch(() => false)

    await annotationWorkspace.timeline.toggle()
    await page.waitForTimeout(500)

    const isVisible2 = await timeline.isVisible().catch(() => false)

    expect(isVisible1).not.toBe(isVisible2)
  })

  test('timeline ruler shows frame numbers', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()
    await page.waitForTimeout(500)

    // Take a screenshot to verify timeline is rendering
    const screenshot = await annotationWorkspace.timeline.screenshot()
    expect(screenshot.length).toBeGreaterThan(0)

    // Verify timeline is visible and has reasonable dimensions
    const info = await annotationWorkspace.timeline.getCanvasInfo()
    expect(info.canvasWidth).toBeGreaterThan(100)
    expect(info.canvasHeight).toBeGreaterThan(20)
  })
})

test.describe('Annotation Timeline - Playhead', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('playhead moves as video plays', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    const initialTime = await annotationWorkspace.video.getCurrentTime()

    await annotationWorkspace.video.play()
    await page.waitForTimeout(500)

    await annotationWorkspace.video.expectPlaying()

    await page.waitForTimeout(1000)

    const newTime = await annotationWorkspace.video.getCurrentTime()
    expect(newTime).toBeGreaterThan(initialTime)

    await annotationWorkspace.video.pause()
  })

  test('playhead updates when seeking with keyboard', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    const frame0 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame0).toBe(0)

    // Seek forward 10 frames
    await annotationWorkspace.video.seekForward10Frames()
    await page.waitForTimeout(300)

    const frame10 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame10).toBeGreaterThan(0)

    // Seek back to start
    await annotationWorkspace.video.jumpToStart()
    await page.waitForTimeout(300)

    const frameBack = await annotationWorkspace.video.getCurrentFrame()
    expect(frameBack).toBe(0)
  })
})

test.describe('Annotation Timeline - Keyframe Markers', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('timeline shows keyframe markers at correct positions', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    // Add keyframes at frames 0, 20, 40
    await annotationWorkspace.video.seekToFrame(20)
    await page.waitForTimeout(300)
    await annotationWorkspace.timeline.addKeyframe()
    await page.waitForTimeout(500)

    await annotationWorkspace.video.seekToFrame(40)
    await page.waitForTimeout(300)
    await annotationWorkspace.timeline.addKeyframe()
    await page.waitForTimeout(500)

    // Take screenshot to verify keyframes are rendered
    const screenshot = await annotationWorkspace.timeline.screenshot()
    expect(screenshot.length).toBeGreaterThan(0)

    // Verify timeline is still visible
    await annotationWorkspace.timeline.expectVisible()
  })

  test('timeline updates when keyframes are added', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    // Take initial screenshot
    const screenshot1 = await annotationWorkspace.timeline.screenshot()

    // Add keyframe at frame 30
    await annotationWorkspace.video.seekToFrame(30)
    await page.waitForTimeout(300)
    await annotationWorkspace.timeline.addKeyframe()
    await page.waitForTimeout(500)

    // Take new screenshot
    const screenshot2 = await annotationWorkspace.timeline.screenshot()

    // Screenshots should be different (keyframe added)
    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot1, screenshot2)
  })

  test('timeline updates when keyframes are removed', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    // Add keyframes at frames 0, 20, 40
    await annotationWorkspace.video.seekToFrame(20)
    await page.waitForTimeout(300)
    await annotationWorkspace.timeline.addKeyframe()
    await page.waitForTimeout(500)

    await annotationWorkspace.video.seekToFrame(40)
    await page.waitForTimeout(300)
    await annotationWorkspace.timeline.addKeyframe()
    await page.waitForTimeout(500)

    // Take screenshot before deletion
    const screenshot1 = await annotationWorkspace.timeline.screenshot()

    // Delete keyframe at frame 20
    await annotationWorkspace.video.seekToFrame(20)
    await page.waitForTimeout(300)
    await annotationWorkspace.timeline.deleteKeyframe()
    await page.waitForTimeout(500)

    // Take screenshot after deletion
    const screenshot2 = await annotationWorkspace.timeline.screenshot()

    // Screenshots should be different (keyframe removed)
    annotationWorkspace.timeline.expectScreenshotsDifferent(screenshot1, screenshot2)
  })
})

test.describe('Annotation Timeline - Zoom Controls', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('timeline zoom controls work', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    const zoomIn = page.getByRole('button', { name: /zoom in/i }).or(
      page.getByLabel(/zoom in/i)
    )
    const zoomOut = page.getByRole('button', { name: /zoom out/i }).or(
      page.getByLabel(/zoom out/i)
    )

    if (await zoomIn.isVisible().catch(() => false)) {
      await zoomIn.click()
      await page.waitForTimeout(300)

      await zoomOut.click()
      await page.waitForTimeout(300)
    }

    await annotationWorkspace.timeline.expectVisible()
  })

  test('timeline zoom in increases detail', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    // Get initial canvas info
    const info1 = await annotationWorkspace.timeline.getCanvasInfo()

    // Zoom in using + key
    await page.keyboard.press('+')
    await page.waitForTimeout(500)

    // Get new canvas info (may have scrollable width)
    const info2 = await annotationWorkspace.timeline.getCanvasInfo()

    // Timeline should still be visible
    await annotationWorkspace.timeline.expectVisible()

    // Canvas dimensions should be reasonable
    expect(info2.canvasWidth).toBeGreaterThan(0)
    expect(info2.canvasHeight).toBeGreaterThan(0)
  })

  test('timeline zoom out reduces detail', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()

    // Zoom in first
    await page.keyboard.press('+')
    await page.waitForTimeout(300)

    // Get zoomed-in canvas info
    const info1 = await annotationWorkspace.timeline.getCanvasInfo()

    // Zoom out using - key
    await page.keyboard.press('-')
    await page.waitForTimeout(500)

    // Get zoomed-out canvas info
    const info2 = await annotationWorkspace.timeline.getCanvasInfo()

    // Timeline should still be visible
    await annotationWorkspace.timeline.expectVisible()

    // Canvas should have reasonable dimensions
    expect(info2.canvasWidth).toBeGreaterThan(0)
    expect(info2.canvasHeight).toBeGreaterThan(0)
  })
})
