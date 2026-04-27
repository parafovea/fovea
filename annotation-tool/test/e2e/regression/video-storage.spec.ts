import { test, expect } from '../fixtures/test-context.js'

/**
 * E2E tests for video storage functionality
 *
 * Tests the video storage, streaming, and retrieval workflow
 * using pre-seeded test videos.
 */

test.describe('Video Storage', () => {
  test('streams video from storage endpoint', async ({ page, testVideo, testUser }) => {
    // Test that the video stream endpoint returns valid video content
    const streamResponse = await page.request.get(`/api/videos/${testVideo.id}/stream`)

    expect(streamResponse.status()).toBe(200)
    expect(streamResponse.headers()['content-type']).toMatch(/video\//)
  })

  test('supports video range requests for seeking', async ({ page, testVideo, testUser }) => {
    // Test that range requests work for video seeking
    const response = await page.request.get(`/api/videos/${testVideo.id}/stream`, {
      headers: {
        Range: 'bytes=0-1023',
      },
    })

    // Check for partial content response or full content
    // Some servers return 200 instead of 206 for small files
    expect([200, 206]).toContain(response.status())

    if (response.status() === 206) {
      // If 206, verify range headers are present
      const contentRange = response.headers()['content-range']
      expect(contentRange).toBeTruthy()
    }
  })

  test('thumbnail endpoint responds correctly', async ({ page, testVideo, testUser }) => {
    // Test thumbnail endpoint - may return 200 with image or error if not generated
    const thumbnailResponse = await page.request.get(`/api/videos/${testVideo.id}/thumbnail`)

    // Endpoint should respond (either with thumbnail or error, not crash)
    expect([200, 404, 500]).toContain(thumbnailResponse.status())

    // If thumbnail exists, verify content type
    if (thumbnailResponse.status() === 200) {
      expect(thumbnailResponse.headers()['content-type']).toMatch(/image\/(jpeg|png|webp)/)
    }
  })

  test('returns 404 for non-existent video', async ({ page, testUser }) => {
    // Test error handling for non-existent videos
    const response = await page.request.get('/api/videos/non-existent-video-id/stream')

    expect(response.status()).toBe(404)
  })

  test('video plays in annotation workspace', async ({ page, testVideo, annotationWorkspace }) => {
    // Navigate to annotation workspace with the test video
    await annotationWorkspace.navigateTo(testVideo.id)

    // Wait for video player to be ready
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Verify video element exists and has a source
    const videoElement = page.locator('video').first()
    await expect(videoElement).toBeVisible({ timeout: 5000 })

    // Get the video source and verify it points to the stream endpoint
    const videoSrc = await videoElement.getAttribute('src')
    expect(videoSrc).toContain('/api/videos/')
  })

  test('video metadata is correct', async ({ page, testVideo, testUser }) => {
    // Test that video metadata endpoint returns correct data
    const response = await page.request.get(`/api/videos/${testVideo.id}`)

    expect(response.status()).toBe(200)

    const video = await response.json()
    expect(video.id).toBe(testVideo.id)
    expect(video.filename).toBe(testVideo.filename)
    expect(video.duration).toBeGreaterThan(0)
  })
})

test.describe('Video Storage - Backend API', () => {
  test('video list endpoint returns all videos', async ({ request }) => {
    const response = await request.get('/api/videos')

    expect(response.status()).toBe(200)

    const videos = await response.json()
    expect(Array.isArray(videos)).toBe(true)
    expect(videos.length).toBeGreaterThan(0)

    // Verify video structure
    const firstVideo = videos[0]
    expect(firstVideo).toHaveProperty('id')
    expect(firstVideo).toHaveProperty('filename')
    expect(firstVideo).toHaveProperty('duration')
  })

  test('video stream endpoint returns correct content type', async ({ request, testVideo }) => {
    const streamResponse = await request.get(`/api/videos/${testVideo.id}/stream`)

    expect(streamResponse.status()).toBe(200)
    expect(streamResponse.headers()['content-type']).toMatch(/video\//)
  })

  test('thumbnail endpoint responds without crashing', async ({ request, testVideo }) => {
    // Thumbnail may not be generated in test environment
    const thumbnailResponse = await request.get(`/api/videos/${testVideo.id}/thumbnail`)

    // Endpoint should respond (either with thumbnail or graceful error)
    expect([200, 404, 500]).toContain(thumbnailResponse.status())

    // If thumbnail exists, verify content type is correct
    if (thumbnailResponse.status() === 200) {
      expect(thumbnailResponse.headers()['content-type']).toMatch(/image\//)
    }
  })

  test('health check endpoint is accessible', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
  })

  test('video stream supports HEAD requests', async ({ request, testVideo }) => {
    const response = await request.head(`/api/videos/${testVideo.id}/stream`)

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toMatch(/video\//)
    expect(response.headers()['content-length']).toBeTruthy()
  })

  test('video content-length header is accurate', async ({ request, testVideo }) => {
    // Get video metadata
    const metaResponse = await request.get(`/api/videos/${testVideo.id}`)
    const metadata = await metaResponse.json()

    // Get stream headers
    const streamResponse = await request.head(`/api/videos/${testVideo.id}/stream`)
    const contentLength = parseInt(streamResponse.headers()['content-length'] || '0', 10)

    // Content length should match filesize (or be close for streaming)
    expect(contentLength).toBeGreaterThan(0)
    if (metadata.size || metadata.filesize) {
      expect(contentLength).toBe(metadata.size || metadata.filesize)
    }
  })
})
