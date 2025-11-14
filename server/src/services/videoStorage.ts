import { Readable } from 'stream';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import { stat, access, unlink, copyFile } from 'fs/promises';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFile } from 'fs/promises';

/**
 * Video Storage Provider Interface
 *
 * Abstraction layer for video storage supporting multiple backends:
 * - Local filesystem storage
 * - S3/object storage
 * - Hybrid storage (metadata in one location, files in another)
 */

export interface VideoStorageProvider {
  /**
   * Get a readable stream for video content
   * Supports range requests for video streaming
   *
   * @param videoPath - Path or key to the video
   * @param range - Optional byte range (e.g., "bytes=0-1023")
   * @returns Stream, content length, and content type
   */
  getVideoStream(
    videoPath: string,
    range?: string
  ): Promise<{
    stream: Readable;
    contentLength: number;
    contentType: string;
    range?: { start: number; end: number; total: number };
  }>;

  /**
   * Get a URL for direct video access (signed if needed)
   * Used when frontend needs to access video directly (e.g., for MediaSource API)
   *
   * @param videoPath - Path or key to the video
   * @param expiresIn - URL expiration in seconds (for signed URLs)
   * @returns Accessible URL
   */
  getVideoUrl(videoPath: string, expiresIn?: number): Promise<string>;

  /**
   * Get a URL for thumbnail access
   *
   * @param thumbnailPath - Path or key to the thumbnail
   * @param expiresIn - URL expiration in seconds (for signed URLs)
   * @returns Accessible URL
   */
  getThumbnailUrl(thumbnailPath: string, expiresIn?: number): Promise<string>;

  /**
   * Upload a video to storage
   *
   * @param localPath - Local filesystem path to video
   * @param destinationPath - Destination path/key in storage
   * @returns Final storage path/key
   */
  uploadVideo(localPath: string, destinationPath: string): Promise<string>;

  /**
   * Delete a video from storage
   *
   * @param videoPath - Path or key to the video
   */
  deleteVideo(videoPath: string): Promise<void>;

  /**
   * Check if video exists in storage
   *
   * @param videoPath - Path or key to the video
   * @returns True if video exists
   */
  exists(videoPath: string): Promise<boolean>;

  /**
   * Get video metadata (size, content type)
   *
   * @param videoPath - Path or key to the video
   * @returns Metadata object
   */
  getMetadata(videoPath: string): Promise<{
    size: number;
    contentType: string;
    lastModified?: Date;
  }>;
}

export interface VideoStorageConfig {
  type: 'local' | 's3' | 'hybrid';

  // Local storage config
  localPath?: string;
  baseUrl?: string;

  // S3 storage config
  s3?: {
    bucket: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string; // For S3-compatible services (MinIO, DigitalOcean Spaces)
    publicBucket?: boolean;
  };

  // CDN config (optional)
  cdn?: {
    enabled: boolean;
    baseUrl: string;
    signedUrls: boolean;
  };

  // Thumbnail storage config
  thumbnails?: {
    storageType: 'local' | 's3';
    localPath?: string;
    s3Prefix?: string;
  };
}

/**
 * Factory function to create the appropriate storage provider
 * based on environment configuration
 */
export function createVideoStorageProvider(
  config: VideoStorageConfig
): VideoStorageProvider {
  switch (config.type) {
    case 'local':
      return new LocalStorageProvider(config);
    case 's3':
      return new S3StorageProvider(config);
    case 'hybrid':
      return new HybridStorageProvider(config);
    default:
      throw new Error(`Unsupported storage type: ${config.type}`);
  }
}

/**
 * Local Filesystem Storage Provider
 */
class LocalStorageProvider implements VideoStorageProvider {
  private basePath: string;
  private baseUrl: string;

  constructor(config: VideoStorageConfig) {
    if (!config.localPath) {
      throw new Error('Local storage path is required');
    }
    this.basePath = config.localPath;
    this.baseUrl = config.baseUrl || '/api/videos';
  }

