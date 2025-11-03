---
title: External API Integration
sidebar_position: 8
keywords: [external api, anthropic, openai, google, api integration, provider abstraction]
---

# External API Integration

The model service integrates with external model providers (Anthropic Claude, OpenAI GPT, Google Gemini) through a provider abstraction layer. This architecture enables using external APIs alongside self-hosted models without changing client code.

## Architecture Overview

The external API integration uses three layers:

1. **Provider Abstraction Layer**: Base `ExternalAPIClient` class defines common interface
2. **Router Layer**: `ExternalModelRouter` routes requests to appropriate provider clients
3. **Client Implementations**: Provider-specific clients (Anthropic, OpenAI, Google)

```
┌─────────────────────────────────────────────┐
│         Model Service API                    │
│         (routes.py)                          │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         Model Manager                        │
│   (Decides: self-hosted or external?)       │
└──────┬──────────────────────────────────────┘
       │
       ├──────────────────────┬────────────────┐
       │                      │                │
       ▼                      ▼                ▼
┌──────────────┐    ┌──────────────┐   ┌─────────────┐
│ Self-Hosted  │    │   External   │   │   External  │
│  VLM/LLM     │    │   API Router │   │ Audio APIs  │
│  (SGLang)    │    └──────┬───────┘   └──────┬──────┘
└──────────────┘           │                   │
                           │                   │
            ┌──────────────┼────────────┐      │
            │              │            │      │
            ▼              ▼            ▼      ▼
    ┌─────────────┐  ┌──────────┐  ┌────────────┐
    │ Anthropic   │  │  OpenAI  │  │   Google   │
    │   Client    │  │  Client  │  │   Client   │
    └──────┬──────┘  └─────┬────┘  └─────┬──────┘
           │               │              │
           ▼               ▼              ▼
    ┌──────────────────────────────────────────┐
    │    External Provider APIs                 │
    │ (Claude, GPT-4o, Gemini via HTTPS)       │
    └──────────────────────────────────────────┘
```

## Provider Abstraction Layer

### Base Client Interface

The `ExternalAPIClient` abstract base class defines the common interface:

```python
# model-service/src/external_apis/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class ExternalAPIConfig:
    """Configuration for external API client."""
    api_key: str
    api_endpoint: str
    model_id: str
    timeout: int = 60
    max_retries: int = 3

class ExternalAPIClient(ABC):
    """Base class for external API clients."""

    def __init__(self, config: ExternalAPIConfig):
        self.config = config
        self.client = httpx.AsyncClient(timeout=config.timeout)

    @abstractmethod
    async def generate_text(
        self, prompt: str, max_tokens: int = 1024,
        temperature: float = 0.7, **kwargs
    ) -> dict[str, Any]:
        """Generate text from prompt."""
        pass

    @abstractmethod
    async def generate_from_images(
        self, images: list[bytes], prompt: str,
        max_tokens: int = 1024, **kwargs
    ) -> dict[str, Any]:
        """Generate text from images and prompt."""
        pass

    @abstractmethod
    async def validate_key(self) -> bool:
        """Validate API key with minimal API call."""
        pass
```

All provider clients implement this interface, ensuring consistent behavior across providers.

### Common Patterns

All client implementations follow these patterns:

1. **Configuration via dataclass**: API keys, endpoints, and settings passed in `ExternalAPIConfig`
2. **Async HTTP client**: Uses `httpx.AsyncClient` for non-blocking requests
3. **Retry logic**: Automatic retries with exponential backoff using `tenacity`
4. **Error handling**: Provider-specific errors mapped to common exceptions
5. **Response normalization**: All responses return `dict[str, Any]` with `text`, `usage`, `model` keys

## Router Layer

The `ExternalModelRouter` manages client lifecycle and routes requests:

```python
# model-service/src/external_apis/router.py

class ExternalModelRouter:
    """Routes requests to appropriate external API clients."""

    def __init__(self):
        self._clients: dict[str, ExternalAPIClient] = {}

    def get_client(
        self, config: ExternalAPIConfig, provider: str
    ) -> ExternalAPIClient:
        """Get or create client for the specified provider."""
        cache_key = f"{provider}:{config.model_id}"

        if cache_key in self._clients:
            return self._clients[cache_key]

        # Create client based on provider
        if provider == "anthropic":
            client = AnthropicClient(config)
        elif provider == "openai":
            client = OpenAIClient(config)
        elif provider == "google":
            client = GoogleClient(config)
        else:
            raise ValueError(f"Unsupported provider: {provider}")

        self._clients[cache_key] = client
        return client
```

