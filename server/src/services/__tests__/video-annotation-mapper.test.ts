import { describe, it, expect } from 'vitest'
import {
  annotationToLayers,
  layersToAnnotation,
  type VideoAnnotationInput,
  type MappedLayersAnnotation,
  type StoredLayersAnnotation,
  type DenotesNode,
} from '../video-annotation-mapper.js'

/**
 * Round-trips the full legacy annotation through the layers rows and back with
 * the native anchor authoritative: `type` derives from the layer persona,
 * `linkType` from the denoted node's `nodeType`, `confidence` from the native
 * 0-1000 column, and only `source` plus the tracker fields ride as flat scalar
 * features. No `fovea.annotation` blob and no per-keyframe float sidecar remain.
 */

const FRAME_RATE = 30

/** Turns a mapped annotation into the stored-row shape the inverse map reads. */
function toStored(m: MappedLayersAnnotation): StoredLayersAnnotation {
  return {
    id: m.id,
    label: m.label,
    anchor: m.anchor,
    features: m.features,
    confidence: m.confidence,
    ontologyTypeRefId: m.ontologyTypeRefId,
    denotesNodeId: m.denotesNode?.id ?? null,
    createdByUserId: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  }
}

describe('video-annotation-mapper round-trips', () => {
  it('round-trips a tracker object annotation, deriving link/source natively', () => {
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

    // The object layer is world-object, model-projected (non-manual source).
    expect(mapping.layer.subkind).toBe('world-object')
    expect(mapping.layer.sourceMethod).toBe('model-projected')
    // The denoted node is always minted (never nulled) with the link's nodeType.
    expect(mapping.annotation.denotesNode).toEqual({
      id: 'entity-42',
      nodeType: 'entity',
      label: 'entity-42',
    })
    // No structured meta blob; only flat scalar features remain.
    expect(mapping.annotation.features['fovea.annotation']).toBeUndefined()
    expect(mapping.annotation.features).toEqual({
      'fovea.source': 'sam2',
      'fovea.trackId': 'track-7',
      'fovea.trackingSource': 'sam2',
      'fovea.trackingConfidence': 880,
    })
    // Confidence is the native 0-1000 integer column.
    expect(mapping.annotation.confidence).toBe(800)

    const node: DenotesNode = { nodeType: 'entity', label: 'Entity 42' }
    const out = layersToAnnotation(
      toStored(mapping.annotation),
      { personaId: mapping.layer.personaId },
      { id: input.videoId, frameRate: FRAME_RATE },
      node,
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
    expect(mapping.layer.sourceMethod).toBe('manual-native')
    expect(mapping.annotation.ontologyTypeRefId).toBe('entity-type-abc')
    expect(mapping.annotation.denotesNode).toBeNull()

    const out = layersToAnnotation(
      toStored(mapping.annotation),
      { personaId: mapping.layer.personaId },
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
})
