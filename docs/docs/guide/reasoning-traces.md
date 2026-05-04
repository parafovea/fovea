# Reasoning traces

Use the reasoning-trace flow to capture the chain-of-thought
output of thinking-capable language and vision-language models
alongside the visible response. v0.3.0 introduces two DTOs in
`model-service/src/application/dto/reasoning.py`:

```python
@dataclass(frozen=True)
class ThinkingStep:
    content: str
    tokens_used: int | None = None

@dataclass(frozen=True)
class ThinkingTrace:
    steps: list[ThinkingStep]
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
that calls a thinking-capable model. The backend forwards the
trace unchanged. The frontend renders the trace inside a
collapsible "thinking" panel below the visible response.

## Properties

```text
ThinkingTrace.is_empty           True when steps is empty
ThinkingTrace.combined_text      steps joined by blank lines
ReasonedText.has_thinking        True iff thinking is not None
                                 and not empty
```

These properties are what the FastAPI schemas use to decide
whether to emit a `thinking` block in the response body; the
frontend uses them to decide whether to render the panel.
