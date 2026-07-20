import { describe, it, expect } from 'vitest'
import {
  annotationToLayers,
  layersToAnnotation,
  applyTrackMembership,
  removeTrackMembership,
  tracksByAnnotation,
  type VideoAnnotationInput,
  type MappedLayersAnnotation,
  type StoredLayersAnnotation,
  type DenotesNode,
} from '../video-annotation-mapper.js'

/**
 * Round-trips the full legacy annotation through the layers rows and back with
 * every field in a native home: the sequence rebuilds from the anchor alone,
 * `source` is the layer `sourceMethod`, `confidence` the native 0-1000 column,
 * `type`/`linkType` derive from the layer persona and denoted node, and the
 * tracker identity (`trackId`/`trackingSource`/`trackingConfidence`) is the
 * video's track ClusterSet membership. No annotation feature backs any of it.
 */

const FRAME_RATE = 30

/** Turns a mapped annotation into the stored-row shape the inverse map reads. */
function toStored(m: MappedLayersAnnotation): StoredLayersAnnotation {
  return {
    id: m.id,
    label: m.label,
    anchor: m.anchor,
    confidence: m.confidence,
    ontologyTypeRefId: m.ontologyTypeRefId,
    denotesNodeId: m.denotesNode?.id ?? null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  }
}

describe('video-annotation-mapper round-trips', () => {
  it('round-trips a tracker object annotation, deriving link/source/track natively', () => {
    const input: VideoAnnotationInput = {
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
    }

    const mapping = annotationToLayers(input, {
      expressionId: 'expr-1',
      ontologyId: null,
      frameRate: FRAME_RATE,
    })

    // The object layer is world-object; the authoring source is its native
    // source method (verbatim, so an arbitrary source round-trips).
    expect(mapping.layer.subkind).toBe('world-object')
    expect(mapping.layer.sourceMethod).toBe('sam2')
    // The denoted node is always minted (never nulled) with the link's nodeType.
    expect(mapping.annotation.denotesNode).toEqual({
      id: 'entity-42',
      nodeType: 'entity',
      label: 'entity-42',
    })
    // Confidence is the native 0-1000 integer column.
    expect(mapping.annotation.confidence).toBe(800)
    // The tracker identity is a track (folded into the video's track ClusterSet),
    // not a per-annotation feature: track id, tracker name, and 0-1000 confidence.
    expect(mapping.track).toEqual({
      trackId: 'track-7',
      trackingSource: 'sam2',
      trackingConfidence: 880,
    })

    // The track round-trips through the ClusterSet membership the write path folds.
    const clusters = applyTrackMembership(null, mapping.annotation.id, mapping.track)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].uuid.value).toBe('track-7')
    expect(clusters[0].canonicalLabel).toBe('sam2')
    const track = tracksByAnnotation(clusters).get(mapping.annotation.id) ?? null

    const node: DenotesNode = { nodeType: 'entity', label: 'Entity 42' }
    const out = layersToAnnotation(
      toStored(mapping.annotation),
      { personaId: mapping.layer.personaId, sourceMethod: mapping.layer.sourceMethod },
      { id: input.videoId, frameRate: FRAME_RATE },
      node,
      track,
    )

    expect(out.type).toBe('object')
    expect(out.linkType).toBe('entity')
    expect(out.personaId).toBeNull()
    expect(out.label).toBe('entity-42')
    expect(out.confidence).toBe(0.8)
    expect(out.source).toBe('sam2')
    expect(out.linkedObjectName).toBe('Entity 42')
    expect(out.frames).toEqual(input.frames)
  })

  it('round-trips a persona type annotation, deriving type from the layer persona', () => {
    const input: VideoAnnotationInput = {
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
    }

    const mapping = annotationToLayers(input, {
      expressionId: 'expr-1',
      ontologyId: 'ontology-1',
      frameRate: FRAME_RATE,
    })

    expect(mapping.layer.subkind).toBe('ontology-type')
    expect(mapping.layer.sourceMethod).toBe('manual')
    expect(mapping.annotation.ontologyTypeRefId).toBe('entity-type-abc')
    expect(mapping.annotation.denotesNode).toBeNull()
    // A type annotation carries no tracker identity.
    expect(mapping.track).toBeNull()

    const out = layersToAnnotation(
      toStored(mapping.annotation),
      { personaId: mapping.layer.personaId, sourceMethod: mapping.layer.sourceMethod },
      { id: input.videoId, frameRate: FRAME_RATE },
      null,
    )

    expect(out.type).toBe('type')
    expect(out.linkType).toBeNull()
    expect(out.personaId).toBe('persona-1')
    expect(out.label).toBe('entity-type-abc')
    expect(out.confidence).toBe(0.7)
    expect(out.source).toBe('manual')
    expect(out.linkedObjectName).toBeNull()
    expect(out.frames).toEqual(input.frames)
  })

  it('materializes a world node for a persona-scoped world-instance annotation', () => {
    const input: VideoAnnotationInput = {
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
    }

    const mapping = annotationToLayers(input, {
      expressionId: 'expr-1',
      ontologyId: 'ontology-1',
      frameRate: FRAME_RATE,
    })

    // A world-instance annotation denotes a native world GraphNode (its nodeType
    // from the instance kind) and asserts no ontology type.
    expect(mapping.annotation.denotesNode).toEqual({
      id: 'loc-yankee-stadium',
      nodeType: 'location',
      label: 'loc-yankee-stadium',
    })
    expect(mapping.annotation.ontologyTypeRefId).toBeNull()

    const node: DenotesNode = { nodeType: 'location', label: 'Yankee Stadium' }
    const out = layersToAnnotation(
      toStored(mapping.annotation),
      { personaId: mapping.layer.personaId, sourceMethod: mapping.layer.sourceMethod },
      { id: input.videoId, frameRate: FRAME_RATE },
      node,
    )

    // The instance kind reconstructs from the denoted node's nodeType.
    expect(out.type).toBe('location')
    expect(out.personaId).toBe('persona-1')
    expect(out.linkedObjectName).toBe('Yankee Stadium')
  })

  it('moves an annotation between tracks and detaches it on removal', () => {
    const first = applyTrackMembership(null, 'ann-a', { trackId: 'track-1' })
    const withSecond = applyTrackMembership(first, 'ann-b', { trackId: 'track-1' })
    expect(withSecond).toHaveLength(1)
    expect(withSecond[0].members.map((m) => m.localId.value)).toEqual(['ann-a', 'ann-b'])

    // Re-tracking ann-a moves it to a new cluster, leaving ann-b behind.
    const moved = applyTrackMembership(withSecond, 'ann-a', { trackId: 'track-2' })
    const byAnnotation = tracksByAnnotation(moved)
    expect(byAnnotation.get('ann-a')?.trackId).toBe('track-2')
    expect(byAnnotation.get('ann-b')?.trackId).toBe('track-1')

    // Detaching ann-a drops its (now empty) cluster.
    const detached = removeTrackMembership(moved, 'ann-a')
    expect(tracksByAnnotation(detached).has('ann-a')).toBe(false)
    expect(detached.map((c) => c.uuid.value)).toEqual(['track-1'])
  })
})
