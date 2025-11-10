---
title: S3 Configuration
sidebar_position: 7
---

# S3 Storage Configuration

This guide covers production deployment of FOVEA with S3 storage for video files. For general S3 usage, see the [S3 Storage User Guide](../user-guides/video-management/s3-storage.md).

## Production Architecture

In production, FOVEA uses S3 for video storage with the following architecture:

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Browser   │────────▶│   Frontend   │────────▶│   Backend    │
└─────────────┘         │  (React App) │         │  (Fastify)   │
      │                 └──────────────┘         └──────────────┘
      │                                                  │
      │                                                  │
      │                                           ┌──────▼──────┐
      └──────────── Presigned URL ───────────────│   AWS S3    │
                                                  │   Bucket    │
                                                  └─────────────┘
```

1. Backend generates presigned URLs for video access
2. Browser streams video directly from S3
3. No video data passes through backend (efficient bandwidth usage)

## AWS S3 Setup

### 1. Create S3 Bucket

```bash
# Using AWS CLI
aws s3 mb s3://fovea-production-videos --region us-east-1

# Configure bucket settings
aws s3api put-bucket-versioning \
  --bucket fovea-production-videos \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket fovea-production-videos \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'
```

### 2. Configure CORS

Allow frontend to access S3 directly via presigned URLs:

```bash
aws s3api put-bucket-cors \
  --bucket fovea-production-videos \
  --cors-configuration file://cors.json
```

**cors.json:**
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://fovea.yourcompany.com"
      ],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

### 3. Create IAM User

Create a dedicated IAM user for FOVEA:

```bash
aws iam create-user --user-name fovea-production

# Attach policy (see below)
aws iam put-user-policy \
  --user-name fovea-production \
  --policy-name FOVEAVideoAccess \
  --policy-document file://policy.json

# Create access key
aws iam create-access-key --user-name fovea-production
```

**policy.json:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::fovea-production-videos",
        "arn:aws:s3:::fovea-production-videos/*"
      ]
    }
  ]
}
```

Save the access key ID and secret access key for environment configuration.

### 4. Configure Bucket Lifecycle (Optional)

Automatically transition old videos to cheaper storage:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket fovea-production-videos \
  --lifecycle-configuration file://lifecycle.json
```

**lifecycle.json:**
```json
{
  "Rules": [
    {
      "Id": "ArchiveOldVideos",
      "Status": "Enabled",
      "Filter": {
        "Prefix": ""
      },
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "STANDARD_IA"
        },
        {
          "Days": 365,
          "StorageClass": "GLACIER"
        }
      ]
    }
  ]
}
```

## Environment Configuration

### Docker Deployment

Update `docker-compose.prod.yml`:

```yaml
services:
  backend:
    environment:
      # S3 Storage
      - S3_ENABLED=true
      - S3_ENDPOINT=https://s3.amazonaws.com
      - S3_REGION=us-east-1
      - S3_BUCKET=fovea-production-videos
      - S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}
      - S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}
      - S3_MANIFEST_KEY=manifest.json

      # Security
      - NODE_ENV=production
      - FRONTEND_URL=https://fovea.yourcompany.com
```

### EC2 with IAM Role (Recommended)

For deployments on AWS EC2, use IAM instance roles instead of access keys:

1. **Create IAM Role**:
   ```bash
   aws iam create-role \
     --role-name FOVEA-EC2-S3-Access \
     --assume-role-policy-document file://trust-policy.json
   ```

   **trust-policy.json:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {"Service": "ec2.amazonaws.com"},
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```

2. **Attach Policy**:
   ```bash
   aws iam attach-role-policy \
     --role-name FOVEA-EC2-S3-Access \
     --policy-arn arn:aws:iam::YOUR_ACCOUNT_ID:policy/FOVEAVideoAccess
   ```

3. **Create Instance Profile**:
   ```bash
   aws iam create-instance-profile \
     --instance-profile-name FOVEA-EC2-Profile

   aws iam add-role-to-instance-profile \
     --instance-profile-name FOVEA-EC2-Profile \
     --role-name FOVEA-EC2-S3-Access
   ```

4. **Attach to EC2 Instance**:
   ```bash
   aws ec2 associate-iam-instance-profile \
     --instance-id i-1234567890abcdef0 \
     --iam-instance-profile Name=FOVEA-EC2-Profile
   ```

5. **Update Docker Compose** (no access keys needed):
   ```yaml
   services:
     backend:
       environment:
         - S3_ENABLED=true
         - S3_REGION=us-east-1
         - S3_BUCKET=fovea-production-videos
         # S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY not needed
         # AWS SDK will use IAM role automatically
   ```

## CloudFront CDN (Optional)

For global deployment, use CloudFront as a CDN in front of S3:

### 1. Create CloudFront Distribution

```bash
aws cloudfront create-distribution \
  --distribution-config file://cloudfront-config.json
```

**cloudfront-config.json:**
```json
{
  "CallerReference": "fovea-videos-cdn",
  "Comment": "FOVEA Video CDN",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "S3-fovea-production-videos",
        "DomainName": "fovea-production-videos.s3.amazonaws.com",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        }
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "S3-fovea-production-videos",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"]
    },
    "ForwardedValues": {
      "QueryString": true,
      "Headers": {
        "Quantity": 0
      }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  }
}
```

### 2. Update Backend Configuration

