import React, { forwardRef, useEffect, useImperativeHandle } from 'react'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'
import { VideoMetadata } from '@models/types'
import { useVideoPlayer } from '@hooks/annotation/useVideoPlayer'

export interface VideoPlayerProps {
  videoId: string | undefined
  videoMetadata: VideoMetadata | null
  onTimeUpdate?: (time: number) => void
  onFrameChange?: (frame: number) => void
  onDurationChange?: (duration: number) => void
  onPlayingChange?: (isPlaying: boolean) => void
  /**
   * Callback fired with the underlying ``<video>`` element once it has been
   * attached to the DOM (and again with ``null`` when it unmounts).
   *
   * Consumers that need to render an overlay positioned over the video
   * element should track this in component state rather than reading
   * ``videoRef.current`` directly — refs do not trigger re-renders, so
   * conditional rendering keyed on ``videoRef.current`` would only flip on
   * unrelated state updates.
   */
  onVideoElementChange?: (element: HTMLVideoElement | null) => void
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
      onVideoElementChange,
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

    // Notify the parent once the underlying <video> element is attached to
    // the DOM, so consumers can render overlays in response to a real state
    // change (refs don't trigger re-renders). Fires with null on unmount.
    useEffect(() => {
      if (!onVideoElementChange) return
      onVideoElementChange(videoRef.current)
      return () => onVideoElementChange(null)
    }, [onVideoElementChange, videoRef])

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
      <div className="relative flex-grow bg-black min-h-0" data-tour-id="video-player-scrubber">
        <div className="annotation-video-container" data-tour-id="drawing-canvas">
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
      </div>
    )
  }
)
