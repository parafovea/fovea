/**
 * Lossless conversion between Fovea's `Annotation.frames` bounding-box
 * sequences and the layers-schema {@link SpatioTemporalAnchor} shape.
 *
 * The layers anchor is a lossy projection of a Fovea sequence on its own:
 * bounding boxes are integer pixels, times are integer milliseconds, and
 * interpolation collapses to a single slug. To keep the transform bit-exact
 * — so a backfill can round-trip every legacy annotation without drift — the
 * exact source values are stashed under `fovea.*` keys: per-keyframe fields
 * (frame number, float bbox, confidence, keyframe flag, metadata) live in the
 * {@link Keyframe.features} map, and sequence-level fields (interpolation
 * segments, visibility ranges, track identity, frame counts) live in the
 * layer-level features bag returned alongside the anchor.
 *
 * The inverse reads the `fovea.*` values first and only falls back to the
 * integer millisecond / pixel projection when a source value is absent (e.g.
 * an anchor authored natively in the layers store rather than migrated).
 *
 * These functions are pure and take no database — they are exercised by the
 * golden round-trip test and reused by the P3 backfill and the layers routes.
 *
 * @module
 */

import type {
  SpatioTemporalAnchor,
  SpatioTemporalAnchorInterpolation,
  Keyframe,
  BoundingBox,
  TemporalSpan,
  Feature,
  FeatureMap,
} from '@fovea/layers-schema'

/**
 * Interpolation modes a Fovea bounding-box sequence may use between
 * keyframes. Mirrors the annotation-tool `InterpolationType`.
 */
export type FoveaInterpolationType =
  | 'linear'
  | 'bezier'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'hold'
  | 'parametric'

/** Source of tracking data on a Fovea sequence. */
export type FoveaTrackingSource =
  | 'manual'
  | 'samurai'
  | 'sam2long'
  | 'sam2'
  | 'yolo11seg'

/**
 * A single Fovea bounding box at a specific video frame. Coordinates are
 * pixel-space floats for annotation output; only raw detection output is
 * normalized 0-1 (that normalization is not undone here).
 */
export interface FoveaBoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameNumber: number
  confidence?: number
  isKeyframe?: boolean
  metadata?: Record<string, unknown>
}

/** Interpolation configuration for a single segment between two keyframes. */
export interface FoveaInterpolationSegment {
  startFrame: number
  endFrame: number
  type: FoveaInterpolationType
  controlPoints?: Record<string, unknown>
  parametric?: Record<string, unknown>
}

/** One discontiguous visibility range within a sequence. */
export interface FoveaVisibilityRange {
  startFrame: number
  endFrame: number
  visible: boolean
}

/**
 * A complete Fovea bounding-box sequence, the shape stored in the legacy
 * `Annotation.frames` JSON column. Single-frame annotations are sequences with
 * one keyframe.
 */
export interface BoundingBoxSequence {
  boxes: FoveaBoundingBox[]
  interpolationSegments: FoveaInterpolationSegment[]
  visibilityRanges: FoveaVisibilityRange[]
  trackId?: string | number
  trackingSource?: FoveaTrackingSource
  trackingConfidence?: number
  totalFrames: number
  keyframeCount: number
  interpolatedFrameCount: number
}

/** Options controlling the frame-number <-> millisecond mapping. */
export interface FrameRateOptions {
  /** Video frame rate in frames per second. */
  frameRate: number
  /** Video width in pixels, recorded in the anchor features when supplied. */
  videoWidth?: number
  /** Video height in pixels, recorded in the anchor features when supplied. */
  videoHeight?: number
}

/**
 * The exact `fovea.*` feature keys used to make the transform bit-exact.
 * Kept in one place so the forward and inverse functions cannot drift.
 */
const FOVEA_KEYS = {
  frameNumber: 'fovea.frameNumber',
  x: 'fovea.x',
  y: 'fovea.y',
  width: 'fovea.width',
  height: 'fovea.height',
  confidence: 'fovea.confidence',
  isKeyframe: 'fovea.isKeyframe',
  metadata: 'fovea.metadata',
  interpolationSegments: 'fovea.interpolationSegments',
  visibilityRanges: 'fovea.visibilityRanges',
  trackId: 'fovea.trackId',
  trackingSource: 'fovea.trackingSource',
  trackingConfidence: 'fovea.trackingConfidence',
  totalFrames: 'fovea.totalFrames',
  keyframeCount: 'fovea.keyframeCount',
  interpolatedFrameCount: 'fovea.interpolatedFrameCount',
  videoWidth: 'fovea.videoWidth',
  videoHeight: 'fovea.videoHeight',
} as const

// --------------------------------------------------------------------------
// Scalar helpers
// --------------------------------------------------------------------------

/**
 * Scales a 0-1 confidence float to the layers-native 0-1000 integer scale.
 * Returns undefined for an undefined input.
 */
export function to1000(x: number | undefined): number | undefined {
  return x === undefined ? undefined : Math.round(x * 1000)
}

/**
 * Inverts {@link to1000}, mapping a 0-1000 integer back to a 0-1 float.
 * Returns undefined for an undefined input.
 */
