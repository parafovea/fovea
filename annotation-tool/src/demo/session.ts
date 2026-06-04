/**
 * Demo-mode anonymous-session hook.
 *
 * On first call, fetches a fresh anonymous session via
 * /api/demo/anonymous-session and stashes the userId in sessionStorage
 * so a reload doesn't strand the visitor in a half-loaded fixture.
 *
 * The session token itself comes back as an httpOnly cookie set by the
 * backend; only the userId is exposed to client JS (needed for fixture
 * seeding so the seeder knows which workspace to wipe).
 */

import { useEffect, useState } from 'react'
import { createAnonymousSession, type AnonymousSession } from './api'

const STORAGE_KEY = 'fovea.demo.session'

export function useDemoSession() {
  const [session, setSession] = useState<AnonymousSession | null>(() => readCached())
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (session) return
    let cancelled = false
    createAnonymousSession()
      .then((s) => {
        if (cancelled) return
        writeCached(s)
        setSession(s)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [session])

  return { session, error }
}

function readCached(): AnonymousSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AnonymousSession
  } catch {
    return null
  }
}

function writeCached(s: AnonymousSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // sessionStorage can throw in private mode — non-fatal.
  }
}
