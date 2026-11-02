import { act, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AnchorRegistry, AnchorRegistryContext } from './anchorRegistry'
import { TourRunner } from './TourRunner'
import type { Tour } from './tourSchema'

vi.mock('./SpotlightOverlay', () => ({ SpotlightOverlay: () => null }))
vi.mock('./StepCard', () => ({ StepCard: () => null }))

const tour: Tour = {
  id: 'delayed-import', title: 'Import', description: 'Import after navigation',
  durationMinutes: 1, tags: [],
  steps: [{ anchor: 'import-dialog', route: '/app', narration: 'Import data', expectAction: 'none' }],
}

function renderRunner(registry: AnchorRegistry, onEvent = vi.fn()) {
  return render(
    <MemoryRouter>
      <AnchorRegistryContext.Provider value={registry}>
        <TourRunner tour={tour} onEvent={onEvent} onClose={vi.fn()} />
      </AnchorRegistryContext.Provider>
    </MemoryRouter>,
  )
}

describe('Tour navigation openers', () => {
  it('opens the dialog when its trigger mounts after navigation begins', async () => {
    const registry = new AnchorRegistry()
    const onEvent = vi.fn()
    renderRunner(registry, onEvent)
    const trigger = document.createElement('button')
    trigger.onclick = () => registry.register('import-dialog', document.createElement('div'))
    act(() => registry.register('import-trigger', trigger))
    await waitFor(() => expect(onEvent).toHaveBeenCalledWith({
      type: 'anchor_resolved', anchorId: 'import-dialog',
    }))
  })

  it('does not click a delayed trigger after the tour unmounts', async () => {
    const registry = new AnchorRegistry()
    const view = renderRunner(registry)
    view.unmount()
    const trigger = document.createElement('button')
    const click = vi.spyOn(trigger, 'click')
    await act(async () => registry.register('import-trigger', trigger))
    expect(click).not.toHaveBeenCalled()
  })
})

/** An element whose layout box has the given size, since jsdom lays out nothing. */
function sizedElement(width: number, height: number): HTMLElement {
  const element = document.createElement('div')
  element.getClientRects = () => [new DOMRect(0, 0, width, height)] as unknown as DOMRectList
  element.getBoundingClientRect = () => new DOMRect(0, 0, width, height)
  return element
}

const timelineTour: Tour = {
  id: 'timeline', title: 'Timeline', description: 'Spotlight the timeline',
  durationMinutes: 1, tags: [],
  steps: [{ anchor: 'timeline-panel', narration: 'The timeline', expectAction: 'none' }],
}

function renderTimelineRunner(registry: AnchorRegistry) {
  return render(
    <MemoryRouter>
      <AnchorRegistryContext.Provider value={registry}>
        <TourRunner tour={timelineTour} onClose={vi.fn()} />
      </AnchorRegistryContext.Provider>
    </MemoryRouter>,
  )
}

describe('Collapsed anchors', () => {
  it('clicks the opener when the anchor is registered but collapsed to zero height', async () => {
    const registry = new AnchorRegistry()
    registry.register('timeline-panel', sizedElement(716, 0))
    const opener = document.createElement('button')
    const click = vi.spyOn(opener, 'click')
    registry.register('show-timeline-button', opener)
    renderTimelineRunner(registry)
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
  })

  it('leaves an already expanded anchor alone', async () => {
    const registry = new AnchorRegistry()
    registry.register('timeline-panel', sizedElement(716, 240))
    const opener = document.createElement('button')
    const click = vi.spyOn(opener, 'click')
    registry.register('show-timeline-button', opener)
    renderTimelineRunner(registry)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
    expect(click).not.toHaveBeenCalled()
  })
})
