"""
Tests for the main FastAPI application.

Tests cover health check endpoint, root endpoint, CORS configuration,
and application lifecycle management.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from src.main import app


@pytest.fixture
def client():
    """
    Create a test client for the FastAPI application.

    Returns:
        TestClient instance for making test requests
    """
    return TestClient(app)


def test_health_check(client):
    """
    Test the health check endpoint returns correct status.

    Verifies that the /health endpoint returns a 200 status code with
    the expected response structure including status, timestamp, and service name.
    """
    response = client.get("/health")

    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "model-service"
    assert "timestamp" in data

    # Verify timestamp is valid ISO format
    timestamp = datetime.fromisoformat(data["timestamp"])
    assert timestamp.tzinfo is not None


def test_health_check_timestamp_is_recent(client):
    """
    Test that health check timestamp is current.

    Verifies that the timestamp returned by the health check endpoint
    is within the last few seconds of the current time.
    """
    response = client.get("/health")
    data = response.json()

    timestamp = datetime.fromisoformat(data["timestamp"])
    now = datetime.now(UTC)

    # Timestamp should be within 5 seconds of now
    time_diff = abs((now - timestamp).total_seconds())
    assert time_diff < 5


def test_root_endpoint(client):
    """
    Test the root endpoint returns service information.

    Verifies that the / endpoint returns basic service information
    including service name, version, and documentation link.
    """
    response = client.get("/")

    assert response.status_code == 200

    data = response.json()
    assert data["service"] == "Fovea Model Service"
    assert data["version"] == "1.0.0"
    assert data["docs"] == "/docs"


def test_cors_headers(client):
    """
    Test that CORS headers are properly configured.

    Verifies that the application accepts requests from allowed origins
    and includes appropriate CORS headers in responses.
    """
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers
    assert "access-control-allow-methods" in response.headers


def test_openapi_docs_available(client):
    """
    Test that OpenAPI documentation is accessible.

    Verifies that the automatically generated OpenAPI documentation
    endpoints are available and return valid responses.
    """
    # Test OpenAPI JSON
    response = client.get("/openapi.json")
    assert response.status_code == 200

    openapi_data = response.json()
    assert openapi_data["info"]["title"] == "Fovea Model Service"
    assert openapi_data["info"]["version"] == "1.0.0"

    # Test Swagger UI
    response = client.get("/docs")
    assert response.status_code == 200


def test_health_check_content_type(client):
    """
    Test that health check returns JSON content type.

    Verifies that the response has the correct content-type header
    for JSON responses.
    """
    response = client.get("/health")

    assert response.status_code == 200
    assert "application/json" in response.headers["content-type"]


def test_multiple_health_checks(client):
    """
    Test that multiple health check requests return consistent results.

    Verifies that the service can handle multiple consecutive health
    check requests and returns healthy status for all.
    """
    for _ in range(5):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
