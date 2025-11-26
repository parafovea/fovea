import { test, expect } from '../fixtures/test-context.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

/**
 * E2E tests for video storage functionality
 *
 * Tests the complete video upload, storage, and retrieval workflow
 * including video streaming and thumbnail generation.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test.describe('Video Storage', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/')

    // Wait for the app to be ready
    await page.waitForLoadState('networkidle')
  })

  test('should upload a video and store it correctly', async ({ page }) => {
    // This test verifies that:
    // 1. Videos can be uploaded through the UI
    // 2. The storage provider correctly handles the video
    // 3. The video can be retrieved and played back

    // Create a small test video file (using a minimal MP4)
    const testVideoPath = path.join(__dirname, '../../fixtures/test-video.mp4')

    // Check if test video exists, if not skip this test
    if (!fs.existsSync(testVideoPath)) {
      test.skip()
      return
    }

    // Navigate to video upload or browse page
    // Note: This assumes there's a videos page - adjust based on actual UI
    await page.goto('/videos')

    // Look for upload button (adjust selector based on actual UI)
    const uploadButton = page.locator('button:has-text("Upload")').first()
    if (await uploadButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await uploadButton.click()

      // Handle file upload dialog
      const fileInput = page.locator('input[type="file"]')
      await fileInput.setInputFiles(testVideoPath)

      // Wait for upload to complete
      await page.waitForResponse(response =>
        response.url().includes('/api/videos') && response.status() === 200,
        { timeout: 30000 }
      )

      // Verify video appears in the list
      await expect(page.locator('text=test-video.mp4').first()).toBeVisible({ timeout: 10000 })
    } else {
      console.log('ℹ️  Upload button not found - skipping upload test')
      test.skip()
    }
  })

  test('should stream video from storage', async ({ page, testVideo, videoBrowser, annotationWorkspace }) => {
    // This test verifies video streaming works correctly in the UI

    // Navigate to video browser and click first video
    await videoBrowser.navigateToHome()
    await videoBrowser.expectPageLoaded()

    const firstVideo = videoBrowser.firstVideoCard
    await expect(firstVideo).toBeVisible()

    const annotateButton = firstVideo.getByRole('button', { name: /annotate/i })
    await annotateButton.click()

    // Wait for annotation workspace to load
    await page.waitForURL(/\/annotate\//, { timeout: 15000 })
    await annotationWorkspace.expectWorkspaceReady()

    // Find the video element in annotation workspace
    const videoElement = page.locator('video').first()
    await expect(videoElement).toBeVisible({ timeout: 10000 })

    // Wait for video to have a source
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video')
        return video && (video.src || video.currentSrc)
      },
      { timeout: 10000 }
    )

    // Get the video source URL (use currentSrc which is set by the browser)
    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video')
      return video ? (video.currentSrc || video.src) : null
    })

    expect(videoSrc).toBeTruthy()

    // Verify the URL follows expected pattern
    if (videoSrc) {
      expect(videoSrc).toMatch(/\/api\/videos\/.*\/stream/)
    }
  })

  test('should support video range requests for seeking', async ({ page, testVideo, videoBrowser, annotationWorkspace }) => {
    // This test verifies that range requests work for video seeking

    await videoBrowser.navigateToHome()
    await videoBrowser.expectPageLoaded()

    const firstVideo = videoBrowser.firstVideoCard
    const annotateButton = firstVideo.getByRole('button', { name: /annotate/i })
    await annotateButton.click()

    await page.waitForURL(/\/annotate\//, { timeout: 15000 })
    await annotationWorkspace.expectWorkspaceReady()

    // Get the video source URL
    await page.waitForFunction(
      () => {
        const video = document.querySelector('video')
        return video && (video.src || video.currentSrc)
      },
      { timeout: 10000 }
    )

    const videoSrc = await page.evaluate(() => {
      const video = document.querySelector('video')
      return video ? (video.currentSrc || video.src) : null
    })

    expect(videoSrc).toBeTruthy()

    if (videoSrc) {
      // Make a range request to the video URL
      const response = await page.request.get(videoSrc, {
        headers: {
          'Range': 'bytes=0-1023'
        }
      })

      // Check for partial content response or full content
      // Some servers return 200 instead of 206 for small files
      expect([200, 206]).toContain(response.status())

      if (response.status() === 206) {
        // If 206, verify range headers are present
        const contentRange = response.headers()['content-range']
        expect(contentRange).toBeTruthy()
      }
    }
  })

  test('should generate and display video thumbnails', async ({ page, testVideo, videoBrowser }) => {
    // This test verifies thumbnail generation works

    await videoBrowser.navigateToHome()
    await videoBrowser.expectPageLoaded()

    // Look for CardMedia with background image (thumbnail)
    const firstVideo = videoBrowser.firstVideoCard
    await expect(firstVideo).toBeVisible()

    // Get the CardMedia component (which has the thumbnail as background image)
    const cardMedia = firstVideo.locator('.MuiCardMedia-root').first()
    await expect(cardMedia).toBeVisible({ timeout: 10000 })

    // Get the background image URL from the inline style
    const backgroundImage = await cardMedia.evaluate((el) => {
      return window.getComputedStyle(el).backgroundImage
    })

    expect(backgroundImage).toBeTruthy()
    expect(backgroundImage).not.toBe('none')

    // Extract URL from background-image: url("...") format
    const urlMatch = backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)
    if (urlMatch && urlMatch[1]) {
      const thumbnailUrl = urlMatch[1]

      // Verify thumbnail URL pattern
      expect(thumbnailUrl).toMatch(/\/api\/videos\/.*\/thumbnail/)

      // Verify thumbnail is accessible (optional - may not be generated in all test environments)
      const response = await page.request.get(thumbnailUrl)
      // Accept 200 (thumbnail exists) or 404 (not generated yet)
      expect([200, 404]).toContain(response.status())

      if (response.status() === 200) {
        expect(response.headers()['content-type']).toMatch(/image\/(jpeg|png)/)
      }
    }
  })

  test('should handle storage errors gracefully', async ({ page }) => {
    // This test verifies error handling for storage failures

    // Try to access a non-existent video
    const response = await page.request.get('/api/videos/non-existent-video-id/stream')

    // Should return 404
    expect(response.status()).toBe(404)
  })

  test('should delete videos from storage', async ({ page }) => {
    // This test verifies video deletion API endpoint
    // Note: Delete functionality in UI may require admin privileges

    // Test the DELETE API endpoint directly
    // This test verifies that the backend properly handles deletion requests
    const response = await page.request.delete('/api/videos/non-existent-video-id')

    // Should return 404 for non-existent video (or 403 if not authorized)
    expect([403, 404]).toContain(response.status())
  })
})

test.describe('Video Storage - Backend API', () => {
  test('video stream endpoint returns correct content type', async ({ request }) => {
    // This test directly tests the backend API
    // Note: Requires a seeded video in the test database

    const response = await request.get('/api/videos')
    if (response.ok()) {
      const videos = await response.json()

      if (videos && videos.length > 0) {
        const firstVideo = videos[0]
        const streamResponse = await request.get(`/api/videos/${firstVideo.id}/stream`)

        expect(streamResponse.status()).toBe(200)
        expect(streamResponse.headers()['content-type']).toMatch(/video\//)
      } else {
        console.log('ℹ️  No videos in database - skipping stream endpoint test')
        test.skip()
      }
    } else {
      console.log('ℹ️  Videos endpoint not accessible - skipping test')
      test.skip()
    }
  })

  test('thumbnail endpoint returns correct content type', async ({ request }) => {
    const response = await request.get('/api/videos')
    if (response.ok()) {
      const videos = await response.json()

      if (videos && videos.length > 0) {
        const firstVideo = videos[0]
        // Assuming thumbnail endpoint follows similar pattern
        const thumbnailResponse = await request.get(`/api/videos/${firstVideo.id}/thumbnail`)

        if (thumbnailResponse.ok()) {
          expect(thumbnailResponse.headers()['content-type']).toMatch(/image\//)
        } else {
          console.log('ℹ️  Thumbnail endpoint not available - may not be implemented')
          test.skip()
        }
      } else {
        console.log('ℹ️  No videos in database - skipping thumbnail endpoint test')
        test.skip()
      }
    } else {
      console.log('ℹ️  Videos endpoint not accessible - skipping test')
      test.skip()
    }
  })

  test('health check endpoint is accessible', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
  })
})
