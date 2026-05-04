# Authentication

Use the auth endpoints to log in, register, refresh sessions, and
read the current user. Two operating modes are supported:
single-user (no auth) and multi-user (cookie-session auth).

## Mode selection

```text
FOVEA_MODE=single-user   # auto-login as the seeded default user
FOVEA_MODE=multi-user    # require login; default for production
ALLOW_REGISTRATION=true  # let unauthenticated users self-register
                         # (valid only in multi-user mode)
```

In single-user mode every request resolves to the seeded default
user and ownership checks pass automatically. In multi-user mode
unauthenticated requests get 401 from `requireAuth` routes.

## Endpoints

```text
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/register
GET  /api/auth/me
GET  /api/auth/session-status
POST /api/auth/extend-session
```

## Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  --cookie-jar cookies.txt \
  -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}'
# {"user":{"id":"...","username":"admin","isAdmin":true},"token":"..."}
```

The session cookie is HttpOnly. Subsequent requests pass it via
`--cookie cookies.txt` (curl) or the browser's automatic cookie
handling.

## Sessions

`Session` rows carry `token`, `expiresAt`, `ipAddress`, and
`userAgent`. The default expiration is `SESSION_TIMEOUT_DAYS=7`.
`POST /api/auth/extend-session` resets `expiresAt` and
`lastActivityAt` to the current time plus the timeout.

`GET /api/sessions` lists the requester's active sessions.
`GET /api/admin/sessions` lists every session (admin only).

## Login attempts

The `LoginAttempt` table records every login with `success` and
`failedAt`. The route uses the table to lock out brute-force
attackers; an account with too many recent failures gets 429.
Tests that exercise login should clear `LoginAttempt` in
`beforeEach` so accumulated lockout state from prior runs does not
mask 401s as 429s.

## Registration

When `ALLOW_REGISTRATION=true`, `POST /api/auth/register` accepts
`username`, `password`, `email`, `displayName`. The new user gets
`systemRole: 'user'`, `isAdmin: false`, and an empty world state.
When `ALLOW_REGISTRATION=false` (the default), the route returns
403.

## System role

`User.systemRole` (added in v0.2.0) is the source of truth for
admin status. It takes one of `'user'` or `'system_admin'`. The
older boolean `User.isAdmin` is still populated for backward
compatibility but new code reads `systemRole`. CASL builds an
ability for every authenticated user that includes
`can('manage', 'all')` when `systemRole === 'system_admin'` — see
[Concepts > RBAC](../concepts/rbac.md).
