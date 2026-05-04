# Audio transcription

Use the audio transcription path to attach speech-to-text output
to a video summary. The model service ships seven vendor adapters
under `model-service/src/external_apis/audio/`:

```text
assemblyai_client.py
aws_transcribe_client.py
azure_speech_client.py
deepgram_client.py
gladia_client.py
google_speech_client.py
revai_client.py
```

Each adapter implements the common base in `base.py` and is
selected by the audio model name in
`model-service/config/models.yaml`.

## Selection

The summary generation pipeline runs audio transcription, visual
summarization, and a fusion step. The audio model is configured
under the `audio_transcription` task slot in `models.yaml`.
`audioModelUsed` on the resulting `VideoSummary` row records
which adapter actually ran.

## Vendor credentials

Each vendor needs its own credential. Store them as user-level or
admin-level API keys (see [Guide > API keys](api-keys.md)) under
the matching provider name (`assemblyai`, `aws`, `azure`,
`deepgram`, `gladia`, `google`, `revai`). The model service
reads the resolved credential from the backend at call time;
adapters do not have direct database access.

## Fusion strategies

The `fusionStrategy` column on `VideoSummary` records how audio
and visual outputs were combined:

```text
sequential    visual then audio, audio used to refine
parallel      visual and audio independent, fused at end
audio-first   audio drives the narrative, visual fills detail
```

The selected fusion strategy depends on the configured fusion
model and the input characteristics; the model service picks
based on the audio-presence detection in `av_fusion.py`.

## Languages

`audioLanguage` on the summary row is the ISO code returned by
the vendor. Different vendors auto-detect different language sets;
consult the vendor adapter for the exact list.
