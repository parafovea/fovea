---
title: Python Development
---

# Python Development

The model service provides AI capabilities for video summarization, object detection, tracking, and ontology augmentation. Built with Python 3.12, FastAPI 0.110+, and PyTorch 2.5+, it uses SGLang 0.4+ for primary inference with vLLM 0.6+ fallback.

## Development Environment

### Prerequisites

- Python 3.12+
- CUDA 12.1+ (for GPU mode)
- Redis 7 (for job coordination)
- FFmpeg (for video processing)

### Initial Setup

```bash
cd model-service
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Development Installation

Install with dev dependencies:

```bash
pip install -e ".[dev]"
```

This installs pytest, httpx, mypy, ruff, and other development tools.

### Configuration

Create `.env` file:

```bash
DEVICE=cpu              # or cuda for GPU
BUILD_MODE=minimal      # or full for production inference
REDIS_URL=redis://localhost:6379
LOG_LEVEL=INFO
```

### Start Development Server

```bash
uvicorn src.main:app --reload --port 8000
```

Server starts at `http://localhost:8000` with auto-reload on file changes.

## Project Structure

```
model-service/
├── src/
│   ├── main.py              # FastAPI application entry point
│   ├── routes.py            # API endpoint definitions
│   ├── summarization.py     # Video summarization logic
│   ├── detection.py         # Object detection logic
│   ├── tracking.py          # Video tracking logic
│   ├── augmentation.py      # Ontology augmentation logic
│   ├── model_manager.py     # Model loading and caching
│   ├── llm_loader.py        # LLM model loader
│   ├── vlm_loader.py        # VLM model loader
│   ├── detection_loader.py  # Detection model loader
│   ├── tracking_loader.py   # Tracking model loader
│   ├── video_utils.py       # Video processing utilities
│   └── otel_config.py       # OpenTelemetry configuration
├── config/
│   └── models.yaml          # Model configuration
├── test/
│   ├── test_routes.py       # API endpoint tests
│   ├── test_model_manager.py
│   ├── test_llm_loader.py
│   ├── test_vlm_loader.py
│   ├── test_detection_loader.py
│   ├── test_tracking_loader.py
│   └── test_video_utils.py
└── requirements.txt         # Production dependencies
```

## Running the Model Service

### Development Mode

```bash
uvicorn src.main:app --reload --port 8000
```

FastAPI auto-reloads when source files change.

### Production Mode

```bash
uvicorn src.main:app --host 0.0.0.0 --port 8000 --workers 4
```

Runs with multiple worker processes for production traffic.

### Testing

```bash
pytest                           # Run all tests
pytest --cov=src                 # Run with coverage
pytest test/test_routes.py -v   # Run specific test file with verbose output
pytest -k "test_summarize" -v   # Run tests matching pattern
pytest --tb=short                # Short traceback format
```

### Type Checking

```bash
mypy src/                        # Type check all source files
mypy src/main.py                 # Type check single file
```

### Linting

```bash
ruff check .                     # Check code style
ruff check --fix .               # Auto-fix issues where possible
```

## Adding New Model Loaders

### Step 1: Create Loader Module

Create `src/my_model_loader.py`:

```python
from typing import Any, Optional
import torch
from transformers import AutoModel, AutoProcessor

class MyModelLoader:
    """Loads and manages my custom model.

    Attributes:
        config: Model configuration from models.yaml
        device: Target device (cpu or cuda)
    """

    def __init__(self, config: dict[str, Any], device: str = "cpu"):
        self.config = config
        self.device = device
        self.model: Optional[Any] = None
        self.processor: Optional[Any] = None

    def load(self) -> tuple[Any, Any]:
        """Load model and processor.

        Returns:
            Tuple of (model, processor)
        """
        if self.model is not None:
            return self.model, self.processor

        model_id = self.config["model_id"]

        self.processor = AutoProcessor.from_pretrained(model_id)
        self.model = AutoModel.from_pretrained(
            model_id,
            torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
            device_map=self.device
        )

        if self.device == "cuda":
            self.model = self.model.cuda()

        return self.model, self.processor

    def unload(self) -> None:
        """Unload model from memory."""
        if self.model is not None:
            del self.model
            del self.processor
            self.model = None
            self.processor = None

            if self.device == "cuda":
                torch.cuda.empty_cache()
```

### Step 2: Register in Model Manager

In `src/model_manager.py`:

