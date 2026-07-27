import { describe, it, expect } from 'vitest'

import {
  annotationToLayers,
  layersToAnnotation,
  tracksByAnnotation,
  applyTrackMembership,
  type VideoAnnotationInput as OracleInput,
  type AnnotationToLayersContext,
  type StoredLayersAnnotation,
  type DenotesNode,
} from '../../video-annotation-mapper.js'
import { getPanproto, loadFoveaSchema } from '../panproto-registry.js'
import { assertOracleParity, type LayersRow } from '../oracle-parity.js'
import {
  buildKeyframeRegroupLens,
  toVideoAnnotationSource,
  foveaAnnotationToLayersRows,
  videoRegroupSourceSchema,
  type VideoAnnotationInput,
  type VideoAnnotationContext,
  type AnnotationLayersMapping,
} from '../video-lens.js'

/**
 * Verifies the FOVEA video surface's lens+adapter path against the committed
 * hand-rolled forward mapper (the oracle): the keyframe regroup compiles to a
 * native panproto lens whose round-trip laws hold, and the composition + adapter
 * reproduce the oracle's rows exactly over a corpus of representative annotations.
 */

const FRAME_RATE = 30

const CTX: AnnotationToLayersContext & VideoAnnotationContext = {
  expressionId: 'expr-1',
  ontologyId: 'ontology-1',
  frameRate: FRAME_RATE,
}

/** The corpus: representative FOVEA annotations across every branch of the map. */
const CORPUS: Array<{ name: string; input: OracleInput & VideoAnnotationInput }> = [
  {
    name: 'tracker object annotation',
    input: {
      id: 'ann-obj-1',
      videoId: 'video-1',
      personaId: null,
      type: 'object',
      label: 'entity-42',
      linkType: 'entity',
      confidence: 0.8,
      source: 'sam2',
      frames: {
        boxes: [
          { x: 10, y: 10, width: 50, height: 50, frameNumber: 0, isKeyframe: true, confidence: 0.9 },
          { x: 80, y: 40, width: 55, height: 60, frameNumber: 30, isKeyframe: true, confidence: 0.75 },
        ],
        interpolationSegments: [{ startFrame: 0, endFrame: 30, type: 'linear' }],
        visibilityRanges: [{ startFrame: 0, endFrame: 30, visible: true }],
        trackId: 'track-7',
        trackingSource: 'sam2',
        trackingConfidence: 0.88,
        totalFrames: 31,
        keyframeCount: 2,
        interpolatedFrameCount: 29,
      },
    },
  },
  {
    name: 'persona type annotation',
    input: {
      id: 'ann-type-1',
      videoId: 'video-1',
      personaId: 'persona-1',
      type: 'type',
      label: 'entity-type-abc',
      linkType: null,
      confidence: 0.7,
      source: 'manual',
      frames: {
        boxes: [{ x: 5, y: 5, width: 40, height: 40, frameNumber: 12, isKeyframe: true }],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 12, endFrame: 12, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0,
      },
    },
  },
  {
    name: 'persona-scoped world-instance annotation',
    input: {
      id: 'ann-inst-1',
      videoId: 'video-1',
      personaId: 'persona-1',
      type: 'location',
      label: 'loc-yankee-stadium',
      linkType: null,
      confidence: null,
      source: 'manual',
      frames: {
        boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0,
      },
    },
  },
  {
    name: 'unlinked object annotation (denotes no node)',
    input: {
      id: 'ann-obj-free',
      videoId: 'video-2',
      personaId: null,
      type: 'object',
      label: 'freeform',
      linkType: null,
      confidence: null,
      source: 'yolo11seg',
      frames: {
        boxes: [{ x: 3, y: 4, width: 20, height: 22, frameNumber: 6, isKeyframe: true }],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 6, endFrame: 6, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0,
      },
    },
  },
  {
    name: 'eased multi-keyframe object annotation with features',
    input: {
      id: 'ann-obj-eased',
      videoId: 'video-2',
      personaId: null,
      type: 'object',
      label: 'event-99',
      linkType: 'event',
      confidence: 0.5,
      source: 'samurai',
      frames: {
        boxes: [
          { x: 1, y: 2, width: 30, height: 30, frameNumber: 0, isKeyframe: true, confidence: 0.6, metadata: { pose: 'front' } },
          { x: 9, y: 12, width: 33, height: 31, frameNumber: 15, isKeyframe: true, confidence: 0.4 },
          { x: 20, y: 25, width: 35, height: 33, frameNumber: 45, isKeyframe: true },
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 15, type: 'bezier', controlPoints: { c: 0.3 } },
          { startFrame: 15, endFrame: 45, type: 'ease-in-out' },
        ],
        visibilityRanges: [
          { startFrame: 0, endFrame: 15, visible: true },
          { startFrame: 16, endFrame: 45, visible: false },
        ],
        trackId: 'track-9',
        trackingSource: 'samurai',
        totalFrames: 46,
        keyframeCount: 3,
        interpolatedFrameCount: 43,
      },
    },
  },
]

