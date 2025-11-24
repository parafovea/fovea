---
title: Your First Video
sidebar_position: 4
---

# Your First Video

Add your own video files to FOVEA and start annotating. This guide covers video file requirements, metadata creation, and initial setup.

## Video File Requirements

FOVEA works with standard video formats served from the `/data` directory.

### Supported Formats

- **Format:** MP4 (H.264 codec recommended)
- **Resolution:** Any (tested up to 4K)
- **Frame rate:** Any (30fps standard)
- **Audio:** Optional

### File Size

- No hard limit
- Larger files take longer to process for AI operations
- Recommended: Under 1 GB for development

## Adding a Video

### Step 1: Place Video in Data Directory

Copy your video file to the `/data` directory:

```bash
# From your video location
cp my-video.mp4 /path/to/fovea/data/

# Verify file exists
ls /path/to/fovea/data/
```

For Docker deployments, the `/data` directory is mounted as a volume. Place files in the directory that maps to `/data`.

### Step 2: Create Metadata File

Each video requires a `.info.json` file with the same base name.

For `sample-video.mp4`, create `sample-video.info.json`:

```json
{
  "id": "unique-video-id",
  "title": "Baseball Spring Training Game",
  "description": "Practice game footage from March 15, 2025",
  "duration": 120.5,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "format": "mp4",
  "filePath": "sample-video.mp4"
}
```

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| id | string | Unique identifier | "spring-training-2025" |
| title | string | Display title | "Spring Training Game" |
| description | string | Video description | "Practice game footage" |
| duration | number | Duration in seconds | 120.5 |
| width | number | Video width in pixels | 1920 |
| height | number | Video height in pixels | 1080 |
| fps | number | Frames per second | 30 |
| filePath | string | Filename (must match) | "sample-video.mp4" |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| uploader | string | Person who uploaded the video |
| uploadDate | string | ISO 8601 date string |
| tags | array | Array of string tags |
| thumbnail | string | Path to thumbnail image |

### Complete Example

```json
{
  "id": "spring-training-2025-03-15",
  "title": "Baseball Spring Training Game",
  "description": "Practice game footage from March 15, 2025. Focus on pitcher mechanics and batting technique.",
  "duration": 3612.5,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "format": "mp4",
  "filePath": "spring-training-2025-03-15.mp4",
  "uploader": "John Doe",
  "uploadDate": "2025-03-15T14:30:00Z",
  "tags": ["baseball", "sports", "training", "pitcher"],
  "thumbnail": "spring-training-2025-03-15-thumb.jpg"
}
```

## Extracting Video Metadata

Use `ffprobe` to extract metadata from video files.

### Install ffprobe

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Verify installation
ffprobe -version
```

### Extract Metadata

```bash
ffprobe -v quiet -print_format json -show_format -show_streams your-video.mp4
```

Output includes:
- Duration
- Width and height
- Frame rate
- Codec information
- Bitrate

### Example Output

```json
{
  "streams": [
    {
      "codec_name": "h264",
      "width": 1920,
      "height": 1080,
      "r_frame_rate": "30/1",
      "duration": "120.500000"
    }
  ],
  "format": {
    "filename": "your-video.mp4",
    "duration": "120.500000",
    "size": "104857600",
    "bit_rate": "6970880"
  }
}
```

### Automated Metadata Generation

Create a Python script to generate `.info.json` files:

```python
#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

