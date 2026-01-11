import type { GlossItem } from './gloss'

/**
 * @interface VideoFormat
 * @description Represents an available format/quality option for a video.
 * Used when videos have multiple streaming options (different resolutions, codecs).
 */
export interface VideoFormat {
  /** URL to access this format */
  url: string
  /** Unique identifier for this format (e.g., "720p", "1080p60") */
  format_id: string
  /** Human-readable description of the format */
  format_note?: string
  /** Video width in pixels */
  width?: number
  /** Video height in pixels */
  height?: number
  /** File extension (e.g., "mp4", "webm") */
  ext?: string
  /** Streaming protocol (e.g., "https", "m3u8") */
  protocol?: string
  /** Resolution string (e.g., "1920x1080") */
  resolution?: string
  /** Total bitrate in kbps */
  tbr?: number
}

/**
 * @interface VideoMetadata
 * @description Complete metadata for a video in the annotation system.
 * Includes technical details, source information, and available formats.
 *
 * @remarks
 * VideoMetadata is the primary data structure for videos. It combines
 * technical information (dimensions, duration, fps) with source metadata
 * (uploader, tags, descriptions) and storage information (file paths, URLs).
 *
 * @example
 * ```typescript
 * const video: VideoMetadata = {
 *   id: 'video-123',
 *   title: 'Example Video',
 *   description: 'A sample video for annotation',
 *   duration: 120.5,
 *   width: 1920,
 *   height: 1080,
 *   fps: 30,
 *   filePath: '/videos/example.mp4',
 *   path: 'https://storage.example.com/videos/example.mp4'
 * };
 * ```
 */
export interface VideoMetadata {
  /** Unique identifier for the video */
  id: string
  /** Original filename (if imported from file) */
  filename?: string
  /** Display title for the video */
  title: string
  /** Text description of the video content */
  description: string
  /** Duration in seconds */
  duration: number
  /** Video width in pixels */
  width: number
  /** Video height in pixels */
  height: number
  /** Frames per second */
  fps?: number
  /** Video format/codec information */
  format?: string
  /** Name of the uploader/creator */
  uploader?: string
  /** Unique ID of the uploader on the source platform */
  uploaderId?: string
  /** URL to the uploader's profile/channel */
  uploaderUrl?: string
  /** Upload date (YYYYMMDD format) */
  uploadDate?: string
  /** Unix timestamp of upload */
  timestamp?: number
  /** Tags/keywords associated with the video */
  tags?: string[]
  /** URL to thumbnail image */
  thumbnail?: string
  /** Available thumbnail images at different sizes */
  thumbnails?: Array<{
    /** Thumbnail URL */
    url: string
    /** Thumbnail width in pixels */
    width: number
    /** Thumbnail height in pixels */
    height: number
  }>
  /** Local file system path (for imported videos) */
  filePath: string
  /** Playback URL (S3 URL, CDN URL, or local file path) */
  path: string
  /** Available quality/format options */
  formats?: VideoFormat[]
  /** Original webpage URL (for videos imported from web) */
  webpageUrl?: string
  /** Channel/creator ID on source platform */
  channelId?: string
  /** Number of likes on source platform */
  likeCount?: number
  /** Number of reposts/shares on source platform */
  repostCount?: number
  /** Number of comments on source platform */
  commentCount?: number
}

/**
 * @interface VideoSummary
 * @description A persona's summary of a video's content.
 * Summaries are written from a specific persona's perspective and can
 * contain rich text with references to ontology types and world objects.
 *
 * @remarks
 * Video summaries are the primary input for claim extraction.
 * They capture what a persona considers important about a video's content.
 */
export interface VideoSummary {
  /** Unique identifier for the summary */
  id: string
  /** ID of the video being summarized */
  videoId: string
  /** ID of the persona who wrote this summary */
  personaId: string
  /** Rich text summary with optional references */
  summary: GlossItem[]
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
  /** ID of the user who created this summary */
  createdBy?: string
}