```python
from src.my_model_loader import MyModelLoader

class ModelManager:
    def __init__(self, config_path: str, device: str = "cpu"):
        # ... existing code ...
        self.my_loader: Optional[MyModelLoader] = None

    def get_my_model(self) -> tuple[Any, Any]:
        """Get my model and processor.

        Returns:
            Tuple of (model, processor)
        """
        if self.my_loader is None:
            config = self.config["my_task"]["my_model"]
            self.my_loader = MyModelLoader(config, self.device)

        return self.my_loader.load()
```

### Step 3: Add Tests

Create `test/test_my_model_loader.py`:

```python
import pytest
from src.my_model_loader import MyModelLoader

def test_loader_initialization():
    """Test loader initializes with config."""
    config = {
        "model_id": "test/model",
        "device": "cpu"
    }
    loader = MyModelLoader(config, device="cpu")

    assert loader.config == config
    assert loader.device == "cpu"
    assert loader.model is None

@pytest.mark.asyncio
async def test_load_model():
    """Test model loading."""
    config = {
        "model_id": "test/model"
    }
    loader = MyModelLoader(config, device="cpu")

    model, processor = loader.load()

    assert model is not None
    assert processor is not None
```

## Adding New FastAPI Endpoints

### Step 1: Define Pydantic Models

In `src/routes.py` or separate schema file:

```python
from pydantic import BaseModel, Field

class MyTaskRequest(BaseModel):
    """Request for my task.

    Attributes:
        input_data: Input data for processing
        config: Optional configuration overrides
    """
    input_data: str = Field(..., description="Input data to process")
    config: dict[str, Any] = Field(default_factory=dict)

class MyTaskResponse(BaseModel):
    """Response from my task.

    Attributes:
        result: Processing result
        metadata: Additional metadata
    """
    result: str
    metadata: dict[str, Any] = Field(default_factory=dict)
```

### Step 2: Implement Endpoint

In `src/routes.py`:

```python
from fastapi import APIRouter, HTTPException
from opentelemetry import trace

router = APIRouter()
tracer = trace.get_tracer(__name__)

@router.post("/my-task", response_model=MyTaskResponse)
async def process_my_task(request: MyTaskRequest) -> MyTaskResponse:
    """Process custom task.

    Args:
        request: Task request with input data

    Returns:
        Task response with results

    Raises:
        HTTPException: If processing fails
    """
    with tracer.start_as_current_span("my_task_processing"):
        try:
            # Get model from manager
            model, processor = app.state.model_manager.get_my_model()

            # Process input
            inputs = processor(request.input_data, return_tensors="pt")
            outputs = model(**inputs)

            # Format response
            result = process_outputs(outputs)

            return MyTaskResponse(
                result=result,
                metadata={"config": request.config}
            )

        except Exception as e:
            logger.error(f"Task processing failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))
```

### Step 3: Register Router

In `src/main.py`:

```python
from src.routes import router

app = FastAPI()
app.include_router(router, prefix="/api")
```

### Step 4: Add Tests

In `test/test_routes.py`:

```python
import pytest
from httpx import AsyncClient
from src.main import app

@pytest.mark.asyncio
async def test_my_task_success():
    """Test my task endpoint with valid input."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/my-task",
            json={
                "input_data": "test input",
                "config": {}
            }
        )

    assert response.status_code == 200
    data = response.json()
    assert "result" in data
    assert "metadata" in data

@pytest.mark.asyncio
async def test_my_task_invalid_input():
    """Test my task endpoint with invalid input."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/my-task",
            json={}
        )

    assert response.status_code == 422  # Validation error
```

## Working with Video Processing

### Frame Extraction

```python
from src.video_utils import extract_frames

def process_video(video_path: str, sample_rate: int = 30) -> list[np.ndarray]:
    """Extract frames from video.

    Args:
        video_path: Path to video file
        sample_rate: Extract every Nth frame

    Returns:
        List of frame arrays
    """
    frames = extract_frames(video_path, sample_rate=sample_rate)
    return frames
```

### Frame Sampling Strategies

```python
import numpy as np

def uniform_sampling(total_frames: int, num_samples: int) -> list[int]:
    """Sample frames uniformly across video.

    Args:
        total_frames: Total number of frames
        num_samples: Number of frames to sample

    Returns:
        List of frame indices
    """
    if num_samples >= total_frames:
        return list(range(total_frames))

    indices = np.linspace(0, total_frames - 1, num_samples, dtype=int)
    return indices.tolist()

def keyframe_sampling(video_path: str, threshold: float = 30.0) -> list[int]:
    """Sample keyframes based on scene changes.

    Args:
        video_path: Path to video file
        threshold: Scene change detection threshold

    Returns:
        List of keyframe indices
    """
    # Implementation uses scene detection
    pass
```

