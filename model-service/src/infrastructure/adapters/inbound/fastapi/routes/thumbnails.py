"""Thumbnail generation route.

Provides the endpoint for extracting thumbnails from video files.
"""

import logging

from fastapi import APIRouter, HTTPException
from opentelemetry import trace

from src.infrastructure.adapters.inbound.fastapi import models
from src.infrastructure.adapters.inbound.fastapi.dx_bodies import (
    as_request,
    as_response,
    dump,
)
from src.infrastructure.adapters.outbound.video.downloader import (
    cleanup_temp_video,
    download_video_if_needed,
)
from src.infrastructure.adapters.outbound.video.processor import (
    VideoProcessingError,
    extract_thumbnail,
)
from src.infrastructure.config.settings import get_settings

router = APIRouter()
tracer = trace.get_tracer(__name__)
logger = logging.getLogger(__name__)

_ThumbnailRequestBody = as_request(models.ThumbnailGenerateRequest)


@router.post(
    "/thumbnails/generate",
    response_model=as_response(models.ThumbnailGenerateResponse),
    responses={
        400: {"model": as_response(models.ErrorResponse)},
        404: {"model": as_response(models.ErrorResponse)},
        500: {"model": as_response(models.ErrorResponse)},
    },
    summary="Generate video thumbnail",
    description="Extract a thumbnail from a video at a specified timestamp using FFmpeg.",
)
async def generate_thumbnail(
    request: _ThumbnailRequestBody,
) -> dict[str, object]:
    """Generate a thumbnail from a video file.

    Parameters
    ----------
    request : ThumbnailGenerateRequest
        Thumbnail generation request with video_id, video_path,
        timestamp, and size.

    Returns
    -------
    ThumbnailGenerateResponse
        Generated thumbnail information.

    Raises
    ------
    HTTPException
        If video file not found or thumbnail generation fails.
    """
    with tracer.start_as_current_span("generate_thumbnail") as span:
        span.set_attribute("video_id", request.video_id)
        span.set_attribute("timestamp", request.timestamp)
        span.set_attribute("size", request.size)

        # Map size presets to dimensions
        size_map = {
            "small": (320, 180),
            "medium": (640, 360),
            "large": (1280, 720),
        }
        dimensions = size_map[request.size]

        # Thumbnails land in the same directory the processor validates
        # against. Defaults to ``/tmp/thumbnails`` so tests don't need to
        # mount a real video volume; operators point ``THUMBNAIL_OUTPUT_ROOT``
        # at the shared data disk in production.
        thumbnails_dir = get_settings().thumbnail_output_root
        thumbnails_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(thumbnails_dir / f"{request.video_id}_{request.size}.jpg")

        # Track if we downloaded a temporary file for cleanup
        temp_video_path: str | None = None

        try:
            # Download video if it is a URL (e.g., S3 pre-signed URL)
            video_path, is_temp = await download_video_if_needed(request.video_path)
            if is_temp:
                temp_video_path = video_path

            thumbnail_path = await extract_thumbnail(
                video_path=video_path,
                output_path=output_path,
                timestamp=request.timestamp,
                size=dimensions,
            )

            return dump(
                models.ThumbnailGenerateResponse(
                    video_id=request.video_id,
                    thumbnail_path=thumbnail_path,
                    timestamp=request.timestamp,
                    size=request.size,
                )
            )

        except VideoProcessingError as e:
            logger.error("Thumbnail generation failed: %s", type(e).__name__)
            raise HTTPException(
                status_code=500,
                detail=f"Thumbnail generation failed: {e!s}",
            ) from e
        except Exception as e:
            logger.error("Unexpected error during thumbnail generation: %s", e)
            raise HTTPException(
                status_code=500,
                detail="Unexpected error during thumbnail generation",
            ) from e
        finally:
            # Clean up temporary video file if downloaded
            if temp_video_path:
                cleanup_temp_video(temp_video_path)
