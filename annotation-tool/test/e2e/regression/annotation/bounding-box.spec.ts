import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for bounding box creation and manipulation.
 * Tests drawing, resizing, and moving bounding boxes.
 */

test.describe('Annotation Bounding Box', () => {
  test.beforeEach(async ({ videoBrowser, testUser, testPersona, testEntityType, testVideo }) => {
    await videoBrowser.navigateToHome()
  })

  test('loads video and navigates to annotation workspace', async ({ videoBrowser, annotationWorkspace, testUser, testPersona, testEntityType, testVideo }) => {
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

  test('creates initial bounding box annotation', async ({ annotationWorkspace, testUser, testPersona, testEntityType, testVideo }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('navigates frames with arrow keys', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    void page
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })

    // Each seek sets video.currentTime directly; poll the derived frame until
    // it settles rather than sleeping a fixed interval before the read.
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBe(0)

    await annotationWorkspace.video.seekForwardOneFrame()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBe(1)

    await annotationWorkspace.video.seekForward10Frames()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBe(11)

    await annotationWorkspace.video.seekBackwardOneFrame()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBe(10)

    await annotationWorkspace.video.seekBackward10Frames()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBe(0)
  })

  test('keyboard shortcuts work in annotation workspace', async ({ annotationWorkspace, page, testUser, testPersona, testEntityType, testVideo }) => {
    void page
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox({ personaName: testPersona.name })

    const video = annotationWorkspace.video.videoElement

    // Toggling playback flips video.paused; assert on the property (which
    // retries) instead of sleeping and reading once.
    await annotationWorkspace.video.togglePlayback()
    await expect(video).toHaveJSProperty('paused', false, { timeout: 10000 })

    await annotationWorkspace.video.togglePlayback()
    await expect(video).toHaveJSProperty('paused', true, { timeout: 10000 })

    await annotationWorkspace.video.jumpToStart()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBe(0)

    await annotationWorkspace.video.jumpToEnd()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBeGreaterThan(0)

    await annotationWorkspace.video.jumpToStart()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBe(0)
    await annotationWorkspace.video.seekForwardOneFrame()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame()).toBe(1)
  })
})
