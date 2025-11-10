---
title: S3 Storage for Videos
sidebar_position: 2
---

# S3 Storage for Videos

FOVEA supports storing video files in Amazon S3 or S3-compatible storage services (MinIO, Wasabi, Backblaze B2, etc.). This guide explains how to configure and use S3 storage for your video files.

## Overview

S3 storage provides several advantages over local file storage:

- **Scalability**: Store unlimited videos without local disk constraints
- **Reliability**: Built-in redundancy and durability
- **Performance**: Concurrent access and streaming from cloud storage
- **Cost**: Pay only for storage used, no need for large local disks
- **Accessibility**: Access videos from multiple FOVEA deployments

## Architecture

When S3 storage is enabled, FOVEA:

1. Lists videos from a manifest file stored in S3
2. Generates presigned URLs for video playback
3. Streams video directly from S3 to the browser
4. Fetches metadata (`.info.json`) from S3 alongside videos

The backend acts as a proxy for S3 access, managing credentials and URL generation.

## Configuration

### Prerequisites

- S3 bucket created (AWS S3, MinIO, or compatible service)
- S3 access key ID and secret access key with read permissions
- Videos uploaded to the S3 bucket with accompanying `.info.json` files

### Environment Variables

Configure S3 access in your backend environment:

```bash
# S3 Configuration
S3_ENABLED=true
S3_ENDPOINT=https://s3.amazonaws.com  # Or your S3-compatible endpoint
S3_REGION=us-east-1
S3_BUCKET=your-fovea-videos
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_MANIFEST_KEY=manifest.json  # Optional, defaults to manifest.json
```

### Docker Compose Configuration

Add S3 environment variables to your `docker-compose.yml`:

```yaml
services:
  backend:
    environment:
      - S3_ENABLED=true
      - S3_ENDPOINT=${S3_ENDPOINT}
      - S3_REGION=${S3_REGION:-us-east-1}
      - S3_BUCKET=${S3_BUCKET}
      - S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
      - S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
```

Create a `.env` file in your project root with your S3 credentials:

```bash
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=my-fovea-videos
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
```

## S3 Bucket Structure

Organize your S3 bucket with the following structure:

```
your-fovea-videos/
├── manifest.json
├── video1.mp4
├── video1.info.json
├── video2.mp4
├── video2.info.json
└── subdirectory/
    ├── video3.mp4
    └── video3.info.json
```

### Manifest File

The `manifest.json` file lists all available videos:

```json
{
  "videos": [
    {
      "key": "video1.mp4",
      "size": 15728640,
      "lastModified": "2025-01-15T10:30:00Z"
    },
    {
      "key": "video2.mp4",
      "size": 20971520,
      "lastModified": "2025-01-16T14:20:00Z"
    },
    {
      "key": "subdirectory/video3.mp4",
      "size": 31457280,
      "lastModified": "2025-01-17T09:15:00Z"
    }
  ],
  "generatedAt": "2025-01-20T12:00:00Z"
}
```

### Metadata Files

Each video should have an accompanying `.info.json` metadata file:

**Example: `video1.info.json`**
```json
{
  "id": "video1",
  "title": "Sample Video 1",
  "description": "Description of the video",
  "upload_date": "20250115",
  "duration": 120,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "format": "mp4",
  "tags": ["sample", "test"]
}
```

## Generating the Manifest

You can generate the manifest file using AWS CLI, Python, or any S3 client:

### Using AWS CLI

```bash
#!/bin/bash
BUCKET=your-fovea-videos

# List all MP4 files and generate manifest
aws s3api list-objects-v2 \
  --bucket "$BUCKET" \
  --query 'Contents[?ends_with(Key, `.mp4`)]' \
  --output json | \
jq '{videos: [.[] | {key: .Key, size: .Size, lastModified: .LastModified}], generatedAt: now | todate}' \
  > manifest.json

# Upload manifest to S3
aws s3 cp manifest.json "s3://$BUCKET/manifest.json"
```

### Using Python

```python
import boto3
import json
from datetime import datetime

s3 = boto3.client('s3')
BUCKET = 'your-fovea-videos'

# List all MP4 files
response = s3.list_objects_v2(Bucket=BUCKET)
videos = [
    {
        'key': obj['Key'],
        'size': obj['Size'],
        'lastModified': obj['LastModified'].isoformat()
    }
    for obj in response.get('Contents', [])
    if obj['Key'].endswith('.mp4')
]

# Create manifest
manifest = {
    'videos': videos,
    'generatedAt': datetime.utcnow().isoformat() + 'Z'
}

# Upload to S3
s3.put_object(
    Bucket=BUCKET,
    Key='manifest.json',
    Body=json.dumps(manifest, indent=2),
    ContentType='application/json'
)

print(f"Manifest generated with {len(videos)} videos")
```

