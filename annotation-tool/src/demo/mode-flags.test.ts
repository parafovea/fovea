/**
 * mode-flags unit tests — exercises the boot-time URL/sessionStorage
 * flag-reading logic in isolation. We re-import the module after
 * mutating window.location.search so each test sees a fresh boot.
 */

import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => {
  sessionStorage.clear()
  // Restore a clean URL between tests so module re-imports see the
  // expected starting state.
  history.replaceState({}, '', '/')
})

async function importFresh() {
  // Vitest's import cache keys on file path; reset modules so each
  // test boot picks up the current window.location.search.
  const mod = await import(`./mode-flags?bust=${Math.random()}`)
  return mod as typeof import('./mode-flags')
}

describe('demo mode-flags', () => {
  it('returns false for both when neither flag is in the URL', async () => {
    const m = await importFresh()
    expect(m.isPresenterMode()).toBe(false)
    expect(m.isSafeMode()).toBe(false)
  })

  it('reads ?presenter=1 from the URL on first boot', async () => {
    history.replaceState({}, '', '/?presenter=1')
    const m = await importFresh()
    expect(m.isPresenterMode()).toBe(true)
    expect(m.isSafeMode()).toBe(false)
  })

  it('reads ?safe=1 independently of presenter', async () => {
    history.replaceState({}, '', '/?safe=1')
    const m = await importFresh()
    expect(m.isSafeMode()).toBe(true)
    expect(m.isPresenterMode()).toBe(false)
  })

  it('persists flags to sessionStorage so a soft nav preserves them', async () => {
    history.replaceState({}, '', '/?presenter=1&safe=1')
    await importFresh()
    expect(sessionStorage.getItem('fovea.demo.presenter')).toBe('1')
    expect(sessionStorage.getItem('fovea.demo.safe')).toBe('1')
  })

  it('honors sessionStorage even after the query string is gone', async () => {
    sessionStorage.setItem('fovea.demo.presenter', '1')
    history.replaceState({}, '', '/')
    const m = await importFresh()
    expect(m.isPresenterMode()).toBe(true)
  })
})
