import { chromium } from '@playwright/test'

const BASE = process.env.PROBE_BASE ?? 'http://localhost:5180'
const TOURS = [
  'welcome',
  'first-annotation',
  'ontology-authoring',
  'wikidata-augmentation',
  'events-roles-claims',
  'world-layer',
  'model-in-the-loop',
  'summaries-and-claims',
  'collaboration',
  'admin',
  'import-export',
  'keyframes-interpolation',
]

const browser = await chromium.launch()
const results = []

for (const tourId of TOURS) {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  const warnings = []
  p.on('console', (m) => {
    if (m.type() === 'warn' && m.text().includes('[tour]')) warnings.push(m.text())
  })
  try {
    await p.goto(BASE, { waitUntil: 'load', timeout: 30_000 })
    await p.getByTestId(`launch-${tourId}`).click({ timeout: 10_000 })
    const steps = []
    // Walk forward until Finish appears, capturing per-step missing-anchor banner
    let safety = 30
    while (safety-- > 0) {
      // waitForAnchor's ceiling is 6s; the banner is rendered when
      // the resolver returns null. Wait 8s so the banner has had
      // time to mount AND any revealBy chain has had time to walk
      // AND any network-bound mount (lazy chunk + /api round-trip)
      // has settled before we observe. The probe MUST exceed the
      // engine's ceiling — a probe that fires before the banner
      // would report 0 banners on a tour that strands every
      // visitor on a missing-anchor error.
      await p.waitForTimeout(10000)
      const banner = await p
        .getByText(/Couldn't find this UI element/i)
        .count()
        .catch(() => 0)
      const stepText = await p.locator('[data-fovea-tour-step-card]').textContent().catch(() => '')
      const finishBtn = await p.getByRole('button', { name: /^Finish$/ }).count()
      const nextBtn = await p.getByRole('button', { name: /^Next$/ }).count()
      const skipBtn = await p.getByRole('button', { name: /^Skip$/ }).count()
      steps.push({ banner: banner > 0, snippet: (stepText || '').slice(0, 100) })
      if (finishBtn > 0) break
      // Skip means the engine showed the banner — record the step
      // and advance through Skip so we still walk the whole tour.
      if (nextBtn > 0) {
        await p.getByRole('button', { name: /^Next$/ }).click({ timeout: 3_000 }).catch(() => {})
      } else if (skipBtn > 0) {
        await p.getByRole('button', { name: /^Skip$/ }).click({ timeout: 3_000 }).catch(() => {})
      } else {
        break
      }
    }
    const banners = steps.filter((s) => s.banner).length
    results.push({ tourId, total: steps.length, banners, warnings: warnings.length })
    if (banners > 0) {
      console.log(`>> ${tourId}: ${banners}/${steps.length} banner steps`)
      steps.forEach((s, i) => { if (s.banner) console.error(`   FAIL ${tourId} step ${i+1}: ${s.snippet}`) })
    } else {
      console.log(`OK ${tourId}: ${steps.length} steps clean`)
    }
  } catch (e) {
    console.log(`ERR ${tourId}:`, String(e).split('\n')[0])
    results.push({ tourId, error: String(e).split('\n')[0] })
  }
  await ctx.close()
}

await browser.close()
console.log('\n=== summary ===')
console.log(results)
const totalBanners = results.reduce((a, r) => a + (r.banners || 0), 0)
console.log(`TOTAL banners: ${totalBanners}`)
process.exit(totalBanners > 0 ? 1 : 0)
