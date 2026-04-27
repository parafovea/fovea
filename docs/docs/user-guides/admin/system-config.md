---
title: System configuration
sidebar_position: 1
---

# System configuration

System administrators manage runtime model-service configuration through the SystemConfig surface in Fovea. Values persist in the backend's `SystemConfig` table and propagate live to the model service, so admins can change storage paths, runtime knobs, and external API keys without restarting any service.

## Where it lives

System configuration is rendered by `SystemConfigPanel` in the annotation tool. The panel appears on the Settings page, gated behind `isAdmin`. The panel is composed of three shadcn tabs:

| Tab | Contents |
|-----|----------|
| Storage paths | Video root, thumbnail root, model cache root, export root |
| Runtime | Inference defaults (sampling, audio, detection thresholds) and worker concurrency |
| External APIs | API keys for VLM/LLM providers (Anthropic, OpenAI, Google, etc.) and audio vendors (AssemblyAI, AWS Transcribe, Azure, Deepgram, Gladia, Google Speech, Rev AI) |

Non-admin users do not see the panel.

## How values propagate

1. Admin edits a value in `SystemConfigPanel` and clicks Save.
2. The frontend calls `PUT /api/admin/config` (TanStack Query mutation).
3. The backend writes the row to PostgreSQL (`SystemConfig` model).
4. The backend calls `services/system-config-propagator.ts`, which posts the row to the model service at `POST /api/admin/reconfigure` with the `X-Admin-Token` header (value: `MODEL_SERVICE_ADMIN_TOKEN`).
5. The model service applies the change to the live `ModelManager`. Storage-path keys flow through `reconfigure_roots`; runtime knobs are written to in-memory inference config.

The model service does not need a restart for any of these.

## Startup replay

When the backend starts, it reads every persisted `SystemConfig` row and replays each one through the same propagator. A fresh model-service container therefore picks up admin state automatically; an operator never needs to push an explicit "Reapply" button.

If `MODEL_SERVICE_ADMIN_TOKEN` is unset, the propagator logs a warning and continues. The backend still serves API requests in this state, but admin edits do not reach the model service until the token is configured.

## Required environment

| Variable | Purpose |
|----------|---------|
| `MODEL_SERVICE_ADMIN_TOKEN` | Shared secret for the backend-to-model-service admin channel |
| `MODEL_SERVICE_URL` | Defaults to `http://model-service:8000` in Docker |

Set both in the backend service environment (and the model service environment for `MODEL_SERVICE_ADMIN_TOKEN`). Generate a token with `openssl rand -hex 32`.

## Audit fields

Every row has `updatedByUserId` resolved through the users table. Phantom test-bypass IDs and races against deleted users no longer violate the foreign key (the propagator falls back to `NULL` when the user no longer exists).

## API

`GET /api/admin/config` returns all rows. `PUT /api/admin/config` upserts a single key. Both endpoints require `system_admin`. See the API reference for payload shapes.

## Related

- [Inference preferences](./inference-preferences.md) for per-user and per-persona overrides
- [Permissions matrix](./permissions.md) for runtime RolePermission editing
- [Environment variables](../../reference/environment-variables.md)
