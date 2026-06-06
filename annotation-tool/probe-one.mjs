// Probe a single tour. Usage: PROBE_TOUR=ontology-authoring node probe-one.mjs
// Walks the tour, records anchor-mount status + banner per step. Faster
// than probe-tours.mjs (one browser, one tour) so debug loops are tight.
import { chromium } from '@playwright/test'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5180'
const TOUR = process.env.PROBE_TOUR ?? 'first-annotation'
const WAIT_MS = parseInt(process.env.PROBE_WAIT_MS ?? '10000', 10)

const browser = await chromium.launch({ headless: process.env.HEADED !== '1' })
const ctx = await browser.newContext()
const p = await ctx.newPage()
const warnings = []
p.on('console', (m) => {
  if (m.text().includes('[tour]')) warnings.push(`${m.type()}: ${m.text()}`)
})
try {
  await p.goto(BASE, { waitUntil: 'load', timeout: 30_000 })
  await p.getByTestId(`launch-${TOUR}`).click({ timeout: 10_000 })
  const steps = []
  let safety = 40
  while (safety-- > 0) {
    await p.waitForTimeout(WAIT_MS)
    const banner = await p
      .getByText(/Couldn't find this UI element/i)
      .count()
      .catch(() => 0)
    const stepText =
      (await p.locator('[data-fovea-tour-step-card]').textContent().catch(() => '')) ?? ''
    const popupCount = await p.locator('[data-tour-id="gloss-autocomplete-popup"]').count().catch(() => 0)
    const stepIdx = steps.length + 1
    steps.push({
      step: stepIdx,
      banner: banner > 0,
      popup: popupCount > 0,
      snippet: stepText.slice(0, 140),
    })
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
  console.log(`Tour: ${TOUR}, wait=${WAIT_MS}ms, total=${steps.length} steps`)
  steps.forEach((s) => {
    const flag = s.banner ? 'BANNER' : 'ok'
    const popup = s.popup ? ' [popup]' : ''
    console.log(`  step ${s.step}: [${flag}]${popup} ${s.snippet}`)
  })
  const banners = steps.filter((s) => s.banner).length
  console.log(`\nbanners=${banners}, popup_mounts=${steps.filter((s) => s.popup).length}, warnings=${warnings.length}`)
  if (warnings.length > 0) {
    console.log('\nWarnings:')
    warnings.slice(0, 30).forEach((w) => console.log('  ' + w))
  }
  process.exit(banners > 0 ? 1 : 0)
} finally {
  await ctx.close()
  await browser.close()
}
