/**
 * waitForAnchor unit tests — covers the load-bearing failure modes:
 *
 *   - resolves to an HTMLElement when the anchor is present
 *   - returns null (never throws) when the 3 s ceiling expires
 *   - aborts cleanly when the caller's AbortSignal fires
 *   - finds an anchor that appears mid-flight without spinning past
 *     the ceiling
 *
 * The runtime guarantee these tests defend is the one the plan calls
 * out in §3 customization #3 and §9 risk 3: the resolver MUST NEVER
 * hang the UI. Returning null lets the step-card surface a Skip
 * affordance; throwing or spinning would strand the visitor.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { waitForAnchor } from './waitForAnchor'

describe('waitForAnchor', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('resolves to the element when the anchor is already in the DOM', async () => {
    const el = document.createElement('div')
    el.setAttribute('data-tour-id', 'test-anchor')
    document.body.appendChild(el)

    const found = await waitForAnchor('test-anchor')
    expect(found).toBe(el)
  })

  it('returns null when the anchor never appears (no throw)', async () => {
    // waitForAnchor's ceiling is 8 s (bumped from the original 3 s to
    // tolerate slow first-paints behind React.lazy + a slow /api round-
    // trip), so the timer needs to be advanced past it for the resolver
    // to settle on the no-anchor branch.
    vi.useFakeTimers()
    const promise = waitForAnchor('does-not-exist')
    await vi.advanceTimersByTimeAsync(8100)
    const result = await promise
    expect(result).toBeNull()
  }, 12000)

  it('resolves to the element when it appears mid-poll', async () => {
    vi.useFakeTimers()
    const promise = waitForAnchor('appears-late')
    await vi.advanceTimersByTimeAsync(200) // a few polls have run, no element yet
    const el = document.createElement('div')
    el.setAttribute('data-tour-id', 'appears-late')
    document.body.appendChild(el)
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise
    expect(result).toBe(el)
  })

  it('returns null promptly when AbortSignal fires before the element appears', async () => {
    vi.useFakeTimers()
    const ac = new AbortController()
    const promise = waitForAnchor('never-resolves', ac.signal)
    ac.abort()
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise
    expect(result).toBeNull()
  })

  it('escapes quotes and backslashes in anchor names so the CSS selector parses', async () => {
    // Anchor names should be kebab-case per the convention, but the
    // escape exists defensively. We can't easily put a quote in a
    // data-tour-id from real product code, but the function must not
    // throw on one if it ever gets through.
    const result = await waitForAnchor('weird"name')
    expect(result).toBeNull() // not found, but didn't throw on selector parse
  })
})
