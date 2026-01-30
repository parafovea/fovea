---
title: Session Management
sidebar_position: 7
---

# Session Management

Fovea provides a session management system that monitors session validity, warns users before session expiry, and saves pending data when sessions expire.

## Overview

The session management system operates only in multi-user mode and consists of three main components:

| Component | Purpose |
|-----------|---------|
| `useSessionHeartbeat` | Polls session status every 5 minutes |
| `useEmergencySave` | Saves pending data on session expiry |
| `SessionManager` | Orchestrates components and renders UI |

## Session Lifecycle

```
Login -> Session Created -> Heartbeat Checks -> Warning Dialog -> Expiry/Extension
                                    |
                                    v
                           Session Activity Updates
                           (sliding window timeout)
```

### Session Validity Checks

The frontend polls the `/api/auth/session-status` endpoint every 5 minutes to check session validity. Each successful request updates the session's `lastActivityAt` timestamp, implementing a sliding window timeout.

### Session Expiry Flow

1. Session heartbeat detects expiry is within 5 minutes
2. `SessionExpiryWarning` dialog displays with countdown timer
3. User can extend session or logout
4. If session expires, `session:expired` event fires
5. `useEmergencySave` attempts to save pending mutations
6. User is redirected to login page

## Component Architecture

### SessionManager

The `SessionManager` component should be rendered once at the app root level, after the Routes component:

```tsx
import { SessionManager } from '@components/auth/SessionManager'

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* routes */}
      </Routes>
      <SessionManager />
    </ErrorBoundary>
  )
}
```

`SessionManager` handles:

- Enabling heartbeat monitoring in multi-user mode
- Rendering the expiry warning dialog
- Redirecting to login on session expiry
- Setting up emergency save listeners

### Session Heartbeat

The `useSessionHeartbeat` hook monitors session validity:

```tsx
import { useSessionHeartbeat } from '@hooks/auth'

function MyComponent() {
  const { expiresAt, showWarning, isExpired, checkSession } = useSessionHeartbeat(true)

  if (isExpired) {
    return <RedirectToLogin />
  }

  return showWarning ? <WarningDialog expiresAt={expiresAt} /> : null
}
```

The hook returns:

| Property | Type | Description |
|----------|------|-------------|
| `expiresAt` | `Date \| null` | When the session expires |
| `showWarning` | `boolean` | Whether to display the warning dialog |
| `isExpired` | `boolean` | Whether the session has expired |
| `checkSession` | `() => Promise<void>` | Manual session check function |

### Emergency Save

The `useEmergencySave` hook listens for `session:expired` events and saves pending data:

```tsx
import { useEmergencySave } from '@hooks/auth'

function MyComponent() {
  const { saveAllPendingData } = useEmergencySave()

  // Manual save trigger
  const handleEmergencySave = async () => {
    const result = await saveAllPendingData()
    console.log(`Saved ${result.saved} items, ${result.errors.length} errors`)
  }

  return <button onClick={handleEmergencySave}>Save All</button>
}
```

The `saveAllPendingData` function returns:

```typescript
interface EmergencySaveResult {
  saved: number    // Number of items saved
  errors: string[] // Error messages from failed saves
}
```

### Session Expiry Warning

The `SessionExpiryWarning` component displays a dialog with:

- Countdown timer showing time until expiry
- "Stay Logged In" button to extend the session
- "Logout Now" button for immediate logout

The dialog calls `/api/auth/extend-session` to add 30 minutes to the session.

## Configuration

### Backend Configuration

Session timeout is configured via environment variable:

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_IDLE_TIMEOUT_MINUTES` | `60` | Idle timeout in minutes |

The session uses a sliding window: activity updates `lastActivityAt`, and sessions expire after 60 minutes of inactivity.

### Timing Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Check interval | 5 minutes | Time between heartbeat checks |
| Warning threshold | 5 minutes | When to show expiry warning |
| Extension duration | 30 minutes | Time added when extending |

## Event System

The session management system uses custom DOM events:

```typescript
// Dispatch session expired event
window.dispatchEvent(new Event('session:expired'))

// Listen for session expired event
window.addEventListener('session:expired', handleExpired)
```

Components can listen to this event to perform cleanup or save operations.

## Single-User Mode

In single-user mode (`FOVEA_MODE=single-user`):

- Session heartbeat is disabled
- `SessionManager` returns null (no UI rendered)
- No login redirect occurs
- Emergency save listeners are not set up

## Integration with Autosave

When a session expires, the autosave system detects 401 responses and stops retrying:

```typescript
// Auth errors skip retry logic
if (isAuthError) {
  setSaveStatus('error')
  setErrorMessage('Session expired. Please log in again.')
  // No retry attempt
}
```

This prevents unnecessary retry attempts with an invalid session.

## API Endpoints

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

## Troubleshooting

### Warning Appears Too Early

Check that the server time is synchronized. Time drift between client and server can cause premature warnings.

### Session Expires Unexpectedly

Verify `SESSION_IDLE_TIMEOUT_MINUTES` is set appropriately. The default is 60 minutes of inactivity.

### Emergency Save Not Working

Check browser console for errors. The emergency save relies on React Query mutation cache, which may be empty if no mutations are pending.

## Related Documentation

- [Authentication Reference](../reference/authentication.md)
- [Autosave System](../development/autosave.md)
- [Environment Variables](../reference/environment-variables.md)
