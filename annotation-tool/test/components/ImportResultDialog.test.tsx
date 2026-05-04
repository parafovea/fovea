import { describe, it, expect } from 'vitest'
import { shouldShowOrphanSkippedBanner } from '@components/data-management/ImportResultDialog'
import type { ImportResult } from '@models/types'

/**
 * Unit tests for the orphan-skipped-banner predicate. Rendering the full
 * MUI Dialog under jsdom + pnpm hits a React-context resolution issue
 * (multiple React copies via the strict node_modules layout), so we test
 * the predicate directly. Visual placement of the banner remains a manual
 * QA item, but the *condition* under which it shows — and the cases under
 * which it must NOT show — is locked down here.
 *
 * Specifically, this guards against a regression to the issue-#121-class
 * UX cliff: a user importing an export whose referenced world objects are
 * absent saw `success: true` with zero annotations and no banner.
 */
describe('shouldShowOrphanSkippedBanner', () => {
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

  it('returns true when annotations were skipped AND a missing-dependency conflict was recorded', () => {
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

  it('returns false when nothing was skipped', () => {
    expect(shouldShowOrphanSkippedBanner(makeResult())).toBe(false)
  })

  it('returns false when annotations were skipped for a non-missing-dependency reason (e.g. duplicate)', () => {
    // Duplicate-resolved-as-skip is a deliberate user choice from the
    // import preview. The banner targets the silent-data-loss UX cliff
    // specifically, not every skip case.
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

  it('returns false when missing-dependency conflict exists but no annotations were dropped', () => {
    // E.g., the dependency was satisfied via remap. The skip count is the
    // primary signal — the conflict alone is not enough.
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
