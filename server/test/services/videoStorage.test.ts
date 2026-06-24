import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import {
  createVideoStorageProvider,
  loadStorageConfig,
  parseByteRange,
  VideoStorageProvider,
  VideoStorageConfig,
} from '../../src/services/videoStorage.js'
import { RangeNotSatisfiableError } from '../../src/lib/errors.js'

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

    // Reads a Readable fully into a Buffer so range tests can assert the
    // exact bytes streamed, not just the declared content length.
    const collect = async (stream: import('stream').Readable): Promise<Buffer> => {
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(Buffer.from(chunk))
      return Buffer.concat(chunks)
    }

    it('serves a suffix range (the last N bytes Safari requests)', async () => {
      const result = await provider.getVideoStream('test-video.mp4', 'bytes=-5')

      expect(result.contentLength).toBe(5)
      expect(result.range).toEqual({ start: 13, end: 17, total: 18 })
      expect((await collect(result.stream)).toString()).toBe('ntent')
    })

    it('serves an open-ended range to the last byte', async () => {
      const result = await provider.getVideoStream('test-video.mp4', 'bytes=5-')

      expect(result.contentLength).toBe(13)
      expect(result.range).toEqual({ start: 5, end: 17, total: 18 })
      expect((await collect(result.stream)).toString()).toBe('video content')
    })

    it('clamps an end past EOF so Content-Length matches the bytes streamed', async () => {
      const result = await provider.getVideoStream('test-video.mp4', 'bytes=10-100')

      expect(result.range).toEqual({ start: 10, end: 17, total: 18 })
      expect(result.contentLength).toBe(8)
      expect((await collect(result.stream)).length).toBe(8)
    })

    it('treats an oversized suffix as the whole file', async () => {
      const result = await provider.getVideoStream('test-video.mp4', 'bytes=-100')

      expect(result.range).toEqual({ start: 0, end: 17, total: 18 })
      expect(result.contentLength).toBe(18)
    })

    it('rejects a range starting past EOF with RangeNotSatisfiableError', async () => {
      await expect(
        provider.getVideoStream('test-video.mp4', 'bytes=100-200')
      ).rejects.toBeInstanceOf(RangeNotSatisfiableError)
    })

    it('ignores a malformed range header and serves the full file', async () => {
      const result = await provider.getVideoStream('test-video.mp4', 'bytes=abc')

      expect(result.range).toBeUndefined()
      expect(result.contentLength).toBe(18)
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

    it('discovers videos recursively in subdirectories with relative keys', async () => {
      // Flat file already created in beforeEach: test-video.mp4
      await fs.mkdir(path.join(tempDir, 'team', 'qc'), { recursive: true })
      await fs.writeFile(path.join(tempDir, 'team', 'clip-a.mp4'), Buffer.from('a'))
      await fs.writeFile(path.join(tempDir, 'team', 'qc', 'clip-b.webm'), Buffer.from('b'))
      // A hidden directory and a non-video file must be ignored.
      await fs.mkdir(path.join(tempDir, '.hidden'), { recursive: true })
      await fs.writeFile(path.join(tempDir, '.hidden', 'secret.mp4'), Buffer.from('x'))
      await fs.writeFile(path.join(tempDir, 'team', 'notes.txt'), Buffer.from('n'))

      const result = await provider.listVideos()
      const filenames = result.videos.map((v) => v.filename).sort()

      expect(filenames).toEqual(['team/clip-a.mp4', 'team/qc/clip-b.webm', 'test-video.mp4'])
      // The hidden-dir video and the .txt are excluded.
      expect(filenames).not.toContain('.hidden/secret.mp4')
      // Subdir keys resolve back to real files on disk.
      const nested = result.videos.find((v) => v.filename === 'team/qc/clip-b.webm')
      expect(nested?.size).toBe(1)
    })

    it('returns an empty list when the storage directory does not exist', async () => {
      const missingProvider = createVideoStorageProvider({
        type: 'local',
        localPath: path.join(tempDir, 'does-not-exist'),
        baseUrl: '/api/videos',
      })
      const result = await missingProvider.listVideos()
      expect(result.videos).toEqual([])
      expect(result.isTruncated).toBe(false)
    })
  })

  // S3StorageProvider and HybridStorageProvider are tested in videoStorage.integration.test.ts

  describe('loadStorageConfig', () => {
    beforeEach(() => {
      // Clear environment variables
      delete process.env.VIDEO_STORAGE_TYPE
      delete process.env.STORAGE_PATH
      delete process.env.VIDEO_BASE_URL
      delete process.env.S3_BUCKET
      delete process.env.S3_REGION
      delete process.env.CDN_ENABLED
      delete process.env.THUMBNAIL_STORAGE_TYPE
    })

    it('should load local storage config with defaults', () => {
      const config = loadStorageConfig()

      expect(config.type).toBe('local')
      // STORAGE_PATH unset falls back to the unified repo-relative default
      // (<repo>/videos), an absolute path ending in `videos`.
      expect(config.localPath).toMatch(/[/\\]videos$/)
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

    // S3StorageProvider and HybridStorageProvider creation tested in integration tests

    describe('S3 + CDN getVideoUrl behavior', () => {
      const baseConfig: VideoStorageConfig = {
        type: 's3',
        s3: { bucket: 'test-bucket', region: 'us-east-1' },
      }

      it('returns the unsigned CDN URL when cdn.enabled is true and cdn.signedUrls is false', async () => {
        const config: VideoStorageConfig = {
          ...baseConfig,
          cdn: { enabled: true, baseUrl: 'https://cdn.example.com', signedUrls: false },
        }
        const provider = createVideoStorageProvider(config)
        const url = await provider.getVideoUrl('foo.mp4')
        expect(url).toBe('https://cdn.example.com/foo.mp4')
      })

      it('throws an actionable error when cdn.enabled is true and cdn.signedUrls is true', async () => {
        const config: VideoStorageConfig = {
          ...baseConfig,
          cdn: { enabled: true, baseUrl: 'https://cdn.example.com', signedUrls: true },
        }
        const provider = createVideoStorageProvider(config)
        await expect(provider.getVideoUrl('foo.mp4')).rejects.toThrow(
          /CDN signed URL generation is not implemented/i,
        )
        await expect(provider.getVideoUrl('foo.mp4')).rejects.toThrow(
          /CDN_SIGNED_URLS=false|cloudfront-signer/i,
        )
      })
    })

    it('should throw error for unsupported storage type', () => {
      const config = {
        type: 'invalid' as VideoStorageConfig['type'],
      }

      expect(() => createVideoStorageProvider(config as VideoStorageConfig)).toThrow('Unsupported storage type')
    })
  })
})

