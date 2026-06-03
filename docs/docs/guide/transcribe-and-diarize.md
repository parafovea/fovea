---
sidebar_label: Transcribe and diarize
---

# Transcribing audio and labelling speakers

The annotation workspace can transcribe the audio track of any video
and, optionally, attach a speaker label to every transcript segment.
This is the standalone path used by the `Transcribe Audio` toolbar
button on `AnnotationWorkspace`, distinct from the audio path the
summary pipeline drives internally (covered in
[Guide > Audio transcription](audio-transcription.md)).

## What runs end to end

1. The user clicks `Transcribe Audio` on the workspace toolbar.
2. The frontend calls `POST /api/videos/:videoId/transcribe` on the
   backend with the requested language and diarization options.
3. The backend resolves the video path, then calls the model service:
   - `POST /api/transcribe` for the transcript itself
     (default loader: `faster-whisper`).
   - `POST /api/diarize` for speaker turns, only when
     `enableDiarization=true` (default loader: `pyannote 3.1`).
4. The backend merges the two segment streams by per-second overlap,
   so every transcript segment carries the speaker who was talking
   the longest during it.
5. The `TranscriptPanel` UI renders one row per segment with a
   colour-coded speaker chip, a click-to-seek timestamp, and an
   active-segment highlight that follows playback.

Diarization failures are non-fatal. If the diarizer errors out, the
backend logs the failure and returns the plain transcript so the user
still sees something useful.

## Request shape

```http
POST /api/videos/:videoId/transcribe
Content-Type: application/json

{
  "language": "en",          // optional ISO-639-1 code; omit to auto-detect
  "enableDiarization": true, // optional, default false
  "numSpeakers": null,       // optional exact count
  "minSpeakers": null,       // optional lower bound
  "maxSpeakers": null        // optional upper bound
}
```

`numSpeakers` / `minSpeakers` / `maxSpeakers` are accepted for forward
compatibility. The current pyannote adapter binds these at loader-config
time and ignores per-request overrides; the model service logs a
warning when they are supplied.

## Response shape

```json
{
  "text": "full concatenated transcript",
  "segments": [
    {
      "start": 0.0,
      "end": 2.4,
      "text": "Welcome to the broadcast.",
      "confidence": 0.93,
      "speaker": "SPEAKER_00"
    }
  ],
  "language": "en",
  "duration": 14.3,
  "processingTime": 1.42,
  "modelUsed": "faster-whisper-tiny",
  "speakers": ["SPEAKER_00", "SPEAKER_01"],
  "diarizationModelUsed": "pyannote-3-1",
  "diarizationProcessingTime": 2.18
}
```

`speakers`, `diarizationModelUsed`, and `diarizationProcessingTime`
are present only when diarization actually ran. `segments[].speaker`
is `null` when no diarize turn overlaps that segment (typically
silence).

## Model selection

The audio loaders are configured under the
`audio_transcription` and `speaker_diarization` task slots in
`model-service/config/models.yaml` (GPU build) and
`model-service/config/models-cpu.yaml` (CPU build). The CPU build
defaults to `faster-whisper-tiny` for transcription so the demo
booth laptop and the docs-test runners can transcribe a 30-second
clip in roughly two seconds.

The diarization loader is `pyannote-3-1` in both builds. Pyannote
requires a Hugging Face account, a one-time acceptance of the model
licence on huggingface.co, and an `HF_TOKEN` environment variable on
the model-service container; see
[Reference > Environment variables](../reference/environment-variables.md).

## Error responses

```text
400   the model service rejected the request body
404   the video row does not exist
500   transcription failed (model load error, decoding error, etc.)
502   the model service is unreachable
504   the model service exceeded MODEL_SERVICE_TIMEOUTS.transcribe
```

The `MODEL_SERVICE_TIMEOUTS.transcribe` ceiling is overridable per
deployment via `MODEL_SERVICE_TIMEOUT_TRANSCRIBE_MS`; CPU-first-load
diarization on a long clip is the most common case for raising it.

## TranscriptPanel UI

The panel lives in the right-hand workspace dock. Each row is:

- A coloured chip for the speaker (`SPEAKER_00`, `SPEAKER_01`, ...).
  Colours are assigned by first-appearance order so the same clip
  always paints the same speaker palette across reloads.
- A `mm:ss` start timestamp. Clicking it seeks the player.
- The segment text. The currently-playing segment highlights as the
  player crosses its `start..end` window.

When diarization is disabled, the chip column collapses and the rows
render as plain timestamped transcript lines.
