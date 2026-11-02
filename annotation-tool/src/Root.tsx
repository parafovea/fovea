import React from 'react'
import App from './App'
import { DemoShell } from './demo/DemoShell'
import { isDemoModeEnabled } from './demo/config'
import { TourProvider } from './tours'
import { loadTourContentBundle } from './tours/content/loader'
import type { TourContentBundle } from './tours/content/types'

/** Loads deployment tour content and renders the selected application shell. */
export function Root(): React.ReactElement {
  type LoadState =
    | { kind: 'loading' }
    | { kind: 'ready'; bundle: TourContentBundle }
    | { kind: 'error'; message: string }
  const [state, setState] = React.useState<LoadState>({ kind: 'loading' })
  React.useEffect(() => {
    loadTourContentBundle()
      .then((bundle) => setState({ kind: 'ready', bundle }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[tours] content bundle load failed:', message)
        setState({ kind: 'error', message })
      })
  }, [])

  if (isDemoModeEnabled()) return <DemoShell />

  // Always wrap <App /> in <TourProvider>: the demo-public catalogue
  // (TourCataloguePage at /) calls useTour() to launch tours, and
  // dropping the provider in the loading or error branch made the
  // hook throw "useTour must be used inside <TourProvider>" the moment
  // a VITE_DEMO_PUBLIC=1 visitor hit /. TourProvider defaults
  // contentBundle to microventContent when none is supplied, so the
  // provider is happy with no real bundle while we wait for the
  // boot-time fetch; once the fetch resolves we swap in the real
  // bundle and TourProvider re-derives the catalogue.
  const bundle = state.kind === 'ready' ? state.bundle : undefined
  const errorBanner =
    state.kind === 'error' ? (
      <div
        role="alert"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: '#b91c1c',
          color: 'white',
          padding: '12px 16px',
          zIndex: 9999,
          fontSize: 13,
        }}
      >
        <strong>Tours disabled: content config error.</strong>{' '}
        {state.message} See <code>docs/tour-customization.md</code>.
      </div>
    ) : null
  return (
    <TourProvider contentBundle={bundle}>
      {errorBanner}
      <App />
    </TourProvider>
  )
}