export function from1000(i: number | undefined): number | undefined {
  return i === undefined ? undefined : i / 1000
}

/** Converts seconds to integer milliseconds. */
export function secToMs(sec: number): number {
  return Math.round(sec * 1000)
}

/** Converts milliseconds to seconds. */
export function msToSec(ms: number): number {
  return ms / 1000
}

/**
 * Maps a Fovea interpolation type to the coarser layers interpolation slug.
 * Linear stays linear, hold becomes step, and every eased/curved/parametric
 * mode collapses to cubic; the exact per-segment configuration is preserved
 * separately in the features bag.
 */
function interpolationTypeToSlug(
  type: FoveaInterpolationType,
): SpatioTemporalAnchorInterpolation {
  if (type === 'linear') return 'linear'
  if (type === 'hold') return 'step'
  return 'cubic'
}

// --------------------------------------------------------------------------
// FeatureMap helpers
// --------------------------------------------------------------------------

/** Builds a lookup over a Keyframe FeatureMap's entries. */
function featureIndex(features: FeatureMap | undefined): Map<string, string> {
  const index = new Map<string, string>()
  if (!features?.entries) return index
  for (const entry of features.entries) index.set(entry.key, entry.value)
  return index
}

// --------------------------------------------------------------------------
// Forward: BoundingBoxSequence -> SpatioTemporalAnchor
// --------------------------------------------------------------------------

/**
 * Projects a Fovea bounding-box sequence onto a layers
 * {@link SpatioTemporalAnchor}, returning the anchor plus a layer-level
 * features bag that carries the sequence-level `fovea.*` values.
 *
 * Each box becomes a keyframe whose `timeMs` is the frame number mapped
 * through the frame rate and whose `bbox` is the pixel box rounded to
 * integers (width/height floored to a 1px minimum). The exact source frame
 * number, float box, confidence, keyframe flag, and metadata are stashed under
 * `fovea.*` keys in the keyframe's feature map so the inverse can rebuild the
 * box bit-exactly. Interpolation segments, visibility ranges, and track
 * identity are preserved verbatim in the returned features bag; the anchor's
 * `interpolation` slug is derived from the first segment.
 *
 * @param seq - the source sequence (the `Annotation.frames` shape)
 * @param opts - frame rate and optional video dimensions
 * @returns the layers anchor and the sequence-level features bag
 */
export function boundingBoxSequenceToSpatioTemporalAnchor(
  seq: BoundingBoxSequence,
  opts: FrameRateOptions,
): { anchor: SpatioTemporalAnchor; features: Record<string, unknown> } {
  const { frameRate } = opts

  const keyframes: Keyframe[] = seq.boxes.map((box) => {
    const timeMs = Math.round((box.frameNumber / frameRate) * 1000)

    const bbox: BoundingBox = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    }

    const entries: Feature[] = [
      { key: FOVEA_KEYS.frameNumber, value: String(box.frameNumber) },
      { key: FOVEA_KEYS.x, value: String(box.x) },
      { key: FOVEA_KEYS.y, value: String(box.y) },
      { key: FOVEA_KEYS.width, value: String(box.width) },
      { key: FOVEA_KEYS.height, value: String(box.height) },
    ]
    if (box.confidence !== undefined) {
      // Exact float for reconstruction, plus the layers-native 0-1000 scale.
      entries.push({ key: FOVEA_KEYS.confidence, value: String(box.confidence) })
      entries.push({ key: 'confidence', value: String(to1000(box.confidence)) })
    }
    if (box.isKeyframe !== undefined) {
      entries.push({ key: FOVEA_KEYS.isKeyframe, value: String(box.isKeyframe) })
    }
    if (box.metadata !== undefined) {
      entries.push({ key: FOVEA_KEYS.metadata, value: JSON.stringify(box.metadata) })
    }

    return { bbox, timeMs, features: { entries } }
  })

  const firstMs = keyframes.length > 0 ? keyframes[0].timeMs : 0
  const lastMs = keyframes.length > 0 ? keyframes[keyframes.length - 1].timeMs : 0
  const temporalSpan: TemporalSpan = { start: firstMs, ending: lastMs }

  const interpolation: SpatioTemporalAnchorInterpolation =
    seq.interpolationSegments.length > 0
      ? interpolationTypeToSlug(seq.interpolationSegments[0].type)
      : 'linear'

  const anchor: SpatioTemporalAnchor = {
    interpolation,
    keyframes,
    temporalSpan,
  }

  // Sequence-level values preserved verbatim so the inverse is bit-exact.
  const features: Record<string, unknown> = {
    [FOVEA_KEYS.interpolationSegments]: seq.interpolationSegments,
    [FOVEA_KEYS.visibilityRanges]: seq.visibilityRanges,
    [FOVEA_KEYS.totalFrames]: seq.totalFrames,
    [FOVEA_KEYS.keyframeCount]: seq.keyframeCount,
    [FOVEA_KEYS.interpolatedFrameCount]: seq.interpolatedFrameCount,
  }
  if (seq.trackId !== undefined) features[FOVEA_KEYS.trackId] = seq.trackId
  if (seq.trackingSource !== undefined) features[FOVEA_KEYS.trackingSource] = seq.trackingSource
  if (seq.trackingConfidence !== undefined) {
    features[FOVEA_KEYS.trackingConfidence] = seq.trackingConfidence
  }
  if (opts.videoWidth !== undefined) features[FOVEA_KEYS.videoWidth] = opts.videoWidth
  if (opts.videoHeight !== undefined) features[FOVEA_KEYS.videoHeight] = opts.videoHeight

  return { anchor, features }
}

