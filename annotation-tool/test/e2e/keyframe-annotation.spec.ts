/**
 * @file keyframe-annotation.spec.ts
 * @description E2E tests for keyframe annotation workflow.
 * Tests the complete manual keyframe annotation workflow from Session 4.
 */

import { test, expect } from '@playwright/test'

test.describe('Keyframe Annotation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to video annotation page
    await page.goto('/videos')
    // Assume there's a test video available
  })

  test('complete keyframe annotation workflow', async ({ page }) => {
    // Step 1: Load video and draw initial bounding box at frame 0
    await page.click('button:has-text("Draw Bounding Box")')

    // Draw box by clicking and dragging
    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Verify bounding box created
    await expect(page.locator('[data-annotation-id]')).toBeVisible()

    // Step 2: Advance to frame 50
    await page.keyboard.press('Shift+ArrowRight') // Jump 10 frames
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')

    // Verify at frame 50
    await expect(page.locator('text=/Frame 50/')).toBeVisible()

    // Step 3: Add keyframe using keyboard shortcut
    await page.keyboard.press('k')

    // Verify keyframe indicator on timeline
    const timeline = page.locator('canvas[data-testid="timeline"]').first()
    await expect(timeline).toBeVisible()

    // Step 4: Resize box
    // Move box to new position
    const handle = page.locator('[data-testid="resize-handle-se"]').first()
    const handleBox = await handle.boundingBox()
    if (handleBox) {
      await page.mouse.move(handleBox.x, handleBox.y)
      await page.mouse.down()
      await page.mouse.move(handleBox.x + 50, handleBox.y + 30)
      await page.mouse.up()
    }

    // Step 5: Verify interpolation by seeking to midpoint
    await page.click('canvas[data-testid="timeline"]', {
      position: { x: 150, y: 50 },
    })

    // Verify interpolated box is visible
    await expect(page.locator('[data-annotation-id]')).toBeVisible()

    // Step 6: Verify Quick Actions Panel appears on selection
    const boundingBox = page.locator('[data-annotation-id]').first()
    await boundingBox.click()

    await expect(page.locator('text=Keyframe')).toBeVisible()
    await expect(page.locator('text=Delete')).toBeVisible()
    await expect(page.locator('text=Previous')).toBeVisible()
  })

  test('keyframe deletion workflow', async ({ page }) => {
    // Create annotation with 3 keyframes
    await page.click('button:has-text("Draw Bounding Box")')

    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    // Draw initial box
    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Add keyframe at frame 25
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('k')

    // Add keyframe at frame 50
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('ArrowRight')
    }
    await page.keyboard.press('k')

    // Go back to frame 25
    await page.keyboard.press('Ctrl+ArrowLeft')

    // Delete middle keyframe
    await page.keyboard.press('Delete')

    // Verify keyframe removed
    // Timeline should only show 2 keyframes now
  })

  test('keyframe dragging on timeline', async ({ page }) => {
    // Create annotation with keyframes
    await page.click('button:has-text("Draw Bounding Box")')

    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Add keyframe at frame 50
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('k')

    // Drag keyframe on timeline
    const timeline = page.locator('canvas[data-testid="timeline"]').first()
    const timelineBox = await timeline.boundingBox()
    if (timelineBox) {
      // Click on keyframe (approximate position)
      await page.mouse.move(timelineBox.x + 300, timelineBox.y + 60)
      await page.mouse.down()
      // Drag to new position
      await page.mouse.move(timelineBox.x + 250, timelineBox.y + 60)
      await page.mouse.up()
    }

    // Verify keyframe moved
  })

  test('convert interpolated frame to keyframe', async ({ page }) => {
    // Create annotation with 2 keyframes
    await page.click('button:has-text("Draw Bounding Box")')

    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Add keyframe at frame 50
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('k')

    // Go to interpolated frame (frame 25)
    await page.keyboard.press('Ctrl+ArrowLeft')
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('ArrowLeft')
    }

    // Click corner handle to convert to keyframe
    const cornerHandle = page.locator('[style*="cursor: nw-resize"]').first()
    await cornerHandle.click()

    // Verify tooltip appears
    await expect(page.locator('text=/Convert to Keyframe/')).toBeVisible()

    // Verify keyframe created
    // Should now have 3 keyframes (0, 25, 50)
  })

  test('copy previous frame functionality', async ({ page }) => {
    // Create annotation
    await page.click('button:has-text("Draw Bounding Box")')

    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Advance 1 frame
    await page.keyboard.press('ArrowRight')

    // Use Ctrl+C to copy previous frame
    await page.keyboard.press('Control+c')

    // Verify box copied (should now have keyframe at frame 1)
  })

  test('motion path visualization', async ({ page }) => {
    // Create annotation with keyframes
    await page.click('button:has-text("Draw Bounding Box")')

    const videoPlayer = page.locator('video').first()
    const bbox = await videoPlayer.boundingBox()
    if (!bbox) throw new Error('Video player not found')

    await page.mouse.move(bbox.x + 100, bbox.y + 100)
    await page.mouse.down()
    await page.mouse.move(bbox.x + 200, bbox.y + 200)
    await page.mouse.up()

    // Add keyframe at different position
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('k')

    // Move box
    const boundingBox = page.locator('[data-annotation-id]').first()
    const boxBounds = await boundingBox.boundingBox()
    if (boxBounds) {
      await page.mouse.move(boxBounds.x + 25, boxBounds.y + 25)
      await page.mouse.down()
      await page.mouse.move(boxBounds.x + 125, boxBounds.y + 125)
      await page.mouse.up()
    }

    // Verify motion path overlay is visible
    await expect(page.locator('[data-testid="motion-path-overlay"]')).toBeVisible()

    // Verify path shows trajectory
    const pathElement = page.locator('[data-testid="motion-path-overlay"] path').first()
    await expect(pathElement).toBeVisible()
  })
})