  private getFullPath(videoPath: string): string {
    // Remove leading slash if present
    const cleanPath = videoPath.startsWith('/') ? videoPath.slice(1) : videoPath;
    return path.join(this.basePath, cleanPath);
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
    };
    return mimeTypes[ext] || 'video/mp4';
  }

  async getVideoStream(
    videoPath: string,
    range?: string
  ): Promise<{
    stream: Readable;
    contentLength: number;
    contentType: string;
    range?: { start: number; end: number; total: number };
  }> {
    const fullPath = this.getFullPath(videoPath);
    const stats = await stat(fullPath);
    const contentType = this.getContentType(fullPath);

    // Handle range requests
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = end - start + 1;

      const stream = createReadStream(fullPath, { start, end });

      return {
        stream,
        contentLength: chunkSize,
        contentType,
        range: {
          start,
          end,
          total: stats.size,
        },
      };
    }

    // Full file
    const stream = createReadStream(fullPath);
    return {
      stream,
      contentLength: stats.size,
      contentType,
    };
  }

  async getVideoUrl(videoPath: string, _expiresIn?: number): Promise<string> {
    // For local storage, return backend proxy URL
    // Extract video ID from path if it contains one
    const videoId = path.basename(videoPath, path.extname(videoPath));
    return `${this.baseUrl}/${videoId}/stream`;
  }

  async getThumbnailUrl(
    thumbnailPath: string,
    _expiresIn?: number
  ): Promise<string> {
    // Extract video ID from thumbnail path
    const videoId = path.basename(thumbnailPath, path.extname(thumbnailPath));
    return `/api/videos/${videoId}/thumbnail`;
  }

  async uploadVideo(
    localPath: string,
    destinationPath: string
  ): Promise<string> {
    const fullDestPath = this.getFullPath(destinationPath);
    const destDir = path.dirname(fullDestPath);

    // Create directory if it doesn't exist
    await fs.mkdir(destDir, { recursive: true });

    // Copy file to destination
    await copyFile(localPath, fullDestPath);

    return destinationPath;
  }

  async deleteVideo(videoPath: string): Promise<void> {
    const fullPath = this.getFullPath(videoPath);
    await unlink(fullPath);
  }

  async exists(videoPath: string): Promise<boolean> {
    const fullPath = this.getFullPath(videoPath);
    try {
      await access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(videoPath: string): Promise<{
    size: number;
    contentType: string;
    lastModified?: Date;
  }> {
    const fullPath = this.getFullPath(videoPath);
    const stats = await stat(fullPath);
    const contentType = this.getContentType(fullPath);

    return {
      size: stats.size,
      contentType,
      lastModified: stats.mtime,
    };
  }
}

/**
 * S3 Storage Provider
 */
class S3StorageProvider implements VideoStorageProvider {
  private s3Client: S3Client;
  private bucket: string;
  private publicBucket: boolean;

  constructor(private config: VideoStorageConfig) {
    if (!config.s3) {
      throw new Error('S3 configuration is required');
    }

    const s3Config = config.s3;
    this.bucket = s3Config.bucket;
    this.publicBucket = s3Config.publicBucket || false;

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: s3Config.region,
      credentials:
        s3Config.accessKeyId && s3Config.secretAccessKey
          ? {
              accessKeyId: s3Config.accessKeyId,
              secretAccessKey: s3Config.secretAccessKey,
            }
          : undefined, // Use IAM role if credentials not provided
      endpoint: s3Config.endpoint, // For S3-compatible services
      forcePathStyle: s3Config.endpoint ? true : undefined, // Required for LocalStack and S3-compatible services
    });
  }

  private getS3Key(videoPath: string): string {
    // Remove leading slash if present
    return videoPath.startsWith('/') ? videoPath.slice(1) : videoPath;
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'video/ogg',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async getVideoStream(
    videoPath: string,
    range?: string
  ): Promise<{
    stream: Readable;
    contentLength: number;
    contentType: string;
    range?: { start: number; end: number; total: number };
  }> {
    const key = this.getS3Key(videoPath);
    const contentType = this.getContentType(videoPath);

    // Get object metadata to determine size
    const headCommand = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const headResponse = await this.s3Client.send(headCommand);
    const totalSize = headResponse.ContentLength || 0;

    // Handle range requests
    const getCommand = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: range,
    });

    const response = await this.s3Client.send(getCommand);

    if (!response.Body) {
      throw new Error('Failed to get video stream from S3');
    }

    const stream = response.Body as Readable;
    const contentLength = response.ContentLength || totalSize;

    // Parse range if present
    if (range && response.ContentRange) {
      const rangeMatch = response.ContentRange.match(
        /bytes (\d+)-(\d+)\/(\d+)/
      );
      if (rangeMatch) {
        return {
          stream,
          contentLength,
          contentType: response.ContentType || contentType,
          range: {
            start: parseInt(rangeMatch[1], 10),
            end: parseInt(rangeMatch[2], 10),
            total: parseInt(rangeMatch[3], 10),
          },
        };
      }
    }

    return {
      stream,
      contentLength,
      contentType: response.ContentType || contentType,
    };
  }

  async getVideoUrl(videoPath: string, expiresIn = 3600): Promise<string> {
    const key = this.getS3Key(videoPath);

    // If using CDN, return CDN URL
    if (this.config.cdn?.enabled) {
      // TODO: Implement CDN signed URL generation if needed
      return `${this.config.cdn.baseUrl}/${key}`;
    }

    // If public bucket, return public URL
    if (this.publicBucket) {
      const endpoint = this.config.s3?.endpoint || `https://s3.${this.config.s3?.region}.amazonaws.com`;
      return `${endpoint}/${this.bucket}/${key}`;
    }

    // Generate pre-signed URL
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getThumbnailUrl(
    thumbnailPath: string,
    expiresIn = 3600
  ): Promise<string> {
    // Use same logic as getVideoUrl for thumbnails
    return this.getVideoUrl(thumbnailPath, expiresIn);
  }

  async uploadVideo(
    localPath: string,
    destinationPath: string
  ): Promise<string> {
    const key = this.getS3Key(destinationPath);
    const contentType = this.getContentType(localPath);

    // Read file from local filesystem
    const fileContent = await readFile(localPath);

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
    });

    await this.s3Client.send(command);

    return destinationPath;
  }

  async deleteVideo(videoPath: string): Promise<void> {
    const key = this.getS3Key(videoPath);

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async exists(videoPath: string): Promise<boolean> {
    const key = this.getS3Key(videoPath);

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  async getMetadata(videoPath: string): Promise<{
    size: number;
    contentType: string;
    lastModified?: Date;
  }> {
    const key = this.getS3Key(videoPath);

    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType || this.getContentType(videoPath),
      lastModified: response.LastModified,
    };
  }
}