// --------------------------------------------------------------------------
// Inverse: SpatioTemporalAnchor -> BoundingBoxSequence
// --------------------------------------------------------------------------

/**
 * Rebuilds a Fovea bounding-box sequence from a layers
 * {@link SpatioTemporalAnchor} and its sequence-level features bag — the exact
 * inverse of {@link boundingBoxSequenceToSpatioTemporalAnchor}.
 *
 * Per-keyframe reconstruction reads the exact `fovea.*` features first (frame
 * number, float box, confidence, keyframe flag, metadata) and only falls back
 * to the anchor's integer `timeMs` / pixel `bbox` when those features are
 * absent (i.e. an anchor authored natively in the layers store). Sequence-level
 * fields are read from the features bag, with computed fallbacks for a
 * natively-authored anchor.
 *
 * @param anchor - the layers anchor
 * @param features - the sequence-level features bag produced by the forward map
 * @param opts - frame rate for the fallback millisecond -> frame mapping
 * @returns the reconstructed sequence
 */
export function spatioTemporalAnchorToBoundingBoxSequence(
  anchor: SpatioTemporalAnchor,
  features: Record<string, unknown> | undefined,
  opts: FrameRateOptions,
): BoundingBoxSequence {
  const { frameRate } = opts
  const bag = features ?? {}
  const keyframes = anchor.keyframes ?? []

  const boxes: FoveaBoundingBox[] = keyframes.map((kf) => {
    const feat = featureIndex(kf.features)

    const frameNumber = feat.has(FOVEA_KEYS.frameNumber)
      ? Number(feat.get(FOVEA_KEYS.frameNumber))
      : Math.round((kf.timeMs / 1000) * frameRate)

    const x = feat.has(FOVEA_KEYS.x) ? Number(feat.get(FOVEA_KEYS.x)) : kf.bbox.x
    const y = feat.has(FOVEA_KEYS.y) ? Number(feat.get(FOVEA_KEYS.y)) : kf.bbox.y
    const width = feat.has(FOVEA_KEYS.width) ? Number(feat.get(FOVEA_KEYS.width)) : kf.bbox.width
    const height = feat.has(FOVEA_KEYS.height)
      ? Number(feat.get(FOVEA_KEYS.height))
      : kf.bbox.height

    const box: FoveaBoundingBox = { x, y, width, height, frameNumber }

    if (feat.has(FOVEA_KEYS.confidence)) {
      box.confidence = Number(feat.get(FOVEA_KEYS.confidence))
    } else if (feat.has('confidence')) {
      box.confidence = from1000(Number(feat.get('confidence')))
    }
    if (feat.has(FOVEA_KEYS.isKeyframe)) {
      box.isKeyframe = feat.get(FOVEA_KEYS.isKeyframe) === 'true'
    }
    if (feat.has(FOVEA_KEYS.metadata)) {
      box.metadata = JSON.parse(feat.get(FOVEA_KEYS.metadata) as string) as Record<string, unknown>
    }

    return box
  })

  const interpolationSegments =
    (bag[FOVEA_KEYS.interpolationSegments] as FoveaInterpolationSegment[] | undefined) ?? []
  const visibilityRanges =
    (bag[FOVEA_KEYS.visibilityRanges] as FoveaVisibilityRange[] | undefined) ?? []

  const totalFrames =
    (bag[FOVEA_KEYS.totalFrames] as number | undefined) ??
    (boxes.length > 0 ? boxes[boxes.length - 1].frameNumber - boxes[0].frameNumber + 1 : 0)
  const keyframeCount = (bag[FOVEA_KEYS.keyframeCount] as number | undefined) ?? boxes.length
  const interpolatedFrameCount =
    (bag[FOVEA_KEYS.interpolatedFrameCount] as number | undefined) ??
    Math.max(0, totalFrames - keyframeCount)

  const seq: BoundingBoxSequence = {
    boxes,
    interpolationSegments,
    visibilityRanges,
    totalFrames,
    keyframeCount,
    interpolatedFrameCount,
  }

  if (bag[FOVEA_KEYS.trackId] !== undefined) {
    seq.trackId = bag[FOVEA_KEYS.trackId] as string | number
  }
  if (bag[FOVEA_KEYS.trackingSource] !== undefined) {
    seq.trackingSource = bag[FOVEA_KEYS.trackingSource] as FoveaTrackingSource
  }
  if (bag[FOVEA_KEYS.trackingConfidence] !== undefined) {
    seq.trackingConfidence = bag[FOVEA_KEYS.trackingConfidence] as number
  }

  return seq
}
