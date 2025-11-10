/**
 * Type definitions for audio transcription and video summary components.
 */

/**
 * Fusion strategy for combining audio and visual analysis.
 */
export type FusionStrategy =
  | 'sequential'
  | 'timestampAligned'
  | 'nativeMultimodal'
  | 'hybrid'

/**
 * Configuration options for audio processing during video summarization.
 */
export interface AudioConfig {
  /** Enable audio transcription. */
  enableAudio: boolean
  /** Enable speaker diarization (requires audio transcription). */
  enableSpeakerDiarization: boolean
  /** Strategy for combining audio and visual analysis. */
  fusionStrategy: FusionStrategy
  /** Optional ISO language code (e.g., 'en', 'es', 'fr'). If not provided, language is auto-detected. */
  audioLanguage?: string
}

/**
 * Individual transcript segment with timing and speaker information.
 */
export interface TranscriptSegment {
  /** Start time in seconds. */
  start: number
  /** End time in seconds. */
  end: number
  /** Transcribed text for this segment. */
  text: string
  /** Speaker identifier (e.g., "Speaker 1", "Speaker 2"). Null if speaker diarization not enabled. */
  speaker?: string | null
  /** Confidence score for this segment (0-1). */
  confidence: number
  /** Optional sentiment analysis data. */
  sentiment?: any
}

/**
 * Complete transcript structure with segments and metadata.
 */
export interface TranscriptJson {
  /** Array of transcript segments with timing and text. */
  segments: TranscriptSegment[]
  /** Array of speaker identifiers detected in the transcript. */
  speakers?: string[]
  /** Detected language ISO code. */
  language?: string
}
