"""Pytest configuration and shared fixtures for model service tests.

This file is automatically loaded by pytest and provides fixtures
available to all tests.
"""

import importlib.metadata
import sys
import types

# Shim pkg_resources with importlib.metadata for Python 3.12+ environments
# where setuptools (which provides pkg_resources) is not installed.
# The opentelemetry-instrumentation packages import pkg_resources at
# module level to check dependency versions.
if "pkg_resources" not in sys.modules:
    _pkg_resources = types.ModuleType("pkg_resources")
    _pkg_resources.__path__ = []  # type: ignore[attr-defined]
    _pkg_resources.get_distribution = importlib.metadata.distribution  # type: ignore[attr-defined]
    sys.modules["pkg_resources"] = _pkg_resources

import pytest
from fastapi.testclient import TestClient


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
    # Imported lazily so test subsets that never use `client` (e.g. the
    # lairs-based interop suite in the codec venv) collect without pulling the
    # full FastAPI/video/model stack.
    from src.main import app

    return TestClient(app, base_url="http://testserver")


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
