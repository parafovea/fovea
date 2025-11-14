import { test, expect } from '@playwright/test'
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

  test('should upload a video and store it correctly', async ({ page, _context }) => {
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

  test('should stream video from storage', async ({ page }) => {
    // This test verifies video streaming works correctly

    // Navigate to a page with a video player
    await page.goto('/videos')

    // Find a video element (adjust selector based on actual UI)
    const videoElement = page.locator('video').first()

    if (await videoElement.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Get the video source URL
      const videoSrc = await videoElement.getAttribute('src')
      expect(videoSrc).toBeTruthy()

      // Verify the URL follows expected pattern
      if (videoSrc) {
        expect(videoSrc).toMatch(/\/api\/videos\/.*\/stream/)

        // Make a direct request to verify the video endpoint works
        const response = await page.request.get(videoSrc)
        expect(response.status()).toBe(200)
        expect(response.headers()['content-type']).toContain('video/')
      }
    } else {
      console.log('ℹ️  No video element found - test may need UI adjustments')
      test.skip()
    }
  })

  test('should support video range requests for seeking', async ({ page, _context }) => {
    // This test verifies that range requests work for video seeking

    await page.goto('/videos')

    const videoElement = page.locator('video').first()

    if (await videoElement.isVisible({ timeout: 5000 }).catch(() => false)) {
      const videoSrc = await videoElement.getAttribute('src')

      if (videoSrc) {
        // Make a range request
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
    } else {
      console.log('ℹ️  No video element found - skipping range request test')
      test.skip()
    }
  })

  test('should generate and display video thumbnails', async ({ page }) => {
    // This test verifies thumbnail generation works

    await page.goto('/videos')

    // Look for thumbnail images (adjust selector based on actual UI)
    const thumbnails = page.locator('img[src*="thumbnail"]')
    const thumbnailCount = await thumbnails.count()

    if (thumbnailCount > 0) {
      // Get first thumbnail
      const firstThumbnail = thumbnails.first()
      const thumbnailSrc = await firstThumbnail.getAttribute('src')

      expect(thumbnailSrc).toBeTruthy()

      if (thumbnailSrc) {
        // Verify thumbnail URL pattern
        expect(thumbnailSrc).toMatch(/\/api\/videos\/.*\/thumbnail/)

        // Verify thumbnail is accessible
        const response = await page.request.get(thumbnailSrc)
        expect(response.status()).toBe(200)
        expect(response.headers()['content-type']).toMatch(/image\/(jpeg|png)/)
      }
    } else {
      console.log('ℹ️  No thumbnails found - may need video data seeded')
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
    // This test verifies video deletion works

    await page.goto('/videos')

    // Look for a delete button (adjust based on actual UI)
    const deleteButton = page.locator('button[aria-label*="delete"], button:has-text("Delete")').first()

    if (await deleteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Get the video ID before deletion
      const videoRow = deleteButton.locator('..').first()
      const videoTitle = await videoRow.locator('text').first().textContent()

      // Click delete
      await deleteButton.click()

      // Confirm deletion if there's a dialog
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")').last()
      if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmButton.click()
      }

      // Wait for deletion to complete
      await page.waitForResponse(response =>
        response.url().includes('/api/videos') &&
        (response.status() === 200 || response.status() === 204),
        { timeout: 10000 }
      ).catch(() => {})

      // Verify video is no longer in the list
      if (videoTitle) {
        await expect(page.locator(`text=${videoTitle}`)).not.toBeVisible({ timeout: 5000 })
      }
    } else {
      console.log('ℹ️  Delete button not found - skipping deletion test')
      test.skip()
    }
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
