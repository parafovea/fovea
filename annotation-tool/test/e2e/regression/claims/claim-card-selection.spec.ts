/**
 * @file claim-card-selection.spec.ts
 * @description E2E coverage for clicking a claim card in the claims viewer.
 * Clicking a card selects it in place and must keep the user on the Claims
 * tab; it must not navigate back to the Summary tab.
 */

import { test, expect } from '../../fixtures/test-context.js'

const API = 'http://localhost:3001'

test.describe('Claim card selection', () => {
  /**
   * Seed a summary with a single leaf claim, open the Claims tab, click the
   * claim card, and assert the click selects the card and leaves the user on
   * the Claims tab rather than switching to the Summary tab.
   */
  test('clicking a claim card selects it and stays on the Claims tab', async ({
    page,
    testVideo,
    testPersona,
    workerSessionToken,
    annotationWorkspace,
  }) => {
    const cookie = `session_token=${workerSessionToken}`

    // Seed a summary for (video, persona) with source text the claim spans.
    const summaryRes = await fetch(`${API}/api/summaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        videoId: testVideo.id,
        personaId: testPersona.id,
        summary: [{ type: 'text', content: 'A red car drives through the intersection.' }],
      }),
    })
    expect(summaryRes.ok).toBe(true)
    const summary = await summaryRes.json()

    // Seed a single leaf claim (no subclaims), carrying source text spans so
    // the old behavior would have shown the Summary tab's highlight view.
    const claimText = `Card-select claim ${Date.now()}`
    const claimRes = await fetch(`${API}/api/summaries/${summary.id}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        summaryType: 'video',
        text: claimText,
        audio: ['speech'],
        textSpans: [{ charStart: 0, charEnd: 9 }],
      }),
    })
    expect(claimRes.ok).toBe(true)

    // Open the summary dialog, pick the persona, switch to the Claims tab.
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
    }

    const summaryTab = dialog.locator('[role="tab"]').filter({ hasText: 'Summary' })
    const claimsTab = dialog.locator('[role="tab"]').filter({ hasText: 'Claims' })
    await claimsTab.click()

    // Precondition: the claim card is shown, unselected, on the Claims tab.
    await expect(page.getByText(claimText)).toBeVisible({ timeout: 10000 })
    const card = dialog.getByTestId('claim-card')
    await expect(card).toHaveAttribute('data-selected', 'false')

    // Click the card body (the claim text, not an action button).
    await page.getByText(claimText).click()

    // The card is now selected, and we are still on the Claims tab — the
    // claims viewer stays visible, the Claims tab stays active, and the
    // Summary tab's highlight view never takes over.
    await expect(card).toHaveAttribute('data-selected', 'true')
    await expect(dialog.locator('[data-tour-anchor="claims-viewer"]')).toBeVisible()
    await expect(claimsTab).toHaveAttribute('aria-selected', 'true')
    await expect(summaryTab).toHaveAttribute('aria-selected', 'false')
    await expect(
      page.getByText(/showing highlighted text for selected claim/i)
    ).toBeHidden()
  })
})