### Client Caching

The router caches client instances using `{provider}:{model_id}` as cache key. This:

- Reuses HTTP connections across requests
- Prevents recreating client objects
- Improves performance for repeated API calls

Clients remain cached until the router is closed with `close_all()`.

## Provider Implementations

### Anthropic Claude Client

Supports Claude Sonnet 4.5 with vision capabilities:

```python
# model-service/src/external_apis/anthropic_client.py

class AnthropicClient(ExternalAPIClient):
    """Client for Anthropic Claude API."""

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.HTTPStatusError))
    )
    async def generate_text(self, prompt: str, max_tokens: int = 1024,
                           temperature: float = 0.7, **kwargs) -> dict[str, Any]:
        headers = {
            "x-api-key": self.config.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }

        payload = {
            "model": self.config.model_id,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}]
        }

        response = await self.client.post(
            self.config.api_endpoint, headers=headers, json=payload
        )
        response.raise_for_status()

        data = response.json()
        return {
            "text": data["content"][0]["text"],
            "usage": data["usage"],
            "model": data["model"]
        }
```

**Features**:
- Vision support via `generate_from_images()` (max 20 images)
- Automatic retry with exponential backoff
- System prompts via `system` kwarg
- Stop sequences support

### OpenAI GPT Client

Supports GPT-4o with vision:

```python
# model-service/src/external_apis/openai_client.py

class OpenAIClient(ExternalAPIClient):
    """Client for OpenAI GPT API."""

    async def generate_text(self, prompt: str, **kwargs) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": self.config.model_id,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": kwargs.get("max_tokens", 1024),
            "temperature": kwargs.get("temperature", 0.7)
        }

        response = await self.client.post(
            self.config.api_endpoint, headers=headers, json=payload
        )
        response.raise_for_status()

        data = response.json()
        return {
            "text": data["choices"][0]["message"]["content"],
            "usage": data["usage"],
            "model": data["model"]
        }
```

**Features**:
- Vision support via `generate_from_images()`
- JSON mode via `response_format` kwarg
- Function calling support
- Streaming via `stream=true`

### Google Gemini Client

Supports Gemini 2.5 Flash multimodal:

```python
# model-service/src/external_apis/google_client.py

class GoogleClient(ExternalAPIClient):
    """Client for Google Gemini API."""

    async def generate_from_images(
        self, images: list[bytes], prompt: str, **kwargs
    ) -> dict[str, Any]:
        url = f"{self.config.api_endpoint}?key={self.config.api_key}"

        # Convert images to base64
        image_parts = [
            {
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": base64.b64encode(img).decode()
                }
            }
            for img in images
        ]

        payload = {
            "contents": [{
                "parts": [{"text": prompt}] + image_parts
            }],
            "generationConfig": {
                "maxOutputTokens": kwargs.get("max_tokens", 1024),
                "temperature": kwargs.get("temperature", 0.7)
            }
        }

        response = await self.client.post(url, json=payload)
        response.raise_for_status()

        data = response.json()
        return {
            "text": data["candidates"][0]["content"]["parts"][0]["text"],
            "usage": {"total_tokens": 0},  # Gemini doesn't return usage
            "model": self.config.model_id
        }
```

**Features**:
- Native multimodal support (text + images in single request)
- Safety settings configuration
- Response candidates filtering
- Function calling support

## API Key Resolution

API keys are resolved in this priority order:

1. **User-level keys**: Set in Settings > API Keys (user-scoped)
2. **System-level keys**: Set in Admin Panel > API Keys (admin-only, userId: null)
3. **Environment variables**: Fallback from `.env` file

### Resolution Logic

