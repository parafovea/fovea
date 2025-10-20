import { test, expect } from '../fixtures/test-context.js'

/**
 * Smoke Tests - Critical Path
 *
 * These tests verify the core functionality of the application.
 * They should be fast (< 3 minutes total), reliable (100% pass rate),
 * and test only critical user journeys.
 *
 * Criteria:
 * - Each test runs in < 20 seconds
 * - Tests are independent (no dependencies between tests)
 * - Tests verify critical paths (if these fail, app is broken)
 * - Total runtime < 3 minutes
 */

test.describe('Smoke Tests - Critical Path', () => {
  test.describe.configure({ timeout: 30000, retries: 2 })

  test('loads application and shows video browser', async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()

    // Verify no login UI (single-user mode)
    await videoBrowser.expectNoLoginUI()

    // Verify user logged in
    await videoBrowser.expectUserLoggedIn()

    // Verify page loaded with video browser
    await videoBrowser.expectPageLoaded()

    // Verify first video card is visible
    const firstVideo = videoBrowser.firstVideoCard
    await expect(firstVideo).toBeVisible()
  })

  test('navigates to video and loads annotation workspace', async ({ videoBrowser, annotationWorkspace }) => {
    await videoBrowser.navigateToHome()
    await videoBrowser.expectPageLoaded()

    // Click annotate button on first video
    const firstVideo = videoBrowser.firstVideoCard
    await expect(firstVideo).toBeVisible()

    const annotateButton = firstVideo.getByRole('button', { name: /annotate/i })
    await expect(annotateButton).toBeVisible()
    await annotateButton.click()

    // Wait for annotation workspace to load
    await annotationWorkspace.page.waitForURL(/\/annotate\//, { timeout: 15000 })
    await annotationWorkspace.expectWorkspaceReady()
  })

  test('creates simple bounding box annotation', async ({ annotationWorkspace }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // Draw bounding box
    await annotationWorkspace.drawSimpleBoundingBox()

    // Verify box is visible
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('adds keyframe with K shortcut', async ({ annotationWorkspace, page }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Show timeline
    await annotationWorkspace.timeline.show()

    // Seek forward 30 frames
    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    // Add keyframe with K key
    await annotationWorkspace.timeline.addKeyframe()

    await page.waitForTimeout(300)

    // Verify bounding box still visible at new keyframe
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('saves annotation successfully', async ({ annotationWorkspace, page }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Add a keyframe for more complete annotation
    await annotationWorkspace.timeline.show()
    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await annotationWorkspace.timeline.addKeyframe()

    // Click save button
    const saveButton = page.getByRole('button', { name: /save/i })
    await expect(saveButton).toBeVisible()
    await saveButton.click()
    await page.waitForTimeout(1000)

    // Verify success message
    const successMessage = page.getByText(/saved/i).or(page.getByText(/success/i))
    await expect(successMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('toggles timeline with T shortcut', async ({ annotationWorkspace, page }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    const timeline = annotationWorkspace.timeline.canvas

    // Toggle timeline on
    await annotationWorkspace.timeline.toggle()
    await page.waitForTimeout(500)

    const isVisible1 = await timeline.isVisible().catch(() => false)

    // Toggle timeline off
    await annotationWorkspace.timeline.toggle()
    await page.waitForTimeout(500)

    const isVisible2 = await timeline.isVisible().catch(() => false)

    // Verify visibility changed
    expect(isVisible1).not.toBe(isVisible2)
  })

  test('plays and pauses video with Space', async ({ annotationWorkspace, page }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Press Space to play
    await annotationWorkspace.video.togglePlayback()
    await page.waitForTimeout(300)

    let paused = await annotationWorkspace.video.isPaused()
    expect(paused).toBe(false)

    // Press Space to pause
    await annotationWorkspace.video.togglePlayback()
    await page.waitForTimeout(300)

    paused = await annotationWorkspace.video.isPaused()
    expect(paused).toBe(true)
  })

  test('seeks frames with arrow keys', async ({ annotationWorkspace, page }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Verify starting at frame 0
    const initialFrame = await annotationWorkspace.video.getCurrentFrame()
    expect(initialFrame).toBe(0)

    // Seek forward one frame
    await annotationWorkspace.video.seekForwardOneFrame()
    await page.waitForTimeout(100)

    const frame1 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame1).toBe(1)

    // Seek forward 10 frames
    await annotationWorkspace.video.seekForward10Frames()
    await page.waitForTimeout(100)

    const frame11 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame11).toBe(11)

    // Seek backward one frame
    await annotationWorkspace.video.seekBackwardOneFrame()
    await page.waitForTimeout(100)

    const frame10 = await annotationWorkspace.video.getCurrentFrame()
    expect(frame10).toBe(10)
  })

  test('timeline renders correctly', async ({ annotationWorkspace }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Show timeline
    await annotationWorkspace.timeline.toggle()
    await annotationWorkspace.timeline.expectVisible()

    // Verify canvas dimensions are valid
    const info = await annotationWorkspace.timeline.getCanvasInfo()
    expect(info.canvasWidth).toBeGreaterThan(0)
    expect(info.canvasHeight).toBeGreaterThan(0)
  })

  test('playhead moves as video plays', async ({ annotationWorkspace, page }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Show timeline
    await annotationWorkspace.timeline.show()

    // Get initial time
    const initialTime = await annotationWorkspace.video.getCurrentTime()

    // Play video
    await annotationWorkspace.video.play()
    await page.waitForTimeout(500)

    // Verify playing
    await annotationWorkspace.video.expectPlaying()

    // Wait for playback
    await page.waitForTimeout(1000)

    // Get new time
    const newTime = await annotationWorkspace.video.getCurrentTime()
    expect(newTime).toBeGreaterThan(initialTime)

    // Pause video
    await annotationWorkspace.video.pause()
  })
})
