import Fastify from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { thumbnailRoutes } from '../../../src/routes/videos/thumbnail.js'
import type { VideoRepository } from '../../../src/repositories/VideoRepository.js'
import type { VideoStorageProvider } from '../../../src/services/videoStorage.js'

afterEach(() => vi.unstubAllGlobals())

describe('thumbnail model-service paths', () => {
  it.each([
    ['/test-videos/clip.webm', '/test-videos/clip.webm'],
    ['/videos/clip.webm', '/videos/clip.webm'],
    ['/data/clip.webm', '/videos/clip.webm'],
  ])('forwards the shared path for %s', async (videoPath, expectedPath) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('synthetic rejection', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const app = Fastify()
    await app.register(thumbnailRoutes, {
      videoRepository: {
        findByIdWithSelect: vi.fn().mockResolvedValue({ id: 'test-path', path: videoPath }),
      } as unknown as VideoRepository,
      storageProvider: {} as VideoStorageProvider,
      storageConfig: { type: 'local' },
      storagePath: '/test-videos',
    })
    try {
      const response = await app.inject('/api/videos/test-path/thumbnail')
      expect(response.statusCode).toBe(400)
      expect(fetchMock).toHaveBeenCalledOnce()
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
      expect(body.video_path).toBe(expectedPath)
    } finally {
      await app.close()
    }
  })
})
