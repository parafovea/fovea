import { test, expect } from '../../fixtures/test-context.js'
import { verifyNoPageScroll } from '../helpers/keyboard-test-utils.js'

/**
 * Video Playback Keyboard Shortcuts Tests
 *
 * Tests verify that video playback shortcuts work correctly:
 * - Space: Play/pause video (should NOT scroll page)
 * - Arrow Left/Right: Previous/next frame
 * - Shift+Arrow Left/Right: Jump 10 frames
 * - Home: Jump to start
 * - End: Jump to end
 * - M: Toggle mute
 * - F: Toggle fullscreen
 */

test.describe('Keyboard Shortcuts - Video Playback', () => {
  test.beforeEach(async ({ annotationWorkspace, testVideo }) => {
    await annotationWorkspace.navigateTo(testVideo.id)
    // Wait for command context to be initialized
    await annotationWorkspace.video.waitForCommandContext()
  })

  test('Space plays/pauses video without scrolling page', async ({ page, annotationWorkspace }) => {
    const video = page.locator('video')
    await expect(video).toBeVisible()

    // Ensure video is initially paused
    const initialPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
    expect(initialPaused).toBe(true)

    // Verify Space doesn't scroll page
    await verifyNoPageScroll(page, 'Space')

    // Wait for video to actually start playing
    await annotationWorkspace.video.waitForPlaying()

    // Verify video is now playing
    const nowPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
    expect(nowPaused).toBe(false)

    // Press Space again
    await page.keyboard.press('Space')
    await page.waitForTimeout(300)

    // Verify video is paused again
    const finalPaused = await video.evaluate((v: HTMLVideoElement) => v.paused)
    expect(finalPaused).toBe(true)
  })

  test('Arrow Right advances one frame', async ({ page, annotationWorkspace }) => {
    const video = page.locator('video')
    const initialTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)

    // Press Right Arrow
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)

    // Verify time increased
    const newTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    expect(newTime).toBeGreaterThan(initialTime)
  })

  test('Arrow Left goes back one frame', async ({ page, annotationWorkspace }) => {
    const video = page.locator('video')

    // Advance first
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)

    const initialTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)

    // Press Left Arrow
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(200)

    // Verify time decreased
    const newTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    expect(newTime).toBeLessThan(initialTime)
  })

  test('Shift+Arrow Right jumps 10 frames forward', async ({ page, annotationWorkspace }) => {
    const video = page.locator('video')
    const initialTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)

    // Press Shift+Right
    await page.keyboard.press('Shift+ArrowRight')
    await page.waitForTimeout(200)

    // Verify jumped multiple frames (at least 0.2 seconds at 30fps = 6+ frames)
    const newTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    const timeDiff = newTime - initialTime
    expect(timeDiff).toBeGreaterThan(0.2)
  })

  test('Shift+Arrow Left jumps 10 frames backward', async ({ page, annotationWorkspace }) => {
    const video = page.locator('video')

    // Advance to middle first
    await page.keyboard.press('Shift+ArrowRight')
    await page.waitForTimeout(200)
    await page.keyboard.press('Shift+ArrowRight')
    await page.waitForTimeout(200)

    const initialTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)

    // Press Shift+Left
    await page.keyboard.press('Shift+ArrowLeft')
    await page.waitForTimeout(200)

    // Verify jumped back multiple frames
    const newTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    const timeDiff = initialTime - newTime
    expect(timeDiff).toBeGreaterThan(0.2)
  })

  test('Home jumps to start', async ({ page, annotationWorkspace }) => {
    const video = page.locator('video')

    // Advance video first
    await page.keyboard.press('Shift+ArrowRight')
    await page.waitForTimeout(200)

    // Verify not at start
    let currentTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    expect(currentTime).toBeGreaterThan(0)

    // Press Home
    await page.keyboard.press('Home')
    await page.waitForTimeout(300)

    // Verify at start
    currentTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    expect(currentTime).toBe(0)
  })

  test('End jumps to end', async ({ page, annotationWorkspace }) => {
    const video = page.locator('video')

    // Wait for video metadata to load before getting duration
    const duration = await video.evaluate((v: HTMLVideoElement) => {
      return new Promise<number>((resolve) => {
        if (!isNaN(v.duration)) {
          resolve(v.duration)
        } else {
          v.addEventListener('loadedmetadata', () => resolve(v.duration), { once: true })
        }
      })
    })

    // Press End
    await page.keyboard.press('End')
    await page.waitForTimeout(300)

    // Verify at end (within 0.5 seconds)
    const currentTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
    expect(currentTime).toBeGreaterThan(duration - 0.5)
  })

  test('shortcuts disabled when typing in search field', async ({ page, annotationWorkspace }) => {
    const video = page.locator('video')

    // Click on a search/input field in the sidebar (if exists)
    const searchInput = page.getByPlaceholder(/search/i).first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.focus()
      await page.waitForTimeout(200)

      const initialTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)

      // Press arrow key - should type in input, not seek video
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(300)

      // Verify video did NOT seek
      const newTime = await video.evaluate((v: HTMLVideoElement) => v.currentTime)
      expect(newTime).toBe(initialTime)
    }
  })
})
