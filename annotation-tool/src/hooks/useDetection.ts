/**
 * TanStack Query hook for object detection operations.
 * Provides declarative data fetching for video object detection.
 */

import {
  useMutation,
  UseMutationOptions,
} from '@tanstack/react-query'
import {
  apiClient,
  DetectionRequest,
  DetectionResponse,
  ApiError,
} from '../api/client'

/**
 * Mutation hook for detecting objects in video frames.
 * Processes video frames and returns detected objects with bounding boxes.
 *
 * @param options - TanStack Mutation options
 * @returns Mutation result with detect function
 *
 * @example
 * ```tsx
 * const detectMutation = useDetectObjects({
 *   onSuccess: (data) => {
 *     console.log(`Found ${data.total_detections} objects`)
 *   }
 * })
 *
 * // Trigger detection
 * detectMutation.mutate({
 *   videoId: 'video-123',
 *   query: 'person wearing red shirt',
 *   confidenceThreshold: 0.5
 * })
 * ```
 */
export function useDetectObjects(
  options?: UseMutationOptions<DetectionResponse, ApiError, DetectionRequest>
) {
  return useMutation<DetectionResponse, ApiError, DetectionRequest>({
    mutationFn: (request) => apiClient.detectObjects(request),
    ...options,
  })
}
