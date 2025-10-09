/**
 * @file trackingConverter.ts
 * @description Utilities for converting tracking results to bounding box sequences.
 * Handles conversion from automated tracking output to keyframe-based sequences
 * with interpolation configuration and visibility range detection.
 */

import {
  TrackingResult,
  TrackFrame,
  BoundingBox,
  BoundingBoxSequence,
  InterpolationSegment,
} from '../models/types.js'

/**
 * Convert tracking result to bounding box sequence.
 * All tracked frames are initially marked as keyframes.
 * Linear interpolation is set between all keyframe pairs.
 * Visibility ranges are detected from frame gaps (discontiguous sequences).
 *
 * @param track - Tracking result from model service
 * @returns Bounding box sequence ready for annotation
 */
export function convertTrackToSequence(
  track: TrackingResult
): BoundingBoxSequence {
  // Extract bounding boxes from tracking frames
  const boxes: BoundingBox[] = track.frames.map((frame) => ({
    x: frame.box.x,
    y: frame.box.y,
    width: frame.box.width,
    height: frame.box.height,
    frameNumber: frame.frameNumber,
    isKeyframe: true, // All tracked frames initially keyframes
    confidence: frame.confidence,
  }))

  // Sort boxes by frame number
  boxes.sort((a, b) => a.frameNumber - b.frameNumber)

  // Detect gaps in tracking (discontiguous sequences)
  const visibilityRanges = detectVisibilityRanges(track.frames)

  // Create linear interpolation segments between keyframes
  const interpolationSegments = createInterpolationSegments(boxes)

  return {
    boxes,
    interpolationSegments,
    visibilityRanges,
    trackId: track.trackId,
    trackingSource: track.model as 'manual' | 'samurai' | 'sam2long' | 'sam2' | 'yolo11seg',
    trackingConfidence: track.confidence,
    totalFrames: boxes.length,
    keyframeCount: boxes.length,
    interpolatedFrameCount: 0, // No interpolation initially (all keyframes)
  }
}

/**
 * Detect visibility ranges from tracking frames.
 * Handles discontiguous tracks where object leaves and re-enters frame.
 * Gaps of more than 1 frame are marked as hidden ranges.
 *
 * @param frames - Tracking frames from automation
 * @returns Array of visibility ranges
 */
export function detectVisibilityRanges(
  frames: TrackFrame[]
): Array<{ startFrame: number; endFrame: number; visible: boolean }> {
  if (frames.length === 0) {
    return []
  }

  // Sort frames by frame number
  const sortedFrames = [...frames].sort((a, b) => a.frameNumber - b.frameNumber)

  const ranges: Array<{ startFrame: number; endFrame: number; visible: boolean }> = []
  let currentStart = sortedFrames[0].frameNumber
  let currentEnd = sortedFrames[0].frameNumber

  for (let i = 1; i < sortedFrames.length; i++) {
    const prevFrame = sortedFrames[i - 1].frameNumber
    const currFrame = sortedFrames[i].frameNumber

    // Check for gap (more than 1 frame difference)
    if (currFrame - prevFrame > 1) {
      // Close current visible range
      ranges.push({
        startFrame: currentStart,
        endFrame: currentEnd,
        visible: true,
      })

      // Add hidden range for the gap
      ranges.push({
        startFrame: prevFrame + 1,
        endFrame: currFrame - 1,
        visible: false,
      })

      // Start new visible range
      currentStart = currFrame
      currentEnd = currFrame
    } else {
      // Continuous, extend current range
      currentEnd = currFrame
    }
  }

  // Close final visible range
  ranges.push({
    startFrame: currentStart,
    endFrame: currentEnd,
    visible: true,
  })

  return ranges
}

/**
 * Create linear interpolation segments between all keyframes.
 * Each pair of adjacent keyframes gets a linear interpolation segment.
 *
 * @param boxes - Sorted array of keyframe bounding boxes
 * @returns Array of interpolation segments
 */
export function createInterpolationSegments(
  boxes: BoundingBox[]
): InterpolationSegment[] {
  const segments: InterpolationSegment[] = []

  for (let i = 0; i < boxes.length - 1; i++) {
    segments.push({
      startFrame: boxes[i].frameNumber,
      endFrame: boxes[i + 1].frameNumber,
      type: 'linear',
    })
  }

  return segments
}

/**
 * Decimate keyframes to reduce sequence size.
 * Keep every Nth frame to make manual refinement manageable.
 * Always keeps first and last frame.
 * Recomputes interpolation segments for decimated keyframes.
 *
 * @param sequence - Full tracked sequence
 * @param keepEveryN - Keep every Nth keyframe (e.g., 5 = keep frames 0, 5, 10, ...)
 * @returns Decimated sequence with fewer keyframes
 */
export function decimateKeyframes(
  sequence: BoundingBoxSequence,
  keepEveryN: number
): BoundingBoxSequence {
  if (keepEveryN <= 1 || sequence.boxes.length <= 2) {
    // No decimation needed
    return sequence
  }

  const decimatedBoxes: BoundingBox[] = []

  // Always keep first frame
  decimatedBoxes.push(sequence.boxes[0])

  // Keep every Nth frame (skip first since we already added it)
  for (let i = keepEveryN; i < sequence.boxes.length - 1; i += keepEveryN) {
    decimatedBoxes.push(sequence.boxes[i])
  }

  // Always keep last frame (if not already added)
  const lastBox = sequence.boxes[sequence.boxes.length - 1]
  if (decimatedBoxes[decimatedBoxes.length - 1].frameNumber !== lastBox.frameNumber) {
    decimatedBoxes.push(lastBox)
  }

  // Recompute interpolation segments for decimated boxes
  const newInterpolationSegments = createInterpolationSegments(decimatedBoxes)

  // Update visibility ranges if needed (should still be valid)
  // Visibility ranges are based on frame gaps, not keyframe positions

  // Calculate new interpolated frame count
  const totalFrames = lastBox.frameNumber - sequence.boxes[0].frameNumber + 1
  const interpolatedFrames = totalFrames - decimatedBoxes.length

  return {
    ...sequence,
    boxes: decimatedBoxes,
    interpolationSegments: newInterpolationSegments,
    keyframeCount: decimatedBoxes.length,
    interpolatedFrameCount: interpolatedFrames,
    totalFrames,
  }
}

/**
 * Calculate optimal decimation factor based on sequence length.
 * Aims to reduce sequences to ~30-50 keyframes for manageable editing.
 *
 * @param totalKeyframes - Total number of keyframes in sequence
 * @returns Recommended decimation factor
 */
export function calculateOptimalDecimation(totalKeyframes: number): number {
  const targetKeyframes = 40 // Aim for ~40 keyframes after decimation

  if (totalKeyframes <= targetKeyframes) {
    return 1 // No decimation needed
  }

  // Calculate factor to get close to target
  const factor = Math.ceil(totalKeyframes / targetKeyframes)

  // Cap at reasonable maximum
  return Math.min(factor, 20)
}
