"""
Tests for model service API routes.

This module contains tests for the video summarization, ontology augmentation,
and object detection endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


class TestSummarizeEndpoint:
    """Tests for /api/summarize endpoint."""

    def test_summarize_video_success(self) -> None:
        """Test successful video summarization request."""
        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-123",
                "persona_id": "test-persona-456",
                "frame_sample_rate": 2,
                "max_frames": 20,
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert "id" in data
        assert data["video_id"] == "test-video-123"
        assert data["persona_id"] == "test-persona-456"
        assert "summary" in data
        assert isinstance(data["key_frames"], list)
        assert "confidence" in data

    def test_summarize_video_default_params(self) -> None:
        """Test summarization with default parameters."""
        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-789",
                "persona_id": "test-persona-012",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["video_id"] == "test-video-789"

    def test_summarize_video_missing_fields(self) -> None:
        """Test summarization with missing required fields."""
        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-123",
            },
        )

        assert response.status_code == 422

    def test_summarize_video_invalid_frame_rate(self) -> None:
        """Test summarization with invalid frame sample rate."""
        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-123",
                "persona_id": "test-persona-456",
                "frame_sample_rate": 20,  # Exceeds max of 10
            },
        )

        assert response.status_code == 422

    def test_summarize_response_structure(self) -> None:
        """Test that response contains all expected fields."""
        response = client.post(
            "/api/summarize",
            json={
                "video_id": "test-video-123",
                "persona_id": "test-persona-456",
            },
        )

        assert response.status_code == 200
        data = response.json()

        required_fields = [
            "id",
            "video_id",
            "persona_id",
            "summary",
            "confidence",
        ]
        for field in required_fields:
            assert field in data

        assert isinstance(data["key_frames"], list)
        if len(data["key_frames"]) > 0:
            key_frame = data["key_frames"][0]
            assert "frame_number" in key_frame
            assert "timestamp" in key_frame
            assert "description" in key_frame
            assert "confidence" in key_frame


class TestAugmentEndpoint:
    """Tests for /api/ontology/augment endpoint."""

    def test_augment_ontology_success(self) -> None:
        """Test successful ontology augmentation request."""
        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-123",
                "domain": "Wildlife research and animal behavior tracking",
                "existing_types": ["Mammal", "Bird"],
                "target_category": "entity",
                "max_suggestions": 5,
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert "id" in data
        assert data["persona_id"] == "test-persona-123"
        assert data["target_category"] == "entity"
        assert "suggestions" in data
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) <= 5
        assert "reasoning" in data

    def test_augment_ontology_event_category(self) -> None:
        """Test augmentation for event category."""
        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-456",
                "domain": "Sports analytics and game tracking",
                "target_category": "event",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["target_category"] == "event"

    def test_augment_ontology_invalid_category(self) -> None:
        """Test augmentation with invalid category."""
        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-789",
                "domain": "Test domain",
                "target_category": "invalid",
            },
        )

        assert response.status_code == 422

    def test_augment_ontology_default_max_suggestions(self) -> None:
        """Test augmentation with default max_suggestions."""
        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-012",
                "domain": "Medical procedures",
                "target_category": "entity",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["suggestions"]) <= 10

    def test_augment_response_suggestion_structure(self) -> None:
        """Test that suggestions have correct structure."""
        response = client.post(
            "/api/ontology/augment",
            json={
                "persona_id": "test-persona-345",
                "domain": "Urban planning",
                "target_category": "entity",
            },
        )

        assert response.status_code == 200
        data = response.json()

        if len(data["suggestions"]) > 0:
            suggestion = data["suggestions"][0]
            assert "name" in suggestion
            assert "description" in suggestion
            assert "confidence" in suggestion
            assert isinstance(suggestion["examples"], list)


class TestDetectionEndpoint:
    """Tests for /api/detection/process endpoint."""

    def test_process_detection_success(self) -> None:
        """Test successful object detection request."""
        response = client.post(
            "/api/detection/process",
            json={
                "video_id": "test-video-123",
                "query": "person wearing red shirt",
                "confidence_threshold": 0.5,
                "enable_tracking": True,
            },
        )

        assert response.status_code == 200
        data = response.json()

        assert "id" in data
        assert data["video_id"] == "test-video-123"
        assert data["query"] == "person wearing red shirt"
        assert "frames" in data
        assert isinstance(data["frames"], list)
        assert "total_detections" in data
        assert "processing_time" in data

    def test_process_detection_specific_frames(self) -> None:
        """Test detection on specific frames."""
        response = client.post(
            "/api/detection/process",
            json={
                "video_id": "test-video-456",
                "query": "vehicle",
                "frame_numbers": [0, 30, 60, 90],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["video_id"] == "test-video-456"

    def test_process_detection_no_tracking(self) -> None:
        """Test detection without tracking enabled."""
        response = client.post(
            "/api/detection/process",
            json={
                "video_id": "test-video-789",
                "query": "animal",
                "enable_tracking": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["video_id"] == "test-video-789"

    def test_process_detection_missing_query(self) -> None:
        """Test detection with missing query field."""
        response = client.post(
            "/api/detection/process",
            json={
                "video_id": "test-video-012",
            },
        )

        assert response.status_code == 422

    def test_process_detection_invalid_confidence(self) -> None:
        """Test detection with invalid confidence threshold."""
        response = client.post(
            "/api/detection/process",
            json={
                "video_id": "test-video-345",
                "query": "test",
                "confidence_threshold": 1.5,  # Exceeds max of 1.0
            },
        )

        assert response.status_code == 422

    def test_process_detection_response_structure(self) -> None:
        """Test that response contains all expected fields."""
        response = client.post(
            "/api/detection/process",
            json={
                "video_id": "test-video-678",
                "query": "test object",
            },
        )

        assert response.status_code == 200
        data = response.json()

        required_fields = [
            "id",
            "video_id",
            "query",
            "frames",
            "total_detections",
            "processing_time",
        ]
        for field in required_fields:
            assert field in data

        if len(data["frames"]) > 0:
            frame = data["frames"][0]
            assert "frame_number" in frame
            assert "timestamp" in frame
            assert "detections" in frame
            assert isinstance(frame["detections"], list)


class TestOpenAPIDocumentation:
    """Tests for OpenAPI documentation."""

    def test_openapi_schema_available(self) -> None:
        """Test that OpenAPI schema is available."""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        schema = response.json()
        assert "openapi" in schema
        assert "info" in schema
        assert "paths" in schema

    def test_api_endpoints_documented(self) -> None:
        """Test that all API endpoints are documented."""
        response = client.get("/openapi.json")
        schema = response.json()
        paths = schema["paths"]

        assert "/api/summarize" in paths
        assert "/api/ontology/augment" in paths
        assert "/api/detection/process" in paths

    def test_docs_ui_available(self) -> None:
        """Test that Swagger UI is available."""
        response = client.get("/docs")
        assert response.status_code == 200
