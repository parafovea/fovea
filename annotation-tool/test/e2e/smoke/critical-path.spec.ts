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
  test.describe.configure({ timeout: 30000, retries: 0 })

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

  test('creates simple bounding box annotation', async ({ annotationWorkspace, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()

    // Draw the box. drawSimpleBoundingBox arms a waitForResponse on the
    // /annotations create call before dragging and returns that promise, so
    // awaiting it resolves only once the POST/PUT has landed — the assertions
    // below run against committed state, never a mid-flight render.
    await annotationWorkspace.drawSimpleBoundingBox()

    // Wait for the drawn annotation's SVG overlay to actually render on the
    // canvas, then confirm the sidebar count reflects it. Both are web-first
    // assertions that retry under load rather than depending on a fixed sleep.
    await expect(annotationWorkspace.boundingBox.first()).toBeVisible({ timeout: 10000 })
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('adds keyframe with K shortcut', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
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

    // Verify bounding box still visible at new keyframe. expectBoundingBoxVisible
    // polls the annotation count with a generous timeout, so it settles on its
    // own without a fixed wait after the keyframe edit.
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('saves annotation successfully', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Add a keyframe for more complete annotation
    await annotationWorkspace.timeline.show()
    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await annotationWorkspace.timeline.addKeyframe()

    // Click save button (use first() to avoid strict mode violation with multiple Save buttons)
    const saveButton = page.getByRole('button', { name: /save/i }).first()
    await expect(saveButton).toBeVisible()
    await saveButton.click()

    // Verify success message. The toast is the user-visible signal that the
    // save landed; the web-first assertion retries until it appears, so no
    // fixed wait is needed between the click and the check.
    const successMessage = page.getByText(/saved/i).or(page.getByText(/success/i))
    await expect(successMessage.first()).toBeVisible({ timeout: 10000 })
  })

  test('toggles timeline with T shortcut', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    const timeline = annotationWorkspace.timeline.canvas

    // The timeline starts hidden after drawing (nothing has revealed it), so the
    // first T-toggle must reveal it and the second must hide it again. Asserting
    // each concrete transition with a web-first assertion is deterministic —
    // replacing the old pattern of two sleep-gated isVisible() reads whose
    // ordering under load determined whether the "changed" comparison held.
    await annotationWorkspace.timeline.toggle()
    await expect(timeline).toBeVisible({ timeout: 10000 })

    await annotationWorkspace.timeline.toggle()
    await expect(timeline).toBeHidden({ timeout: 10000 })
  })

  test('plays and pauses video with Space', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Press Space to play
    await annotationWorkspace.video.togglePlayback()
    // Wait for video to actually start playing
    await annotationWorkspace.video.waitForPlaying()
    await annotationWorkspace.video.expectPlaying()

    // Press Space to pause. expectPaused polls the video's `paused` JS property,
    // so it settles once the pause takes effect instead of guessing with a sleep.
    await annotationWorkspace.video.togglePlayback()
    await annotationWorkspace.video.expectPaused()
  })

  test('seeks frames with arrow keys', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Verify starting at frame 0
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame(), { timeout: 10000 }).toBe(0)

    // Seek forward one frame. expect.poll re-reads the video's currentTime until
    // the seek is reflected, replacing the fixed sleep that could read the frame
    // before the time update settled under load.
    await annotationWorkspace.video.seekForwardOneFrame()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame(), { timeout: 10000 }).toBe(1)

    // Seek forward 10 frames
    await annotationWorkspace.video.seekForward10Frames()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame(), { timeout: 10000 }).toBe(11)

    // Seek backward one frame
    await annotationWorkspace.video.seekBackwardOneFrame()
    await expect.poll(() => annotationWorkspace.video.getCurrentFrame(), { timeout: 10000 }).toBe(10)
  })

  test('timeline renders correctly', async ({ annotationWorkspace, testPersona, testEntityType }) => {
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

  test('playhead moves as video plays', async ({ annotationWorkspace, page, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    // Show timeline
    await annotationWorkspace.timeline.show()

    // Get initial time
    const initialTime = await annotationWorkspace.video.getCurrentTime()

    // Play video
    await annotationWorkspace.video.play()
    // Wait for video to actually start playing
    await annotationWorkspace.video.waitForPlaying()

    // Verify playing
    await annotationWorkspace.video.expectPlaying()

    // The playhead advances as the video plays. Polling currentTime until it
    // exceeds the start time is the deterministic signal that playback made
    // progress, in place of a fixed 1s wait that assumes a minimum advance.
    await expect
      .poll(() => annotationWorkspace.video.getCurrentTime(), { timeout: 10000 })
      .toBeGreaterThan(initialTime)

    // Pause video
    await annotationWorkspace.video.pause()
  })
})
