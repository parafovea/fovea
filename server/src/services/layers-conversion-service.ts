/**
 * Conversion between Fovea's `Annotation.frames` bounding-box sequences and the
 * layers-schema {@link SpatioTemporalAnchor} shape, with the native anchor as the
 * single source of truth.
 *
 * A keyframe's integer `bbox` is the geometry (Fovea's UI-drawn boxes are pixel
 * boxes; the layers `boundingBox` is integer-pixel by definition), and a
 * keyframe's `timeMs` is the time. The stored keyframes are the true keyframes;
 * interpolated frames are recomputed on read. The per-box confidence, visibility
 * flag, per-segment interpolation mode, and arbitrary per-box metadata ride in
 * {@link Keyframe.features} — the lexicon's designated open per-keyframe
 * extension. A box's `frameNumber` and the sequence's frame counts derive on read
 * from `timeMs` and the video frame rate.
 *
 * These functions are pure and take no database — they are exercised by the
 * golden round-trip test and reused by the backfill and the layers routes.
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
 * A single Fovea bounding box at a specific video frame. The layers projection
 * stores integer-pixel geometry, so a box round-trips as integer coordinates.
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
 * one keyframe. `boxes` holds only keyframes; interpolated frames are generated
 * on demand and never persisted.
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
  /** Video width in pixels (read from the video, never stored on the anchor). */
  videoWidth?: number
  /** Video height in pixels (read from the video, never stored on the anchor). */
  videoHeight?: number
}

// --------------------------------------------------------------------------
// Native keyframe feature keys
// --------------------------------------------------------------------------

/**
 * The keyframe feature keys the anchor uses as the designated open per-keyframe
 * extension. The lexicon documents `keyframe.features` for exactly this —
 * visibility, occlusion, confidence, pose — and each key here is plain. Kept in
 * one place so the forward and inverse cannot drift.
 */