```yaml
services:
  backend:
    environment:
      - S3_ENABLED=true
      - S3_ENDPOINT=https://d1234567890abc.cloudfront.net
      - S3_BUCKET=fovea-production-videos
      # Other S3 vars...
```

## Video Upload Pipeline

Automate video uploads with a CI/CD pipeline:

### GitHub Actions Example

**.github/workflows/upload-videos.yml:**
```yaml
name: Upload Videos to S3

on:
  push:
    paths:
      - 'videos/**'

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Upload Videos
        run: |
          for video in videos/*.mp4; do
            aws s3 cp "$video" "s3://fovea-production-videos/"
            aws s3 cp "${video%.mp4}.info.json" "s3://fovea-production-videos/"
          done

      - name: Generate Manifest
        run: |
          python scripts/generate-manifest.py
          aws s3 cp manifest.json s3://fovea-production-videos/manifest.json
```

### AWS Lambda Trigger (Advanced)

Automatically update manifest when videos are uploaded:

```python
# lambda_function.py
import boto3
import json
from datetime import datetime

s3 = boto3.client('s3')
BUCKET = 'fovea-production-videos'

def lambda_handler(event, context):
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

    # Update manifest
    manifest = {
        'videos': videos,
        'generatedAt': datetime.utcnow().isoformat() + 'Z'
    }

    s3.put_object(
        Bucket=BUCKET,
        Key='manifest.json',
        Body=json.dumps(manifest, indent=2),
        ContentType='application/json'
    )

    return {'statusCode': 200, 'body': f'{len(videos)} videos'}
```

Trigger this Lambda whenever a `.mp4` file is uploaded to S3.

## Monitoring and Logging

### S3 Access Logging

Enable S3 access logs for audit and debugging:

```bash
aws s3api put-bucket-logging \
  --bucket fovea-production-videos \
  --bucket-logging-status '{
    "LoggingEnabled": {
      "TargetBucket": "fovea-logs",
      "TargetPrefix": "s3-access/"
    }
  }'
```

### CloudWatch Metrics

Monitor S3 usage with CloudWatch:

- **Requests**: Track GET/HEAD request counts
- **Bandwidth**: Monitor data transfer
- **Errors**: Alert on 4xx/5xx errors

### Backend Logs

Backend logs S3 operations:

```bash
# View S3-related logs
docker compose logs backend | grep S3

# Common log messages
# [INFO] S3 enabled, using bucket: fovea-production-videos
# [INFO] Generated presigned URL for video: video1.mp4
# [ERROR] S3 error: Access Denied
```

## Cost Optimization

### 1. Use Intelligent Tiering

```bash
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket fovea-production-videos \
  --id AutoTiering \
  --intelligent-tiering-configuration '{
    "Id": "AutoTiering",
    "Status": "Enabled",
    "Tierings": [
      {
        "Days": 90,
        "AccessTier": "ARCHIVE_ACCESS"
      },
      {
        "Days": 180,
        "AccessTier": "DEEP_ARCHIVE_ACCESS"
      }
    ]
  }'
```

### 2. Compress Videos

Store videos in efficient codecs:
- **Codec**: H.264/H.265
- **Container**: MP4
- **Bitrate**: Optimize for quality vs. size

### 3. Monitor Costs

```bash
# Get bucket size
aws s3 ls s3://fovea-production-videos --recursive --summarize

# Estimate monthly cost (assuming Standard storage at $0.023/GB)
# For 1TB = $23.50/month storage + data transfer costs
```

## Disaster Recovery

### Bucket Replication

Replicate to another region for disaster recovery:

```bash
aws s3api put-bucket-replication \
  --bucket fovea-production-videos \
  --replication-configuration file://replication.json
```

**replication.json:**
```json
{
  "Role": "arn:aws:iam::ACCOUNT_ID:role/S3-Replication-Role",
  "Rules": [
    {
      "Status": "Enabled",
      "Priority": 1,
      "Filter": {},
      "Destination": {
        "Bucket": "arn:aws:s3:::fovea-backup-videos",
        "ReplicationTime": {
          "Status": "Enabled",
          "Time": {"Minutes": 15}
        }
      }
    }
  ]
}
```

### Backup Strategy

1. **Versioning**: Enable bucket versioning (prevents accidental deletes)
2. **Replication**: Cross-region replication for redundancy
3. **Snapshots**: Periodic manifests saved as backups
4. **Testing**: Regularly test restoration from backup bucket

## Troubleshooting

### Backend Can't Access S3

Check credentials and permissions:

```bash
# Test with AWS CLI
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
aws s3 ls s3://fovea-production-videos/
```

### CORS Errors in Browser

1. Verify CORS configuration on bucket
2. Check frontend URL matches `AllowedOrigins`
3. Inspect browser console for specific CORS error

### Presigned URL Expired

Presigned URLs expire after 1 hour. If playback fails mid-stream:
- Backend generates fresh URLs automatically
- Check for clock skew between client and server

### High S3 Costs

1. Review bucket size: `aws s3 ls s3://fovea-production-videos --recursive --summarize`
2. Check request metrics in CloudWatch
3. Enable lifecycle policies to archive old videos
4. Consider CloudFront CDN to reduce S3 requests

## See Also

- [S3 Storage User Guide](../user-guides/video-management/s3-storage.md): General S3 usage
- [Deployment Overview](./overview.md): General deployment guide
- [Configuration Reference](./configuration.md): All environment variables
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/): Official AWS S3 docs
