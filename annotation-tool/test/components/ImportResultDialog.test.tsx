import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../utils/test-utils'
import { ImportResultDialog, shouldShowOrphanSkippedBanner } from '@components/data-management/ImportResultDialog'
import type { ImportResult } from '@models/types'

/**
 * The dialog must render the orphan-skipped banner in production. We verify
 * both the predicate (cheap, runs in isolation) and the actual rendered
 * tree using the project's `renderWithProviders` helper, which wraps the
 * MUI ThemeProvider that the Dialog depends on for context. Without those
 * providers `render` from @testing-library/react fails under jsdom + pnpm
 * with a misleading "Cannot read properties of null (reading 'useContext')"
 * error.
 */
describe('ImportResultDialog', () => {
  function makeResult(overrides: Partial<ImportResult> = {}): ImportResult {
    const base: ImportResult = {
      success: true,
      summary: {
        totalLines: 0,
        processedLines: 0,
        importedItems: {
          personas: 0, ontologies: 0, entities: 0, events: 0, times: 0,
          entityCollections: 0, eventCollections: 0, timeCollections: 0,
          relations: 0, annotations: 0, totalKeyframes: 0,
          totalInterpolatedFrames: 0, singleKeyframeSequences: 0,
        },
        skippedItems: {
          personas: 0, worldObjects: 0, annotations: 0, sequenceAnnotations: 0,
        },
      },
      warnings: [],
      errors: [],
      conflicts: [],
    }
    return { ...base, ...overrides, summary: { ...base.summary, ...(overrides.summary ?? {}) } }
  }

  describe('shouldShowOrphanSkippedBanner predicate', () => {
    it('true when annotations were skipped AND a missing-dependency conflict was recorded', () => {
      const result = makeResult({
        summary: {
          totalLines: 1, processedLines: 0,
          importedItems: { personas: 0, ontologies: 0, entities: 0, events: 0, times: 0, entityCollections: 0, eventCollections: 0, timeCollections: 0, relations: 0, annotations: 0, totalKeyframes: 0, totalInterpolatedFrames: 0, singleKeyframeSequences: 0 },
          skippedItems: { personas: 0, worldObjects: 0, annotations: 1, sequenceAnnotations: 0 },
        },
        conflicts: [{
          type: 'missing-dependency',
          line: 1,
          originalId: '00000000-0000-0000-0000-0000000000dd',
          details: 'Entity 99999999-... does not exist',
          resolution: 'skip-item',
        }],
      })
      expect(shouldShowOrphanSkippedBanner(result)).toBe(true)
    })

    it('false when nothing was skipped', () => {
      expect(shouldShowOrphanSkippedBanner(makeResult())).toBe(false)
    })

    it('false when annotations skipped but cause is duplicate (deliberate user choice)', () => {
      const result = makeResult({
        summary: {
          totalLines: 1, processedLines: 0,
          importedItems: { personas: 0, ontologies: 0, entities: 0, events: 0, times: 0, entityCollections: 0, eventCollections: 0, timeCollections: 0, relations: 0, annotations: 0, totalKeyframes: 0, totalInterpolatedFrames: 0, singleKeyframeSequences: 0 },
          skippedItems: { personas: 0, worldObjects: 0, annotations: 1, sequenceAnnotations: 0 },
        },
        conflicts: [{
          type: 'duplicate-annotation',
          line: 1,
          originalId: 'same-as-existing',
          details: 'Annotation already exists',
          resolution: 'skip-item',
        }],
      })
      expect(shouldShowOrphanSkippedBanner(result)).toBe(false)
    })

    it('false when missing-dependency conflict resolved via remap (not skip)', () => {
      const result = makeResult({
        conflicts: [{
          type: 'missing-dependency',
          line: 1,
          originalId: 'x',
          details: 'resolved via remap',
          resolution: 'create-new',
        }],
      })
      expect(shouldShowOrphanSkippedBanner(result)).toBe(false)
    })
  })

  /**
   * Rendered-output tests are intentionally skipped: every Dialog-rendering
   * test in this repo (including pre-existing ones in
   * test/integration/persona-deletion.test.tsx and
   * test/components/browsers/PersonaBrowser.test.tsx — 23+ tests total)
   * fails in jsdom + pnpm with "Cannot read properties of null (reading
   * 'useContext')" because vitest resolves React from two different paths
   * (the project's `.pnpm/react@18.3.1/...` and the workspace root's
   * `node_modules/react`). MUI's ThemeProvider then loads against one
   * React copy while ReactDOM renders against the other, and every hook
   * crashes. The production Vite bundler dedupes correctly (the build
   * succeeds and the bundle has a single React), so this is a test-infra
   * limitation, not a runtime bug. Visual placement of the banner is
   * verified by the Playwright spec
   * `test/e2e/regression/export-import/orphan-skipped-banner.spec.ts`,
   * which exercises the dialog in a real Chromium against the running
   * stack.
   */
  describe('rendered output', () => {
    it('shows the orphan-skipped banner', () => {
      const result = makeResult({
        summary: {
          totalLines: 3, processedLines: 0,
          importedItems: { personas: 0, ontologies: 0, entities: 0, events: 0, times: 0, entityCollections: 0, eventCollections: 0, timeCollections: 0, relations: 0, annotations: 0, totalKeyframes: 0, totalInterpolatedFrames: 0, singleKeyframeSequences: 0 },
          skippedItems: { personas: 0, worldObjects: 0, annotations: 3, sequenceAnnotations: 0 },
        },
        conflicts: [{ type: 'missing-dependency', line: 1, originalId: 'a-1', details: 'Entity 99999999-... does not exist', resolution: 'skip-item' }],
      })
      renderWithProviders(<ImportResultDialog open={true} result={result} onClose={vi.fn()} />)
      expect(screen.getByTestId('import-orphan-skipped-banner')).toBeInTheDocument()
    })
  })
})
