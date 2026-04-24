"""Tests for the thumbnail generation route.

Exercises the full request/response cycle through the FastAPI TestClient
with the video download and thumbnail extraction helpers patched. The
route itself owns: size-preset dispatch, temp-file cleanup on both
success and failure paths, and HTTPException translation from
``VideoProcessingError`` vs. unexpected errors.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from src.infrastructure.adapters.outbound.video.processor import VideoProcessingError
from src.main import app

if TYPE_CHECKING:
    from collections.abc import Generator


@pytest.fixture
def client() -> TestClient:
    """Return a TestClient bound to the main FastAPI app."""
    return TestClient(app)


@pytest.fixture
def patched_video_helpers() -> Generator[dict[str, MagicMock], None, None]:
    """Patch the two video helpers called by the thumbnails route.

    Yields a dict of the patched call mocks so each test can assert on
    which path was taken.
    """
    with (
        patch(
            "src.infrastructure.adapters.inbound.fastapi.routes.thumbnails.download_video_if_needed",
            new_callable=AsyncMock,
        ) as mock_download,
        patch(
            "src.infrastructure.adapters.inbound.fastapi.routes.thumbnails.extract_thumbnail",
            new_callable=AsyncMock,
        ) as mock_extract,
        patch(
            "src.infrastructure.adapters.inbound.fastapi.routes.thumbnails.cleanup_temp_video"
        ) as mock_cleanup,
    ):
        # Default: treat incoming path as local and return it unchanged.
        mock_download.return_value = ("/videos/source.mp4", False)
        mock_extract.return_value = "/videos/thumbnails/vid_medium.jpg"
        yield {
            "download": mock_download,
            "extract": mock_extract,
            "cleanup": mock_cleanup,
        }


class TestSuccessPath:
    """Happy-path 200 responses for each size preset."""

    @pytest.mark.parametrize("size", ["small", "medium", "large"])
    def test_returns_thumbnail_response_for_every_size(
        self,
        client: TestClient,
        patched_video_helpers: dict[str, MagicMock],
        size: str,
    ) -> None:
        response = client.post(
            "/api/thumbnails/generate",
            json={
                "video_id": "vid-42",
                "video_path": "/videos/source.mp4",
                "timestamp": 1.5,
                "size": size,
            },
        )

        assert response.status_code == 200
        body = response.json()
        assert body["video_id"] == "vid-42"
        assert body["size"] == size
        assert body["timestamp"] == 1.5
        assert body["thumbnail_path"] == "/videos/thumbnails/vid_medium.jpg"

    def test_maps_size_preset_to_dimensions(
        self,
        client: TestClient,
        patched_video_helpers: dict[str, MagicMock],
    ) -> None:
        response = client.post(
            "/api/thumbnails/generate",
            json={
                "video_id": "vid",
                "video_path": "/videos/source.mp4",
                "timestamp": 0.0,
                "size": "small",
            },
        )
        assert response.status_code == 200
        extract_kwargs = patched_video_helpers["extract"].call_args.kwargs
        assert extract_kwargs["size"] == (320, 180)

    def test_skips_cleanup_when_video_is_local(
        self,
        client: TestClient,
        patched_video_helpers: dict[str, MagicMock],
    ) -> None:
        patched_video_helpers["download"].return_value = ("/videos/source.mp4", False)
        client.post(
            "/api/thumbnails/generate",
            json={
                "video_id": "vid",
                "video_path": "/videos/source.mp4",
                "timestamp": 0.0,
                "size": "medium",
            },
        )
        patched_video_helpers["cleanup"].assert_not_called()


class TestTempFileCleanup:
    """When ``download_video_if_needed`` produced a temp file, it must be
    cleaned up on both success and failure paths."""

    def test_cleans_up_temp_on_success(
        self,
        client: TestClient,
        patched_video_helpers: dict[str, MagicMock],
    ) -> None:
        patched_video_helpers["download"].return_value = ("/tmp/video_abc.mp4", True)
        response = client.post(
            "/api/thumbnails/generate",
            json={
                "video_id": "vid",
                "video_path": "https://bucket.s3.amazonaws.com/video.mp4",
                "timestamp": 0.0,
                "size": "medium",
            },
        )
        assert response.status_code == 200
        patched_video_helpers["cleanup"].assert_called_once_with("/tmp/video_abc.mp4")

    def test_cleans_up_temp_on_processor_failure(
        self,
        client: TestClient,
        patched_video_helpers: dict[str, MagicMock],
    ) -> None:
        patched_video_helpers["download"].return_value = ("/tmp/video_abc.mp4", True)
        patched_video_helpers["extract"].side_effect = VideoProcessingError(
            "Could not open video"
        )
        response = client.post(
            "/api/thumbnails/generate",
            json={
                "video_id": "vid",
                "video_path": "https://bucket.s3.amazonaws.com/video.mp4",
                "timestamp": 0.0,
                "size": "medium",
            },
        )
        assert response.status_code == 500
        patched_video_helpers["cleanup"].assert_called_once_with("/tmp/video_abc.mp4")


class TestErrorPaths:
    """500 translation from both known and unexpected exceptions."""

    def test_video_processing_error_becomes_500(
        self,
        client: TestClient,
        patched_video_helpers: dict[str, MagicMock],
    ) -> None:
        patched_video_helpers["extract"].side_effect = VideoProcessingError(
            "Could not open video"
        )
        response = client.post(
            "/api/thumbnails/generate",
            json={
                "video_id": "vid",
                "video_path": "/videos/source.mp4",
                "timestamp": 0.0,
                "size": "medium",
            },
        )
        assert response.status_code == 500
        assert "Could not open video" in response.json()["detail"]

    def test_unexpected_exception_becomes_500_with_generic_detail(
        self,
        client: TestClient,
        patched_video_helpers: dict[str, MagicMock],
    ) -> None:
        patched_video_helpers["extract"].side_effect = RuntimeError("not a processing err")
        response = client.post(
            "/api/thumbnails/generate",
            json={
                "video_id": "vid",
                "video_path": "/videos/source.mp4",
                "timestamp": 0.0,
                "size": "medium",
            },
        )
        assert response.status_code == 500
        # The generic branch hides the underlying error message.
        assert response.json()["detail"] == "Unexpected error during thumbnail generation"


class TestRequestValidation:
    """Pydantic schema validation rejects bad input with 422."""

    def test_missing_video_id_returns_422(self, client: TestClient) -> None:
        response = client.post(
            "/api/thumbnails/generate",
            json={"video_path": "/v/x.mp4", "timestamp": 0.0, "size": "medium"},
        )
        assert response.status_code == 422

    def test_invalid_size_returns_422(self, client: TestClient) -> None:
        response = client.post(
            "/api/thumbnails/generate",
            json={
                "video_id": "vid",
                "video_path": "/v/x.mp4",
                "timestamp": 0.0,
                "size": "enormous",
            },
        )
        assert response.status_code == 422
