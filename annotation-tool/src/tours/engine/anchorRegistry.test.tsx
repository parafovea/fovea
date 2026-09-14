import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { AnchorRegistry, AnchorRegistryProvider, useAnchorElement, useTourAnchor } from './anchorRegistry'

describe('AnchorRegistry', () => {
  it('registers, reads, and unregisters with change notifications', () => {
    const registry = new AnchorRegistry()
    const changed: string[] = []
    const unsubscribe = registry.subscribe((id) => changed.push(id))
    const element = document.createElement('div')

    registry.register('app-shell', element)
    expect(registry.get('app-shell')).toBe(element)
    expect(registry.snapshot().get('app-shell')).toBe(element)

    registry.unregister('app-shell')
    expect(registry.get('app-shell')).toBeNull()
    expect(changed).toEqual(['app-shell', 'app-shell'])

    unsubscribe()
    registry.register('app-shell', element)
    expect(changed).toHaveLength(2)
  })
})

function Probe() {
  const element = useAnchorElement('app-shell')
  return <span data-testid="probe">{element ? 'present' : 'absent'}</span>
}

function Anchored({ mounted }: { mounted: boolean }) {
  const ref = useTourAnchor('app-shell')
  return mounted ? <div ref={ref}>anchored</div> : null
}

describe('useTourAnchor + useAnchorElement', () => {
  it('reflects an anchor mounting and unmounting', () => {
    const { rerender } = render(
      <AnchorRegistryProvider>
        <Anchored mounted />
        <Probe />
      </AnchorRegistryProvider>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('present')

    rerender(
      <AnchorRegistryProvider>
        <Anchored mounted={false} />
        <Probe />
      </AnchorRegistryProvider>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('absent')
  })
})