## Uploading Videos

### Using AWS CLI

```bash
# Upload video and metadata
aws s3 cp video1.mp4 s3://your-fovea-videos/video1.mp4
aws s3 cp video1.info.json s3://your-fovea-videos/video1.info.json

# Regenerate manifest after upload
./generate-manifest.sh
```

### Using AWS SDK (Python)

```python
import boto3

s3 = boto3.client('s3')
BUCKET = 'your-fovea-videos'

# Upload video
with open('video1.mp4', 'rb') as video:
    s3.upload_fileobj(video, BUCKET, 'video1.mp4')

# Upload metadata
with open('video1.info.json', 'rb') as metadata:
    s3.upload_fileobj(metadata, BUCKET, 'video1.info.json')
```

## Bucket Permissions

Your S3 bucket needs appropriate permissions. Here's a minimal IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FOVEAReadAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-fovea-videos",
        "arn:aws:s3:::your-fovea-videos/*"
      ]
    }
  ]
}
```

For private buckets, FOVEA generates presigned URLs with temporary access.

## S3-Compatible Services

FOVEA works with any S3-compatible service:

### MinIO

```bash
S3_ENDPOINT=https://minio.example.com
S3_REGION=us-east-1  # Can be arbitrary for MinIO
S3_BUCKET=fovea-videos
```

### Wasabi

```bash
S3_ENDPOINT=https://s3.us-east-1.wasabisys.com
S3_REGION=us-east-1
S3_BUCKET=fovea-videos
```

### Backblaze B2

```bash
S3_ENDPOINT=https://s3.us-west-001.backblazeb2.com
S3_REGION=us-west-001
S3_BUCKET=fovea-videos
```

## Troubleshooting

### Videos Not Appearing

1. **Check S3 configuration**: Verify environment variables are set correctly
2. **Verify manifest**: Ensure `manifest.json` exists and is valid JSON
3. **Check credentials**: Test S3 access with AWS CLI:
   ```bash
   aws s3 ls s3://your-fovea-videos/
   ```
4. **Review backend logs**: Check for S3 connection errors:
   ```bash
   docker compose logs backend | grep S3
   ```

### Playback Failures

1. **Verify video format**: Ensure videos are MP4 with H.264 codec
2. **Check presigned URLs**: Backend logs should show URL generation
3. **CORS configuration**: For custom S3 endpoints, configure CORS:
   ```json
   {
     "CORSRules": [
       {
         "AllowedOrigins": ["http://localhost:3000"],
         "AllowedMethods": ["GET"],
         "AllowedHeaders": ["*"]
       }
     ]
   }
   ```

### Permission Errors

1. **Check IAM permissions**: Ensure `s3:GetObject` and `s3:ListBucket`
2. **Verify bucket policy**: Bucket must allow access from your credentials
3. **Test with AWS CLI**: Confirm credentials work outside FOVEA

## Migration from Local Storage

To migrate from local file storage to S3:

1. **Upload existing videos** from `data/` directory to S3
2. **Generate manifest** with all uploaded videos
3. **Enable S3** in backend configuration
4. **Restart services**: `docker compose restart backend`
5. **Verify**: Videos should now load from S3

Local storage and S3 storage cannot be used simultaneously. Choose one storage backend.

## Performance Considerations

- **Presigned URL expiration**: URLs expire after 1 hour by default
- **Caching**: Browser caches video segments for smoother playback
- **Bandwidth**: S3 bandwidth is metered; monitor usage for cost control
- **Latency**: S3 access is slower than local files; use CDN for production

## Security Best Practices

1. **Use IAM roles** instead of access keys when running on AWS EC2
2. **Rotate credentials** regularly
3. **Enable bucket versioning** to prevent accidental deletions
4. **Use private buckets** with presigned URLs (FOVEA default)
5. **Enable S3 access logging** for audit trails

## See Also

- [Getting Started: First Video](../../getting-started/first-video.md): Working with video files
- [Deployment: Configuration](../../deployment/configuration.md): Environment variable reference
- [S3 Deployment Guide](../../deployment/s3-configuration.md): Production S3 setup
