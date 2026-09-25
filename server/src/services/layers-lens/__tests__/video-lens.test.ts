import { describe, it, expect } from 'vitest'

import type { SpatioTemporalAnchor } from '@fovea/layers-schema'

import {
  tracksByAnnotation,
  applyTrackMembership,
  type VideoAnnotationInput as OracleInput,
  type AnnotationToLayersContext,
  type StoredLayersAnnotation,
  type StoredAnnotationLayer,
  type DenotesNode,
  type MappedTrack,
} from '../../video-annotation-shared.js'
import { getPanproto, loadFoveaSchema } from '../panproto-registry.js'
import {
  buildVideoAnnotationLens,
  getVideoAnnotationLens,
  toVideoAnnotationSource,
  toVideoLensRecord,
  projectAnnotationCore,
  foveaAnnotationToLayersRows,
  videoLensSourceSchema,
  VIDEO_ANNOTATION_LENS_BODY_VERTEX,
  buildVideoAnnotationBackLens,
  getVideoAnnotationBackLens,
  projectBackView,
  layersToAnnotationViaLens,
  videoLensBackSourceSchema,
  VIDEO_ANNOTATION_BACK_LENS_BODY_VERTEX,
  type VideoAnnotationInput,
  type VideoAnnotationContext,
  type AnnotationLayersMapping,
} from '../video-lens.js'

/**
 * Verifies the FOVEA video surface's bidirectional lens path. The forward
 * annotation-core lens compiles to a native panproto lens whose `getJson` output
 * carries the keyframe regroup, the folded temporal span, and the scaled
 * confidence, and the composition + adapter distribute it to rows. The backward
 * annotation-core lens compiles to a native inverse lens whose `getJson` flattens
 * the keyframe geometry and descales the confidence, and the reconstruction
 * rebuilds the FOVEA annotation from it. Both directions run the reliable forward
 * projection (`getJson`) of a lens authored in that direction; the round-trip laws
 * hold on both compiled lenses, and running the surface forward then backward
 * returns the annotation.
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

/**
 * Rebuilds the stored-row shape the backward map reads from a forward mapping, the
 * way the persistence boundary hands it back: the annotation row, its grouping
 * layer, the denoted node, and the track resolved from the video's track
 * ClusterSet membership.
 */
