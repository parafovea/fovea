/**
 * TanStack Query hook for audio transcription.
 *
 * Wraps the synchronous /api/videos/:videoId/transcribe forwarder
 * around the model-service's faster-whisper backend.
 */

import {
  useMutation,
  UseMutationOptions,
} from '@tanstack/react-query'
import {
  apiClient,
  ApiError,
  TranscribeRequest,
  TranscribeResponse,
} from '@api/client'

export function useTranscribeVideo(
  options?: UseMutationOptions<TranscribeResponse, ApiError, TranscribeRequest>
) {
  return useMutation<TranscribeResponse, ApiError, TranscribeRequest>({
    mutationFn: (request) => apiClient.transcribeVideo(request),
    ...options,
  })
}
