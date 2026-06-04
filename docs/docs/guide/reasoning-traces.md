# Reasoning traces

Use the reasoning-trace flow to capture the chain-of-thought
output of thinking-capable language and vision-language models
alongside the visible response. Three DTOs in
`model-service/src/application/dto/reasoning.py` carry the trace:

```python
@dataclass(frozen=True)
class ThinkingStep:
    content: str
    tokens_used: int | None = None

@dataclass(frozen=True)
class ThinkingTrace:
    steps: list[ThinkingStep] = field(default_factory=list)
    total_tokens: int | None = None
    model_id: str = ""

@dataclass(frozen=True)
class ReasonedText:
    text: str
    thinking: ThinkingTrace | None = None
    tokens_used: int | None = None
```

`ReasonedText` is what the
[`ILanguageModel.generate_reasoned`](../concepts/clean-architecture.md)
port returns. `text` is the visible response; `thinking` is the
parsed reasoning trace, or `None` for non-thinking models.

## When the trace is populated

Thinking-capable models populate `ReasonedText.thinking` from
the `<think>...</think>` blocks in the raw output. The current
catalog lists the following options as thinking-capable:

```text
qwen-3-vl-8b-thinking         video summarization
qwen-3-vl-30b-a3b-thinking    video summarization
deepseek-r1-distill-qwen-14b  ontology / claims
deepseek-r1-distill-qwen-32b  ontology / claims
deepseek-r1-distill-qwen-1-5b-gguf  ontology / claims (CPU)
```

Non-thinking models (Qwen3-VL non-thinking variants, Llama-4,
Pixtral, Claude family, GPT family, Gemini family) return
`ReasonedText` with `thinking=None`.

## Where the trace surfaces

The model-service FastAPI schemas in
`infrastructure/adapters/inbound/fastapi/schemas/reasoning.py`
expose the trace on every response that runs through a use case
that calls a thinking-capable model. The Node backend's response
schemas in `server/src/routes/` do not yet declare a `thinking`
field, so the trace is stripped during proxying by
fast-json-stringify; surfacing it to the frontend (for example as
a collapsible panel below the visible response) is planned future
work.

## Properties

```text
ThinkingTrace.is_empty           True when steps is empty
ThinkingTrace.combined_text      steps joined by blank lines
ReasonedText.has_thinking        True iff thinking is not None
                                 and not empty
```

The mappers (`ontology.py`, `claims.py`, `summarization.py`) check
`dto.reasoning_trace is not None` before invoking
`thinking_trace_dto_to_schema` to emit a `thinking` block; the
`has_thinking` and `is_empty` properties are convenience accessors
on the DTOs and are not consulted by the FastAPI schemas or
mappers.
