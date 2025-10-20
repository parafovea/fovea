import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for bounding box creation and manipulation.
 * Tests drawing, resizing, and moving bounding boxes.
 */

test.describe('Annotation Bounding Box', () => {
  test.beforeEach(async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()
  })

  test('loads video and navigates to annotation workspace', async ({ videoBrowser, annotationWorkspace }) => {
    await videoBrowser.expectPageLoaded()

    const firstVideo = videoBrowser.firstVideoCard
    await expect(firstVideo).toBeVisible()

    // Click the Annotate button within the first video card
    const annotateButton = firstVideo.getByRole('button', { name: /annotate/i })
    await expect(annotateButton).toBeVisible()
    await annotateButton.click()

    // Wait for URL change to annotation workspace
    await annotationWorkspace.page.waitForURL(/\/annotate\//, { timeout: 15000 })

    await annotationWorkspace.expectWorkspaceReady()
  })

  test('creates initial bounding box annotation', async ({ annotationWorkspace }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('navigates frames with arrow keys', async ({ annotationWorkspace, page }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    const initialFrame = await annotationWorkspace.video.getCurrentFrame()
    expect(initialFrame).toBe(0)

    await annotationWorkspace.video.seekForwardOneFrame()
    await page.waitForTimeout(100)

    const frame1 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame1).toBe(1)

    await annotationWorkspace.video.seekForward10Frames()
    await page.waitForTimeout(100)

    const frame11 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame11).toBe(11)

    await annotationWorkspace.video.seekBackwardOneFrame()
    await page.waitForTimeout(100)

    const frame10 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame10).toBe(10)

    await annotationWorkspace.video.seekBackward10Frames()
    await page.waitForTimeout(100)

    const frame0 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame0).toBe(0)
  })

  test('keyboard shortcuts work in annotation workspace', async ({ annotationWorkspace, page }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.video.togglePlayback()
    await page.waitForTimeout(300)
    let paused = await annotationWorkspace.video.isPaused()
    expect(paused).toBe(false)

    await annotationWorkspace.video.togglePlayback()
    await page.waitForTimeout(300)
    paused = await annotationWorkspace.video.isPaused()
    expect(paused).toBe(true)

    await annotationWorkspace.video.jumpToStart()
    await page.waitForTimeout(200)
    const frame = await annotationWorkspace.video.getCurrentFrame()
    expect(frame).toBe(0)

    await annotationWorkspace.video.jumpToEnd()
    await page.waitForTimeout(300)
    const endFrame = await annotationWorkspace.video.getCurrentFrame()
    expect(endFrame).toBeGreaterThan(0)

    await annotationWorkspace.video.jumpToStart()
    await page.waitForTimeout(200)
    await annotationWorkspace.video.seekForwardOneFrame()
    await page.waitForTimeout(100)
    const frame1 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame1).toBe(1)
  })
})
