import { test, expect } from '../fixtures/test-context.js'

/**
 * Regression tests for Video Browser search functionality.
 *
 * These tests verify the search/filter feature handles edge cases correctly,
 * particularly when video metadata fields are missing or undefined.
 */

test.describe('Video Browser Search', () => {
  test.describe('search with missing metadata', () => {
    test('does not crash when filtering videos with undefined title and description', async ({ page, testUser }) => {
      // Mock the /api/videos endpoint to return videos with minimal metadata
      await page.route('**/api/videos', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'video-minimal-1',
              filename: 'test_video_one.mp4',
              path: '/videos/test_video_one.mp4',
              duration: 300,
              width: 1920,
              height: 1080,
              // Intentionally omitting: title, description, uploader, tags
            },
            {
              id: 'video-minimal-2',
              filename: 'another_video.mp4',
              path: '/videos/another_video.mp4',
              duration: 450,
              width: 1920,
              height: 1080,
              // Intentionally omitting: title, description, uploader, tags
            },
          ])
        })
      })

      // Navigate to video browser
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Verify videos loaded
      await expect(page.getByText('2 videos')).toBeVisible({ timeout: 10000 })

      // Type in search box - this should NOT crash
      const searchInput = page.getByPlaceholder(/search videos/i)
      await expect(searchInput).toBeVisible()
      await searchInput.fill('test')

      // Wait for filter to apply
      await page.waitForTimeout(500)

      // Should filter to 1 video (matches 'test_video_one.mp4' filename)
      await expect(page.getByText('1 video')).toBeVisible()

      // No error should be visible
      await expect(page.getByText(/cannot read properties/i)).not.toBeVisible()
      await expect(page.getByText(/typeerror/i)).not.toBeVisible()
    })

    test('filters by filename when title is undefined', async ({ page, testUser }) => {
      await page.route('**/api/videos', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'video-1',
              filename: 'baseball_highlights_2024.mp4',
              path: '/videos/baseball_highlights_2024.mp4',
              duration: 300,
              width: 1920,
              height: 1080,
            },
            {
              id: 'video-2',
              filename: 'whale_migration_documentary.mp4',
              path: '/videos/whale_migration_documentary.mp4',
              duration: 450,
              width: 1920,
              height: 1080,
            },
            {
              id: 'video-3',
              filename: 'cooking_tutorial.mp4',
              path: '/videos/cooking_tutorial.mp4',
              duration: 600,
              width: 1920,
              height: 1080,
            },
          ])
        })
      })

      await page.goto('/')
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('3 videos')).toBeVisible({ timeout: 10000 })

      const searchInput = page.getByPlaceholder(/search videos/i)
      await searchInput.fill('whale')
      await page.waitForTimeout(500)

      // Should find the whale video by filename
      await expect(page.getByText('1 video')).toBeVisible()
    })

    test('handles mixed videos with and without metadata', async ({ page, testUser }) => {
      await page.route('**/api/videos', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              // Video with full metadata
              id: 'video-full',
              filename: 'full_metadata.mp4',
              path: '/videos/full_metadata.mp4',
              title: 'Complete Video',
              description: 'This video has all metadata fields',
              uploader: 'Test Uploader',
              tags: ['complete', 'metadata'],
              duration: 300,
              width: 1920,
              height: 1080,
            },
            {
              // Video with minimal metadata
              id: 'video-minimal',
              filename: 'minimal_metadata.mp4',
              path: '/videos/minimal_metadata.mp4',
              duration: 450,
              width: 1920,
              height: 1080,
            },
          ])
        })
      })

      await page.goto('/')
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('2 videos')).toBeVisible({ timeout: 10000 })

      // Search by title (only matches video with full metadata)
      const searchInput = page.getByPlaceholder(/search videos/i)
      await searchInput.fill('Complete')
      await page.waitForTimeout(500)
      await expect(page.getByText('1 video')).toBeVisible()

      // Clear and search by filename (matches minimal metadata video)
      await searchInput.fill('minimal_metadata')
      await page.waitForTimeout(500)
      await expect(page.getByText('1 video')).toBeVisible()

      // Clear and search by description
      await searchInput.fill('all metadata fields')
      await page.waitForTimeout(500)
      await expect(page.getByText('1 video')).toBeVisible()
    })
  })
})
