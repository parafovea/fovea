---
title: Quick Start
sidebar_position: 2
---

# Quick Start

Get Fovea running and explore your first video.

## Step 1: Prepare Video Files

Place video files and their metadata in the `/data` directory. For each video file, create a corresponding `.info.json` file with the same base name:

```bash
/data/
  your-video.mp4
  your-video.info.json
```

The `.info.json` file should contain video metadata in this format:

```json
{
  "id": "unique-video-id",
  "title": "Video Title",
  "description": "Brief description of the video content",
  "duration": 120.5,
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "format": "mp4",
  "uploader": "Creator Name",
  "uploadDate": "2024-01-15",
  "tags": ["tag1", "tag2"],
  "thumbnail": "thumbnail.jpg",
  "filePath": "your-video.mp4"
}
```

Required fields: `id`, `title`, `description`, `duration`, `width`, `height`, `filePath`. All other fields are optional.

The backend scans the `/data` directory and serves videos to the annotation interface.

## Step 2: Start Fovea

```bash
docker compose up
```

Wait for all services to start. The frontend will be available at http://localhost:3000

## Step 3: Browse Videos

1. Open http://localhost:3000 in your browser
2. The Video Browser displays all videos from `/data`
3. Use the search bar to filter videos by title, description, or tags
4. Click **Annotate** on a video card to begin

## Step 4: Create Annotations

The annotation workspace provides:
- Video playback controls
- **Detect Objects** button to run object detection models
- Annotation list showing existing annotations
- Type/Object mode toggle for linking annotations to types or world objects

## Next Steps

- Explore [persona-based ontologies](../concepts/personas.md)
- Learn about the [annotation model](../concepts/annotation-model.md)
- Visit [http://localhost:3001/admin/queues](http://localhost:3001/admin/queues) to monitor model service jobs
