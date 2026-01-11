/**
 * @file coordinates.ts
 * @description Utility functions for coordinate transformations between
 * video pixel space, normalized space, and SVG display space.
 */

import { BoundingBox } from '@models/types'

/**
 * Video dimensions for coordinate transformations.
 */
export interface VideoDimensions {
  width: number
  height: number
}

/**
 * Container dimensions for display coordinate transformations.
 */
export interface ContainerDimensions {
  width: number
  height: number
}

/**
 * Normalized bounding box coordinates (0-1 range).
 * Used for resolution-independent positioning.
 */
export interface NormalizedBoundingBox {
  /** X coordinate as fraction of video width (0-1) */
  nx: number
  /** Y coordinate as fraction of video height (0-1) */
  ny: number
  /** Width as fraction of video width (0-1) */
  nw: number
  /** Height as fraction of video height (0-1) */
  nh: number
  frameNumber: number
  confidence?: number
  isKeyframe?: boolean
  metadata?: Record<string, unknown>
}

/**
 * Convert pixel coordinates to normalized coordinates (0-1).
 *
 * @param box - Bounding box in pixel coordinates
 * @param dimensions - Video dimensions
 * @returns Normalized bounding box
 */
export function pixelToNormalized(
  box: BoundingBox,
  dimensions: VideoDimensions
): NormalizedBoundingBox {
  return {
    nx: box.x / dimensions.width,
    ny: box.y / dimensions.height,
    nw: box.width / dimensions.width,
    nh: box.height / dimensions.height,
    frameNumber: box.frameNumber,
    confidence: box.confidence,
    isKeyframe: box.isKeyframe,
    metadata: box.metadata,
  }
}

/**
 * Convert normalized coordinates (0-1) to pixel coordinates.
 *
 * @param box - Normalized bounding box
 * @param dimensions - Video dimensions
 * @returns Bounding box in pixel coordinates
 */
export function normalizedToPixel(
  box: NormalizedBoundingBox,
  dimensions: VideoDimensions
): BoundingBox {
  return {
    x: box.nx * dimensions.width,
    y: box.ny * dimensions.height,
    width: box.nw * dimensions.width,
    height: box.nh * dimensions.height,
    frameNumber: box.frameNumber,
    confidence: box.confidence,
    isKeyframe: box.isKeyframe,
    metadata: box.metadata,
  }
}

/**
 * Check if coordinates appear to be normalized (0-1 range).
 * Pixel coordinates are typically > 1 for any reasonable video size.
 *
 * @param box - Bounding box to check
 * @returns true if coordinates appear normalized
 */
export function isNormalized(box: BoundingBox): boolean {
  return box.x <= 1 && box.y <= 1 && box.width <= 1 && box.height <= 1
}

/**
 * Ensure box is in normalized coordinates, converting if necessary.
 *
 * @param box - Bounding box (pixel or normalized)
 * @param dimensions - Video dimensions for conversion
 * @returns Normalized bounding box
 */
export function ensureNormalized(
  box: BoundingBox,
  dimensions: VideoDimensions
): NormalizedBoundingBox {
  if (isNormalized(box)) {
    return {
      nx: box.x,
      ny: box.y,
      nw: box.width,
      nh: box.height,
      frameNumber: box.frameNumber,
      confidence: box.confidence,
      isKeyframe: box.isKeyframe,
      metadata: box.metadata,
    }
  }
  return pixelToNormalized(box, dimensions)
}

/**
 * Calculate the display rect for a video with preserveAspectRatio="xMidYMid meet".
 * When a video is letterboxed or pillarboxed, this returns the actual video area.
 *
 * @param video - Video native dimensions
 * @param container - Container dimensions
 * @returns The display rect where the video content is rendered
 */
export function calculateVideoDisplayRect(
  video: VideoDimensions,
  container: ContainerDimensions
): { x: number; y: number; width: number; height: number } {
  const videoAspect = video.width / video.height
  const containerAspect = container.width / container.height

  let displayWidth: number
  let displayHeight: number
  let offsetX: number
  let offsetY: number

  if (videoAspect > containerAspect) {
    // Video is wider than container - letterbox (black bars top/bottom)
    displayWidth = container.width
    displayHeight = container.width / videoAspect
    offsetX = 0
    offsetY = (container.height - displayHeight) / 2
  } else {
    // Video is taller than container - pillarbox (black bars left/right)
    displayHeight = container.height
    displayWidth = container.height * videoAspect
    offsetX = (container.width - displayWidth) / 2
    offsetY = 0
  }

  return {
    x: offsetX,
    y: offsetY,
    width: displayWidth,
    height: displayHeight,
  }
}

/**
 * Convert screen coordinates (from mouse event) to video pixel coordinates.
 * Accounts for letterboxing/pillarboxing when video doesn't fill container.
 *
 * @param screenX - Screen X coordinate relative to container
 * @param screenY - Screen Y coordinate relative to container
 * @param container - Container dimensions
 * @param video - Video native dimensions
 * @returns Video pixel coordinates, or null if outside video area
 */
export function screenToVideoPixel(
  screenX: number,
  screenY: number,
  container: ContainerDimensions,
  video: VideoDimensions
): { x: number; y: number } | null {
  const displayRect = calculateVideoDisplayRect(video, container)

  // Check if point is within video area
  if (
    screenX < displayRect.x ||
    screenX > displayRect.x + displayRect.width ||
    screenY < displayRect.y ||
    screenY > displayRect.y + displayRect.height
  ) {
    return null
  }

  // Convert to video coordinates
  const relativeX = screenX - displayRect.x
  const relativeY = screenY - displayRect.y
  const videoX = (relativeX / displayRect.width) * video.width
  const videoY = (relativeY / displayRect.height) * video.height

  return { x: videoX, y: videoY }
}

/**
 * Convert video pixel coordinates to screen coordinates.
 * Accounts for letterboxing/pillarboxing when video doesn't fill container.
 *
 * @param videoX - Video X coordinate in pixels
 * @param videoY - Video Y coordinate in pixels
 * @param container - Container dimensions
 * @param video - Video native dimensions
 * @returns Screen coordinates relative to container
 */
export function videoPixelToScreen(
  videoX: number,
  videoY: number,
  container: ContainerDimensions,
  video: VideoDimensions
): { x: number; y: number } {
  const displayRect = calculateVideoDisplayRect(video, container)

  const screenX = displayRect.x + (videoX / video.width) * displayRect.width
  const screenY = displayRect.y + (videoY / video.height) * displayRect.height

  return { x: screenX, y: screenY }
}

/**
 * Calculate the scale factor between video and display dimensions.
 * Useful for determining if labels or handles need size adjustments.
 *
 * @param video - Video native dimensions
 * @param container - Container dimensions
 * @returns Scale factor (display size / video size)
 */
export function getDisplayScale(
  video: VideoDimensions,
  container: ContainerDimensions
): number {
  const displayRect = calculateVideoDisplayRect(video, container)
  return displayRect.width / video.width
}
