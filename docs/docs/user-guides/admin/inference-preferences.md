---
title: Inference preferences
sidebar_position: 2
---

# Inference preferences

Fovea exposes two layers of inference preferences: per-user defaults and per-persona pins. Both are persisted on the server and merged with the model service's built-in defaults before each summarize, audio, or detection request.

## Layers and merge order

Three layers contribute to the final value of any inference parameter:

1. **Server defaults** from the model service (`/api/models/defaults`, `/api/models/frameworks`, proxied through the backend).
2. **User preferences** from `UserPreferences` (one row per user, edited from Settings → Inference).
3. **Persona pins** from `PersonaPreferences` (one row per persona, edited from the Persona Editor).

Persona pins override user preferences, which in turn override server defaults. The merge is implemented by the `mergeOverrides` helper (user → persona precedence). Both layers are sparse: only fields the user has set are sent over the wire.

## User preferences

The Settings page exposes an Inference tab with four shadcn subtabs:

| Subtab | Contents |
|--------|----------|
| Sampling | Frame count, sampling strategy, temperature, top-p, max tokens |
| Audio | Transcription model, language hint, diarization toggle, VAD toggle |
| Detection | Confidence threshold, IoU threshold, max detections per frame |
| Advanced | Reasoning trace toggle, beam size, repetition penalty |

Each control has a Reset button that clears the user's override and falls back to the server default. The form binds to backend defaults through `useModelDefaults` and `useModelFrameworks`.

User preferences are persisted via `GET` / `PUT /api/me/preferences`. The store hook `useInferencePreferences` is server-backed (TanStack Query) with optimistic updates.

## Persona pins

Open the Persona Editor and expand the Persona Preferences section to pin values for a specific persona. Pinned values:

- Apply only when that persona is the active context for a request
- Take precedence over user defaults
- Are stored in the `PersonaPreferences` table (one row per persona)
- Are edited via `GET` / `PUT /api/personas/:id/preferences`

The merge happens client-side in `VideoBrowser` before each summarize call, so the request payload always reflects the final, fully-merged values.

## How preferences reach the model service

1. The frontend reads user preferences (`useInferencePreferences`) and the active persona's pins (`usePersonaPreferences`).
2. `mergeOverrides(userPrefs, personaPrefs)` produces a single object with persona pins on top.
3. `VideoBrowser` attaches `generationOverrides` and `audioOverrides` blocks to the `CreateSummaryRequest`.
4. The backend forwards them on `SummarizeJobData`.
5. The video-summarization worker passes them to the model service as `generation_overrides` and `audio_overrides` (snake_case).
6. The model service merges them with server defaults inside the relevant use case.

## Save semantics

Inference preferences use **explicit save**, not autosave. The Settings → Inference tab and the Persona Editor's preferences section both surface a Save button and rely on `useUnsavedChangesPrompt` to warn before discarding dirty state.

Autosave is reserved for surfaces that have no Save button (annotations) or for long-form free-text editing where unsaved work would be painful (video summary). The full rule is documented in `annotation-tool/src/hooks/data/README.md` and summarized in [Autosave](../../development/autosave.md).

## Permissions

- `GET` / `PUT /api/me/preferences`: any authenticated user (own row only)
- `GET` / `PUT /api/personas/:id/preferences`: requires `update` on the persona (CASL ability check)

RBAC coverage is exercised in `server/test/preferences.test.ts`.

## Related

- [System configuration](./system-config.md) for system-wide defaults
- [Audio processing](../../model-service/audio-processing.md) for the audio override schema
- [Autosave](../../development/autosave.md)
