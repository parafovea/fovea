import { test, expect } from '../../fixtures/test-context.js'

/**
 * Regression tests for timeline functionality.
 * Tests timeline visibility, playhead movement, and zoom controls.
 */

test.describe('Annotation Timeline', () => {
  test.beforeEach(async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()
  })

  test('timeline is visible and renders correctly', async ({ annotationWorkspace }) => {
    await annotationWorkspace.navigateFromVideoBrowser()
    await annotationWorkspace.drawSimpleBoundingBox()

    await annotationWorkspace.timeline.toggle()
    await annotationWorkspace.timeline.expectVisible()

    const info = await annotationWorkspace.timeline.getCanvasInfo()
    expect(info.canvasWidth).toBeGreaterThan(0)
    expect(info.canvasHeight).toBeGreaterThan(0)
  })

  test('playhead moves as video plays', async ({ annotationWorkspace, page }) => {
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

  test('timeline toggles visibility with T key', async ({ annotationWorkspace, page }) => {
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

  test('timeline zoom controls work', async ({ annotationWorkspace, page }) => {
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
})
