# API keys

Use the API keys API to store credentials for external model
providers (Anthropic, OpenAI, Google, Cohere, Mistral, AWS, Azure,
Roboflow, Cloudsight, Eden AI). Keys are AES-256-GCM encrypted at
rest. Two scopes are supported: user-level keys (visible only to
the owner) and admin-level keys (a shared pool used as fallback).

## Endpoints

```text
GET  /api/api-keys                    # requester's keys
POST /api/api-keys                    # store a key
GET  /api/admin/api-keys              # admin: shared pool
POST /api/admin/api-keys              # admin: add to shared pool
```

## Store a key

```bash
curl -X POST http://localhost:3001/api/api-keys \
  -H 'Content-Type: application/json' --cookie cookies.txt \
  -d '{"provider":"anthropic","keyName":"my key",
       "key":"sk-ant-..."}'
```

The route encrypts `key` with `API_KEY_ENCRYPTION_KEY` and stores
only the encrypted form plus a four-character `keyMask` for
display. `GET /api/api-keys` returns the metadata (provider,
keyName, keyMask, isActive, lastUsed, usageCount), never the
decrypted key.

## Resolution order

When the model service needs an external key for a given provider,
the backend resolves in this order:

1. The requesting user's active key for that provider.
2. The admin shared-pool key for that provider.
3. The corresponding environment variable
   (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`).

A model that requires an external key fails with a clear error if
none of the three resolves.

## Encryption key

`API_KEY_ENCRYPTION_KEY` is a 32-byte hex string. Generate one
with:

```bash
openssl rand -hex 32
```

Rotating the encryption key requires re-encrypting all stored
keys; there is no automated rotation path.