describe('parseByteRange', () => {
  const SIZE = 1000

  it('returns null when no range header is present', () => {
    expect(parseByteRange(undefined, SIZE)).toBeNull()
  })

  it('resolves a fully bounded range', () => {
    expect(parseByteRange('bytes=100-200', SIZE)).toEqual({ start: 100, end: 200 })
  })

  it('resolves an open-ended range to the last byte', () => {
    expect(parseByteRange('bytes=0-', SIZE)).toEqual({ start: 0, end: 999 })
    expect(parseByteRange('bytes=500-', SIZE)).toEqual({ start: 500, end: 999 })
  })

  it('resolves a suffix range to the last N bytes', () => {
    expect(parseByteRange('bytes=-500', SIZE)).toEqual({ start: 500, end: 999 })
  })

  it('clamps a suffix larger than the file to the whole file', () => {
    expect(parseByteRange('bytes=-5000', SIZE)).toEqual({ start: 0, end: 999 })
  })

  it('clamps an end past EOF to the last byte', () => {
    expect(parseByteRange('bytes=999-5000', SIZE)).toEqual({ start: 999, end: 999 })
  })

  it('reports a start past EOF as unsatisfiable', () => {
    expect(parseByteRange('bytes=1000-2000', SIZE)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=2000-', SIZE)).toBe('unsatisfiable')
  })

  it('reports a zero-length suffix and zero-size resource as unsatisfiable', () => {
    expect(parseByteRange('bytes=-0', SIZE)).toBe('unsatisfiable')
    expect(parseByteRange('bytes=0-100', 0)).toBe('unsatisfiable')
  })

  it('ignores malformed, multi-range, and non-bytes headers', () => {
    expect(parseByteRange('bytes=abc', SIZE)).toBeNull()
    expect(parseByteRange('bytes=-', SIZE)).toBeNull()
    expect(parseByteRange('bytes=0-100,200-300', SIZE)).toBeNull()
    expect(parseByteRange('items=0-100', SIZE)).toBeNull()
  })
})