/**
 * Hybrid Storage Provider
 * Supports scenarios like:
 * - Video files in S3, metadata in local DB
 * - Video files local, thumbnails in S3
 * - Failover from one storage to another
 */
class HybridStorageProvider implements VideoStorageProvider {
  private localProvider: LocalStorageProvider;
  private s3Provider: S3StorageProvider;
  private primaryStorage: 'local' | 's3';

  constructor(private config: VideoStorageConfig) {
    this.localProvider = new LocalStorageProvider({
      ...config,
      type: 'local',
    });
    this.s3Provider = new S3StorageProvider({
      ...config,
      type: 's3',
    });

    // Default to S3 as primary for hybrid mode
    this.primaryStorage = 's3';
  }

  private async tryBothProviders<T>(
    operation: (provider: VideoStorageProvider) => Promise<T>
  ): Promise<T> {
    const providers =
      this.primaryStorage === 's3'
        ? [this.s3Provider, this.localProvider]
        : [this.localProvider, this.s3Provider];

    let lastError: Error | undefined;

    for (const provider of providers) {
      try {
        return await operation(provider);
      } catch (error) {
        lastError = error as Error;
        // Continue to next provider
      }
    }

    throw lastError || new Error('All storage providers failed');
  }

  async getVideoStream(
    videoPath: string,
    range?: string
  ): Promise<{
    stream: Readable;
    contentLength: number;
    contentType: string;
    range?: { start: number; end: number; total: number };
  }> {
    return this.tryBothProviders((provider) =>
      provider.getVideoStream(videoPath, range)
    );
  }

