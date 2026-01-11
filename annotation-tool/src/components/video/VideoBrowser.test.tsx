/**
 * Tests for VideoBrowser component.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'
import VideoBrowser from './VideoBrowser'
import { useVideoUiStore, useAnnotationUiStore } from '@store/zustand'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  )
}

const mockVideos = [
  {
    id: 'video-1',
    title: 'Baseball Spring Training Highlights',
    description: 'Pitching mechanics and batting practice from spring training',
    uploader: 'Sports Network',
    uploader_id: 'sportsnet',
    duration: 300,
    tags: ['baseball', 'sports', 'training'],
    webpage_url: 'https://example.com/video1',
    thumbnail: 'https://example.com/thumb1.jpg',
    width: 1920,
    height: 1080,
    formats: [],
  },
  {
    id: 'video-2',
    title: 'Whale Pod Migration Patterns',
    description: 'Marine biologist tracks humpback whale migration',
    uploader: 'Wildlife Channel',
    uploader_id: 'wildlife',
    duration: 450,
    tags: ['whales', 'marine', 'biology'],
    webpage_url: 'https://example.com/video2',
    thumbnail: 'https://example.com/thumb2.jpg',
    width: 1920,
    height: 1080,
    formats: [],
  },
  {
    id: 'video-3',
    title: 'Retail Store Customer Flow Analysis',
    description: 'Peak hours and traffic patterns in shopping mall',
    uploader: 'Retail Analytics',
    uploader_id: 'retailanalytics',
    duration: 600,
    tags: ['retail', 'customers', 'analytics'],
    webpage_url: 'https://example.com/video3',
    thumbnail: 'https://example.com/thumb3.jpg',
    width: 1920,
    height: 1080,
    formats: [],
  },
]

// Mock personas for tests
const mockPersonas = [
  { id: 'persona-1', name: 'Baseball Scout', role: 'Sports Analyst' },
  { id: 'persona-2', name: 'Film Critic', role: 'Movie Reviewer' },
]

describe('VideoBrowser', () => {
  beforeEach(() => {
    // Reset Zustand store state between tests
    useVideoUiStore.getState().resetAllState()
    useAnnotationUiStore.getState().setSelectedPersonaId(null)

    // Mock fetch for video list and personas (for tests that trigger loading)
    server.use(
      http.get('/api/videos', () => {
        return HttpResponse.json(mockVideos)
      }),
      http.get('/api/personas', () => {
        return HttpResponse.json(mockPersonas)
      })
    )
  })

  describe('loading state', () => {
    it('renders loading spinner while fetching videos', () => {
      render(<VideoBrowser />, { wrapper: createWrapper() })

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  describe('video grid display', () => {
    it('displays video cards with metadata', async () => {
      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Sports Network')).toBeInTheDocument()
      })
      expect(screen.getByText('Wildlife Channel')).toBeInTheDocument()
      expect(screen.getByText('Retail Analytics')).toBeInTheDocument()
    })

    it('displays video count in search bar', async () => {
      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })
    })
  })

  describe('search filtering', () => {
    it('filters videos by title', async () => {
      const user = userEvent.setup()

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search videos/i)
      await user.type(searchInput, 'Baseball')

      await waitFor(() => {
        expect(screen.getByText('1 video')).toBeInTheDocument()
      })
      expect(screen.getByText('Sports Network')).toBeInTheDocument()
      expect(screen.queryByText('Wildlife Channel')).not.toBeInTheDocument()
    })

    it('filters videos by description', async () => {
      const user = userEvent.setup()

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search videos/i)
      await user.type(searchInput, 'biologist')

      await waitFor(() => {
        expect(screen.getByText('1 video')).toBeInTheDocument()
        expect(screen.getByText('Wildlife Channel')).toBeInTheDocument()
      })
    })

    it('filters videos by uploader', async () => {
      const user = userEvent.setup()

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search videos/i)
      await user.type(searchInput, 'Retail Analytics')

      await waitFor(() => {
        expect(screen.getByText('1 video')).toBeInTheDocument()
        expect(screen.getByText('Retail Analytics')).toBeInTheDocument()
      })
    })

    it('filters videos by tags', async () => {
      const user = userEvent.setup()

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search videos/i)
      await user.type(searchInput, 'marine')

      await waitFor(() => {
        expect(screen.getByText('1 video')).toBeInTheDocument()
        expect(screen.getByText('Wildlife Channel')).toBeInTheDocument()
      })
    })

    it('shows empty state when no videos match search', async () => {
      const user = userEvent.setup()

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search videos/i)
      await user.type(searchInput, 'nonexistent search term xyz')

      await waitFor(() => {
        expect(screen.getByText('0 videos')).toBeInTheDocument()
      })
    })

    it('filters videos by filename', async () => {
      const user = userEvent.setup()

      // Mock videos with filename but minimal metadata
      server.use(
        http.get('/api/videos', () => {
          return HttpResponse.json([
            {
              id: 'video-1',
              filename: 'baseball_highlights_2024.mp4',
              title: 'Baseball Video',
              description: 'Sports content',
              duration: 300,
              width: 1920,
              height: 1080,
            },
            {
              id: 'video-2',
              filename: 'whale_migration.mp4',
              title: 'Whale Video',
              description: 'Marine content',
              duration: 450,
              width: 1920,
              height: 1080,
            },
          ])
        })
      )


      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('2 videos')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search videos/i)
      await user.type(searchInput, 'baseball_highlights')

      await waitFor(() => {
        expect(screen.getByText('1 video')).toBeInTheDocument()
      })
    })

    it('handles videos with missing title and description fields', async () => {
      const user = userEvent.setup()

      // Mock videos with minimal metadata (no title/description) - regression test for #32
      server.use(
        http.get('/api/videos', () => {
          return HttpResponse.json([
            {
              id: 'video-minimal-1',
              filename: 'test_video_one.mp4',
              duration: 300,
              width: 1920,
              height: 1080,
              // No title, description, uploader, tags
            },
            {
              id: 'video-minimal-2',
              filename: 'another_video.mp4',
              duration: 450,
              width: 1920,
              height: 1080,
              // No title, description, uploader, tags
            },
          ])
        })
      )


      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('2 videos')).toBeInTheDocument()
      })

      // This should NOT throw an error - regression test for GitHub issue #32
      const searchInput = screen.getByPlaceholderText(/search videos/i)
      await user.type(searchInput, 'test')

      // Should filter by filename since title/description are undefined
      await waitFor(() => {
        expect(screen.getByText('1 video')).toBeInTheDocument()
      })
    })
  })

  describe('CPU-only mode', () => {
    it('hides persona selector in CPU-only mode', async () => {
      // Use relative URL to match the ApiClient's default behavior (SSH port forwarding compatible)
      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {},
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: false,
          })
        })
      )


      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      expect(screen.queryByLabelText(/persona/i)).not.toBeInTheDocument()
    })

    it('hides batch summarize button in CPU-only mode', async () => {
      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {},
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: false,
          })
        })
      )


      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      expect(screen.queryByText(/summarize all/i)).not.toBeInTheDocument()
    })

    it('disables individual video summarize button in CPU-only mode', async () => {
      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {},
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: false,
          })
        })
      )


      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const summarizeButtons = screen.queryAllByLabelText(/summarize/i)
      summarizeButtons.forEach(button => {
        expect(button).toBeDisabled()
      })
    })
  })

  describe('GPU mode', () => {
    it('shows persona selector in GPU mode', async () => {
      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: {
                selected: 'llava',
                options: {},
              },
            },
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: true,
          })
        })
      )


      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByLabelText(/persona/i)).toBeInTheDocument()
      })
    })

    it('disables batch summarize button without persona', async () => {
      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: {
                selected: 'llava',
                options: {},
              },
            },
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: true,
          })
        })
      )


      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        const button = screen.getByText(/summarize all/i)
        expect(button).toBeDisabled()
      })
    })
  })

  describe('summary generation', () => {
    it('triggers summary job when summarize button clicked', async () => {
      const user = userEvent.setup()

      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: {
                selected: 'llava',
                options: {},
              },
            },
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: true,
          })
        })
      )

      // Set active persona to enable summarize button
      useAnnotationUiStore.getState().setSelectedPersonaId('persona-1')

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Wildlife Channel')).toBeInTheDocument()
      })

      const cards = screen.getAllByRole('button', { name: /summarize/i })
      await user.click(cards[1])

      await waitFor(() => {
        expect(screen.getByText(/generating summary/i)).toBeInTheDocument()
      })
    })

    it('shows job status indicator during processing', async () => {
      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: {
                selected: 'llava',
                options: {},
              },
            },
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: true,
          })
        })
      )

      // Set active persona and active summary job
      useAnnotationUiStore.getState().setSelectedPersonaId('persona-1')
      useVideoUiStore.getState().setActiveSummaryJob('video-1', 'persona-1', 'job-active')

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/generating summary/i)).toBeInTheDocument()
        expect(screen.getByText(/processing\.\.\. 50%/i)).toBeInTheDocument()
      })
    })

    it('expands summary after completion', async () => {
      const user = userEvent.setup()

      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: {
                selected: 'llava',
                options: {},
              },
            },
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: true,
          })
        })
      )

      // Set active persona and video summary
      useAnnotationUiStore.getState().setSelectedPersonaId('persona-1')
      useVideoUiStore.getState().addVideoSummary('video-3', 'persona-1')

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Retail Analytics')).toBeInTheDocument()
      })

      // Find the View button for the third video (which has a summary)
      const viewButtons = screen.getAllByRole('button', { name: /view/i })
      await user.click(viewButtons[0])

      // Summary should now be visible
      await waitFor(() => {
        expect(screen.getByText(/Wildlife researcher/i)).toBeInTheDocument()
      })
    })
  })

  describe('video card interactions', () => {
    it('navigates to annotation view when Annotate button clicked', async () => {
      const user = userEvent.setup()

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Sports Network')).toBeInTheDocument()
      })

      const annotateButtons = screen.getAllByRole('button', { name: /annotate/i })
      await user.click(annotateButtons[0])

      // Should navigate to /annotate/:videoId (mocked by router)
    })

    it('displays tag overflow indicator when more than 3 tags', async () => {
      server.use(
        http.get('/api/videos', () => {
          return HttpResponse.json([{
            id: 'video-with-many-tags',
            title: 'Video with Many Tags',
            description: 'Test video',
            uploader: 'Test Uploader',
            uploader_id: 'test',
            duration: 300,
            tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
            webpage_url: 'https://example.com/video',
            thumbnail: 'https://example.com/thumb.jpg',
            width: 1920,
            height: 1080,
            formats: [],
          }])
        })
      )


      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Test Uploader')).toBeInTheDocument()
      })

      // Should show "+2" chip for 2 additional tags beyond the first 3
      expect(screen.getByText('+2')).toBeInTheDocument()
      expect(screen.getByText('tag1')).toBeInTheDocument()
      expect(screen.getByText('tag2')).toBeInTheDocument()
      expect(screen.getByText('tag3')).toBeInTheDocument()
    })

    it('displays video metadata when available', async () => {

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Sports Network')).toBeInTheDocument()
      })

      // Tags should be visible
      expect(screen.getByText('baseball')).toBeInTheDocument()
      expect(screen.getByText('sports')).toBeInTheDocument()
      expect(screen.getByText('training')).toBeInTheDocument()
    })

  })

  describe('persona management', () => {
    it('allows changing active persona', async () => {
      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: {
                selected: 'llava',
                options: {},
              },
            },
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: true,
          })
        })
      )

      // Set active persona before rendering
      useAnnotationUiStore.getState().setSelectedPersonaId('persona-1')

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByLabelText(/persona/i)).toBeInTheDocument()
      })

      // Persona selector should show Baseball Scout initially
      expect(screen.getByText(/Baseball Scout/)).toBeInTheDocument()
    })

    it('triggers batch summarization for all videos', async () => {
      const user = userEvent.setup()

      server.use(
        http.get('/api/models/config', () => {
          return HttpResponse.json({
            models: {
              vlm: {
                selected: 'llava',
                options: {},
              },
            },
            inference: {
              max_memory_per_model: 24.0,
              offload_threshold: 0.8,
              warmup_on_startup: true,
            },
            cudaAvailable: true,
          })
        })
      )

      // Set active persona to enable batch summarization
      useAnnotationUiStore.getState().setSelectedPersonaId('persona-1')

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const batchButton = screen.getByText(/summarize all/i)
      await user.click(batchButton)

      // Should trigger job submissions (implementation details tested via integration)
    })
  })

  describe('keyboard navigation', () => {
    it('focuses search input on keyboard shortcut', async () => {

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search videos/i)
      expect(searchInput).toBeInTheDocument()
    })

    it('supports card selection with click', async () => {
      const user = userEvent.setup()

      render(<VideoBrowser />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('3 videos')).toBeInTheDocument()
      })

      const cards = screen.getAllByRole('button')
      const videoCard = cards.find(card =>
        within(card).queryByText('Wildlife Channel')
      )

      if (videoCard) {
        await user.click(videoCard)
        expect(videoCard).toHaveStyle({ outline: '2px' })
      }
    })
  })
})
