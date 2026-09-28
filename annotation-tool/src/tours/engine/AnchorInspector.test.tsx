import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnchorInspector, useAnchorInspectorMode } from './AnchorInspector'
import { AnchorRegistryProvider, useTourAnchor } from './anchorRegistry'

function Anchored({ mounted }: { mounted: boolean }) {
  const ref = useTourAnchor('app-shell')
  return mounted ? <div ref={ref}>shell</div> : null
}

function flushFrame() {
  // The inspector measures on requestAnimationFrame; advance one tick so a
  // freshly registered anchor gets a badge.
  act(() => {
    vi.advanceTimersByTime(16)
  })
}

describe('AnchorInspector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 16) as unknown as number,
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle))
    useAnchorInspectorMode.setState({ enabled: false })
    // Anchors report a non-zero box so the inspector keeps them.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      width: 100,
      height: 40,
      top: 20,
      left: 10,
      right: 110,
      bottom: 60,
      toJSON: () => ({}),
    } as DOMRect)
  })

  afterEach(() => {
    // Unmount before restoring the rAF/cAF stubs so the inspector's effect
    // cleanup still finds the stubbed cancelAnimationFrame it scheduled with.
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useAnchorInspectorMode.setState({ enabled: false })
  })

  it('paints nothing while author mode is off', () => {
    render(
      <AnchorRegistryProvider>
        <Anchored mounted />
        <AnchorInspector />
      </AnchorRegistryProvider>,
    )
    flushFrame()
    expect(document.querySelector('[data-fovea-anchor-inspector]')).toBeNull()
  })

  it('badges each registered anchor with its id once author mode is on', () => {
    render(
      <AnchorRegistryProvider>
        <Anchored mounted />
        <AnchorInspector />
      </AnchorRegistryProvider>,
    )

    act(() => {
      useAnchorInspectorMode.getState().toggle()
    })
    flushFrame()

    const overlay = document.querySelector('[data-fovea-anchor-inspector]')
    expect(overlay).not.toBeNull()
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('app-shell')).toBeInTheDocument()
  })

  it('drops a badge when its anchor unmounts', () => {
    const { rerender } = render(
      <AnchorRegistryProvider>
        <Anchored mounted />
        <AnchorInspector />
      </AnchorRegistryProvider>,
    )
    act(() => {
      useAnchorInspectorMode.setState({ enabled: true })
    })
    flushFrame()
    expect(screen.queryByText('app-shell')).toBeInTheDocument()

    rerender(
      <AnchorRegistryProvider>
        <Anchored mounted={false} />
        <AnchorInspector />
      </AnchorRegistryProvider>,
    )
    flushFrame()
    expect(screen.queryByText('app-shell')).toBeNull()
  })

  it('renders the overlay non-interactively', () => {
    render(
      <AnchorRegistryProvider>
        <Anchored mounted />
        <AnchorInspector />
      </AnchorRegistryProvider>,
    )
    act(() => {
      useAnchorInspectorMode.setState({ enabled: true })
    })
    flushFrame()
    const overlay = document.querySelector('[data-fovea-anchor-inspector]') as HTMLElement
    expect(overlay.style.pointerEvents).toBe('none')
  })
})
