// Verify cross-tour state isolation. Launch Tour A, dirty the store
// directly via window eval, abandon, launch Tour B, then read the
// store: every slice must be back at initialState.
import { chromium } from '@playwright/test'
import { mkdirSync } from 'fs'

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5173'
const OUT = '/tmp/shots-isolation'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
p.on('console', (msg) => {
  const t = msg.text()
  if (t.includes('STORE') || msg.type() === 'error') console.log(`[browser:${msg.type()}] ${t}`)
})

await p.goto(BASE, { waitUntil: 'load', timeout: 30_000 })
await p.waitForTimeout(2000)

// Launch Tour A: ontology-authoring
await p.getByTestId('launch-ontology-authoring').click({ timeout: 10_000 })
await p.waitForTimeout(3000)

// Dirty the store directly so the leak scenario is reproducible
// regardless of where in the tour we are.
await p.evaluate(async () => {
  const mod = await import('/src/store/zustand/annotationUiStore.ts')
  const s = mod.useAnnotationUiStore.getState()
  s.setOntologyTabIndex(3)
  s.setAnnotationMode('event')
  s.setDrawingMode('relation')
  s.setSelectedTypeId('dirty-type')
  s.setSelectedPersonaId('dirty-persona')
  s.setOntologySelectedPersonaId('dirty-ont-persona')
  s.setTimelineExpanded(true)
  s.setShowDetectionCandidates(true)
  s.setLinkTarget('dirty-link', 'entity')
  console.log('STORE dirtied')
})

// Read state to confirm dirty
const dirty = await p.evaluate(async () => {
  const mod = await import('/src/store/zustand/annotationUiStore.ts')
  const s = mod.useAnnotationUiStore.getState()
  return {
    ontologyTabIndex: s.ontologyTabIndex,
    annotationMode: s.annotationMode,
    drawingMode: s.drawingMode,
    selectedTypeId: s.selectedTypeId,
    selectedPersonaId: s.selectedPersonaId,
    ontologySelectedPersonaId: s.ontologySelectedPersonaId,
    timelineExpanded: s.timelineExpanded,
    showDetectionCandidates: s.showDetectionCandidates,
    linkTargetId: s.linkTargetId,
    linkTargetType: s.linkTargetType,
  }
})
console.log('After dirty:', JSON.stringify(dirty))

// Abandon current tour (Skip)
const skip = await p.getByRole('button', { name: /^Skip$/ }).count()
if (skip > 0) await p.getByRole('button', { name: /^Skip$/ }).click()
await p.waitForTimeout(1500)
// If still in tour, navigate home
await p.goto(BASE, { waitUntil: 'load', timeout: 15_000 })
await p.waitForTimeout(1500)

// Launch Tour B: first-annotation. The TourProvider.launch should
// fire resetAllState() BEFORE the launch routes anywhere.
await p.getByTestId('launch-first-annotation').click({ timeout: 10_000 })
await p.waitForTimeout(3000)

const fresh = await p.evaluate(async () => {
  const mod = await import('/src/store/zustand/annotationUiStore.ts')
  const s = mod.useAnnotationUiStore.getState()
  return {
    ontologyTabIndex: s.ontologyTabIndex,
    annotationMode: s.annotationMode,
    drawingMode: s.drawingMode,
    selectedTypeId: s.selectedTypeId,
    selectedPersonaId: s.selectedPersonaId,
    ontologySelectedPersonaId: s.ontologySelectedPersonaId,
    timelineExpanded: s.timelineExpanded,
    showDetectionCandidates: s.showDetectionCandidates,
    linkTargetId: s.linkTargetId,
    linkTargetType: s.linkTargetType,
  }
})
console.log('After Tour B launch:', JSON.stringify(fresh))

// Expected fresh state per initialState
const expected = {
  ontologyTabIndex: 0,
  annotationMode: 'type',
  drawingMode: null,
  selectedTypeId: null,
  selectedPersonaId: null,
  ontologySelectedPersonaId: null,
  timelineExpanded: false,
  showDetectionCandidates: false,
  linkTargetId: null,
  linkTargetType: null,
}
let pass = true
for (const [k, v] of Object.entries(expected)) {
  if (fresh[k] !== v) {
    console.log(`  LEAK: ${k} = ${JSON.stringify(fresh[k])} (expected ${JSON.stringify(v)})`)
    pass = false
  }
}
await p.screenshot({ path: `${OUT}/tour-b-step-1.png`, fullPage: false })
console.log(pass ? 'PASS: all slices reset' : 'FAIL: state leaked between tours')
await ctx.close()
await browser.close()
process.exit(pass ? 0 : 1)
