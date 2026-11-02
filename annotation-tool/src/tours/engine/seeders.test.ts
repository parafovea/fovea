import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnchorRegistry } from './anchorRegistry'
import { getCapability } from './capabilities'
import './seeders'

describe('tour driver cancellation', () => {
  afterEach(() => vi.restoreAllMocks())

  it('does not click a video card that mounts after the step is cancelled', async () => {
    const registry = new AnchorRegistry()
    const controller = new AbortController()
    const navigate = vi.fn()
    const pending = getCapability('select-first-video')!({
      registry, signal: controller.signal, navigate,
      getAnchor: id => registry.get(id), sleep: async () => {},
    })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    const card = document.createElement('button')
    const click = vi.spyOn(card, 'click')
    registry.register('video-browser-card-first', card)
    await rejected
    expect(click).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledTimes(1)
  })
  it('waits for a summary opener that mounts after navigation', async () => {
    const registry = new AnchorRegistry()
    const controller = new AbortController()
    const pending = getCapability('open-summary-editor')!({
      registry, signal: controller.signal, navigate: vi.fn(),
      getAnchor: id => registry.get(id), sleep: async () => {},
    })
    const control = document.createElement('button')
    const editor = document.createElement('div')
    control.onclick = () => registry.register('video-summary-editor', editor)
    registry.register('edit-summary-button', control)
    await pending
    expect(registry.get('video-summary-editor')).toBe(editor)
  })

})