function toStored(m: AnnotationLayersMapping): {
  row: StoredLayersAnnotation
  layer: StoredAnnotationLayer
  node: DenotesNode | null
  track: MappedTrack | null
} {
  const row: StoredLayersAnnotation = {
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
  const layer: StoredAnnotationLayer = {
    personaId: m.layer.personaId,
    sourceMethod: m.layer.sourceMethod,
  }
  const node: DenotesNode | null = m.annotation.denotesNode
    ? { nodeType: m.annotation.denotesNode.nodeType, label: m.annotation.denotesNode.label }
    : null
  let track: MappedTrack | null = null
  if (m.track) {
    const clusters = applyTrackMembership(null, m.annotation.id, m.track)
    track = tracksByAnnotation(clusters).get(m.annotation.id) ?? null
  }
  return { row, layer, node, track }
}

describe('video-lens forward annotation-core lens', () => {
  it('compiles a native lens carrying the keyframe, span, and confidence transforms', async () => {
    const { requirementKind, fieldTransforms } = await buildVideoAnnotationLens()
    // The lens is native (its complement requirement is empty) and its three
    // computed fields survive compilation, keyed by the annotation root vertex.
    expect(requirementKind).toBe('empty')
    expect(Object.keys(fieldTransforms)).toContain(VIDEO_ANNOTATION_LENS_BODY_VERTEX)
    const rootTransforms = fieldTransforms[VIDEO_ANNOTATION_LENS_BODY_VERTEX] as Array<{
      ComputeField?: { target_key?: string }
    }>
    const targets = rootTransforms.map((t) => t.ComputeField?.target_key)
    expect(targets).toEqual(expect.arrayContaining(['keyframes', 'temporalSpan', 'confidence']))
  })

  it("holds the round-trip laws over every corpus annotation's core", async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(videoLensSourceSchema)
    const { lens } = await getVideoAnnotationLens()

    for (const { name, input } of CORPUS) {
      const record = toVideoLensRecord(toVideoAnnotationSource(input, CTX))
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `PutGet for ${name}`).toBe(true)
    }
  })

  it('emits keyframes regrouped under bbox with timeMs and features carried through', async () => {
    const { lens } = await getVideoAnnotationLens()
    const eased = CORPUS[4].input
    const core = projectAnnotationCore(lens, toVideoAnnotationSource(eased, CTX))

    // The lens itself nested the geometry: each output keyframe is the layers
    // Keyframe shape (bbox + timeMs), not the flat source geometry.
    for (const kf of core.keyframes) {
      expect(kf).toHaveProperty('bbox')
      expect(kf).toHaveProperty('timeMs')
      expect(kf).not.toHaveProperty('x')
    }
    expect(core.keyframes[0].bbox).toEqual({ x: 1, y: 2, width: 30, height: 30 })
    // The first keyframe carried per-box confidence and metadata as features.
    expect(core.keyframes[0].features?.entries).toEqual(
      expect.arrayContaining([
        { key: 'confidence', value: '600' },
        { key: 'metadata.pose', value: '"front"' },
      ]),
    )

    // A featureless single keyframe carries no feature map; the conditional
    // passthrough omits the field rather than emitting an empty entries list.
    const plain = projectAnnotationCore(lens, toVideoAnnotationSource(CORPUS[2].input, CTX))
    expect(plain.keyframes[0].features).toBeUndefined()
  })

  it('folds the temporal span from the keyframe times and scales the confidence', async () => {
    const { lens } = await getVideoAnnotationLens()

    const eased = projectAnnotationCore(lens, toVideoAnnotationSource(CORPUS[4].input, CTX))
    // frames 0 and 45 at 30fps -> 0ms and 1500ms; the lens fold derived the extent.
    expect(eased.temporalSpan).toEqual({ start: 0, ending: 1500 })
    // confidence 0.5 -> the layers-native 0-1000 integer, by the lens.
    expect(eased.confidence).toBe(500)

    const nullConf = projectAnnotationCore(lens, toVideoAnnotationSource(CORPUS[2].input, CTX))
    // A single keyframe collapses the span to a point; a null confidence stays null.
    expect(nullConf.temporalSpan).toEqual({ start: 0, ending: 0 })
    expect(nullConf.confidence).toBeNull()
  })
})

describe('video-lens backward annotation-core lens', () => {
  it('compiles a native inverse lens carrying the flatten and descale transforms', async () => {
    const { requirementKind, fieldTransforms } = await buildVideoAnnotationBackLens()
    expect(requirementKind).toBe('empty')
    expect(Object.keys(fieldTransforms)).toContain(VIDEO_ANNOTATION_BACK_LENS_BODY_VERTEX)
    const rootTransforms = fieldTransforms[VIDEO_ANNOTATION_BACK_LENS_BODY_VERTEX] as Array<{
      ComputeField?: { target_key?: string }
    }>
    const targets = rootTransforms.map((t) => t.ComputeField?.target_key)
    expect(targets).toEqual(expect.arrayContaining(['keyframes', 'confidence']))
  })

  it('holds the round-trip laws over every stored anchor', async () => {
    const p = await getPanproto()
    const source = await loadFoveaSchema(videoLensBackSourceSchema)
    const { lens } = await getVideoAnnotationBackLens()

    for (const { name, input } of CORPUS) {
      const mapping = await foveaAnnotationToLayersRows(input, CTX)
      const anchor = mapping.annotation.anchor.spatioTemporalAnchor
      const record: Record<string, unknown> = {
        id: input.id,
        label: input.label,
        confidence: mapping.annotation.confidence,
        interpolation: anchor.interpolation,
        temporalSpan: anchor.temporalSpan,
        keyframes: anchor.keyframes,
      }
      if (anchor.interpolationUri) record.interpolationUri = anchor.interpolationUri
      const bytes = p.parseJson(source, JSON.stringify(record))._bytes
      expect(lens.checkGetPut(bytes).holds, `GetPut for ${name}`).toBe(true)
      expect(lens.checkPutGet(bytes).holds, `PutGet for ${name}`).toBe(true)
    }
  })

  it('flattens the keyframe geometry and descales the confidence on getJson', async () => {
    const { lens } = await getVideoAnnotationBackLens()
    const { row } = toStored(await foveaAnnotationToLayersRows(CORPUS[0].input, CTX))
    const anchor = (row.anchor as { spatioTemporalAnchor: SpatioTemporalAnchor }).spatioTemporalAnchor
    const view = projectBackView(lens, row, anchor)

    // The lens itself flattened the geometry: each output keyframe is the FOVEA
    // flat shape (x/y/width/height + timeMs), not the nested layers bbox.
    for (const kf of view.keyframes) {
      expect(kf).toHaveProperty('x')
      expect(kf).toHaveProperty('timeMs')
      expect(kf).not.toHaveProperty('bbox')
    }
    expect(view.keyframes[0]).toMatchObject({ x: 10, y: 10, width: 50, height: 50, timeMs: 0 })
    // The first keyframe carried its per-box confidence feature through unchanged.
    expect(view.keyframes[0].features?.entries).toEqual(
      expect.arrayContaining([{ key: 'confidence', value: '900' }]),
    )
    // confidence 800 (0-1000) -> the FOVEA 0-1 float, by the lens.
    expect(view.confidence).toBe(0.8)

    // A null-confidence stored annotation descales to null.
    const { row: nullRow } = toStored(await foveaAnnotationToLayersRows(CORPUS[2].input, CTX))
    const nullAnchor = (nullRow.anchor as { spatioTemporalAnchor: SpatioTemporalAnchor })
      .spatioTemporalAnchor
    const nullView = projectBackView(lens, nullRow, nullAnchor)
    expect(nullView.confidence).toBeNull()
  })
})

