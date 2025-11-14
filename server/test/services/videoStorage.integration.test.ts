import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import {
  createVideoStorageProvider,
  VideoStorageProvider,
  VideoStorageConfig,
} from '../../src/services/videoStorage.js'
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

/**
 * Integration tests for S3 and Hybrid storage providers
 *
 * Prerequisites:
 * - LocalStack running on localhost:4566
 * - Start with: docker-compose -f docker-compose.test.yml up -d
 */

const TEST_BUCKET = 'test-video-storage'
const TEST_REGION = 'us-east-1'
const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566'

// Skip these tests if LocalStack is not available
const isLocalStackAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${LOCALSTACK_ENDPOINT}/_localstack/health`)
    return response.ok
  } catch {
    return false
  }
}

describe('S3 Storage Integration Tests', () => {
  let s3Client: S3Client
  let provider: VideoStorageProvider
  let tempDir: string
  let skipTests = false

  beforeAll(async () => {
    skipTests = !(await isLocalStackAvailable())

    if (skipTests) {
      console.log('⏭️  Skipping S3 integration tests - LocalStack not available')
      console.log('   Start LocalStack with: docker-compose -f docker-compose.test.yml up -d')
      return
    }

    // Configure S3 client for LocalStack
    s3Client = new S3Client({
      region: TEST_REGION,
      endpoint: LOCALSTACK_ENDPOINT,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      forcePathStyle: true, // Required for LocalStack
    })

    // Create test bucket
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }))
      console.log(`✅ Created test bucket: ${TEST_BUCKET}`)
    } catch (error) {
      console.log(`ℹ️  Bucket ${TEST_BUCKET} may already exist`)
    }

    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-s3-test-'))
  })

  afterAll(async () => {
    if (skipTests) return

    // Clean up test bucket
    try {
      // Delete all objects in bucket
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({ Bucket: TEST_BUCKET })
      )
      if (listResponse.Contents) {
        for (const object of listResponse.Contents) {
          if (object.Key) {
            await s3Client.send(
              new DeleteObjectCommand({ Bucket: TEST_BUCKET, Key: object.Key })
            )
          }
        }
      }
      // Delete bucket
      await s3Client.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET }))
      console.log(`✅ Cleaned up test bucket: ${TEST_BUCKET}`)
    } catch (error) {
      console.error('Error cleaning up test bucket:', error)
    }

    // Clean up temp directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    if (skipTests) {
      return
    }

    const config: VideoStorageConfig = {
      type: 's3',
      s3: {
        bucket: TEST_BUCKET,
        region: TEST_REGION,
        accessKeyId: 'test',
        secretAccessKey: 'test',
        endpoint: LOCALSTACK_ENDPOINT,
      },
      baseUrl: '/api/videos',
    }
    provider = createVideoStorageProvider(config)
  })

  afterEach(async () => {
    if (skipTests) return

    // Clean up any test files created
    try {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({ Bucket: TEST_BUCKET })
      )
      if (listResponse.Contents) {
        for (const object of listResponse.Contents) {
          if (object.Key) {
            await s3Client.send(
              new DeleteObjectCommand({ Bucket: TEST_BUCKET, Key: object.Key })
            )
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up test objects:', error)
    }
  })

  it('should upload and download video to S3', async () => {
    if (skipTests) {
      console.log('⏭️  Skipping test - LocalStack not available')
      return
    }

    // Create a test video file
    const testVideoPath = path.join(tempDir, 'test-upload.mp4')
    const testContent = Buffer.from('test video content for S3')
    await fs.writeFile(testVideoPath, testContent)

    // Upload to S3
    const s3Key = await provider.uploadVideo(testVideoPath, 'videos/test-upload.mp4')
    expect(s3Key).toBe('videos/test-upload.mp4')

    // Download and verify
    const result = await provider.getVideoStream('videos/test-upload.mp4')
    expect(result.contentType).toBe('video/mp4')
    expect(result.contentLength).toBe(testContent.length)
    expect(result.stream).toBeDefined()

    // Read stream content
    const chunks: Buffer[] = []
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk))
    }
    const downloadedContent = Buffer.concat(chunks)
    expect(downloadedContent.toString()).toBe(testContent.toString())
  })

  it('should generate pre-signed URL for video', async () => {
    if (skipTests) {
      console.log('⏭️  Skipping test - LocalStack not available')
      return
    }

    // Upload a test file first
    const testVideoPath = path.join(tempDir, 'test-presigned.mp4')
    await fs.writeFile(testVideoPath, 'test content')
    await provider.uploadVideo(testVideoPath, 'videos/test-presigned.mp4')

    // Generate pre-signed URL
    const url = await provider.getVideoUrl('videos/test-presigned.mp4', 3600)

    expect(url).toContain(TEST_BUCKET)
    expect(url).toContain('test-presigned.mp4')
    expect(url).toContain('X-Amz-Signature')

    // Verify URL works (fetch the video)
    const response = await fetch(url)
    expect(response.ok).toBe(true)
    const content = await response.text()
    expect(content).toBe('test content')
  })

  it('should delete video from S3', async () => {
    if (skipTests) {
      console.log('⏭️  Skipping test - LocalStack not available')
      return
    }

    // Upload a test file
    const testVideoPath = path.join(tempDir, 'test-delete.mp4')
    await fs.writeFile(testVideoPath, 'test content')
    await provider.uploadVideo(testVideoPath, 'videos/test-delete.mp4')

    // Verify it exists
    const existsBefore = await provider.exists('videos/test-delete.mp4')
    expect(existsBefore).toBe(true)

    // Delete it
    await provider.deleteVideo('videos/test-delete.mp4')

    // Verify it's gone
    const existsAfter = await provider.exists('videos/test-delete.mp4')
    expect(existsAfter).toBe(false)
  })

  it('should check if video exists in S3', async () => {
    if (skipTests) {
      console.log('⏭️  Skipping test - LocalStack not available')
      return
    }

    // Check non-existent file
    const existsBefore = await provider.exists('videos/non-existent.mp4')
    expect(existsBefore).toBe(false)

    // Upload a file
    const testVideoPath = path.join(tempDir, 'test-exists.mp4')
    await fs.writeFile(testVideoPath, 'test content')
    await provider.uploadVideo(testVideoPath, 'videos/test-exists.mp4')

    // Check it exists
    const existsAfter = await provider.exists('videos/test-exists.mp4')
    expect(existsAfter).toBe(true)
  })

  it('should get metadata for S3 video', async () => {
    if (skipTests) {
      console.log('⏭️  Skipping test - LocalStack not available')
      return
    }

    // Upload a test file
    const testVideoPath = path.join(tempDir, 'test-metadata.mp4')
    const testContent = Buffer.from('test video content')
    await fs.writeFile(testVideoPath, testContent)
    await provider.uploadVideo(testVideoPath, 'videos/test-metadata.mp4')

    // Get metadata
    const metadata = await provider.getMetadata('videos/test-metadata.mp4')

    expect(metadata.size).toBe(testContent.length)
    expect(metadata.contentType).toBe('video/mp4')
    expect(metadata.lastModified).toBeInstanceOf(Date)
  })

  it('should support range requests for S3 videos', async () => {
    if (skipTests) {
      console.log('⏭️  Skipping test - LocalStack not available')
      return
    }

    // Upload a test file
    const testVideoPath = path.join(tempDir, 'test-range.mp4')
    const testContent = Buffer.from('0123456789abcdefghij')
    await fs.writeFile(testVideoPath, testContent)
    await provider.uploadVideo(testVideoPath, 'videos/test-range.mp4')

    // Request a range
    const result = await provider.getVideoStream('videos/test-range.mp4', 'bytes=0-9')

    expect(result.contentLength).toBe(10)
    expect(result.range).toEqual({
      start: 0,
      end: 9,
      total: 20,
    })

    // Read the range content
    const chunks: Buffer[] = []
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk))
    }
    const rangeContent = Buffer.concat(chunks)
    expect(rangeContent.toString()).toBe('0123456789')
  })
})

describe('Hybrid Storage Integration Tests', () => {
  let s3Client: S3Client
  let provider: VideoStorageProvider
  let tempDir: string
  let skipTests = false

  beforeAll(async () => {
    skipTests = !(await isLocalStackAvailable())

    if (skipTests) {
      console.log('⏭️  Skipping Hybrid integration tests - LocalStack not available')
      return
    }

    // Configure S3 client
    s3Client = new S3Client({
      region: TEST_REGION,
      endpoint: LOCALSTACK_ENDPOINT,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      forcePathStyle: true,
    })

    // Create test bucket
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: TEST_BUCKET }))
    } catch {
      // Bucket may already exist
    }

    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-hybrid-test-'))
  })

  afterAll(async () => {
    if (skipTests) return

    // Clean up test bucket
    try {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({ Bucket: TEST_BUCKET })
      )
      if (listResponse.Contents) {
        for (const object of listResponse.Contents) {
          if (object.Key) {
            await s3Client.send(
              new DeleteObjectCommand({ Bucket: TEST_BUCKET, Key: object.Key })
            )
          }
        }
      }
      await s3Client.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET }))
    } catch (error) {
      console.error('Error cleaning up:', error)
    }

    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    if (skipTests) return

    const config: VideoStorageConfig = {
      type: 'hybrid',
      localPath: tempDir,
      s3: {
        bucket: TEST_BUCKET,
        region: TEST_REGION,
        accessKeyId: 'test',
        secretAccessKey: 'test',
        endpoint: LOCALSTACK_ENDPOINT,
      },
      baseUrl: '/api/videos',
    }
    provider = createVideoStorageProvider(config)
  })

  afterEach(async () => {
    if (skipTests) return

    // Clean up S3 objects
    try {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({ Bucket: TEST_BUCKET })
      )
      if (listResponse.Contents) {
        for (const object of listResponse.Contents) {
          if (object.Key) {
            await s3Client.send(
              new DeleteObjectCommand({ Bucket: TEST_BUCKET, Key: object.Key })
            )
          }
        }
      }
    } catch (error) {
      console.error('Error cleaning up:', error)
    }

    // Clean up local files
    const files = await fs.readdir(tempDir)
    for (const file of files) {
      await fs.unlink(path.join(tempDir, file)).catch(() => {})
    }
  })

  it('should prefer S3 storage in hybrid mode', async () => {
    if (skipTests) {
      console.log('⏭️  Skipping test - LocalStack not available')
      return
    }

    // Upload a test file
    const testVideoPath = path.join(tempDir, 'test-hybrid-s3.mp4')
    await fs.writeFile(testVideoPath, 'test content from S3')

    const s3Key = await provider.uploadVideo(testVideoPath, 'videos/test-hybrid.mp4')
    expect(s3Key).toBe('videos/test-hybrid.mp4')

    // Verify it went to S3 (not just local)
    const result = await provider.getVideoStream('videos/test-hybrid.mp4')
    const chunks: Buffer[] = []
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk))
    }
    const content = Buffer.concat(chunks)
    expect(content.toString()).toBe('test content from S3')
  })

  it('should fall back to local storage when S3 fails', async () => {
    if (skipTests) {
      console.log('⏭️  Skipping test - LocalStack not available')
      return
    }

    // Create a file in local storage
    const localVideoPath = path.join(tempDir, 'test-local-fallback.mp4')
    await fs.writeFile(localVideoPath, 'local content')

    // Try to get it (should fall back to local since it's not in S3)
    const result = await provider.getVideoStream('test-local-fallback.mp4')
    const chunks: Buffer[] = []
    for await (const chunk of result.stream) {
      chunks.push(Buffer.from(chunk))
    }
    const content = Buffer.concat(chunks)
    expect(content.toString()).toBe('local content')
  })
})
