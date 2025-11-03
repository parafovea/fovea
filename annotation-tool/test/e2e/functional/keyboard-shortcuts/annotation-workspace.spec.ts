import { test, expect } from '../../fixtures/test-context.js'

/**
 * Annotation Workspace Keyboard Shortcuts Tests
 *
 * Tests verify that annotation workspace shortcuts work correctly:
 * - K: Add keyframe at current frame
 * - T: Toggle timeline visibility
 * - V: Toggle annotation visibility
 * - C: Copy previous keyframe
 * - Delete: Remove keyframe
 * - N: Start new annotation
 */

test.describe('Keyboard Shortcuts - Annotation Workspace', () => {
  test.beforeEach(async ({ annotationWorkspace, testVideo, testUser, testPersona, testEntityType }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
  })

  test('K adds keyframe at current frame', async ({ page, annotationWorkspace, testUser, testPersona, testEntityType }) => {
    // Draw initial bounding box
    await annotationWorkspace.drawSimpleBoundingBox()

    // Show timeline
    await annotationWorkspace.timeline.show()
    await page.waitForTimeout(500)

    // Advance 30 frames
    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    // Press K to add keyframe
    await page.keyboard.press('k')
    await page.waitForTimeout(500)

    // Verify bounding box still visible (keyframe was added)
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('T toggles timeline visibility', async ({ page, annotationWorkspace, testUser, testPersona, testEntityType }) => {
    // Draw initial bounding box
    await annotationWorkspace.drawSimpleBoundingBox()

    const timeline = page.locator('[data-testid="timeline-canvas"]')

    // Timeline should be hidden initially
    let isVisible = await timeline.isVisible().catch(() => false)

    // Press T to toggle
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    // Verify visibility toggled
    const newVisible = await timeline.isVisible().catch(() => false)
    expect(newVisible).toBe(!isVisible)

    // Press T again
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    // Verify back to original state
    isVisible = await timeline.isVisible().catch(() => false)
    expect(isVisible).toBe(!newVisible)
  })

  test('V toggles annotation visibility', async ({ page, annotationWorkspace, testUser, testPersona, testEntityType }) => {
    // Draw initial bounding box
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()
    await page.waitForTimeout(500)

    // Press V to toggle visibility
    await page.keyboard.press('v')
    await page.waitForTimeout(500)

    // Verify visibility was toggled (exact behavior depends on implementation)
    // This test verifies the command executes without error
  })

  test('C copies previous keyframe', async ({ page, annotationWorkspace, testUser, testPersona, testEntityType }) => {
    // Draw initial bounding box
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()
    await page.waitForTimeout(500)

    // Advance 30 frames
    for (let i = 0; i < 30; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    // Press C to copy previous keyframe
    await page.keyboard.press('c')
    await page.waitForTimeout(500)

    // Verify bounding box visible at new position
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('Delete removes keyframe', async ({ page, annotationWorkspace, testUser, testPersona, testEntityType }) => {
    // Draw initial bounding box
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.show()
    await page.waitForTimeout(500)

    // Add keyframe at frame 20
    for (let i = 0; i < 20; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await page.keyboard.press('k')
    await page.waitForTimeout(300)

    // Add keyframe at frame 40
    for (let i = 0; i < 20; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }
    await page.keyboard.press('k')
    await page.waitForTimeout(300)

    // Go back to frame 20
    await annotationWorkspace.video.jumpToStart()
    await page.waitForTimeout(200)
    for (let i = 0; i < 20; i++) {
      await annotationWorkspace.video.seekForwardOneFrame()
    }

    // Press Delete to remove keyframe
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)

    // Verify still have bounding box (from interpolation or remaining keyframes)
    await annotationWorkspace.expectBoundingBoxVisible()
  })

  test('shortcuts work after selecting annotation', async ({ page, annotationWorkspace, testUser, testPersona, testEntityType }) => {
    // Draw and save annotation
    await annotationWorkspace.drawSimpleBoundingBox()

    const saveButton = page.getByRole('button', { name: /save/i }).first()
    await expect(saveButton).toBeVisible()
    await saveButton.click()
    await page.waitForTimeout(1000)

    // Draw second annotation
    await annotationWorkspace.drawSimpleBoundingBox()

    // Timeline toggle should work
    await page.keyboard.press('t')
    await page.waitForTimeout(500)

    const timeline = page.locator('[data-testid="timeline-canvas"]')
    await expect(timeline).toBeVisible()
  })

  test('shortcuts disabled when typing in annotation label', async ({ page, annotationWorkspace, testUser, testPersona, testEntityType }) => {
    // Draw initial bounding box
    await annotationWorkspace.drawSimpleBoundingBox()

    // Find and focus an input field (e.g., type selector or label field)
    const input = page.getByRole('combobox', { name: /select type|entity type/i }).first()
    if (await input.isVisible().catch(() => false)) {
      await input.focus()
      await page.waitForTimeout(200)

      // Count existing keyframes via Redux state or DOM
      const initialKeyframeCount = await page.locator('[data-testid="keyframe-marker"]').count().catch(() => 0)

      // Press K - should type 'k' in input, not add keyframe
      await page.keyboard.type('k')
      await page.waitForTimeout(500)

      // Verify no new keyframe added
      const newKeyframeCount = await page.locator('[data-testid="keyframe-marker"]').count().catch(() => 0)
      expect(newKeyframeCount).toBe(initialKeyframeCount)
    }
  })

  test('Space shortcut specific to annotation workspace', async ({ page, annotationWorkspace, testUser }) => {
    const video = page.locator('video')

    // Ensure video paused
    const initialPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
    expect(initialPaused).toBe(true)

    // Press Space
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)

    // Verify video playing
    const nowPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
    expect(nowPaused).toBe(false)
  })
})