  async getVideoUrl(videoPath: string, expiresIn?: number): Promise<string> {
    return this.tryBothProviders((provider) =>
      provider.getVideoUrl(videoPath, expiresIn)
    );
  }

  async getThumbnailUrl(
    thumbnailPath: string,
    expiresIn?: number
  ): Promise<string> {
    // Use thumbnail storage config to determine which provider
    const thumbnailStorageType = this.config.thumbnails?.storageType || 'local';

    if (thumbnailStorageType === 's3') {
      return this.s3Provider.getThumbnailUrl(thumbnailPath, expiresIn);
    } else {
      return this.localProvider.getThumbnailUrl(thumbnailPath, expiresIn);
    }
  }

  async uploadVideo(
    localPath: string,
    destinationPath: string
  ): Promise<string> {
    // Upload to primary storage
    if (this.primaryStorage === 's3') {
      try {
        return await this.s3Provider.uploadVideo(localPath, destinationPath);
      } catch (error) {
        // Fallback to local storage
        console.error('Failed to upload to S3, falling back to local:', error);
        return await this.localProvider.uploadVideo(localPath, destinationPath);
      }
    } else {
      return await this.localProvider.uploadVideo(localPath, destinationPath);
    }
  }

  async deleteVideo(videoPath: string): Promise<void> {
    // Try to delete from both locations (best effort)
    const errors: Error[] = [];

    try {
      await this.s3Provider.deleteVideo(videoPath);
    } catch (error) {
      errors.push(error as Error);
    }

    try {
      await this.localProvider.deleteVideo(videoPath);
    } catch (error) {
      errors.push(error as Error);
    }

    // If both failed, throw the first error
    if (errors.length === 2) {
      throw errors[0];
    }
  }

  async exists(videoPath: string): Promise<boolean> {
    // Check if video exists in either location
    const s3Exists = await this.s3Provider.exists(videoPath).catch(() => false);
    if (s3Exists) return true;

    const localExists = await this.localProvider
      .exists(videoPath)
      .catch(() => false);
    return localExists;
  }

  async getMetadata(videoPath: string): Promise<{
    size: number;
    contentType: string;
    lastModified?: Date;
  }> {
    return this.tryBothProviders((provider) =>
      provider.getMetadata(videoPath)
    );
  }
}

/**
 * Load storage configuration from environment variables
 */
export function loadStorageConfig(): VideoStorageConfig {
  const storageType = (process.env.VIDEO_STORAGE_TYPE || 'local') as
    | 'local'
    | 's3'
    | 'hybrid';

  const config: VideoStorageConfig = {
    type: storageType,
    localPath: process.env.VIDEO_STORAGE_PATH || '/data',
    baseUrl: process.env.VIDEO_BASE_URL || '/api/videos',
  };

  // S3 configuration
  if (storageType === 's3' || storageType === 'hybrid') {
    if (!process.env.S3_BUCKET || !process.env.S3_REGION) {
      throw new Error('S3_BUCKET and S3_REGION are required for S3 storage');
    }

    config.s3 = {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
      publicBucket: process.env.S3_PUBLIC_BUCKET === 'true',
    };
  }

  // CDN configuration
  if (process.env.CDN_ENABLED === 'true') {
    config.cdn = {
      enabled: true,
      baseUrl: process.env.CDN_BASE_URL || '',
      signedUrls: process.env.CDN_SIGNED_URLS !== 'false',
    };
  }

  // Thumbnail storage configuration
  config.thumbnails = {
    storageType:
      (process.env.THUMBNAIL_STORAGE_TYPE as 'local' | 's3') || 'local',
    localPath: process.env.THUMBNAIL_PATH || '/data/thumbnails',
    s3Prefix: process.env.THUMBNAIL_S3_PREFIX || 'thumbnails/',
  };

  return config;
}
