# Clean Architecture

The model service is laid out as three concentric layers:
domain, application, and infrastructure. The motivation is the
canonical Clean Architecture argument: business rules should
not depend on the framework, the framework should not import
the business rules transitively, and every external dependency
should sit behind an interface the inner layer owns. This page
describes how that lands in the model service.

## Layers

```text
src/
  domain/                  pure data, no I/O, no torch
    entities/              ModelConfig, TaskConfig, InferenceConfig,
                           Detection, Summary, Video, Ontology
    value_objects/         BoundingBox, ConfidenceScore, Timestamp
    exceptions.py          ModelError, InferenceError, ConfigError, ...
  application/             use cases and ports, no torch, no FastAPI
    dto/                   ReasonedText, ThinkingTrace, GenerationConfigDTO,
                           DetectObjectsRequestDTO, SummarizeRequestDTO, ...
    ports/
      inbound/             interfaces called by adapters/inbound
      outbound/            interfaces called by use cases (ILanguageModel,
                           IVisionLanguageModel, IDetectionModel,
                           ITrackingModel, IAudioTranscriber,
                           IModelRepository, IFrameSampler, ...)
    services/              ModelManager, AudioProcessingService
    use_cases/             SummarizeVideoUseCase, ExtractClaimsUseCase,
                           SynthesizeSummaryUseCase, AugmentOntologyUseCase,
                           DetectObjectsUseCase, TrackObjectsUseCase,
                           FuseModalitiesUseCase
  infrastructure/          everything that touches torch, the network,
                           the filesystem, or FastAPI
    adapters/
      inbound/fastapi/     routes, schemas, mappers
      outbound/            LLMLoaderAdapter, VLMLoaderAdapter,
                           DetectionAdapter, TrackingAdapter,
                           WhisperTranscriberAdapter, vendor audio
                           clients, frame samplers, persistence
    config/                Container, ContainerConfig, task_factories
    observability/         telemetry helpers
```

The dependency rule is one-way: `domain` imports nothing from
`application` or `infrastructure`; `application` imports from
`domain` only; `infrastructure` imports from `application` and
`domain` to wire concrete adapters. The reverse never happens.

## What each layer adds

- The domain layer holds the entities, value objects, and the
  exception hierarchy. Nothing in the domain knows that torch,
  FastAPI, or YAML exist.
- The application layer holds the use cases and the port
  interfaces (ABCs and Protocols). A use case takes ports in
  its constructor and DTOs at its method boundary; it does not
  import torch and does not know which framework is serving the
  HTTP request.
- The infrastructure layer holds the adapters. Each adapter
  implements one outbound port against one concrete library
  (e.g. `LLMLoaderAdapter` implements `ILanguageModel` against
  the SGLang / vLLM / Transformers / llama.cpp loader fan-out).
  The FastAPI routes live here too; they are inbound adapters
  that translate HTTP into use-case calls.

## Ports versus adapters

A port is an abstract interface in `application/ports/`. An
adapter is a concrete implementation in
`infrastructure/adapters/`. The use case names the port; the
container injects the adapter.

```python
# application/ports/outbound/llm.py
class ILanguageModel(ABC):
    @abstractmethod
    async def generate(
        self, prompt: str, max_tokens: int = 512,
        temperature: float = 0.7, **kwargs: Any,
    ) -> str: ...

    @abstractmethod
    async def generate_reasoned(
        self, prompt: str, *, max_tokens: int = 512,
        temperature: float = 0.7, **kwargs: Any,
    ) -> ReasonedText: ...
```

```python
# infrastructure/adapters/outbound/llm_adapter.py
class LLMLoaderAdapter(ILanguageModel):
    def __init__(self, loader: _LLMLoaderLike) -> None:
        self._loader = loader
    async def generate(self, prompt, ...): ...
    async def generate_reasoned(self, prompt, ...): -> ReasonedText
```

`_LLMLoaderLike` and `_LoaderConfig` are structural Protocols
that describe the shape of the underlying loader without
naming a concrete class; this is what lets the same adapter
sit in front of SGLang, vLLM, Transformers, and llama.cpp
loaders without a union type.

The same port-adapter pair appears for every external
dependency:

