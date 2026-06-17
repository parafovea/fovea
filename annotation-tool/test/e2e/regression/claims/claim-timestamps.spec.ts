/**
 * @file claim-timestamps.spec.ts
 * @description E2E coverage for claim video time spans (discontiguous), set by
 * scrubbing the video, displayed as chips/badges, and persisted across reloads.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { fillClaimEditor } from '../../utils/claim-editor.js'

const API = 'http://localhost:3001'

test.describe('Claim time spans', () => {
  /**
   * Drive the full scrub-capture flow through the UI: open the ClaimEditor,
   * start a scrub capture (which hides the dialog and reveals the player),
   * capture the span start and end from the capture banner, and confirm the
   * dialog returns with a time-span chip, which then persists after save.
   */
  test('captures a time span by scrubbing and persists it', async ({
    page,
    testVideo,
    testPersonaPersistent: testPersona,
    annotationWorkspace,
  }) => {
    const claimText = `Timed claim ${Date.now()}`

    await annotationWorkspace.navigateTo(testVideo.id)
    await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })

    // Open the summary dialog and select the per-worker persona.
    await page.getByRole('button', { name: /edit summary/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const personaSelect = dialog.getByLabel(/select persona/i)
    if (await personaSelect.isVisible()) {
      await personaSelect.click()
      await page
        .getByRole('option')
        .filter({ hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\(') })
        .first()
        .click()
      await page.waitForTimeout(500)
    }

    // Claims tab -> Add Manual Claim.
    await dialog.locator('[role="tab"]').filter({ hasText: 'Claims' }).click()
    const addClaimButton = dialog.getByRole('button', { name: /add manual claim/i }).first()
    await expect(addClaimButton).toBeEnabled({ timeout: 10000 })
    await addClaimButton.click()

    // Fill text + modality so the claim is valid/saveable, then begin scrub capture.
    const claimEditor = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(claimEditor).toBeVisible()
    await fillClaimEditor(claimEditor, { text: claimText })

    await claimEditor.getByTestId('claim-scrub-capture-button').click()

    // The claim + summary dialogs hide; the capture banner appears over the player.
    const banner = page.getByTestId('timestamp-capture-banner')
    await expect(banner).toBeVisible({ timeout: 10000 })

    // Capture the span start, then the span end.
    await banner.getByTestId('timestamp-capture-confirm').click()
    await expect(banner).toBeVisible() // now in the 'end' phase
    await banner.getByTestId('timestamp-capture-confirm').click()

    // The banner goes away and the claim editor returns with the new span chip.
    await expect(banner).toBeHidden({ timeout: 10000 })
    const reopenedEditor = page.getByRole('dialog', { name: /add manual claim/i })
    await expect(reopenedEditor).toBeVisible({ timeout: 10000 })
    await expect(reopenedEditor.getByTestId('claim-time-span-chip')).toHaveCount(1)

    // Save the claim, then confirm the time-span badge shows in the viewer.
    await reopenedEditor.getByRole('button', { name: /create|save/i }).click()
    await expect(reopenedEditor).toBeHidden({ timeout: 5000 })
    await expect(page.getByText(claimText)).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('claim-viewer-time-span').first()).toBeVisible({ timeout: 5000 })
  })

  /**
   * Seed a claim carrying two discontiguous time spans straight through the API,
   * then assert both render as read-only badges in the claims viewer and survive
   * a reload. This exercises the persistence + display path independently of the
   * scrub interaction.
   */
  test('renders seeded discontiguous time spans and persists them across reload', async ({
    page,
    testVideo,
    testPersona,
    workerSessionToken,
    annotationWorkspace,
  }) => {
    const cookie = `session_token=${workerSessionToken}`
    // Create a summary for (video, persona).
    const summaryRes = await fetch(`${API}/api/summaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        videoId: testVideo.id,
        personaId: testPersona.id,
        summary: [{ type: 'text', content: 'Seeded summary for time-span display' }],
      }),
    })
    expect(summaryRes.ok).toBe(true)
    const summary = await summaryRes.json()

    // Create a claim carrying two discontiguous time spans.
    const claimText = `Seeded timed claim ${Date.now()}`
    const claimRes = await fetch(`${API}/api/summaries/${summary.id}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        summaryType: 'video',
        text: claimText,
        audio: ['speech'],
        timeSpans: [
          { start: 1.5, end: 3.0, source: 'scrub' },
          { start: 10.0, end: 12.5, source: 'scrub' },
        ],
      }),
    })
    expect(claimRes.ok).toBe(true)

    const openClaims = async () => {
      await annotationWorkspace.navigateTo(testVideo.id)
      await page.waitForSelector('[data-testid="video-player"], video', { timeout: 10000 })
      await page.getByRole('button', { name: /edit summary/i }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      const personaSelect = dialog.getByLabel(/select persona/i)
      if (await personaSelect.isVisible()) {
        await personaSelect.click()
        await page
          .getByRole('option')
          .filter({ hasText: new RegExp('^' + testPersona.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\(') })
          .first()
          .click()
        await page.waitForTimeout(500)
      }
      await dialog.locator('[role="tab"]').filter({ hasText: 'Claims' }).click()
    }

    await openClaims()
    await expect(page.getByText(claimText)).toBeVisible({ timeout: 10000 })
    // Two discontiguous spans -> two read-only badges.
    await expect(page.getByTestId('claim-viewer-time-span')).toHaveCount(2)

    await page.reload()
    await openClaims()
    await expect(page.getByText(claimText)).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('claim-viewer-time-span')).toHaveCount(2)
  })
})