## OpenTelemetry Instrumentation

### Adding Spans

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)

def my_function(data: str) -> str:
    """Process data with tracing.

    Args:
        data: Input data

    Returns:
        Processed result
    """
    with tracer.start_as_current_span("my_function") as span:
        span.set_attribute("input_length", len(data))

        result = data.upper()

        span.set_attribute("output_length", len(result))
        return result
```

### Adding Metrics

```python
from opentelemetry import metrics

meter = metrics.get_meter(__name__)

# Create counter
request_counter = meter.create_counter(
    "fovea_my_task_requests_total",
    description="Total my task requests",
    unit="1"
)

# Create histogram
duration_histogram = meter.create_histogram(
    "fovea_my_task_duration_seconds",
    description="My task processing duration",
    unit="s"
)

# Use in code
request_counter.add(1, {"status": "success"})
duration_histogram.record(0.5)
```

## Error Handling

### Custom Exceptions

```python
class ModelLoadError(Exception):
    """Raised when model loading fails."""
    pass

class InferenceError(Exception):
    """Raised when inference fails."""
    pass

class VideoProcessingError(Exception):
    """Raised when video processing fails."""
    pass
```

### Exception Handling in Endpoints

```python
@router.post("/process")
async def process_endpoint(request: ProcessRequest) -> ProcessResponse:
    """Process request with proper error handling."""
    try:
        result = await process_data(request.data)
        return ProcessResponse(result=result)

    except ModelLoadError as e:
        logger.error(f"Model load failed: {e}")
        raise HTTPException(status_code=503, detail="Model unavailable")

    except InferenceError as e:
        logger.error(f"Inference failed: {e}")
        raise HTTPException(status_code=500, detail="Inference failed")

    except VideoProcessingError as e:
        logger.error(f"Video processing failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid video")

    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
```

## Debugging

### VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": [
        "src.main:app",
        "--reload",
        "--port",
        "8000"
      ],
      "jinja": true,
      "justMyCode": false,
      "envFile": "${workspaceFolder}/model-service/.env"
    }
  ]
}
```

### Logging

Use Python standard logging:

```python
import logging

logger = logging.getLogger(__name__)

def my_function():
    """Function with logging."""
    logger.info("Starting processing")
    logger.debug(f"Debug info: {data}")

    try:
        result = process()
        logger.info(f"Processing complete: {result}")
        return result
    except Exception as e:
        logger.error(f"Processing failed: {e}", exc_info=True)
        raise
```

## Common Development Tasks

### Adding New Model to Config

Edit `config/models.yaml`:

```yaml
my_task:
  my_model:
    model_id: "organization/model-name"
    device: "auto"
    quantization: "int8"
    memory_required_gb: 8
```

### Managing Dependencies

```bash
# Add new dependency
pip install package-name
pip freeze > requirements.txt

# Install from requirements
pip install -r requirements.txt

# Update specific package
pip install --upgrade package-name
```

### Running Tests with Coverage

```bash
pytest --cov=src --cov-report=html
open htmlcov/index.html  # View coverage report
```

### Type Checking Configuration

Create `mypy.ini`:

```ini
[mypy]
python_version = 3.12
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = True

[mypy-transformers.*]
ignore_missing_imports = True

[mypy-torch.*]
ignore_missing_imports = True
```

## Troubleshooting

### CUDA Out of Memory

Reduce batch size or model size:

```python
# Use smaller model variant
config["model_id"] = "model-small"

# Enable quantization
model = AutoModel.from_pretrained(
    model_id,
    load_in_8bit=True,
    device_map="auto"
)

# Clear cache
torch.cuda.empty_cache()
```

### Model Loading Timeout

Increase timeout or use cached models:

```python
# Set environment variable
export HF_HOME=/path/to/cache

# Pre-download models
from transformers import AutoModel
AutoModel.from_pretrained("model-id")
```

### Import Errors

Verify installation:

```bash
pip list                    # Check installed packages
pip install -e ".[dev]"     # Reinstall with dev dependencies
```

### Test Failures

Run with verbose output:

```bash
pytest -v -s               # Verbose with print statements
pytest --tb=long           # Full traceback
pytest -x                  # Stop on first failure
```

## Next Steps

- [Frontend Development](./frontend-dev.md)
- [Backend Development](./backend-dev.md)
- [Testing Guide](./testing.md)
- [Code Style Guide](./code-style.md)
- [Contributing Guide](./contributing.md)
