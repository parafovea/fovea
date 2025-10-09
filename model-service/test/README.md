# Model Service Test Suite

This directory contains the test suite for the fovea model service (AI/ML backend).

## Structure

```
test/
├── routes/                 # API endpoint tests
├── loaders/                # Model loader tests
├── utils/                  # Utility function tests
├── fixtures/               # Test data factories
├── conftest.py            # Pytest fixtures and configuration
├── test_main.py           # Main app tests
├── test_model_manager.py  # Model manager tests
├── test_observability.py  # Tracing/metrics tests
├── test_ontology_augmentation.py  # LLM ontology tests
└── test_summarization.py  # VLM summarization tests
```

## Test Organization

Tests are organized to **mirror the `src/` directory structure**:
- `src/routes.py` → `test/routes/test_routes.py`
- `src/detection_loader.py` → `test/loaders/test_detection_loader.py`
- `src/video_utils.py` → `test/utils/test_video_utils.py`

## Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=term-missing

# Run specific test file
pytest test/routes/test_routes.py

# Run specific test function
pytest test/routes/test_routes.py::TestSummarizeEndpoint::test_summarize_video_success

# Run with verbose output
pytest -v

# Run with output capture disabled
pytest -s
```

## Shared Resources

### Pytest Fixtures (`conftest.py`)
Shared fixtures available to all tests via pytest's automatic discovery.

**Available fixtures:**
- `client` - FastAPI TestClient for API requests
- `sample_video_path` - Path to sample video file
- `mock_persona_id` - Consistent persona ID for testing
- `mock_video_id` - Consistent video ID for testing

**Usage:**
```python
def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200

def test_summarize_endpoint(client, mock_video_id, mock_persona_id):
    response = client.post(f"/api/videos/{mock_video_id}/summarize", json={
        "persona_id": mock_persona_id
    })
    assert response.status_code == 200
```

### Test Fixtures (`fixtures/`)
Factory functions for creating test data.

**Available fixtures:**
- `create_persona()` - Persona dictionaries
- `create_entity_type()` - Entity type dictionaries
- `create_event_type()` - Event type dictionaries
- `create_ontology()` - Ontology dictionaries
- `create_baseball_scout_persona()` - Domain-specific persona
- `create_wildlife_researcher_persona()` - Domain-specific persona

**Usage:**
```python
from test.fixtures import create_persona, create_ontology

def test_ontology_augmentation():
    persona = create_persona({"name": "Baseball Scout"})
    ontology = create_ontology(
        persona_id=persona["id"],
        entity_types=[create_entity_type({"name": "Pitcher"})]
    )
    # ... test code
```

## Writing Tests

### Best Practices

1. **Use pytest fixtures** - Leverage conftest.py and fixture factories
2. **Use async/await properly** - Mark async tests with `@pytest.mark.asyncio`
3. **Mock model loading** - Don't load real models in unit tests
4. **Test error cases** - Don't just test happy paths
5. **Use descriptive test names** - Follow `test_<action>_<expected_result>` pattern

### Example Test

```python
import pytest
from test.fixtures import create_persona

class TestSummarizeEndpoint:
    """Tests for video summarization endpoint."""

    def test_summarize_video_success(self, client, mock_video_id):
        """Test successful video summarization request."""
        persona = create_persona({"name": "Baseball Scout"})

        response = client.post(
            f"/api/videos/{mock_video_id}/summarize",
            json={"persona_id": persona["id"]}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["video_id"] == mock_video_id
        assert data["persona_id"] == persona["id"]

    def test_summarize_video_missing_persona(self, client, mock_video_id):
        """Test summarization with invalid persona ID."""
        response = client.post(
            f"/api/videos/{mock_video_id}/summarize",
            json={"persona_id": "invalid-id"}
        )

        assert response.status_code == 404
```

### Async Tests

```python
import pytest

@pytest.mark.asyncio
async def test_async_operation(client):
    """Test asynchronous model loading."""
    # pytest-asyncio automatically handles async test execution
    result = await some_async_function()
    assert result is not None
```

## Mocking Models

For unit tests, mock model loading to avoid GPU/memory overhead:

```python
from unittest.mock import patch, MagicMock

@patch('src.vlm_loader.load_vlm_model')
def test_summarization_without_real_model(mock_load_model, client):
    """Test summarization logic without loading real model."""
    mock_model = MagicMock()
    mock_model.generate.return_value = "Baseball pitcher throwing curveball"
    mock_load_model.return_value = mock_model

    # ... test code
```

## Coverage

Coverage thresholds are configured in `pytest.ini`:
- Automatically runs with `--cov=src`
- Reports missing lines with `--cov-report=term-missing`
- Generates HTML report in `htmlcov/`
- Generates JSON report for CI/CD

## Configuration

- `pytest.ini` - Pytest configuration
- `conftest.py` - Shared fixtures
- `pyproject.toml` or `setup.py` - Python package configuration

## Test Markers

Custom markers can be added to `pytest.ini`:

```python
@pytest.mark.slow
def test_expensive_operation():
    # Long-running test
    pass

@pytest.mark.gpu
def test_gpu_inference():
    # Requires GPU
    pass
```

Run specific markers:
```bash
pytest -m "not slow"  # Skip slow tests
pytest -m gpu         # Run only GPU tests
```
