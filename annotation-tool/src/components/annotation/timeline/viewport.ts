/**
 * Viewport math for the timeline ruler and track surface.
 *
 * Every position-dependent primitive (Ruler, Playhead, KeyframeMarker,
 * InterpolationSegment) derives its layout from one of the helpers below.
 * Keeping the math pure means primitives re-render cheaply and tests can
 * assert positioning without mounting the component tree.
 */

import type { TimelineViewport } from './types'

/** Baseline pixels-per-frame at ``zoom === 1``. */
export const BASE_PIXELS_PER_FRAME = 10

/** Upper bound on how far the user may zoom. */
export const MAX_ZOOM = 32

/**
 * Compute a zoom level that fits the entire video in the given container.
 * Returned as an inclusive lower bound on the zoom slider so users can
 * never create whitespace past the tail of the video.
 */
export function computeMinZoom(totalFrames: number, containerWidth: number): number {
  if (totalFrames <= 0 || containerWidth <= 0) return 0.1
  return containerWidth / (totalFrames * BASE_PIXELS_PER_FRAME)
}

/**
 * Clamp a zoom value to the viable ``[minZoom, MAX_ZOOM]`` range.
 *
 * The minZoom floor is the same value :func:`computeMinZoom` returns, so
 * scrolling past "fit-to-window" is a no-op rather than a jump.
 */
export function clampZoom(zoom: number, minZoom: number): number {
  if (zoom < minZoom) return minZoom
  if (zoom > MAX_ZOOM) return MAX_ZOOM
  return zoom
}

/**
 * Given the viewport and a frame, return its horizontal position in px
 * relative to the track surface origin.
 */
export function frameToX(frame: number, viewport: TimelineViewport): number {
  return (frame - viewport.startFrame) * viewport.pixelsPerFrame
}

/**
 * Convert a pixel x (in track-surface space) back to its nearest frame.
 * Rounds to the nearest integer frame — callers that want to clamp to
 * valid frame bounds should do so explicitly.
 */
export function xToFrame(x: number, viewport: TimelineViewport): number {
  return Math.round(viewport.startFrame + x / viewport.pixelsPerFrame)
}

/**
 * Tick density. Returns the interval (in frames) at which major ticks
 * appear given the current zoom, computed from a canonical breakpoint
 * table that keeps roughly 80–120px between labels across zoom levels.
 */
export function getMajorTickInterval(zoom: number, fps: number): number {
  if (zoom >= 16) return 1
  if (zoom >= 8) return Math.max(1, Math.floor(fps / 10)) || 1
  if (zoom >= 4) return Math.max(1, Math.floor(fps / 4)) || 1
  if (zoom >= 2) return fps
  if (zoom >= 1) return fps * 5
  if (zoom >= 0.5) return fps * 10
  if (zoom >= 0.2) return fps * 30
  if (zoom >= 0.1) return fps * 60
  return fps * 300
}

/**
 * Minor tick interval. Derived from the major interval so minor ticks
 * always divide a major segment evenly.
 */
export function getMinorTickInterval(majorInterval: number): number {
  if (majorInterval <= 1) return 1
  return Math.max(1, Math.floor(majorInterval / 5))
}

/**
 * Iterate the (integer) frames that need a tick mark in the current
 * viewport and return them with a flag indicating major vs. minor.
 *
 * The returned array is already clipped to ``[startFrame, endFrame]`` so
 * the Ruler can render it directly.
 */
export function computeTicks(
  viewport: TimelineViewport,
  fps: number,
): Array<{ frame: number; isMajor: boolean }> {
  const major = getMajorTickInterval(viewport.zoom, fps)
  const minor = getMinorTickInterval(major)
  const out: Array<{ frame: number; isMajor: boolean }> = []
  const start = Math.max(0, viewport.startFrame)
  for (let frame = start; frame <= viewport.endFrame; frame += 1) {
    if (frame % major === 0) {
      out.push({ frame, isMajor: true })
    } else if (frame % minor === 0) {
      out.push({ frame, isMajor: false })
    }
  }
  return out
}

/**
 * Build a viewport that centers the ``currentFrame`` in the container,
 * clamped so the visible window never extends past ``[0, totalFrames-1]``.
 */
export function computeViewport(params: {
  currentFrame: number
  totalFrames: number
  containerWidth: number
  zoom: number
}): TimelineViewport {
  const { currentFrame, totalFrames, containerWidth, zoom } = params
  const minZoom = computeMinZoom(totalFrames, containerWidth)
  const clampedZoom = clampZoom(zoom, minZoom)
  const pixelsPerFrame = clampedZoom * BASE_PIXELS_PER_FRAME
  const visibleFrames = Math.max(1, Math.floor(containerWidth / pixelsPerFrame))
  const half = Math.floor(visibleFrames / 2)
  let startFrame = currentFrame - half
  let endFrame = currentFrame + (visibleFrames - half)
  if (startFrame < 0) {
    startFrame = 0
    endFrame = Math.min(totalFrames - 1, visibleFrames)
  }
  if (endFrame >= totalFrames) {
    endFrame = Math.max(0, totalFrames - 1)
    startFrame = Math.max(0, endFrame - visibleFrames)
  }
  return {
    startFrame,
    endFrame,
    pixelsPerFrame,
    containerWidth,
    zoom: clampedZoom,
    minZoom,
    maxZoom: MAX_ZOOM,
  }
}

/**
 * Compute a new zoom centered on ``anchorFrame`` so the frame under the
 * mouse cursor stays put while the user wheel-zooms.
 *
 * Returns the new zoom only; the caller re-runs :func:`computeViewport`.
 */
export function zoomTowardsFrame(params: {
  currentZoom: number
  delta: number
  minZoom: number
}): number {
  const { currentZoom, delta, minZoom } = params
  // Exponential zoom: each delta unit is a 10% change so small wheel ticks
  // feel linear at any base zoom level.
  const factor = Math.pow(1.001, -delta)
  const next = currentZoom * factor
  return clampZoom(next, minZoom)
}

/**
 * Snap a candidate frame to the nearest keyframe within ``radiusFrames``.
 * Returns the snapped frame or the input unchanged if no keyframe is close.
 */
export function snapToKeyframe(
  candidate: number,
  keyframes: readonly number[],
  radiusFrames: number,
): number {
  if (keyframes.length === 0 || radiusFrames <= 0) return candidate
  let bestFrame = candidate
  let bestDistance = radiusFrames + 1
  for (const kf of keyframes) {
    const distance = Math.abs(kf - candidate)
    if (distance <= radiusFrames && distance < bestDistance) {
      bestFrame = kf
      bestDistance = distance
    }
  }
  return bestFrame
}
