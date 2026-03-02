---
title: Authentication
sidebar_position: 7
---

# Authentication

Fovea supports two authentication modes and includes security hardening features to protect against common attacks.

## Authentication Modes

### Single-User Mode

Set `FOVEA_MODE=single-user` for local development or single-user deployments.

- No login required
- Automatic session creation with default user
- Session heartbeat disabled
- Suitable for desktop or embedded use

### Multi-User Mode

Set `FOVEA_MODE=multi-user` for team or production deployments.

- Username/password authentication
- Session-based with httpOnly cookies
- Progressive lockout for failed attempts
- Session idle timeout with sliding window
- Registration can be enabled with `ALLOW_REGISTRATION=true`

## Security Features

### Progressive Lockout

The lockout service tracks failed login attempts per username and enforces delays based on the number of recent failures within a 24-hour window.

| Failed Attempts | Lockout Duration |
|-----------------|------------------|
| 1-3 | No lockout |
| 4-6 | 30 seconds |
| 7-9 | 5 minutes |
| 10+ | 15 minutes |

Successful login clears all failed attempts for that username.

**Rate Limiting:**

The login endpoint also has rate limiting: maximum 5 requests per minute per IP address.

### Session Idle Timeout

Sessions expire after a period of inactivity (default: 60 minutes).

The idle timeout uses a sliding window mechanism:

1. Each request with a valid session updates `lastActivityAt`
2. Sessions are invalidated if `lastActivityAt` is older than the timeout
3. Expired sessions are automatically deleted from the database

Configure with `SESSION_IDLE_TIMEOUT_MINUTES` environment variable.

### Session Regeneration

On successful login, Fovea regenerates the session ID to prevent session fixation attacks:

1. User submits credentials
2. Backend validates credentials
3. Old session (if any) is invalidated
4. New session is created atomically in a database transaction
5. New session token is set in httpOnly cookie

This ensures attackers cannot force a user to use a known session ID.

### Session Cookie Security

Session cookies are configured with security best practices:

| Attribute | Value | Purpose |
|-----------|-------|---------|
| `httpOnly` | `true` | Prevents JavaScript access |
| `secure` | `true` (production) | HTTPS only in production |
| `sameSite` | `lax` | CSRF protection |
| `path` | `/` | Available to all routes |

## Authentication Metrics

Fovea collects OpenTelemetry metrics for authentication events:

### Login Attempts

Counter: `fovea.auth.events`

| Label | Values | Description |
|-------|--------|-------------|
| `event_type` | `login` | Event type |
| `success` | `true`, `false` | Login result |
| `failure_reason` | `none`, `invalid_credentials`, etc. | Failure reason |

### Session Events

Counter: `fovea.auth.sessions`

| Label | Values | Description |
|-------|--------|-------------|
| `event_type` | `created`, `regenerated`, `expired`, `revoked`, `extended` | Session event type |

### Lockout Events

Counter: `fovea.auth.lockouts`

| Label | Values | Description |
|-------|--------|-------------|
| `reason` | `failed_attempts` | Lockout reason |
| `attempt_count_bucket` | `1-5`, `6-10`, `10+` | Attempt count bucket |

## API Endpoints

### Login

```
POST /api/auth/login
```

**Request:**
```json
{
  "username": "user@example.com",
  "password": "password123",
  "rememberMe": true
}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "username": "user@example.com",
    "email": "user@example.com",
    "displayName": "John Doe",
    "isAdmin": false
  }
}
```

**Response (401):**
```json
{
  "error": "Invalid credentials"
}
```

**Response (429):**
```json
{
  "error": "TOO_MANY_REQUESTS",
  "message": "Too many failed login attempts. Please try again later.",
  "details": {
    "retryAfterSeconds": 300
  }
}
```

### Logout

```
POST /api/auth/logout
```

Destroys the session and clears the session cookie.

**Response:**
```json
{
  "success": true
}
```

### Get Current User

```
GET /api/auth/me
```