describe('video-lens composition and reconstruction', () => {
  it('composes the three layers record types with deterministic-id cross-refs', async () => {
    const tracked = CORPUS[0].input
    const rows = await foveaAnnotationToLayersRows(tracked, CTX)
    // annotationLayer -> layer row, its nested annotation, and a denoted graphNode.
    expect(rows.layer.subkind).toBe('world-object')
    expect(rows.annotation.denotesNode).toEqual({ id: 'entity-42', nodeType: 'entity', label: 'entity-42' })
    // The track rides on the per-video clusterSet (id derived from the video).
    expect(rows.track).toEqual({ trackId: 'track-7', trackingSource: 'sam2', trackingConfidence: 880 })
    // The annotation joins the layer by the deterministic layer id.
    expect(rows.annotation.layerId).toBe(rows.layer.id)
    // startMs/endMs read off the lens-derived temporal span.
    expect(rows.annotation.startMs).toBe(0)
    expect(rows.annotation.endMs).toBe(1000)
  })

  it('reconstructs the annotation from its own composed rows (forward then backward)', async () => {
    // Runs the surface forward (annotation -> getJson forward -> adapter -> rows),
    // then backward (rows -> getJson backward -> annotation) over the same
    // annotation, and asserts the bounding-box sequence and the persona/link-derived
    // scalars survive the round trip. The reconstruction runs the inverse lens's
    // getJson, so this is a genuine end-to-end lens self-consistency check.
    for (const { name, input } of CORPUS) {
      const forward = await foveaAnnotationToLayersRows(input, CTX)
      const { row, layer, node, track } = toStored(forward)
      const video = { id: input.videoId, frameRate: FRAME_RATE }
      const out = await layersToAnnotationViaLens(row, layer, video, node, track)

      expect(out.id, `id for ${name}`).toBe(input.id)
      expect(out.videoId).toBe(input.videoId)
      expect(out.personaId).toBe(input.personaId)
      expect(out.label).toBe(input.label)
      expect(out.source).toBe(input.source)
      expect(out.confidence, `confidence for ${name}`).toBe(input.confidence)
      // The keyframe geometry (box, time, per-box confidence, metadata) survives
      // the round trip; the anchor records visibility and interpolation only at
      // keyframes, so a sequence's inter-keyframe range boundaries need not.
      expect(out.frames.boxes, `keyframes for ${name}`).toEqual(input.frames.boxes)
      expect(out.frames.trackId, `track for ${name}`).toBe(input.frames.trackId)
      expect(out.frames.trackingSource).toBe(input.frames.trackingSource)
    }
  })
})