def get_video_metadata(video_path):
    """Extract metadata using ffprobe."""
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        str(video_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

def create_info_json(video_path, metadata):
    """Create .info.json file from ffprobe metadata."""
    video_stream = next(
        s for s in metadata['streams']
        if s['codec_type'] == 'video'
    )

    format_info = metadata['format']

    info = {
        "id": video_path.stem,
        "title": video_path.stem.replace('-', ' ').replace('_', ' ').title(),
        "description": f"Video file: {video_path.name}",
        "duration": float(format_info['duration']),
        "width": int(video_stream['width']),
        "height": int(video_stream['height']),
        "fps": eval(video_stream['r_frame_rate']),  # Converts "30/1" to 30
        "format": video_path.suffix[1:],  # Remove leading dot
        "filePath": video_path.name
    }

    info_path = video_path.with_suffix('.info.json')
    with open(info_path, 'w') as f:
        json.dump(info, f, indent=2)

    print(f"Created {info_path}")
    return info_path

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <video-file>")
        sys.exit(1)

    video_path = Path(sys.argv[1])

    if not video_path.exists():
        print(f"Error: {video_path} not found")
        sys.exit(1)

    metadata = get_video_metadata(video_path)
    create_info_json(video_path, metadata)
```

Save as `generate_video_metadata.py` and use:

```bash
chmod +x generate_video_metadata.py
./generate_video_metadata.py /path/to/fovea/data/my-video.mp4
```

## Directory Structure

After adding videos, your `/data` directory should look like:

```
/data/
  sample-video.mp4
  sample-video.info.json
  another-video.mp4
  another-video.info.json
  spring-game.mp4
  spring-game.info.json
```

## Verifying Video Appears

### Restart Backend (if running)

The backend scans the `/data` directory on startup:

```bash
# Stop backend
# Press Ctrl+C in the terminal running the backend

# Restart backend
cd server
npm run dev
```

For Docker:
```bash
docker compose restart backend
```

### Check Backend Logs

Look for video scanning messages:

```
INFO: Loading video sample-video.mp4
INFO: Metadata found for sample-video.mp4
INFO: Loaded 3 videos from /data
```

### Test API Endpoint

```bash
curl http://localhost:3001/api/videos
```

Should return JSON array with your videos:

```json
[
  {
    "id": "abc123def456",
    "filename": "sample-video.mp4",
    "title": "Baseball Spring Training Game",
    "description": "Practice game footage from March 15, 2025",
    ...
  }
]
```

### Check Frontend

1. Open http://localhost:3000 (or 5173 if using manual dev setup)
2. Navigate to Video Browser
3. Your video should appear in the list
4. Click on the video to open it for annotation

## Troubleshooting

### Video Not Appearing

**Check file permissions:**
```bash
ls -la /path/to/fovea/data/
# Files should be readable by the backend process
```

**Check .info.json is valid JSON:**
```bash
cat sample-video.info.json | python -m json.tool
# Should print formatted JSON without errors
```

**Check backend logs for errors:**
```bash
# Look for error messages related to video loading
# Common issues: invalid JSON, missing required fields, file not found
```

**Verify filePath matches:**
```bash
# .info.json filePath must exactly match the video filename
grep filePath sample-video.info.json
# Should show: "filePath": "sample-video.mp4"
```

### Video Won't Play

**Check video codec:**
```bash
ffprobe sample-video.mp4
# Look for codec_name: should be h264 or similar web-compatible codec
```

**Re-encode if needed:**
```bash
ffmpeg -i sample-video.mp4 -c:v libx264 -c:a aac sample-video-reencoded.mp4
```

**Check browser console:**
- Open Developer Tools (F12)
- Look for video loading errors
- Verify video URL is accessible

**Test video stream endpoint:**
```bash
# Get video ID from /api/videos
curl -I http://localhost:3001/api/videos/abc123def456/stream
# Should return 200 OK with Content-Type: video/mp4
```

### Metadata Extraction Fails

**Check ffprobe is installed:**
```bash
ffprobe -version
```

**Try alternative tool (MediaInfo):**
```bash
# Install MediaInfo
brew install mediainfo  # macOS
sudo apt-get install mediainfo  # Ubuntu

# Extract metadata
mediainfo --Output=JSON sample-video.mp4
```

**Manually create metadata:**
- Use VLC or similar player to get video properties
- Fill in required fields manually
- Save as `.info.json`

## Next Steps

### Start Annotating

1. Click on your video in the Video Browser
2. Video opens in the Annotation Workspace
3. Use the toolbar to draw bounding boxes
4. Add keyframes at different time points
5. Save your annotations

See [Creating Annotations](../user-guides/annotation/creating-annotations.md) for detailed instructions.

### Create a Persona

Before annotating, create a persona to define your analytical perspective:

1. Navigate to Personas tab
2. Click "New Persona"
3. Fill in role and information need
4. Build your ontology with entity types

See [Personas](../concepts/personas.md) for more information.

### Use AI Features

Once annotations are created:
- **Video Summarization:** Generate AI summaries of video content
- **Object Detection:** Automatically detect objects based on your ontology
- **Tracking:** Track objects across frames automatically

See [Automated Tracking](../user-guides/annotation/automated-tracking.md) for details.