const KF = {
  /** Per-box confidence on the layers 0-1000 integer scale. */
  confidence: 'confidence',
  /** Per-keyframe visibility flag; absent means visible. */
  visible: 'visible',
  /** The interpolation mode of the segment that begins at this keyframe. */
  interpolation: 'interpolation',
  /** JSON control points for the segment beginning at this keyframe. */
  interpolationControlPoints: 'interpolationControlPoints',
  /** JSON parametric config for the segment beginning at this keyframe. */
  interpolationParametric: 'interpolationParametric',
  /** Prefix for arbitrary per-box metadata keys (one feature per metadata key). */
  metadataPrefix: 'metadata.',
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
 * mode collapses to cubic; the exact per-segment mode is preserved on each
 * keyframe's feature map.
 */
function interpolationTypeToSlug(
  type: FoveaInterpolationType,
): SpatioTemporalAnchorInterpolation {
  if (type === 'linear') return 'linear'
  if (type === 'hold') return 'step'
  return 'cubic'
}

/**
 * The AT-URI of a community interpolation-mode definition node for a Fovea
 * interpolation type. The nodes are knowledge-graph data, and `interpolationUri`
 * is the lexicon's community-expandable hook for them. The reconstruction reads
 * the per-keyframe mode feature; this URI records the anchor's lead mode.
 */
function interpolationModeUri(type: FoveaInterpolationType): string {
  return `at://did:web:fovea.video/pub.layers.graph.graphNode/interpolation-${type}`
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

/** Whether a frame falls inside a visible range; a frame outside every range is visible. */
function isFrameVisible(frameNumber: number, ranges: FoveaVisibilityRange[]): boolean {
  for (const range of ranges) {
    if (frameNumber >= range.startFrame && frameNumber <= range.endFrame) return range.visible
  }
  return true
}

// --------------------------------------------------------------------------
// Forward: BoundingBoxSequence -> SpatioTemporalAnchor
// --------------------------------------------------------------------------

/**
 * Projects a Fovea bounding-box sequence onto a layers
 * {@link SpatioTemporalAnchor}. Each keyframe carries integer geometry, an
 * integer millisecond time, and a feature map holding the per-box confidence
 * (0-1000), the visibility flag, the interpolation mode that begins at the
 * keyframe (with control points / parametric config), and any per-box metadata.
 * The anchor's `interpolation` slug and `interpolationUri` derive from the first
 * segment; per-segment modes are recovered from the keyframe features.
 *
 * @param seq - the source sequence (the `Annotation.frames` shape)
 * @param opts - frame rate for the frame-number to millisecond mapping
 * @returns the layers anchor
 */
export function boundingBoxSequenceToSpatioTemporalAnchor(
  seq: BoundingBoxSequence,
  opts: FrameRateOptions,
): SpatioTemporalAnchor {
  const { frameRate } = opts

  // The interpolation segment that begins at a given frame, if any.
  const segmentByStart = new Map<number, FoveaInterpolationSegment>()
  for (const segment of seq.interpolationSegments) segmentByStart.set(segment.startFrame, segment)

  const keyframes: Keyframe[] = seq.boxes.map((box) => {
    const timeMs = Math.round((box.frameNumber / frameRate) * 1000)

    const bbox: BoundingBox = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    }

    const entries: Feature[] = []
    if (box.confidence !== undefined) {
      entries.push({ key: KF.confidence, value: String(to1000(box.confidence)) })
    }
    if (!isFrameVisible(box.frameNumber, seq.visibilityRanges)) {
      entries.push({ key: KF.visible, value: 'false' })
    }
    const segment = segmentByStart.get(box.frameNumber)
    if (segment) {
      entries.push({ key: KF.interpolation, value: segment.type })
      if (segment.controlPoints !== undefined) {
        entries.push({
          key: KF.interpolationControlPoints,
          value: JSON.stringify(segment.controlPoints),
        })
      }
      if (segment.parametric !== undefined) {
        entries.push({ key: KF.interpolationParametric, value: JSON.stringify(segment.parametric) })
      }
    }
    if (box.metadata !== undefined) {
      for (const [key, value] of Object.entries(box.metadata)) {
        entries.push({ key: `${KF.metadataPrefix}${key}`, value: JSON.stringify(value) })
      }
    }

    const keyframe: Keyframe = { bbox, timeMs }
    if (entries.length > 0) keyframe.features = { entries }
    return keyframe
  })

  const firstMs = keyframes.length > 0 ? keyframes[0].timeMs : 0
  const lastMs = keyframes.length > 0 ? keyframes[keyframes.length - 1].timeMs : 0
  const temporalSpan: TemporalSpan = { start: firstMs, ending: lastMs }

  const leadType =
    seq.interpolationSegments.length > 0 ? seq.interpolationSegments[0].type : undefined

  const anchor: SpatioTemporalAnchor = {
    interpolation: leadType ? interpolationTypeToSlug(leadType) : 'linear',
    keyframes,
    temporalSpan,
  }
  if (leadType) anchor.interpolationUri = interpolationModeUri(leadType)

  return anchor
}

// --------------------------------------------------------------------------
// Inverse: SpatioTemporalAnchor -> BoundingBoxSequence
// --------------------------------------------------------------------------

/**
 * Rebuilds a Fovea bounding-box sequence from a layers
 * {@link SpatioTemporalAnchor} — the inverse of
 * {@link boundingBoxSequenceToSpatioTemporalAnchor}. Boxes read the integer
 * geometry and derive `frameNumber` from `timeMs` and the frame rate; per-box
 * confidence, metadata, and visibility come from the keyframe features.
 * Interpolation segments are rebuilt from the per-keyframe mode features, and
 * visibility ranges from runs of consecutive keyframe visibility flags. The
 * frame counts are derived from the keyframes.
 *
 * @param anchor - the layers anchor
 * @param opts - frame rate for the millisecond -> frame mapping
 * @returns the reconstructed sequence
 */
export function spatioTemporalAnchorToBoundingBoxSequence(
  anchor: SpatioTemporalAnchor,
  opts: FrameRateOptions,
): BoundingBoxSequence {
  const { frameRate } = opts
  const keyframes = anchor.keyframes ?? []

  const visibleFlags: boolean[] = []
  const modeByIndex: Array<FoveaInterpolationSegment | null> = []

  const boxes: FoveaBoundingBox[] = keyframes.map((kf) => {
    const feat = featureIndex(kf.features)
    const frameNumber = Math.round((kf.timeMs / 1000) * frameRate)

    const box: FoveaBoundingBox = {
      x: kf.bbox.x,
      y: kf.bbox.y,
      width: kf.bbox.width,
      height: kf.bbox.height,
      frameNumber,
      isKeyframe: true,
    }

    if (feat.has(KF.confidence)) {
      box.confidence = from1000(Number(feat.get(KF.confidence)))
    }

    const metadata: Record<string, unknown> = {}
    let hasMetadata = false
    for (const [key, value] of feat) {
      if (key.startsWith(KF.metadataPrefix)) {
        metadata[key.slice(KF.metadataPrefix.length)] = JSON.parse(value) as unknown
        hasMetadata = true
      }
    }
    if (hasMetadata) box.metadata = metadata

    visibleFlags.push(feat.get(KF.visible) !== 'false')

    if (feat.has(KF.interpolation)) {
      const segment: FoveaInterpolationSegment = {
        startFrame: frameNumber,
        endFrame: frameNumber,
        type: feat.get(KF.interpolation) as FoveaInterpolationType,
      }
      if (feat.has(KF.interpolationControlPoints)) {
        segment.controlPoints = JSON.parse(
          feat.get(KF.interpolationControlPoints) as string,
        ) as Record<string, unknown>
      }
      if (feat.has(KF.interpolationParametric)) {
        segment.parametric = JSON.parse(feat.get(KF.interpolationParametric) as string) as Record<
          string,
          unknown
        >
      }
      modeByIndex.push(segment)
    } else {
      modeByIndex.push(null)
    }

    return box
  })

  // Interpolation segments span consecutive keyframes; a segment's mode is the
  // one recorded on its starting keyframe (linear when none was recorded).
  const interpolationSegments: FoveaInterpolationSegment[] = []
  for (let i = 0; i < boxes.length - 1; i++) {
    const start = boxes[i].frameNumber
    const end = boxes[i + 1].frameNumber
    const recorded = modeByIndex[i]
    if (recorded) {
      interpolationSegments.push({ ...recorded, startFrame: start, endFrame: end })
    } else {
      interpolationSegments.push({ startFrame: start, endFrame: end, type: 'linear' })
    }
  }

  // Visibility ranges are maximal runs of consecutive keyframes sharing a
  // visibility flag; an all-visible sequence yields one full-span visible range.
  const visibilityRanges: FoveaVisibilityRange[] = []
  if (boxes.length > 0) {
    let runStart = boxes[0].frameNumber
    let runVisible = visibleFlags[0]
    for (let i = 1; i < boxes.length; i++) {
      if (visibleFlags[i] !== runVisible) {
        visibilityRanges.push({
          startFrame: runStart,
          endFrame: boxes[i].frameNumber - 1,
          visible: runVisible,
        })
        runStart = boxes[i].frameNumber
        runVisible = visibleFlags[i]
      }
    }
    visibilityRanges.push({
      startFrame: runStart,
      endFrame: boxes[boxes.length - 1].frameNumber,
      visible: runVisible,
    })
  }

  const keyframeCount = boxes.length
  const totalFrames =
    boxes.length > 0 ? boxes[boxes.length - 1].frameNumber - boxes[0].frameNumber + 1 : 0
  const interpolatedFrameCount = Math.max(0, totalFrames - keyframeCount)

  return {
    boxes,
    interpolationSegments,
    visibilityRanges,
    totalFrames,
    keyframeCount,
    interpolatedFrameCount,
  }
}