Returns the current authenticated user.

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "username": "user@example.com",
    "email": "user@example.com",
    "displayName": "John Doe",
    "isAdmin": false
  }
}
```

**Response (401):**
```json
{
  "error": "Not authenticated"
}
```

### Session Status

```
GET /api/auth/session-status
```

Returns session expiration and last activity times.

**Response:**
```json
{
  "expiresAt": "2024-01-15T10:30:00.000Z",
  "lastActivityAt": "2024-01-15T09:45:00.000Z"
}
```

### Extend Session

```
POST /api/auth/extend-session
```

Extends the session by 30 minutes.

**Response:**
```json
{
  "expiresAt": "2024-01-15T11:00:00.000Z"
}
```

### Register

```
POST /api/auth/register
```

Creates a new user account. Only available when `ALLOW_REGISTRATION=true`.

**Request:**
```json
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securePassword123",
  "displayName": "New User"
}
```

**Response (201):**
```json
{
  "user": {
    "id": "uuid",
    "username": "newuser",
    "email": "user@example.com",
    "displayName": "New User",
    "isAdmin": false
  }
}
```

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `FOVEA_MODE` | `single-user` | `single-user` or `multi-user` |
| `ALLOW_REGISTRATION` | `false` | Enable user self-registration |
| `SESSION_SECRET` | (required) | Cookie signing secret (min 32 chars) |
| `SESSION_TIMEOUT_DAYS` | `7` | Absolute session expiration |
| `SESSION_IDLE_TIMEOUT_MINUTES` | `60` | Idle timeout (sliding window) |
| `ADMIN_PASSWORD` | (required) | Admin user password for seeding |

## Backend Service Architecture

### LockoutService

The `LockoutService` class manages login attempt tracking:

```typescript
interface LockoutStatus {
  locked: boolean           // Whether user is locked out
  retryAfterSeconds: number // Seconds until lockout expires
  attemptCount: number      // Failed attempts in last 24 hours
}
```

Methods:

| Method | Description |
|--------|-------------|
| `checkLockout(username)` | Check if username is locked out |
| `recordFailedAttempt(username, ip)` | Record a failed login attempt |
| `recordSuccessfulLogin(username)` | Clear failed attempts |
| `getFailedAttemptCount(username)` | Get count of recent failures |

### AuthService

The `AuthService` class manages sessions and authentication providers:

Methods:

| Method | Description |
|--------|-------------|
| `authenticate(provider, credentials)` | Authenticate with a provider |
| `createSession(userId, options)` | Create a new session |
| `validateSession(token)` | Validate and refresh session |
| `destroySession(token)` | Logout and delete session |
| `regenerateSession(oldToken, userId, options)` | Session fixation prevention |
| `extendSession(token, minutes)` | Extend session expiration |
| `revokeAllUserSessions(userId)` | Revoke all sessions for a user |
| `cleanupExpiredSessions()` | Delete expired sessions |

## Security Best Practices

### Password Requirements

- Minimum 8 characters
- No maximum length restriction
- Hashed with bcrypt (cost factor 12)

### Session Token Security

- Generated with `crypto.randomBytes(32)`
- 64 character hex string
- Stored hashed in database (future enhancement)

### Sensitive Data Protection

- Passwords never logged
- Session tokens never logged
- IP addresses stored for audit only
- Usernames not included in lockout metrics (prevents enumeration)

## Troubleshooting

### User Cannot Login

1. Check lockout status in database:
   ```sql
   SELECT * FROM "LoginAttempt" WHERE username = 'user' ORDER BY "failedAt" DESC;
   ```

2. Verify password hash is correct:
   ```bash
   npm --prefix server run seed -- --reset-password user
   ```

### Session Expires Too Quickly

1. Check `SESSION_IDLE_TIMEOUT_MINUTES` is set correctly
2. Verify server and client times are synchronized
3. Check session heartbeat is running (browser DevTools Network tab)

### Registration Disabled Error

Verify `ALLOW_REGISTRATION=true` is set in the backend environment.

## Related Documentation

- [Session Management](../concepts/session-management.md)
- [Environment Variables](./environment-variables.md)
- [Observability](../concepts/observability.md)
