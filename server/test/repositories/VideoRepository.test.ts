import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VideoRepository } from '../../src/repositories/VideoRepository.js'
import { PrismaClient, Video } from '@prisma/client'

/**
 * Unit tests for VideoRepository.
 *
 * Tests all repository methods with mocked Prisma client.
 * Achieves 100% code coverage.
 */
describe('VideoRepository', () => {
  // Mock Prisma client
  const mockPrisma = {
    video: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
  } as unknown as PrismaClient

  let repository: VideoRepository

  // Sample video data for testing
  const mockVideo: Video = {
    id: 'test-video-123',
    filename: 'test.mp4',
    path: '/data/test.mp4',
    duration: 120.5,
    frameRate: 30,
    resolution: '1920x1080',
    metadata: { encoding: 'h264', bitrate: '5000k' },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    localThumbnailPath: null,
    lastMetadataSync: null,
    sourcePlatform: null,
    platformVideoId: null,
    metadataSyncStatus: null
  }

  const mockVideo2: Video = {
    ...mockVideo,
    id: 'test-video-456',
    filename: 'another.mp4',
    path: '/data/another.mp4',
    createdAt: new Date('2024-01-02T00:00:00Z')
  }

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
    repository = new VideoRepository(mockPrisma)
  })

  describe('findAll()', () => {
    it('should find all videos with default ordering (createdAt desc)', async () => {
      const mockVideos = [mockVideo2, mockVideo]
      mockPrisma.video.findMany = vi.fn().mockResolvedValue(mockVideos)

      const result = await repository.findAll()

      expect(mockPrisma.video.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' }
      })
      expect(result).toEqual(mockVideos)
      expect(result).toHaveLength(2)
    })

    it('should find all videos ordered by filename ascending', async () => {
      const mockVideos = [mockVideo2, mockVideo]
      mockPrisma.video.findMany = vi.fn().mockResolvedValue(mockVideos)

      const result = await repository.findAll({
        orderBy: 'filename',
        direction: 'asc'
      })

      expect(mockPrisma.video.findMany).toHaveBeenCalledWith({
        orderBy: { filename: 'asc' }
      })
      expect(result).toEqual(mockVideos)
    })

    it('should find all videos ordered by filename descending', async () => {
      const mockVideos = [mockVideo, mockVideo2]
      mockPrisma.video.findMany = vi.fn().mockResolvedValue(mockVideos)

      const result = await repository.findAll({
        orderBy: 'filename',
        direction: 'desc'
      })

      expect(mockPrisma.video.findMany).toHaveBeenCalledWith({
        orderBy: { filename: 'desc' }
      })
      expect(result).toEqual(mockVideos)
    })

    it('should find all videos ordered by createdAt ascending', async () => {
      const mockVideos = [mockVideo, mockVideo2]
      mockPrisma.video.findMany = vi.fn().mockResolvedValue(mockVideos)

      const result = await repository.findAll({
        orderBy: 'createdAt',
        direction: 'asc'
      })

      expect(mockPrisma.video.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'asc' }
      })
      expect(result).toEqual(mockVideos)
    })

    it('should return empty array when no videos exist', async () => {
      mockPrisma.video.findMany = vi.fn().mockResolvedValue([])

      const result = await repository.findAll()

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
    })

    it('should propagate errors from Prisma', async () => {
      const dbError = new Error('Database connection failed')
      mockPrisma.video.findMany = vi.fn().mockRejectedValue(dbError)

      await expect(repository.findAll()).rejects.toThrow('Database connection failed')
    })
  })

  describe('findById()', () => {
    it('should find a video by ID', async () => {
      mockPrisma.video.findUnique = vi.fn().mockResolvedValue(mockVideo)

      const result = await repository.findById('test-video-123')

      expect(mockPrisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-video-123' }
      })
      expect(result).toEqual(mockVideo)
    })

    it('should return null when video is not found', async () => {
      mockPrisma.video.findUnique = vi.fn().mockResolvedValue(null)

      const result = await repository.findById('nonexistent-id')

      expect(mockPrisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 'nonexistent-id' }
      })
      expect(result).toBeNull()
    })

    it('should propagate errors from Prisma', async () => {
      const dbError = new Error('Database query failed')
      mockPrisma.video.findUnique = vi.fn().mockRejectedValue(dbError)

      await expect(repository.findById('test-id')).rejects.toThrow('Database query failed')
    })

    it('should handle special characters in ID', async () => {
      const specialId = 'video-with-special-chars-!@#$'
      mockPrisma.video.findUnique = vi.fn().mockResolvedValue(null)

      await repository.findById(specialId)

      expect(mockPrisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: specialId }
      })
    })
  })

  describe('findByIdWithSelect()', () => {
    it('should find video by ID with selected fields (path only)', async () => {
      const mockPartialVideo = { path: '/data/test.mp4' }
      mockPrisma.video.findUnique = vi.fn().mockResolvedValue(mockPartialVideo)

      const result = await repository.findByIdWithSelect('test-video-123', {
        path: true
      })

      expect(mockPrisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-video-123' },
        select: { path: true }
      })
      expect(result).toEqual(mockPartialVideo)
    })

    it('should find video by ID with multiple selected fields', async () => {
      const mockPartialVideo = {
        path: '/data/test.mp4',
        filename: 'test.mp4'
      }
      mockPrisma.video.findUnique = vi.fn().mockResolvedValue(mockPartialVideo)

      const result = await repository.findByIdWithSelect('test-video-123', {
        path: true,
        filename: true
      })

      expect(mockPrisma.video.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-video-123' },
        select: { path: true, filename: true }
      })
      expect(result).toEqual(mockPartialVideo)
    })

    it('should find video with thumbnail fields for thumbnail endpoint', async () => {
      const mockPartialVideo = {
        id: 'test-video-123',
        path: '/data/test.mp4',
        filename: 'test.mp4',
        localThumbnailPath: 'thumbnails/test-video-123_medium.jpg'
      }
      mockPrisma.video.findUnique = vi.fn().mockResolvedValue(mockPartialVideo)

      const result = await repository.findByIdWithSelect('test-video-123', {
        id: true,
        path: true,
        filename: true,
        localThumbnailPath: true
      })

      expect(result).toEqual(mockPartialVideo)
    })

    it('should return null when video is not found', async () => {
      mockPrisma.video.findUnique = vi.fn().mockResolvedValue(null)

      const result = await repository.findByIdWithSelect('nonexistent-id', {
        path: true
      })

      expect(result).toBeNull()
    })

    it('should propagate errors from Prisma', async () => {
      const dbError = new Error('Database query failed')
      mockPrisma.video.findUnique = vi.fn().mockRejectedValue(dbError)

      await expect(
        repository.findByIdWithSelect('test-id', { path: true })
      ).rejects.toThrow('Database query failed')
    })
  })

  describe('create()', () => {
    it('should create a new video with minimal required fields', async () => {
      const createData = {
        id: 'new-video-123',
        filename: 'new.mp4',
        path: '/data/new.mp4'
      }
      const createdVideo = { ...mockVideo, ...createData }
      mockPrisma.video.create = vi.fn().mockResolvedValue(createdVideo)

      const result = await repository.create(createData)

      expect(mockPrisma.video.create).toHaveBeenCalledWith({
        data: createData
      })
      expect(result).toEqual(createdVideo)
    })

    it('should create a new video with full metadata', async () => {
      const createData = {
        id: 'new-video-456',
        filename: 'full.mp4',
        path: '/data/full.mp4',
        duration: 180.5,
        frameRate: 60,
        resolution: '3840x2160',
        metadata: {
          encoding: 'h265',
          bitrate: '10000k',
          audioCodec: 'aac'
        }
      }
      const createdVideo = { ...mockVideo, ...createData }
      mockPrisma.video.create = vi.fn().mockResolvedValue(createdVideo)

      const result = await repository.create(createData)

      expect(mockPrisma.video.create).toHaveBeenCalledWith({
        data: createData
      })
      expect(result).toEqual(createdVideo)
    })

    it('should propagate Prisma unique constraint errors', async () => {
      const createData = {
        id: 'duplicate-id',
        filename: 'duplicate.mp4',
        path: '/data/duplicate.mp4'
      }
      const prismaError = {
        code: 'P2002',
        message: 'Unique constraint failed on the fields: (`filename`)'
      }
      mockPrisma.video.create = vi.fn().mockRejectedValue(prismaError)

      await expect(repository.create(createData)).rejects.toMatchObject(prismaError)
    })

    it('should propagate general Prisma errors', async () => {
      const createData = {
        id: 'error-video',
        filename: 'error.mp4',
        path: '/data/error.mp4'
      }
      const dbError = new Error('Database insert failed')
      mockPrisma.video.create = vi.fn().mockRejectedValue(dbError)

      await expect(repository.create(createData)).rejects.toThrow('Database insert failed')
    })
  })

  describe('update()', () => {
    it('should update video metadata', async () => {
      const updateData = {
        metadata: { encoding: 'h265', bitrate: '8000k' }
      }
      const updatedVideo = { ...mockVideo, ...updateData }
      mockPrisma.video.update = vi.fn().mockResolvedValue(updatedVideo)

      const result = await repository.update('test-video-123', updateData)

      expect(mockPrisma.video.update).toHaveBeenCalledWith({
        where: { id: 'test-video-123' },
        data: updateData
      })
      expect(result).toEqual(updatedVideo)
    })

    it('should update video duration and frame rate', async () => {
      const updateData = {
        duration: 150.0,
        frameRate: 24
      }
      const updatedVideo = { ...mockVideo, ...updateData }
      mockPrisma.video.update = vi.fn().mockResolvedValue(updatedVideo)

      const result = await repository.update('test-video-123', updateData)

      expect(mockPrisma.video.update).toHaveBeenCalledWith({
        where: { id: 'test-video-123' },
        data: updateData
      })
      expect(result.duration).toBe(150.0)
      expect(result.frameRate).toBe(24)
    })

    it('should update single field', async () => {
      const updateData = { resolution: '2560x1440' }
      const updatedVideo = { ...mockVideo, resolution: '2560x1440' }
      mockPrisma.video.update = vi.fn().mockResolvedValue(updatedVideo)

      const result = await repository.update('test-video-123', updateData)

      expect(result.resolution).toBe('2560x1440')
    })

    it('should propagate Prisma not found error (P2025)', async () => {
      const updateData = { duration: 100.0 }
      const prismaError = {
        code: 'P2025',
        message: 'Record to update not found'
      }
      mockPrisma.video.update = vi.fn().mockRejectedValue(prismaError)

      await expect(
        repository.update('nonexistent-id', updateData)
      ).rejects.toMatchObject(prismaError)
    })

    it('should propagate general database errors', async () => {
      const updateData = { duration: 100.0 }
      const dbError = new Error('Database update failed')
      mockPrisma.video.update = vi.fn().mockRejectedValue(dbError)

      await expect(
        repository.update('test-id', updateData)
      ).rejects.toThrow('Database update failed')
    })
  })

  describe('updateThumbnailPath()', () => {
    it('should update thumbnail path for a video', async () => {
      const thumbnailPath = 'thumbnails/test-video-123_medium.jpg'
      const updatedVideo = { ...mockVideo, localThumbnailPath: thumbnailPath }
      mockPrisma.video.update = vi.fn().mockResolvedValue(updatedVideo)

      const result = await repository.updateThumbnailPath('test-video-123', thumbnailPath)

      expect(mockPrisma.video.update).toHaveBeenCalledWith({
        where: { id: 'test-video-123' },
        data: { localThumbnailPath: thumbnailPath }
      })
      expect(result.localThumbnailPath).toBe(thumbnailPath)
    })

    it('should update thumbnail path with different sizes', async () => {
      const thumbnailPath = 'thumbnails/test-video-123_large.jpg'
      const updatedVideo = { ...mockVideo, localThumbnailPath: thumbnailPath }
      mockPrisma.video.update = vi.fn().mockResolvedValue(updatedVideo)

      const result = await repository.updateThumbnailPath('test-video-123', thumbnailPath)

      expect(result.localThumbnailPath).toBe(thumbnailPath)
    })

    it('should handle relative paths correctly', async () => {
      const thumbnailPath = 'thumbnails/subfolder/video_small.jpg'
      const updatedVideo = { ...mockVideo, localThumbnailPath: thumbnailPath }
      mockPrisma.video.update = vi.fn().mockResolvedValue(updatedVideo)

      const result = await repository.updateThumbnailPath('test-video-123', thumbnailPath)

      expect(result.localThumbnailPath).toBe(thumbnailPath)
    })

    it('should propagate Prisma not found error', async () => {
      const prismaError = {
        code: 'P2025',
        message: 'Record to update not found'
      }
      mockPrisma.video.update = vi.fn().mockRejectedValue(prismaError)

      await expect(
        repository.updateThumbnailPath('nonexistent-id', 'thumb.jpg')
      ).rejects.toMatchObject(prismaError)
    })

    it('should propagate database errors', async () => {
      const dbError = new Error('Database update failed')
      mockPrisma.video.update = vi.fn().mockRejectedValue(dbError)

      await expect(
        repository.updateThumbnailPath('test-id', 'thumb.jpg')
      ).rejects.toThrow('Database update failed')
    })
  })

  describe('delete()', () => {
    it('should delete a video by ID', async () => {
      mockPrisma.video.delete = vi.fn().mockResolvedValue(mockVideo)

      const result = await repository.delete('test-video-123')

      expect(mockPrisma.video.delete).toHaveBeenCalledWith({
        where: { id: 'test-video-123' }
      })
      expect(result).toEqual(mockVideo)
    })

    it('should return the deleted video record', async () => {
      const videoToDelete = { ...mockVideo, id: 'delete-me-123' }
      mockPrisma.video.delete = vi.fn().mockResolvedValue(videoToDelete)

      const result = await repository.delete('delete-me-123')

      expect(result.id).toBe('delete-me-123')
      expect(result).toEqual(videoToDelete)
    })

    it('should propagate Prisma not found error (P2025)', async () => {
      const prismaError = {
        code: 'P2025',
        message: 'Record to delete does not exist'
      }
      mockPrisma.video.delete = vi.fn().mockRejectedValue(prismaError)

      await expect(
        repository.delete('nonexistent-id')
      ).rejects.toMatchObject(prismaError)
    })

    it('should propagate database errors', async () => {
      const dbError = new Error('Database delete failed')
      mockPrisma.video.delete = vi.fn().mockRejectedValue(dbError)

      await expect(
        repository.delete('test-id')
      ).rejects.toThrow('Database delete failed')
    })

    it('should handle foreign key constraint errors on cascade delete', async () => {
      const prismaError = {
        code: 'P2003',
        message: 'Foreign key constraint failed'
      }
      mockPrisma.video.delete = vi.fn().mockRejectedValue(prismaError)

      await expect(
        repository.delete('test-id')
      ).rejects.toMatchObject(prismaError)
    })
  })

  describe('Repository instantiation', () => {
    it('should create repository with Prisma client', () => {
      const repo = new VideoRepository(mockPrisma)
      expect(repo).toBeInstanceOf(VideoRepository)
    })

    it('should be able to create multiple repository instances', () => {
      const repo1 = new VideoRepository(mockPrisma)
      const repo2 = new VideoRepository(mockPrisma)
      expect(repo1).toBeInstanceOf(VideoRepository)
      expect(repo2).toBeInstanceOf(VideoRepository)
      expect(repo1).not.toBe(repo2)
    })
  })
})