/** Flattens the oracle/lens mapping into tagged Prisma-table rows for comparison. */
function mappingToRows(m: AnnotationLayersMapping): LayersRow[] {
  const rows: LayersRow[] = [
    { __table: 'AnnotationLayer', ...m.layer },
    { __table: 'LayersAnnotation', ...m.annotation },
  ]
  if (m.track) rows.push({ __table: 'Track', ...m.track })
  return rows
}

describe('video-lens keyframe regroup lens', () => {
  it('compiles a native keyframe regroup lens carrying the boundingBox field transform', async () => {
    const { requirementKind, fieldTransforms } = await buildKeyframeRegroupLens()
    // The regroup is a native lens (its complement requirement is empty) and its
    // computed field survives compilation, keyed by the keyframe item vertex.
    expect(requirementKind).toBe('empty')
    expect(Object.keys(fieldTransforms)).toContain('root.keyframes:items')
  })

  it("holds the round-trip laws over every corpus annotation's keyframes", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(videoRegroupSourceSchema)
    const { lens } = await buildKeyframeRegroupLens()

    for (const { name, input } of CORPUS) {
      const vm = toVideoAnnotationSource(input, CTX)
      // The lens binds to the spatial core: flat keyframes plus the copied span.
      const record = {
        id: vm.id,
        label: vm.label,
        confidence: Math.round((input.confidence ?? 0) * 1000),
        interpolation: vm.interpolation,
        temporalSpan: vm.temporalSpan,
        keyframes: vm.keyframes.map((kf) => ({
          timeMs: kf.timeMs,
          x: kf.x,
          y: kf.y,
          width: kf.width,
          height: kf.height,
        })),
      }
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `PutGet for ${name}`).toBe(true)
    }
  })
})

describe('video-lens oracle parity', () => {
  it('reproduces the oracle rows for every corpus annotation', () => {
    const oracleRows: LayersRow[] = []
    const lensRows: LayersRow[] = []

    for (const { input } of CORPUS) {
      oracleRows.push(...mappingToRows(annotationToLayers(input, CTX)))
      lensRows.push(...mappingToRows(foveaAnnotationToLayersRows(input, CTX)))
    }

    assertOracleParity(oracleRows, lensRows)
  })

  it('composes the three layers record types with deterministic-id cross-refs', () => {
    const tracked = CORPUS[0].input
    const rows = foveaAnnotationToLayersRows(tracked, CTX)
    // annotationLayer -> layer row, its nested annotation, and a denoted graphNode.
    expect(rows.layer.subkind).toBe('world-object')
    expect(rows.annotation.denotesNode).toEqual({ id: 'entity-42', nodeType: 'entity', label: 'entity-42' })
    // The track rides on the per-video clusterSet (id derived from the video).
    expect(rows.track).toEqual({ trackId: 'track-7', trackingSource: 'sam2', trackingConfidence: 880 })
    // The annotation joins the layer by the deterministic layer id.
    expect(rows.annotation.layerId).toBe(rows.layer.id)
  })

  it('reconstructs identically to the oracle backward mapper from the composed rows', () => {
    // Feeds the rows from each path through the oracle's backward mapper and
    // asserts they reconstruct the same FOVEA annotation. Because the lens-path
    // rows equal the oracle rows, the reconstruction matches by construction; this
    // guards that the adapter feeds the backward mapper a faithful stored shape.
    const reconstruct = (m: AnnotationLayersMapping, videoId: string) => {
      const stored: StoredLayersAnnotation = {
        id: m.annotation.id,
        label: m.annotation.label,
        anchor: m.annotation.anchor,
        confidence: m.annotation.confidence,
        ontologyTypeRefId: m.annotation.ontologyTypeRefId,
        denotesNodeId: m.annotation.denotesNode?.id ?? null,
        createdByUserId: 'user-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }
      const node: DenotesNode | null = m.annotation.denotesNode
        ? { nodeType: m.annotation.denotesNode.nodeType, label: m.annotation.denotesNode.label }
        : null
      let track = null
      if (m.track) {
        const clusters = applyTrackMembership(null, m.annotation.id, m.track)
        track = tracksByAnnotation(clusters).get(m.annotation.id) ?? null
      }
      return layersToAnnotation(
        stored,
        { personaId: m.layer.personaId, sourceMethod: m.layer.sourceMethod },
        { id: videoId, frameRate: FRAME_RATE },
        node,
        track,
      )
    }

    for (const { name, input } of CORPUS) {
      const fromOracle = reconstruct(annotationToLayers(input, CTX), input.videoId)
      const fromLens = reconstruct(foveaAnnotationToLayersRows(input, CTX), input.videoId)
      expect(fromLens, `reconstruction for ${name}`).toEqual(fromOracle)
    }
  })
})
