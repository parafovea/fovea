import { chromium } from '@playwright/test'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5180'

// Tours that should fire the gloss-autocomplete popup at some step.
// Each entry: { tourId, label, expectedTriggerAt: substring of the step
// narration that means humanType is about to fire on a gloss field.
// The probe walks the tour, watches the StepCard's narration each step,
// and when it sees the trigger narration it waits up to 4s for the
// [data-tour-id="gloss-autocomplete-popup"] element to mount in the DOM.
// A passing tour must mount that popup at least once. }
const TOURS = [
  { tourId: 'ontology-authoring', triggerNarrationFragment: "Type '#' in the gloss field" },
  { tourId: 'wikidata-augmentation', triggerNarrationFragment: 'autocomplete' },
  { tourId: 'events-roles-claims', triggerNarrationFragment: 'Type # in any gloss field' },
]

const browser = await chromium.launch()
const results = []

for (const { tourId, triggerNarrationFragment } of TOURS) {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  let popupSeen = false
  let stepsWalked = 0
  let triggerStepSeen = false
  let triggerStepIndex = null
  const consoleWarnings = []
  p.on('console', (m) => {
    if (m.type() === 'warn' && m.text().includes('[tour]')) consoleWarnings.push(m.text())
  })

  try {
    await p.goto(BASE, { waitUntil: 'load', timeout: 30_000 })
    await p.getByTestId(`launch-${tourId}`).click({ timeout: 10_000 })
    let safety = 40
    while (safety-- > 0) {
      // Wait long enough for revealBy + waitForAnchor + simulateAction to play.
      // humanType is ~80ms/char and the trigger pause is 140ms, so a 12-char
      // typeText with one trigger ≈ 1.2s. Plus the spotlight settle 350ms.
      // Add a generous buffer for any redraws.
      await p.waitForTimeout(5000)
      const stepText = await p.locator('[data-fovea-tour-step-card]').textContent().catch(() => '')
      const cardText = stepText || ''
      stepsWalked += 1
      if (cardText.includes(triggerNarrationFragment)) {
        triggerStepSeen = true
        triggerStepIndex = stepsWalked
        // The 5s above already covers humanType. Now do a short
        // explicit poll for the popup so a slow popup mount doesn't
        // false-fail.
        for (let i = 0; i < 30; i++) {
          const count = await p
            .locator('[data-tour-id="gloss-autocomplete-popup"]')
            .count()
            .catch(() => 0)
          if (count > 0) {
            popupSeen = true
            break
          }
          await p.waitForTimeout(150)
        }
      }
      const finishBtn = await p.getByRole('button', { name: /^Finish$/ }).count()
      const nextBtn = await p.getByRole('button', { name: /^Next$/ }).count()
      const skipBtn = await p.getByRole('button', { name: /^Skip$/ }).count()
      if (finishBtn > 0) break
      if (nextBtn > 0) {
        await p.getByRole('button', { name: /^Next$/ }).click({ timeout: 3_000 }).catch(() => {})
      } else if (skipBtn > 0) {
        await p.getByRole('button', { name: /^Skip$/ }).click({ timeout: 3_000 }).catch(() => {})
      } else {
        break
      }
    }
    results.push({ tourId, triggerStepSeen, triggerStepIndex, popupSeen, stepsWalked, warnings: consoleWarnings.length })
    if (popupSeen) {
      console.log(`OK ${tourId}: popup mounted at step ${triggerStepIndex}`)
    } else if (triggerStepSeen) {
      console.error(`FAIL ${tourId}: trigger narration seen at step ${triggerStepIndex} but popup never mounted`)
    } else {
      console.error(`FAIL ${tourId}: trigger narration never seen across ${stepsWalked} steps`)
    }
  } catch (e) {
    console.error(`ERR ${tourId}:`, String(e).split('\n')[0])
    results.push({ tourId, error: String(e).split('\n')[0] })
  }
  await ctx.close()
}

await browser.close()
console.log('\n=== gloss summary ===')
console.log(results)
const popupHits = results.filter((r) => r.popupSeen).length
console.log(`Popup mounted in ${popupHits}/${TOURS.length} tours`)
process.exit(popupHits === TOURS.length ? 0 : 1)