```python
# model-service/src/model_manager.py

def get_external_api_config(self, task_name: str) -> ExternalAPIConfig:
    """Get external API configuration with key resolution."""
    task_config = self.tasks.get(task_name)
    selected_model = task_config.get_selected_config()

    provider = selected_model.provider

    # 1. Try user-level key (from backend API)
    api_key = await self._fetch_user_api_key(provider)

    # 2. Try system-level key (from backend API, userId: null)
    if not api_key:
        api_key = await self._fetch_system_api_key(provider)

    # 3. Fall back to environment variable
    if not api_key:
        api_key = os.getenv(f"{provider.upper()}_API_KEY")

    if not api_key:
        raise ValueError(
            f"API key for provider '{provider}' not found. "
            f"Set via UI or {provider.upper()}_API_KEY env var."
        )

    return ExternalAPIConfig(
        api_key=api_key,
        api_endpoint=selected_model.api_endpoint,
        model_id=selected_model.model_id
    )
```

This design allows:
- Users to configure their own API keys
- Admins to set fallback keys for all users
- Environment variables for simple deployment

## Configuration

External API models are configured in `config/models.yaml`:

```yaml
tasks:
  video_summarization:
    selected: "claude-sonnet-4-5"
    options:
      claude-sonnet-4-5:
        model_id: "claude-sonnet-4-5"
        framework: "external_api"
        provider: "anthropic"
        api_endpoint: "https://api.anthropic.com/v1/messages"
        requires_api_key: true
        speed: "fast"
        description: "Anthropic Claude Sonnet 4.5, vision capable, API-based"

      gpt-4o:
        model_id: "gpt-4o"
        framework: "external_api"
        provider: "openai"
        api_endpoint: "https://api.openai.com/v1/chat/completions"
        requires_api_key: true
        speed: "fast"
        description: "OpenAI GPT-4 Omni, vision capable, API-based"

      gemini-2-5-flash:
        model_id: "gemini-2.5-flash"
        framework: "external_api"
        provider: "google"
        api_endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        requires_api_key: true
        speed: "very_fast"
        description: "Google Gemini 2.5 Flash, multimodal, API-based"
```

### Model Selection

The `ModelManager` checks the `framework` field to determine if a model is external:

```python
def is_external_api(self, task_name: str) -> bool:
    """Check if task uses external API model."""
    task_config = self.tasks.get(task_name)
    if not task_config:
        return False

    selected_model = task_config.get_selected_config()
    return selected_model.framework == "external_api"
```

If `framework == "external_api"`, the model manager creates an `ExternalAPIConfig` and uses the router instead of loading a self-hosted model.

## Frame Sampling Strategies

Different providers require different frame sampling approaches:

### Anthropic Claude

- **Max images per request**: 20
- **Sampling strategy**: Uniform sampling across video duration
- **Format**: JPEG at 1024px width (maintains aspect ratio)

```python
# Sample 16 frames from 300-frame video
total_frames = 300
max_frames = min(16, MAX_IMAGES_PER_REQUEST)
frame_indices = np.linspace(0, total_frames - 1, max_frames, dtype=int)
```

### OpenAI GPT-4o

- **Max images per request**: 10 (unofficial limit, API may increase)
- **Sampling strategy**: Adaptive based on video length
- **Format**: JPEG at 2048px width (higher detail mode)

### Google Gemini

- **Max images per request**: 16
- **Sampling strategy**: Keyframe detection or uniform
- **Format**: JPEG at 1536px width

The model service automatically adjusts frame count and sampling strategy based on the selected provider.

## Retry Mechanisms

All clients use `tenacity` library for automatic retries:

```python
@retry(
    stop=stop_after_attempt(3),               # Max 3 attempts
    wait=wait_exponential(multiplier=1, min=2, max=10),  # 2s, 4s, 8s backoff
    retry=retry_if_exception_type((
        httpx.TimeoutException,
        httpx.HTTPStatusError
    ))
)
async def generate_text(self, prompt: str, **kwargs):
    # API call here
    pass
```

### Retry Behavior

| Attempt | Wait Time | Total Elapsed |
|---------|-----------|---------------|
| 1       | 0s        | 0s            |
| 2       | 2s        | 2s            |
| 3       | 4s        | 6s            |
| Fail    | -         | 6s+           |

Retries occur for:
- **Timeout errors**: Network or API timeout
- **429 Rate Limit**: Too many requests
- **500/502/503**: Server errors

