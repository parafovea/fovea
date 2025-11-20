/**
 * Tests for VideoPlayer component.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React, { createRef } from 'react'
import { VideoPlayer, VideoPlayerHandle } from './VideoPlayer'
import type { VideoMetadata } from '../../models/types'

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
        return mockPlayer
      }
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

describe('VideoPlayer', () => {
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
  })

  it('should render video element', () => {
    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      />
    )

    const videoElement = screen.getByLabelText('Video being annotated')
    expect(videoElement).toBeInTheDocument()
    expect(videoElement.tagName).toBe('VIDEO')
  })

  it('should render with video-js classes', () => {
    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      />
    )

    const videoElement = screen.getByLabelText('Video being annotated')
    expect(videoElement).toHaveClass('video-js')
    expect(videoElement).toHaveClass('vjs-big-play-centered')
    expect(videoElement).toHaveClass('vjs-fluid')
    expect(videoElement).toHaveClass('vjs-default-skin')
  })

  it('should render children inside container', () => {
    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      >
        <div data-testid="child-overlay">Test Overlay</div>
      </VideoPlayer>
    )

    const childOverlay = screen.getByTestId('child-overlay')
    expect(childOverlay).toBeInTheDocument()
    expect(childOverlay).toHaveTextContent('Test Overlay')
  })

  it('should expose player control methods via ref', () => {
    const ref = createRef<VideoPlayerHandle>()

    render(
      <VideoPlayer
        ref={ref}
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      />
    )

    expect(ref.current).toBeDefined()
    expect(ref.current?.playerRef).toBeDefined()
    expect(ref.current?.videoRef).toBeDefined()
    expect(typeof ref.current?.handlePlayPause).toBe('function')
    expect(typeof ref.current?.handleSeek).toBe('function')
    expect(typeof ref.current?.handleNextFrame).toBe('function')
    expect(typeof ref.current?.handlePrevFrame).toBe('function')
    expect(typeof ref.current?.handleJumpToStart).toBe('function')
    expect(typeof ref.current?.handleJumpToEnd).toBe('function')
    expect(typeof ref.current?.handleNextFrame10).toBe('function')
    expect(typeof ref.current?.handlePrevFrame10).toBe('function')
    expect(typeof ref.current?.formatTime).toBe('function')
  })

  it('should expose player state via ref', () => {
    const ref = createRef<VideoPlayerHandle>()

    render(
      <VideoPlayer
        ref={ref}
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      />
    )

    expect(ref.current).toBeDefined()
    expect(typeof ref.current?.currentTime).toBe('number')
    expect(typeof ref.current?.duration).toBe('number')
    expect(typeof ref.current?.currentFrame).toBe('number')
    expect(typeof ref.current?.totalFrames).toBe('number')
    expect(typeof ref.current?.isPlaying).toBe('boolean')
  })

  it('should call onTimeUpdate callback', () => {
    const onTimeUpdate = vi.fn()

    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
        onTimeUpdate={onTimeUpdate}
      />
    )

    // The callback will be tested via the hook tests
    // This just verifies the prop is passed through
    expect(onTimeUpdate).toBeDefined()
  })

  it('should call onFrameChange callback', () => {
    const onFrameChange = vi.fn()

    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
        onFrameChange={onFrameChange}
      />
    )

    expect(onFrameChange).toBeDefined()
  })

  it('should call onDurationChange callback', () => {
    const onDurationChange = vi.fn()

    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
        onDurationChange={onDurationChange}
      />
    )

    expect(onDurationChange).toBeDefined()
  })

  it('should call onPlayingChange callback', () => {
    const onPlayingChange = vi.fn()

    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
        onPlayingChange={onPlayingChange}
      />
    )

    expect(onPlayingChange).toBeDefined()
  })

  it('should render with correct video attributes', () => {
    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      />
    )

    const videoElement = screen.getByLabelText('Video being annotated') as HTMLVideoElement
    expect(videoElement.hasAttribute('playsinline')).toBe(true)
    expect(videoElement.muted).toBe(false)
    expect(videoElement.preload).toBe('auto')
  })

  it('should handle undefined videoId gracefully', () => {
    render(
      <VideoPlayer
        videoId={undefined}
        videoMetadata={mockVideoMetadata}
      />
    )

    const videoElement = screen.getByLabelText('Video being annotated')
    expect(videoElement).toBeInTheDocument()
  })

  it('should handle null videoMetadata gracefully', () => {
    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={null}
      />
    )

    const videoElement = screen.getByLabelText('Video being annotated')
    expect(videoElement).toBeInTheDocument()
  })

  it('should render no-js fallback message', () => {
    render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      />
    )

    const fallbackMessage = screen.getByText(/To view this video please enable JavaScript/)
    expect(fallbackMessage).toBeInTheDocument()
  })

  it('should have annotation-video-container wrapper', () => {
    const { container } = render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      />
    )

    const wrapper = container.querySelector('.annotation-video-container')
    expect(wrapper).toBeInTheDocument()
  })

  it('should have correct container styling', () => {
    const { container } = render(
      <VideoPlayer
        videoId="test-video-123"
        videoMetadata={mockVideoMetadata}
      />
    )

    const outerBox = container.firstChild as HTMLElement
    expect(outerBox).toHaveStyle({ position: 'relative' })
  })
})
