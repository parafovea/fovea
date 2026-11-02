/**
 * @file video-text-panel.spec.ts
 * @description E2E coverage for the "Associated Text" panel in the video
 * annotation workspace (`VideoTextPanel`), which mounts the same span annotator
 * over a video's projected text expressions (post text and/or ASR transcript).
 *
 * Seeding note: there is no direct "create video text expression" endpoint. A
 * video's text expressions are MATERIALIZED on read from two sources: the
 * video's `metadata` (post text) and a `VideoSummary.transcriptJson` (ASR
 * transcript). The transcript is the seedable path, so this spec writes a
 * summary with a `transcriptJson` (via `POST /api/summaries`), which makes the
 * `GET /api/layers/videos/:id/text-expressions` materializer project a
 * Transcript expression the panel can render and annotate.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { DocumentAnnotationPage } from '../../page-objects/DocumentAnnotationPage.js'

test.describe('Video associated-text panel', () => {
  test('renders the transcript tab and lets a token be selected in the embedded annotator', async ({
    page,
    db,
    annotationWorkspace,
    testVideo,
    testPersona,
    workerSessionToken,
  }) => {
    // Seed an ASR transcript so the materializer projects a Transcript text
    // expression for this video (one token per segment).
    await db.seedVideoTranscript(
      testVideo.id,
      testPersona.id,
      [
        { start: 0, end: 2, text: 'The convoy departed at dawn.' },
        { start: 2, end: 4, text: 'It reached the checkpoint by noon.' },
        { start: 4, end: 6, text: 'No incidents were reported.' },
      ],
      workerSessionToken,
    )

    await annotationWorkspace.navigateTo(testVideo.id)
    await annotationWorkspace.selectPersona(testPersona.name)

    // Open the "Associated Text" collapsible.
    const trigger = page.getByText('Associated Text', { exact: true })
    await expect(trigger).toBeVisible({ timeout: 10000 })
    await trigger.click()

    // The panel renders with the Transcript tab (materialized from the seed).
    const panel = page.locator('[data-testid="video-text-panel"]')
    await expect(panel).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-testid="video-text-tab-transcript"]')).toBeVisible({
      timeout: 10000,
    })

    // If the fixture video also carries metadata post text, exercise switching
    // to it and back; otherwise the transcript is the only tab. (Seeding post
    // text would require a set-video-metadata endpoint, which does not exist.)
    const postTextTab = page.locator('[data-testid="video-text-tab-post-text"]')
    if (await postTextTab.count()) {
      await postTextTab.click()
      await expect(page.locator('[data-testid="span-annotator"]').first()).toBeVisible()
      await page.locator('[data-testid="video-text-tab-transcript"]').click()
    }

    // The embedded span annotator is interactive: selecting a token opens the
    // label picker over the transcript text.
    const doc = new DocumentAnnotationPage(page)
    await expect(doc.annotator).toBeVisible({ timeout: 15000 })
    await doc.selectToken(0)
    await doc.expectPickerOpen()
  })
})
