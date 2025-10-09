"""
Pytest configuration and shared fixtures for model service tests.
This file is automatically loaded by pytest and provides fixtures available to all tests.
"""

import pytest
from fastapi.testclient import TestClient
from src.main import app


@pytest.fixture
def client() -> TestClient:
    """
    Creates a FastAPI test client for making HTTP requests to the model service.

    Returns:
        TestClient instance configured with the model service app

    Example:
        ```python
        def test_health_endpoint(client):
            response = client.get("/health")
            assert response.status_code == 200
        ```
    """
    return TestClient(app)


@pytest.fixture
def sample_video_path() -> str:
    """
    Provides a path to a sample video file for testing.

    Returns:
        Path to sample video file

    Example:
        ```python
        def test_video_processing(sample_video_path):
            result = process_video(sample_video_path)
            assert result is not None
        ```
    """
    return "test/fixtures/sample.mp4"


@pytest.fixture
def mock_persona_id() -> str:
    """
    Provides a consistent persona ID for testing.

    Returns:
        UUID string representing a test persona

    Example:
        ```python
        def test_summarize_with_persona(mock_persona_id):
            result = summarize(video_id="test", persona_id=mock_persona_id)
            assert result.persona_id == mock_persona_id
        ```
    """
    return "test-persona-123"


@pytest.fixture
def mock_video_id() -> str:
    """
    Provides a consistent video ID for testing.

    Returns:
        UUID string representing a test video

    Example:
        ```python
        def test_detection_endpoint(client, mock_video_id):
            response = client.post(f"/api/videos/{mock_video_id}/detect")
            assert response.status_code == 200
        ```
    """
    return "test-video-456"
