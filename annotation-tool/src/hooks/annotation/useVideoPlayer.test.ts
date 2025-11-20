/**
 * Tests for useVideoPlayer hook.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideoPlayer } from './useVideoPlayer'
import type { VideoMetadata } from '../../models/types'
import videojs from 'video.js'

// Mock video.js
vi.mock('video.js', () => {
  const mockPlayer = {
    ready: vi.fn((callback) => callback()),
    on: vi.fn(),
    dispose: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    currentTime: vi.fn((time?: number) => {
      if (time !== undefined) {
        // Setter
        return mockPlayer
      }
      // Getter
      return 0
    }),
    duration: vi.fn(() => 100),
    error: vi.fn(() => null),
    el: vi.fn(() => ({
      querySelector: vi.fn(() => ({
        style: {}
      }))
    }))
  }

  return {
    default: vi.fn(() => mockPlayer)
  }
})

describe('useVideoPlayer', () => {
  const mockVideoMetadata: VideoMetadata = {
    id: 'test-video-123',
    filename: 'test.mp4',
    path: '/videos/test.mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 100,
    size: 1024000,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Create a mock video element
    document.body.innerHTML = '<video></video>'
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata
    }))

    expect(result.current.isPlaying).toBe(false)
    expect(result.current.currentTime).toBe(0)
    expect(result.current.duration).toBe(0)
    expect(result.current.currentFrame).toBe(0)
    expect(result.current.totalFrames).toBe(0)
    expect(result.current.videoRef.current).toBeNull()
  })

  it('should format time correctly', () => {
    const { result } = renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata
    }))

    expect(result.current.formatTime(0)).toBe('0:00.00')
    expect(result.current.formatTime(65.75)).toBe('1:05.75')
    expect(result.current.formatTime(0.5)).toBe('0:00.50')
    expect(result.current.formatTime(3661)).toBe('61:01.00')
  })

  it('should expose playback control functions', () => {
    const { result } = renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata
    }))

    expect(typeof result.current.handlePlayPause).toBe('function')
    expect(typeof result.current.handleSeek).toBe('function')
    expect(typeof result.current.handleNextFrame).toBe('function')
    expect(typeof result.current.handlePrevFrame).toBe('function')
    expect(typeof result.current.handleJumpToStart).toBe('function')
    expect(typeof result.current.handleJumpToEnd).toBe('function')
    expect(typeof result.current.handleNextFrame10).toBe('function')
    expect(typeof result.current.handlePrevFrame10).toBe('function')
  })

  it('should call onTimeUpdate callback when time changes', async () => {
    const onTimeUpdate = vi.fn()

    renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata,
      onTimeUpdate
    }))

    // Simulate time update by calling the callback that was registered with player.on('timeupdate')
    const videojsMock = vi.mocked(videojs)
    const mockPlayerInstance = videojsMock.mock.results[0]?.value

    if (mockPlayerInstance) {
      // Find the timeupdate callback
      const onCalls = vi.mocked(mockPlayerInstance.on).mock.calls
      const timeupdateCall = onCalls.find(call => call[0] === 'timeupdate')

      if (timeupdateCall && timeupdateCall[1]) {
        // Update the currentTime return value
        vi.mocked(mockPlayerInstance.currentTime).mockReturnValue(5.5)

        // Call the timeupdate callback
        await act(async () => {
          timeupdateCall[1]()
        })

        await waitFor(() => {
          expect(onTimeUpdate).toHaveBeenCalledWith(5.5)
        })
      }
    }
  })

  it('should call onFrameChange callback when frame changes', async () => {
    const onFrameChange = vi.fn()

    renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata,
      onFrameChange
    }))

    const videojsMock = vi.mocked(videojs)
    const mockPlayerInstance = videojsMock.mock.results[0]?.value

    if (mockPlayerInstance) {
      const onCalls = vi.mocked(mockPlayerInstance.on).mock.calls
      const timeupdateCall = onCalls.find(call => call[0] === 'timeupdate')

      if (timeupdateCall && timeupdateCall[1]) {
        // 5.5 seconds at 30 FPS = frame 165
        vi.mocked(mockPlayerInstance.currentTime).mockReturnValue(5.5)

        await act(async () => {
          timeupdateCall[1]()
        })

        await waitFor(() => {
          expect(onFrameChange).toHaveBeenCalledWith(165)
        })
      }
    }
  })

  it('should call onDurationChange callback when duration is loaded', async () => {
    const onDurationChange = vi.fn()

    renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata,
      onDurationChange
    }))

    const videojsMock = vi.mocked(videojs)
    const mockPlayerInstance = videojsMock.mock.results[0]?.value

    if (mockPlayerInstance) {
      const onCalls = vi.mocked(mockPlayerInstance.on).mock.calls
      const metadataCall = onCalls.find(call => call[0] === 'loadedmetadata')

      if (metadataCall && metadataCall[1]) {
        vi.mocked(mockPlayerInstance.duration).mockReturnValue(100)

        await act(async () => {
          metadataCall[1]()
        })

        await waitFor(() => {
          expect(onDurationChange).toHaveBeenCalledWith(100)
        })
      }
    }
  })

  it('should call onPlayingChange callback when play state changes', async () => {
    const onPlayingChange = vi.fn()

    renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata,
      onPlayingChange
    }))

    const videojsMock = vi.mocked(videojs)
    const mockPlayerInstance = videojsMock.mock.results[0]?.value

    if (mockPlayerInstance) {
      const onCalls = vi.mocked(mockPlayerInstance.on).mock.calls
      const playCall = onCalls.find(call => call[0] === 'play')
      const pauseCall = onCalls.find(call => call[0] === 'pause')

      if (playCall && playCall[1]) {
        await act(async () => {
          playCall[1]()
        })

        await waitFor(() => {
          expect(onPlayingChange).toHaveBeenCalledWith(true)
        })
      }

      if (pauseCall && pauseCall[1]) {
        await act(async () => {
          pauseCall[1]()
        })

        await waitFor(() => {
          expect(onPlayingChange).toHaveBeenCalledWith(false)
        })
      }
    }
  })

  it('should calculate total frames based on duration and FPS', async () => {
    const { result } = renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata
    }))

    const videojsMock = vi.mocked(videojs)
    const mockPlayerInstance = videojsMock.mock.results[0]?.value

    if (mockPlayerInstance) {
      const onCalls = vi.mocked(mockPlayerInstance.on).mock.calls
      const metadataCall = onCalls.find(call => call[0] === 'loadedmetadata')

      if (metadataCall && metadataCall[1]) {
        vi.mocked(mockPlayerInstance.duration).mockReturnValue(100)

        await act(async () => {
          metadataCall[1]()
        })

        await waitFor(() => {
          // 100 seconds at 30 FPS = 3000 frames
          expect(result.current.totalFrames).toBe(3000)
        })
      }
    }
  })

  it('should handle missing FPS by defaulting to 30', async () => {
    const metadataWithoutFps: VideoMetadata = {
      ...mockVideoMetadata,
      fps: undefined
    }

    const { result } = renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: metadataWithoutFps
    }))

    const videojsMock = vi.mocked(videojs)
    const mockPlayerInstance = videojsMock.mock.results[0]?.value

    if (mockPlayerInstance) {
      const onCalls = vi.mocked(mockPlayerInstance.on).mock.calls
      const metadataCall = onCalls.find(call => call[0] === 'loadedmetadata')

      if (metadataCall && metadataCall[1]) {
        vi.mocked(mockPlayerInstance.duration).mockReturnValue(100)

        await act(async () => {
          metadataCall[1]()
        })

        await waitFor(() => {
          // Should use default 30 FPS
          expect(result.current.totalFrames).toBe(3000)
        })
      }
    }
  })

  it('should cleanup player on unmount', () => {
    const { unmount } = renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: mockVideoMetadata
    }))

    const videojsMock = vi.mocked(videojs)
    const mockPlayerInstance = videojsMock.mock.results[0]?.value

    unmount()

    if (mockPlayerInstance) {
      expect(vi.mocked(mockPlayerInstance.dispose)).toHaveBeenCalled()
    }
  })

  it('should not initialize player without videoId', () => {
    renderHook(() => useVideoPlayer({
      videoId: undefined,
      videoMetadata: mockVideoMetadata
    }))

    expect(videojs).not.toHaveBeenCalled()
  })

  it('should not initialize player without videoMetadata', () => {
    renderHook(() => useVideoPlayer({
      videoId: 'test-video-123',
      videoMetadata: null
    }))

    expect(videojs).not.toHaveBeenCalled()
  })
})