```text
ILanguageModel              LLMLoaderAdapter
IVisionLanguageModel        VLMLoaderAdapter
IDetectionModel             DetectionAdapter, SAM3DetectionAdapter,
                            ONNX detection adapters (YOLO-World, Florence-2,
                            Grounding DINO)
ITrackingModel              TrackingAdapter, SAM3TrackingAdapter
IAudioTranscriber           WhisperTranscriberAdapter (modern path),
                            seven vendor audio clients (assemblyai,
                            aws_transcribe, azure_speech, deepgram,
                            gladia, google_speech, revai)
ISpeakerDiarizer            PyannoteDiarizerAdapter
IVoiceActivityDetector      SileroVADAdapter
IFrameSampler               OpenCVFrameSampler
IModelRepository            YamlModelRepository
IModelCapabilityProbe       TorchModelCapabilityProbe
ITranscriber                WhisperTranscriberAdapter (legacy path)
IExternalAPIRouter          ExternalAPIRouterAdapter
```

`YamlModelRepository` is the canonical example. The port
declares `get_all_tasks`, `get_task`, `get_model`,
`get_inference_config`, and `set_selected_model`; the adapter
loads `models.yaml` (or `models-cpu.yaml`), translates each
YAML task block into a typed `TaskConfig`, and exposes them as
domain entities. Nothing in `application/` or `domain/` imports
`yaml` or `pathlib`.

## Dependency injection

`infrastructure/config/container.py` wires the adapters to the
ports. Use-case factory methods construct a fresh use-case
instance on each call from cached adapter factories.

```python
@dataclass
class ContainerConfig:
    model_config_path: Path
    enable_telemetry: bool = True
    enable_warmup: bool = False

@dataclass
class Container:
    config: ContainerConfig

    @property
    def model_manager(self) -> ModelManager: ...

    def language_model(
        self, *, model_id: str = "meta-llama/Llama-3.2-3B-Instruct",
    ) -> ILanguageModel: ...

    def audio_transcriber(
        self, *, model_id: str = "openai/whisper-large-v3-turbo",
        framework: str = "whisper", language: str | None = None,
    ) -> IAudioTranscriber: ...

    def build_detect_objects_use_case(self) -> DetectObjectsUseCase: ...
    def build_summarize_video_use_case(self) -> SummarizeVideoUseCase: ...
    def build_extract_claims_use_case(self) -> ExtractClaimsUseCase: ...
```

`ContainerConfig` is the single seam for the model config path;
`MODEL_CONFIG_PATH` from the environment becomes
`config.model_config_path`. The Dockerfile creates a build-time
symlink (`/app/config/active-models.yaml -> models.yaml`
or `models-cpu.yaml` depending on the `DEVICE` build arg) so
the same path works on both CPU and GPU images. See
[Reference > Model config](../reference/model-config.md).

`ModelManager.__init__` requires `capability_probe`; the
constructor does not accept a lazy default because that would
hide configuration mistakes until first inference.

## Observability

Every use case wraps its execute method in an OpenTelemetry
span. Every outbound adapter records two metrics on every
call: `model.inference.count` (counter) and
`model.inference.duration` (histogram, seconds). The base
attribute set is `task` and `model`; the counter also carries
a `result` of `success` or `error`, and adapters may attach
additional attributes via an `extra` mapping. The metrics
flow through the OTel collector to Prometheus; the spans flow
to the trace pipeline. See
[Guide > Observability](../guide/observability.md).

## Why this shape

- Use cases are unit-testable with typed fakes against the
  port interfaces; the model-service test suite covers the
  adapters separately.
- The frontend / backend / model-service contract is the only
  place infrastructure leaks out, and it is gated by FastAPI
  schemas in `infrastructure/adapters/inbound/fastapi/schemas/`.
- Adding a new framework (a new VLM runtime, a new audio
  vendor, a new detector) is one new adapter file plus one
  new task-factory entry. The use cases do not change.

## Runtime cyclic-import guards

The shared base modules `audio/base.py`, `detection/base.py`,
and `llm/base.py` exist to break runtime cycles between
adapters and their factory functions. Adapters depend on the
base, the factory depends on the base, the adapter does not
depend on the factory. This pattern repeats for each modality
that has multiple loader backends.
