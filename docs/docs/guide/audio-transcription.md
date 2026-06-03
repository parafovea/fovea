# Audio transcription

Use the audio transcription path to attach speech-to-text output
to a video summary. Since v0.3.0 every transcriber sits behind
the `IAudioTranscriber` outbound port (see
[Concepts > Clean Architecture](../concepts/clean-architecture.md)).
The model service ships seven external-API vendor adapters under
`model-service/src/infrastructure/adapters/outbound/external_apis/audio/`:

```text
assemblyai_client.py
aws_transcribe_client.py
azure_speech_client.py
deepgram_client.py
gladia_client.py
google_speech_client.py
revai_client.py
```

plus the on-device adapters under
`model-service/src/infrastructure/adapters/outbound/models/audio/`:

```text
loader.py            Whisper, faster-whisper
canary.py            Canary-Qwen 2.5B (v0.3.0 Wave 3)
parakeet.py          Parakeet TDT 1.1B (v0.3.0 Wave 3)
whisperx.py          WhisperX large-v3 (v0.3.0 Wave 3)
adapters.py          WhisperTranscriberAdapter, PyannoteDiarizerAdapter,
                     SileroVADAdapter
```

Each adapter implements the common `base.py` interface and is
selected by the audio model name in
`model-service/config/models.yaml`. Speaker diarization
(`ISpeakerDiarizer` / pyannote 3.1) and voice activity
detection (`IVoiceActivityDetector` / Silero VAD) sit behind
their own ports.

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

## Standalone transcribe button (v0.4.0)

The summary pipeline above is the indirect path: audio runs as part
of a larger generate-summary job. v0.4.0 adds a direct path: a
`Transcribe Audio` button on the workspace toolbar that calls
`POST /api/videos/:videoId/transcribe`, optionally enabling speaker
diarization via pyannote 3.1, and renders the result in a
`TranscriptPanel` with click-to-seek timestamps and colour-coded
speaker chips. See [Guide > Transcribe and diarize](transcribe-and-diarize.md)
for the full request and response contract.

The standalone route hits the model-service's `/api/transcribe` and
`/api/diarize` endpoints directly and does not produce a `VideoSummary`
row; it is for the case where a user wants the transcript surface
without the full summary pipeline.

## Languages

`audioLanguage` on the summary row is the ISO code returned by
the vendor. Different vendors auto-detect different language sets;
consult the vendor adapter for the exact list.
