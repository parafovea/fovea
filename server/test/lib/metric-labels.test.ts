import { beforeEach, describe, expect, it } from 'vitest'

import {
  boundedLabel,
  clientRouteLabel,
  MAX_VALUES_PER_LABEL,
  OVERFLOW_LABEL,
  resetBoundedLabels,
  routeLabel,
  UNMATCHED_ROUTE,
} from '../../src/lib/metric-labels.js'

describe('metric labels', () => {
  beforeEach(() => resetBoundedLabels())

  it('labels a matched request with its route template', () => {
    expect(routeLabel({ routeOptions: { url: '/api/videos/:videoId' } })).toBe('/api/videos/:videoId')
  })

  it('labels an unmatched request as unmatched, never with its raw URL', () => {
    expect(routeLabel({ routeOptions: {} })).toBe(UNMATCHED_ROUTE)
    expect(routeLabel({})).toBe(UNMATCHED_ROUTE)
  })

  it('normalizes browser-reported paths: no query, ids collapsed', () => {
    expect(clientRouteLabel('/videos/4305b0e484618e40?t=12#x')).toBe('/videos/:id')
    expect(clientRouteLabel('/personas/3fa9c1d2-1111-4222-8333-444455556666/ontology')).toBe(
      '/personas/:id/ontology',
    )
    expect(clientRouteLabel('/annotate/42')).toBe('/annotate/:id')
    expect(clientRouteLabel(undefined)).toBe('unknown')
  })

  it('keeps the series count finite however many distinct values arrive', () => {
    const recorded = new Set<string>()
    for (let i = 0; i < MAX_VALUES_PER_LABEL * 5; i += 1) recorded.add(boundedLabel('route', `/probe/${i}.php`))
    expect(recorded.size).toBe(MAX_VALUES_PER_LABEL + 1)
    expect(recorded.has(OVERFLOW_LABEL)).toBe(true)
    expect(boundedLabel('route', '/probe/0.php')).toBe('/probe/0.php')
  })

  it('bounds each label independently and truncates long values', () => {
    for (let i = 0; i < MAX_VALUES_PER_LABEL; i += 1) boundedLabel('browser', `b${i}`)
    expect(boundedLabel('browser', 'one-more')).toBe(OVERFLOW_LABEL)
    expect(boundedLabel('component', 'still-admitted')).toBe('still-admitted')
    expect(boundedLabel('component', 'x'.repeat(500))).toHaveLength(100)
  })
})
