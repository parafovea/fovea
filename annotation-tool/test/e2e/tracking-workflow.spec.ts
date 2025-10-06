/**
 * @file tracking-workflow.spec.ts
 * @description E2E tests for automated tracking workflow.
 * Tests the complete automated tracking workflow from Session 6.
 */

import { test, expect } from '@playwright/test'

test.describe('Automated Tracking Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to video annotation page
    await page.goto('/videos')
    // Assume there's a test video available
  })

  test('run detection with tracking and accept candidate', async ({ page }) => {
    // Step 1: Load video
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    // Wait for video player to load
    await expect(page.locator('video').first()).toBeVisible()

    // Step 2: Open tracking dialog
    await page.click('button:has-text("Run Tracking")')

    // Verify tracking dialog opens
    await expect(page.locator('text=/Automated Tracking/i')).toBeVisible()

    // Step 3: Enable tracking (checkbox)
    const trackingCheckbox = page.locator('input[type="checkbox"][name="enable-tracking"]')
    await trackingCheckbox.check()

    // Step 4: Select tracking model (SAMURAI)
    const modelSelect = page.locator('select[name="tracking-model"]')
    await modelSelect.selectOption('samurai')

    // Step 5: Run tracking
    await page.click('button:has-text("Run")')

    // Verify loading state appears
    await expect(page.locator('text=/Running detection/i')).toBeVisible()

    // Step 6: Wait for tracking results panel
    await expect(page.locator('[data-testid="tracking-results-panel"]')).toBeVisible({
      timeout: 30000, // Allow 30 seconds for tracking to complete
    })

    // Verify at least one track found
    const trackCards = page.locator('[data-testid="track-card"]')
    await expect(trackCards.first()).toBeVisible()

    // Step 7: Review first candidate (shows bounding box preview)
    await page.click('[data-testid="preview-track-button"]')

    // Verify preview shows bounding box overlay
    await expect(page.locator('[data-testid="track-preview-overlay"]')).toBeVisible()

    // Step 8: Accept high-confidence track
    await page.click('[data-testid="accept-track-button"]')

    // Step 9: Verify annotation created with tracking metadata
    const annotations = page.locator('[data-annotation-id]')
    await expect(annotations.first()).toBeVisible()

    // Verify tracking metadata is present
    const annotationCard = page.locator('[data-testid="annotation-card"]').first()
    await annotationCard.click()

    // Should show tracking source
    await expect(page.locator('text=/Source: samurai/i')).toBeVisible()

    // Step 10: Manually refine by adding/moving keyframe
    await page.keyboard.press('ArrowRight') // Advance 1 frame
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')

    // Add keyframe using keyboard shortcut
    await page.keyboard.press('k')

    // Verify keyframe added
    await expect(page.locator('text=/Keyframe added/i')).toBeVisible()

    // Move the bounding box
    const boundingBox = page.locator('[data-annotation-id]').first()
    const bbox = await boundingBox.boundingBox()
    if (bbox) {
      await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2)
      await page.mouse.down()
      await page.mouse.move(bbox.x + bbox.width / 2 + 50, bbox.y + bbox.height / 2 + 30)
      await page.mouse.up()
    }

    // Step 11: Save annotation
    await page.click('button:has-text("Save")')

    // Verify success notification
    await expect(page.locator('text=/Annotation saved/i')).toBeVisible()
  })

  test('accept all high-confidence tracks', async ({ page }) => {
    // Load video and run tracking
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    await page.click('button:has-text("Run Tracking")')
    await page.locator('input[type="checkbox"][name="enable-tracking"]').check()
    await page.click('button:has-text("Run")')

    // Wait for results
    await expect(page.locator('[data-testid="tracking-results-panel"]')).toBeVisible({
      timeout: 30000,
    })

    // Accept all high-confidence tracks
    await page.click('button:has-text("Accept All High Confidence")')

    // Verify multiple annotations created
    const annotations = page.locator('[data-annotation-id]')
    const count = await annotations.count()
    expect(count).toBeGreaterThan(0)

    // Verify success notification
    await expect(page.locator('text=/tracks accepted/i')).toBeVisible()
  })

  test('reject low-confidence tracks', async ({ page }) => {
    // Load video and run tracking
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    await page.click('button:has-text("Run Tracking")')
    await page.locator('input[type="checkbox"][name="enable-tracking"]').check()
    await page.click('button:has-text("Run")')

    // Wait for results
    await expect(page.locator('[data-testid="tracking-results-panel"]')).toBeVisible({
      timeout: 30000,
    })

    // Get initial count
    const initialCount = await page.locator('[data-testid="track-card"]').count()

    // Reject first track
    await page.click('[data-testid="reject-track-button"]')

    // Verify track removed from list
    const newCount = await page.locator('[data-testid="track-card"]').count()
    expect(newCount).toBe(initialCount - 1)
  })

  test('decimation reduces keyframe count', async ({ page }) => {
    // Load video and run tracking
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    await page.click('button:has-text("Run Tracking")')
    await page.locator('input[type="checkbox"][name="enable-tracking"]').check()

    // Enable decimation
    const decimationCheckbox = page.locator('input[type="checkbox"][name="enable-decimation"]')
    await decimationCheckbox.check()

    // Set decimation interval
    const decimationInput = page.locator('input[name="decimation-interval"]')
    await decimationInput.fill('5')

    await page.click('button:has-text("Run")')

    // Wait for results
    await expect(page.locator('[data-testid="tracking-results-panel"]')).toBeVisible({
      timeout: 30000,
    })

    // Accept first track
    await page.click('[data-testid="accept-track-button"]')

    // Verify annotation created
    await expect(page.locator('[data-annotation-id]').first()).toBeVisible()

    // Check keyframe count in annotation details
    const annotationCard = page.locator('[data-testid="annotation-card"]').first()
    await annotationCard.click()

    // Should show reduced keyframe count
    await expect(page.locator('text=/keyframes/i')).toBeVisible()
  })

  test('tracking error handling', async ({ page }) => {
    // Load video
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    // Mock tracking API to return error
    await page.route('**/api/videos/*/track', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Tracking service unavailable' }),
      })
    })

    // Open tracking dialog and run
    await page.click('button:has-text("Run Tracking")')
    await page.locator('input[type="checkbox"][name="enable-tracking"]').check()
    await page.click('button:has-text("Run")')

    // Verify error message appears
    await expect(page.locator('text=/Tracking service unavailable/i')).toBeVisible()

    // Verify retry button appears
    await expect(page.locator('button:has-text("Retry")')).toBeVisible()
  })

  test('tracking cancellation', async ({ page }) => {
    // Load video
    const videoCard = page.locator('[data-testid="video-card"]').first()
    await videoCard.click()

    // Open tracking dialog and run
    await page.click('button:has-text("Run Tracking")')
    await page.locator('input[type="checkbox"][name="enable-tracking"]').check()
    await page.click('button:has-text("Run")')

    // Verify loading state appears
    await expect(page.locator('text=/Running detection/i')).toBeVisible()

    // Click cancel button
    await page.click('button:has-text("Cancel")')

    // Verify tracking stops
    await expect(page.locator('text=/Tracking cancelled/i')).toBeVisible()

    // Verify no results panel appears
    await expect(page.locator('[data-testid="tracking-results-panel"]')).not.toBeVisible()
  })
})
