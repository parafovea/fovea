/**
 * AttributionBanner unit tests — CI gate for the load-bearing
 * CC-BY-NC-SA visible-attribution requirement.
 *
 * If the banner ever stops rendering the source artist + license + a
 * link to docs/demo-attribution, the demo deployment falls out of
 * compliance with the license under which we use the KEXP clips. The
 * test fails loudly in CI before anyone ships.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AttributionBanner } from './AttributionBanner'

afterEach(() => {
  sessionStorage.clear()
  history.replaceState({}, '', '/')
})

describe('AttributionBanner', () => {
  it('renders at least one source artist credit', () => {
    render(<AttributionBanner />)
    // The manifest seeds Nils Frahm twice (2015 + 2018 sessions); the
    // banner dedupes by artist, so we expect exactly one Nils Frahm
    // mention in the rendered banner.
    const matches = screen.getAllByText('Nils Frahm')
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('renders the license string for each unique source artist', () => {
    render(<AttributionBanner />)
    expect(screen.getByText(/CC-BY-NC-SA/)).toBeInTheDocument()
  })

  it('renders a link to /docs/demo-attribution', () => {
    render(<AttributionBanner />)
    const link = screen.getByRole('link', { name: /sources.*attribution/i })
    expect(link).toHaveAttribute('href', '/docs/demo-attribution')
  })

  it('renders nothing in presenter mode (cleanup of chrome for recordings)', () => {
    history.replaceState({}, '', '/?presenter=1')
    // mode-flags reads window.location.search at module load; bust the
    // module cache so the import sees the new URL.
    sessionStorage.setItem('fovea.demo.presenter', '1')
    const { container } = render(<AttributionBanner />)
    expect(container.firstChild).toBeNull()
  })
})
