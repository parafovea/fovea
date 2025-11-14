import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import {
  createVideoStorageProvider,
  loadStorageConfig,
  VideoStorageProvider,
  VideoStorageConfig,
} from '../../src/services/videoStorage.js'

describe('Video Storage Providers', () => {
  let tempDir: string

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-storage-test-'))
  })

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  describe('LocalStorageProvider', () => {
    let provider: VideoStorageProvider
    let testVideoPath: string

    beforeEach(async () => {
      const config: VideoStorageConfig = {
        type: 'local',
        localPath: tempDir,
        baseUrl: '/api/videos',
      }
      provider = createVideoStorageProvider(config)

      // Create test video file
      testVideoPath = path.join(tempDir, 'test-video.mp4')
      await fs.writeFile(testVideoPath, Buffer.from('fake video content'))
    })

    it('should get video stream for full file', async () => {
      const result = await provider.getVideoStream('test-video.mp4')

      expect(result.contentType).toBe('video/mp4')
      expect(result.contentLength).toBeGreaterThan(0)
      expect(result.stream).toBeDefined()
      expect(result.range).toBeUndefined()
    })

    it('should get video stream with range request', async () => {
      const result = await provider.getVideoStream('test-video.mp4', 'bytes=0-10')

      expect(result.contentType).toBe('video/mp4')
      expect(result.contentLength).toBe(11)
      expect(result.range).toEqual({
        start: 0,
        end: 10,
        total: 18, // Length of 'fake video content' buffer
      })
    })

    it('should get video URL for local storage', async () => {
      const url = await provider.getVideoUrl('test-video.mp4')

      expect(url).toBe('/api/videos/test-video/stream')
    })

    it('should get thumbnail URL for local storage', async () => {
      const url = await provider.getThumbnailUrl('test-video_medium.jpg')

      expect(url).toBe('/api/videos/test-video_medium/thumbnail')
    })

    it('should upload video to local storage', async () => {
      const sourcePath = path.join(tempDir, 'source-video.mp4')
      await fs.writeFile(sourcePath, Buffer.from('source video content'))

      const result = await provider.uploadVideo(sourcePath, 'uploaded-video.mp4')

      expect(result).toBe('uploaded-video.mp4')
      const uploadedPath = path.join(tempDir, 'uploaded-video.mp4')
      const content = await fs.readFile(uploadedPath, 'utf-8')
      expect(content).toBe('source video content')
    })

    it('should delete video from local storage', async () => {
      await provider.deleteVideo('test-video.mp4')

      await expect(fs.access(testVideoPath)).rejects.toThrow()
    })

    it('should check if video exists', async () => {
      const exists = await provider.exists('test-video.mp4')
      expect(exists).toBe(true)

      const notExists = await provider.exists('non-existent.mp4')
      expect(notExists).toBe(false)
    })

    it('should get metadata for video', async () => {
      const metadata = await provider.getMetadata('test-video.mp4')

      expect(metadata.size).toBe(18) // Size of 'fake video content' buffer
      expect(metadata.contentType).toBe('video/mp4')
      expect(metadata.lastModified).toBeInstanceOf(Date)
    })

    it('should handle missing video file', async () => {
      await expect(provider.getVideoStream('missing.mp4')).rejects.toThrow()
    })
  })

  describe('S3StorageProvider', () => {
    // Note: S3 tests are skipped in unit tests due to AWS SDK complexity
    // Full S3 integration is tested in integration tests with mocked AWS services
    it.skip('should be tested in integration tests', () => {
      // S3StorageProvider functionality is validated through:
      // 1. Integration tests with LocalStack/MinIO
      // 2. E2E tests with actual deployment
      // 3. Manual testing with real S3 buckets
      expect(true).toBe(true)
    })
  })

  describe('HybridStorageProvider', () => {
    // Note: Hybrid tests are skipped in unit tests due to S3 dependency
    // Tested in integration tests with mocked services
    it.skip('should be tested in integration tests', () => {
      expect(true).toBe(true)
    })
  })

  describe('loadStorageConfig', () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.VIDEO_STORAGE_TYPE
      delete process.env.VIDEO_STORAGE_PATH
      delete process.env.VIDEO_BASE_URL
      delete process.env.S3_BUCKET
      delete process.env.S3_REGION
      delete process.env.CDN_ENABLED
      delete process.env.THUMBNAIL_STORAGE_TYPE
    })

    it('should load local storage config with defaults', () => {
      const config = loadStorageConfig()

      expect(config.type).toBe('local')
      expect(config.localPath).toBe('/data')
      expect(config.baseUrl).toBe('/api/videos')
    })

    it('should load S3 storage config', () => {
      process.env.VIDEO_STORAGE_TYPE = 's3'
      process.env.S3_BUCKET = 'my-bucket'
      process.env.S3_REGION = 'us-west-2'
      process.env.S3_ACCESS_KEY_ID = 'access-key'
      process.env.S3_SECRET_ACCESS_KEY = 'secret-key'

      const config = loadStorageConfig()

      expect(config.type).toBe('s3')
      expect(config.s3?.bucket).toBe('my-bucket')
      expect(config.s3?.region).toBe('us-west-2')
      expect(config.s3?.accessKeyId).toBe('access-key')
      expect(config.s3?.secretAccessKey).toBe('secret-key')
    })

    it('should load CDN config when enabled', () => {
      process.env.CDN_ENABLED = 'true'
      process.env.CDN_BASE_URL = 'https://cdn.example.com'
      process.env.CDN_SIGNED_URLS = 'false'

      const config = loadStorageConfig()

      expect(config.cdn?.enabled).toBe(true)
      expect(config.cdn?.baseUrl).toBe('https://cdn.example.com')
      expect(config.cdn?.signedUrls).toBe(false)
    })

    it('should load thumbnail storage config', () => {
      process.env.THUMBNAIL_STORAGE_TYPE = 's3'
      process.env.THUMBNAIL_S3_PREFIX = 'thumbnails/'

      const config = loadStorageConfig()

      expect(config.thumbnails?.storageType).toBe('s3')
      expect(config.thumbnails?.s3Prefix).toBe('thumbnails/')
    })

    it('should throw error for S3 storage without required config', () => {
      process.env.VIDEO_STORAGE_TYPE = 's3'
      process.env.NODE_ENV = 'production' // Ensure we trigger validation

      expect(() => loadStorageConfig()).toThrow('S3_BUCKET and S3_REGION are required')
    })
  })

  describe('createVideoStorageProvider', () => {
    it('should create LocalStorageProvider for local type', () => {
      const config: VideoStorageConfig = {
        type: 'local',
        localPath: tempDir,
      }

      const provider = createVideoStorageProvider(config)

      expect(provider).toBeDefined()
    })

    it.skip('should create S3StorageProvider for s3 type (integration test)', () => {
      // Skipped - requires AWS SDK mocking, tested in integration tests
      expect(true).toBe(true)
    })

    it.skip('should create HybridStorageProvider for hybrid type (integration test)', () => {
      // Skipped - requires AWS SDK mocking, tested in integration tests
      expect(true).toBe(true)
    })

    it('should throw error for unsupported storage type', () => {
      const config = {
        type: 'invalid' as VideoStorageConfig['type'],
      }

      expect(() => createVideoStorageProvider(config as VideoStorageConfig)).toThrow('Unsupported storage type')
    })
  })
})
