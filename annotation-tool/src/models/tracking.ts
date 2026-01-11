/**
 * @interface TrackFrame
 * @description Single frame in a tracking result with bounding box and optional mask.
 * Represents one detection from an automated tracking model.
 *
 * @remarks
 * TrackFrames are produced by computer vision tracking models (SAMURAI, SAM2, YOLO, etc.)
 * and can be converted to annotation bounding boxes.
 */
export interface TrackFrame {
  /** Frame number in the video sequence */
  frameNumber: number
  /** Bounding box coordinates */
  box: {
    /** X coordinate of top-left corner */
    x: number
    /** Y coordinate of top-left corner */
    y: number
    /** Width of bounding box */
    width: number
    /** Height of bounding box */
    height: number
  }
  /** Segmentation mask as 2D array (optional, for models that support it) */
  mask?: number[][]
  /** Model's confidence score for this detection (0-1) */
  confidence: number
  /** Whether the object is partially or fully occluded in this frame */
  occluded: boolean
}

/**
 * @interface TrackingResult
 * @description Result from an automated tracking model for a single tracked object.
 * Contains all frames where the object was detected/tracked.
 *
 * @remarks
 * A single tracking operation can produce multiple TrackingResults if
 * multiple objects are being tracked (e.g., YOLO detecting multiple people).
 *
 * @example
 * ```typescript
 * const track: TrackingResult = {
 *   trackId: 1,
 *   label: 'person',
 *   confidence: 0.95,
 *   model: 'yolo11seg',
 *   frames: [
 *     { frameNumber: 0, box: { x: 100, y: 100, width: 50, height: 120 }, confidence: 0.98, occluded: false },
 *     { frameNumber: 1, box: { x: 102, y: 101, width: 50, height: 120 }, confidence: 0.97, occluded: false }
 *   ]
 * };
 * ```
 */
export interface TrackingResult {
  /** Unique identifier for this track (can be string or number depending on model) */
  trackId: string | number
  /** Object class label (e.g., "person", "car", "dog") */
  label: string
  /** Overall tracking confidence score (0-1) */
  confidence: number
  /** Name of the tracking model used */
  model: string
  /** Array of tracked frames with bounding boxes */
  frames: TrackFrame[]
}

/**
 * @interface TrackingResponse
 * @description Response from the tracking API endpoint.
 * Contains all tracking results and performance metrics.
 */
export interface TrackingResponse {
  /** Whether the tracking operation completed successfully */
  success: boolean
  /** Array of tracking results for all detected/tracked objects */
  tracks: TrackingResult[]
  /** Time taken to process the tracking request (in milliseconds) */
  processingTimeMs: number
}
