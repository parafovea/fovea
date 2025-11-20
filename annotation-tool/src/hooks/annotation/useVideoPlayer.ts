import { useEffect, useRef, useState, useCallback } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import { VideoMetadata } from '../../models/types'

export interface UseVideoPlayerOptions {
  videoId: string | undefined
  videoMetadata: VideoMetadata | null
  onTimeUpdate?: (time: number) => void
  onFrameChange?: (frame: number) => void
  onDurationChange?: (duration: number) => void
  onPlayingChange?: (isPlaying: boolean) => void
}

export interface UseVideoPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement>
  playerRef: React.RefObject<Player | null>
  isPlaying: boolean
  currentTime: number
  duration: number
  currentFrame: number
  totalFrames: number
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
 * Custom hook for managing video.js player state and controls.
 * Handles player initialization, playback controls, frame navigation, and time formatting.
 *
 * @param options - Configuration options for the video player
 * @returns Video player state and control functions
 *
 * @example
 * ```tsx
 * const {
 *   videoRef,
 *   playerRef,
 *   currentTime,
 *   handlePlayPause,
 *   handleSeek
 * } = useVideoPlayer({
 *   videoId: 'video-123',
 *   videoMetadata: videoData,
 *   onTimeUpdate: (time) => console.log('Time:', time)
 * })
 * ```
 */
export function useVideoPlayer(options: UseVideoPlayerOptions): UseVideoPlayerReturn {
  const {
    videoId,
    videoMetadata,
    onTimeUpdate,
    onFrameChange,
    onDurationChange,
    onPlayingChange,
  } = options

  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<Player | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)

  /**
   * Formats video time in seconds to MM:SS.CS display format.
   * Converts decimal seconds to minutes, seconds, and centiseconds.
   */
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }, [])

  /**
   * Toggles video playback between play and pause states.
   */
  const handlePlayPause = useCallback(() => {
    if (!playerRef.current) return
    if (isPlaying) {
      playerRef.current.pause()
    } else {
      playerRef.current.play()
    }
  }, [isPlaying])

  /**
   * Seeks video to a specific time position.
   */
  const handleSeek = useCallback((time: number) => {
    if (!playerRef.current) return
    playerRef.current.currentTime(time)
  }, [])

  /**
   * Advances video by one frame based on video FPS.
   */
  const handleNextFrame = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const fps = videoMetadata?.fps || 30
    const current = player.currentTime() ?? 0
    player.currentTime(current + 1/fps)
  }, [videoMetadata?.fps])

  /**
   * Rewinds video by one frame based on video FPS.
   */
  const handlePrevFrame = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const fps = videoMetadata?.fps || 30
    const current = player.currentTime() ?? 0
    player.currentTime(Math.max(0, current - 1/fps))
  }, [videoMetadata?.fps])

  /**
   * Advances video by 10 frames based on video FPS.
   */
  const handleNextFrame10 = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const fps = videoMetadata?.fps || 30
    const current = player.currentTime() ?? 0
    player.currentTime(current + 10/fps)
  }, [videoMetadata?.fps])

  /**
   * Rewinds video by 10 frames based on video FPS.
   */
  const handlePrevFrame10 = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const fps = videoMetadata?.fps || 30
    const current = player.currentTime() ?? 0
    player.currentTime(Math.max(0, current - 10/fps))
  }, [videoMetadata?.fps])

  /**
   * Jumps video to the start.
   */
  const handleJumpToStart = useCallback(() => {
    if (!playerRef.current) return
    playerRef.current.currentTime(0)
  }, [])

  /**
   * Jumps video to the end.
   */
  const handleJumpToEnd = useCallback(() => {
    if (!playerRef.current) return
    playerRef.current.currentTime(duration)
  }, [duration])

  // Initialize video.js player
  useEffect(() => {
    if (!videoRef.current || !videoId || !videoMetadata?.path) return

    // Clean up any existing player
    if (playerRef.current) {
      playerRef.current.dispose()
      playerRef.current = null
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      if (!videoRef.current || !videoMetadata?.path) return

      // Initialize video.js player with video source
      // Always use backend streaming endpoint (supports local, S3, and hybrid storage)
      const videoSrc = `/api/videos/${videoId}/stream`

      const player = videojs(videoRef.current, {
        controls: false,
        autoplay: false,
        preload: 'auto',
        fluid: false,
        fill: true,
        sources: [{
          src: videoSrc,
          type: 'video/mp4'
        }]
      })

      playerRef.current = player

      player.ready(() => {
        // Ensure the video element is visible
        const videoEl = player.el().querySelector('video')
        if (videoEl) {
          videoEl.style.display = 'block'
          videoEl.style.visibility = 'visible'
        }
      })

      player.on('loadedmetadata', () => {
        const newDuration = player.duration() ?? 0
        setDuration(newDuration)
        if (onDurationChange) {
          onDurationChange(newDuration)
        }
      })

      player.on('timeupdate', () => {
        const newTime = player.currentTime() ?? 0
        setCurrentTime(newTime)
        if (onTimeUpdate) {
          onTimeUpdate(newTime)
        }
      })

      player.on('play', () => {
        setIsPlaying(true)
        if (onPlayingChange) {
          onPlayingChange(true)
        }
      })

      player.on('pause', () => {
        setIsPlaying(false)
        if (onPlayingChange) {
          onPlayingChange(false)
        }
      })

      player.on('error', () => {
        console.error('Video player error:', player.error())
      })
    }, 100)

    return () => {
      clearTimeout(timer)
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
  }, [videoId, videoMetadata, onTimeUpdate, onDurationChange, onPlayingChange])

  // Calculate total frames when duration and fps are available
  useEffect(() => {
    if (duration) {
      // Default to 30 FPS if not provided in metadata
      const fps = videoMetadata?.fps || 30
      const frames = Math.floor(duration * fps)
      setTotalFrames(frames)
    }
  }, [duration, videoMetadata?.fps])

  // Sync currentFrame with video currentTime
  useEffect(() => {
    // Default to 30 FPS if not provided in metadata
    const fps = videoMetadata?.fps || 30
    const frame = Math.floor(currentTime * fps)
    setCurrentFrame(frame)
    if (onFrameChange) {
      onFrameChange(frame)
    }
  }, [currentTime, videoMetadata?.fps, onFrameChange])

  return {
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
  }
}