Retries do NOT occur for:
- **401 Unauthorized**: Invalid API key (permanent failure)
- **400 Bad Request**: Invalid parameters (permanent failure)
- **404 Not Found**: Model or endpoint not found (permanent failure)

## Error Handling

Provider-specific errors are caught and re-raised as common exceptions:

```python
try:
    response = await self.client.post(url, headers=headers, json=payload)
    response.raise_for_status()
except httpx.HTTPStatusError as e:
    if e.response.status_code == 401:
        raise ValueError(f"Invalid API key for {provider}")
    elif e.response.status_code == 429:
        raise ValueError(f"Rate limit exceeded for {provider}")
    elif e.response.status_code >= 500:
        raise RuntimeError(f"{provider} API server error")
    else:
        raise
```

Client code can catch these errors and provide user-friendly messages.

## Integration with Summarization

The video summarization workflow integrates external APIs seamlessly:

```python
# model-service/src/routes.py

@router.post("/api/summarize")
async def summarize_video(request: SummarizeRequest):
    manager = get_model_manager()

    # Check if using external API
    if manager.is_external_api("video_summarization"):
        api_config = manager.get_external_api_config("video_summarization")
        provider = api_config.provider

        # Use external API summarization
        response = await summarize_video_with_external_api(
            request=request,
            video_path=video_path,
            api_config=api_config,
            provider=provider
        )
    else:
        # Use self-hosted VLM
        response = await summarize_video_with_vlm(
            request=request,
            video_path=video_path,
            model_config=model_config
        )

    return response
```

This design allows switching between self-hosted and external models by changing `selected` in config:

```yaml
video_summarization:
  selected: "claude-sonnet-4-5"  # Use external API
  # OR
  selected: "llama-4-maverick"   # Use self-hosted
```

## Performance Considerations

### Latency

External API latency varies by provider:

| Provider | Typical Latency (8 frames) | P95 Latency |
|----------|----------------------------|-------------|
| Anthropic Claude | 2-4 seconds | 6 seconds |
| OpenAI GPT-4o | 3-5 seconds | 8 seconds |
| Google Gemini | 1-3 seconds | 5 seconds |

Self-hosted models on GPU typically have 1-2 second latency for the same workload.

### Cost

External APIs charge per token:

| Provider | Input (1K tokens) | Output (1K tokens) | Images (each) |
|----------|-------------------|-------------------|---------------|
| Anthropic Claude Sonnet 4.5 | $0.003 | $0.015 | $0.0012 |
| OpenAI GPT-4o | $0.0025 | $0.01 | $0.002 |
| Google Gemini 2.5 Flash | $0.0001 | $0.0004 | $0.00004 |

A typical 8-frame video summary (500 input tokens + 100 output tokens) costs:
- **Claude**: ~$0.012
- **GPT-4o**: ~$0.018
- **Gemini**: ~$0.0004

Self-hosted models have no per-request cost (only infrastructure).

### Throughput

External APIs limit concurrent requests:

- **Anthropic**: Tier-based (5-500 requests/min)
- **OpenAI**: Tier-based (3-10,000 requests/min)
- **Google**: 60 requests/min (free tier)

The model service does not implement request queuing. Clients must handle rate limits.

## Design Rationale

### Why Provider Abstraction?

1. **Flexibility**: Switch providers without changing client code
2. **Testability**: Mock external APIs in tests
3. **Extensibility**: Add new providers by implementing `ExternalAPIClient`
4. **Consistency**: Uniform error handling and retry logic

### Why Async HTTP Client?

1. **Performance**: Non-blocking I/O for concurrent requests
2. **Scalability**: Handle multiple requests without threads
3. **Compatibility**: FastAPI requires async handlers

### Why Separate Router?

1. **Lifecycle Management**: Centralized client caching and cleanup
2. **Configuration**: Single place to configure all providers
3. **Testing**: Easier to mock router than individual clients

## See Also

- [Audio Transcription API](../api-reference/audio-transcription) - External audio API integration
- [External API Configuration](../user-guides/external-apis) - User guide for API keys
- [Model Service Configuration](../model-service/configuration) - Model selection and settings
- [Audio Processing Architecture](./audio-processing) - Audio API provider abstraction
