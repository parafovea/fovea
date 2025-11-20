import React, { forwardRef, useImperativeHandle } from 'react'
import { Box } from '@mui/material'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'
import { VideoMetadata } from '../../models/types'
import { useVideoPlayer } from '../../hooks/annotation/useVideoPlayer'

export interface VideoPlayerProps {
  videoId: string | undefined
  videoMetadata: VideoMetadata | null
  onTimeUpdate?: (time: number) => void
  onFrameChange?: (frame: number) => void
  onDurationChange?: (duration: number) => void
  onPlayingChange?: (isPlaying: boolean) => void
  children?: React.ReactNode
}

export interface VideoPlayerHandle {
  playerRef: React.RefObject<Player | null>
  videoRef: React.RefObject<HTMLVideoElement>
  currentTime: number
  duration: number
  currentFrame: number
  totalFrames: number
  isPlaying: boolean
  handlePlayPause: () => void
  handleSeek: (time: number) => void
  handleNextFrame: () => void
  handlePrevFrame: () => void
  handleJumpToStart: () => void
  handleJumpToEnd: () => void
  handleNextFrame10: () => void
  handlePrevFrame10: () => void
  formatTime: (seconds: number) => string
}

/**
 * Video player component using video.js for video playback and frame-accurate navigation.
 * Provides controls for play/pause, seeking, and frame stepping.
 *
 * @example
 * ```tsx
 * const playerHandleRef = useRef<VideoPlayerHandle>(null)
 *
 * <VideoPlayer
 *   ref={playerHandleRef}
 *   videoId={videoId}
 *   videoMetadata={videoMetadata}
 *   onTimeUpdate={(time) => console.log('Time:', time)}
 *   onFrameChange={(frame) => console.log('Frame:', frame)}
 * >
 *   <AnnotationOverlay videoElement={...} />
 * </VideoPlayer>
 * ```
 */
export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(props, ref) {
    const {
      videoId,
      videoMetadata,
      onTimeUpdate,
      onFrameChange,
      onDurationChange,
      onPlayingChange,
      children,
    } = props

    const {
      videoRef,
      playerRef,
      isPlaying,
      currentTime,
      duration,
      currentFrame,
      totalFrames,
      handlePlayPause,
      handleSeek,
      handleNextFrame,
      handlePrevFrame,
      handleJumpToStart,
      handleJumpToEnd,
      handleNextFrame10,
      handlePrevFrame10,
      formatTime,
    } = useVideoPlayer({
      videoId,
      videoMetadata,
      onTimeUpdate,
      onFrameChange,
      onDurationChange,
      onPlayingChange,
    })

    // Expose player control methods via ref for parent component access
    useImperativeHandle(ref, () => ({
      playerRef,
      videoRef,
      currentTime,
      duration,
      currentFrame,
      totalFrames,
      isPlaying,
      handlePlayPause,
      handleSeek,
      handleNextFrame,
      handlePrevFrame,
      handleJumpToStart,
      handleJumpToEnd,
      handleNextFrame10,
      handlePrevFrame10,
      formatTime,
    }), [
      playerRef,
      videoRef,
      currentTime,
      duration,
      currentFrame,
      totalFrames,
      isPlaying,
      handlePlayPause,
      handleSeek,
      handleNextFrame,
      handlePrevFrame,
      handleJumpToStart,
      handleJumpToEnd,
      handleNextFrame10,
      handlePrevFrame10,
      formatTime,
    ])

    return (
      <Box sx={{ position: 'relative', flexGrow: 1, bgcolor: 'black', minHeight: 0 }}>
        <div className="annotation-video-container">
          <video
            ref={videoRef}
            className="video-js vjs-big-play-centered vjs-fluid vjs-default-skin"
            playsInline
            muted={false}
            preload="auto"
            aria-label="Video being annotated"
          >
            <p className="vjs-no-js">
              To view this video please enable JavaScript, and consider upgrading to a web browser that supports HTML5 video
            </p>
          </video>
        </div>
        {children}
      </Box>
    )
  }
)
