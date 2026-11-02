import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { annotationKeys } from '@store/queries/useAnnotations'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import type { ObjectAnnotation } from '@models/types'
import AnnotationEditor from './AnnotationEditor'
import InteractiveBoundingBox from './InteractiveBoundingBox'

const save = vi.hoisted(() => vi.fn())
vi.mock('@store/queries', async importOriginal => ({
  ...await importOriginal<typeof import('@store/queries')>(),
  useUpdateAnnotation: () => ({ mutate: save }),
  usePersonas: () => ({ data: [] }),
  usePersonaOntology: () => ({ data: null }),
  useWorld: () => ({ data: { entities: [{ id: 'entity-1', name: 'Person' }], events: [], entityCollections: [], eventCollections: [] } }),
}))
vi.mock('./BoundingBoxHUD', () => ({ BoundingBoxHUD: () => null }))

const annotation: ObjectAnnotation = {
  id: 'box-1', videoId: 'video-1', annotationType: 'object', linkedEntityId: 'entity-1',
  createdAt: 'now', updatedAt: 'now', notes: 'Original',
  boundingBoxSequence: {
    boxes: [
      { x: 10, y: 20, width: 50, height: 60, frameNumber: 0, isKeyframe: true },
      { x: 30, y: 40, width: 70, height: 80, frameNumber: 30, isKeyframe: true },
      { x: 50, y: 60, width: 90, height: 100, frameNumber: 60, isKeyframe: true },
    ],
    interpolationSegments: [{ startFrame: 0, endFrame: 60, type: 'linear' }],
    visibilityRanges: [{ startFrame: 0, endFrame: 20, visible: true }, { startFrame: 21, endFrame: 25, visible: false }, { startFrame: 26, endFrame: 60, visible: true }],
    totalFrames: 61, keyframeCount: 3, interpolatedFrameCount: 58,
  },
}

describe('video editing preserves tracks', () => {
  beforeEach(() => { save.mockReset(); useAnnotationUiStore.getState().resetAllState() })

  it('saves a note without changing the keyframes, interpolation or visibility', () => {
    const client = new QueryClient()
    render(<QueryClientProvider client={client}><AnnotationEditor open onClose={() => {}} annotation={annotation} /></QueryClientProvider>)
    fireEvent.change(screen.getByPlaceholderText('Optional notes about this annotation'), { target: { value: 'Revised' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ notes: 'Revised', boundingBoxSequence: annotation.boundingBoxSequence }))
  })

  it('allows editing a time-linked annotation without dropping its target', () => {
    const client = new QueryClient()
    const timeAnnotation = { ...annotation, linkedEntityId: undefined, linkedTimeId: 'time-1' }
    render(<QueryClientProvider client={client}><AnnotationEditor open onClose={() => {}} annotation={timeAnnotation} /></QueryClientProvider>)
    fireEvent.change(screen.getByPlaceholderText('Optional notes about this annotation'), { target: { value: 'Revised time note' } })
    const button = screen.getByRole('button', { name: /save/i })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ linkedTimeId: 'time-1', notes: 'Revised time note' }))
  })

  it('adds a keyframe on an interpolated drag and commits once on release', () => {
    const client = new QueryClient()
    client.setQueryData(annotationKeys.video(annotation.videoId), [annotation])
    const complete = vi.fn()
    const { container } = render(<QueryClientProvider client={client}><svg>
      <InteractiveBoundingBox annotation={annotation} currentFrame={15} videoWidth={1000} videoHeight={1000}
        isActive onSelect={() => {}} mode="interpolated" onEditComplete={complete} />
    </svg></QueryClientProvider>)
    vi.spyOn(container.querySelector('svg')!, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000, toJSON: () => ({}) })
    fireEvent.mouseDown(container.querySelector('g[data-annotation-id] > rect')!, { clientX: 20, clientY: 30 })
    fireEvent.mouseMove(window, { clientX: 30, clientY: 40 })
    fireEvent.mouseMove(window, { clientX: 40, clientY: 50 })
    expect(complete).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    fireEvent.mouseUp(window)
    expect(complete).toHaveBeenCalledTimes(1)
    const boxes = complete.mock.calls[0][0][0].boundingBoxSequence.boxes
    expect(boxes).toHaveLength(4)
    expect(boxes.find((box: { frameNumber: number }) => box.frameNumber === 0)).toEqual(annotation.boundingBoxSequence.boxes[0])
    expect(boxes.find((box: { frameNumber: number }) => box.frameNumber === 15)).toMatchObject({ isKeyframe: true, x: 40, y: 50 })
  })
})
