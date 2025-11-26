---
sidebar_position: 7
---

# Authentication API

Authentication endpoints for user management, sessions, and API keys.

## Authentication Modes

Fovea supports two authentication modes:

- **Single-user mode**: Automatic authentication, no login required (for local development)
- **Multi-user mode** (default): Session-based authentication with user management

Set `FOVEA_MODE=multi-user` and `ALLOW_REGISTRATION=true` to enable multi-user mode with registration.

## Authentication Endpoints

### POST /api/auth/login

Authenticates a user and creates a session.

**Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your-secure-password",
  "rememberMe": false
}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "displayName": "Administrator",
    "isAdmin": true
  }
}
```

**Cookie Set:**
- `session_token`: HttpOnly, Secure (in production), SameSite=Lax
- Expiration: 7 days (default) or 30 days (with `rememberMe: true`)

**Error Responses:**
- `401`: Invalid credentials
- `400`: Validation error (missing fields)

**Example:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-secure-password"}' \
  -c cookies.txt
```

---

### POST /api/auth/logout

Destroys the session and clears the session cookie.

**Request:**
```http
POST /api/auth/logout
Cookie: session_token=<token>
```

**Response (200):**
```json
{
  "success": true
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/auth/logout \
  -b cookies.txt
```

---

### GET /api/auth/me

Returns the currently authenticated user.

**Request:**
```http
GET /api/auth/me
Cookie: session_token=<token>
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "displayName": "Administrator",
    "isAdmin": true
  }
}
```

**Error Responses:**
- `401`: Not authenticated or session expired

**Example:**
```bash
curl http://localhost:3001/api/auth/me \
  -b cookies.txt
```

---

### POST /api/auth/register

Registers a new user. Only available when `ALLOW_REGISTRATION=true`.

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepass123",
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

**Error Responses:**
- `403`: Registration disabled
- `400`: Validation error or duplicate username
  - Username must be 3-50 characters
  - Password must be at least 8 characters
  - Email must be valid format

**Example:**
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","email":"user@example.com","password":"securepass123","displayName":"New User"}'
```

---

## User Management (Admin Only)

### GET /api/admin/users

Lists all users with related record counts.

**Authentication:** Requires admin role

**Response (200):**
```json
[
  {
    "id": "uuid",
    "username": "admin",
    "email": "admin@example.com",
    "displayName": "Administrator",
    "isAdmin": true,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z",
    "_count": {
      "personas": 5,
      "sessions": 2,
      "apiKeys": 3
    }
  }
]
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Not an admin

---

### POST /api/admin/users

Creates a new user.

**Authentication:** Requires admin role

**Request:**
```http
POST /api/admin/users
Content-Type: application/json
Cookie: session_token=<admin_token>

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "password123",
  "displayName": "New User",
  "isAdmin": false
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "username": "newuser",
  "email": "user@example.com",
  "displayName": "New User",
  "isAdmin": false,
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:00:00Z"
}
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Not an admin
- `409`: Username already exists
- `400`: Validation error

---

### GET /api/admin/users/:userId

Retrieves a specific user by ID.

**Authentication:** Requires admin role

**Response (200):**
```json
{
  "id": "uuid",
  "username": "user",
  "email": "user@example.com",
  "displayName": "User Name",
  "isAdmin": false,
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:00:00Z"
}
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Not an admin
- `404`: User not found
- `400`: Invalid UUID format

---

### PUT /api/admin/users/:userId

Updates a user. Performs partial updates.

**Authentication:** Requires admin role

**Request:**
```http
PUT /api/admin/users/:userId
Content-Type: application/json
Cookie: session_token=<admin_token>

{
  "displayName": "Updated Name",
  "email": "newemail@example.com",
  "isAdmin": true,
  "password": "newpassword123"
}
```

All fields are optional. Password is hashed if provided.

**Response (200):**
```json
{
  "id": "uuid",
  "username": "user",
  "email": "newemail@example.com",
  "displayName": "Updated Name",
  "isAdmin": true,
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T12:00:00Z"
}
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Not an admin
- `404`: User not found
- `400`: Validation error

---

### DELETE /api/admin/users/:userId

Deletes a user. Cascades to sessions, personas, and API keys.

**Authentication:** Requires admin role

**Response (200):**
```json
{
  "success": true
}
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Not an admin or attempting self-deletion
- `404`: User not found

**Note:** Users cannot delete themselves.

---

## Session Management

### GET /api/sessions

Lists the current user's sessions. Tokens are masked for security.

**Authentication:** Required

**Response (200):**
```json
[
  {
    "id": "uuid",
    "token": "...abc12345",
    "expiresAt": "2025-01-22T10:00:00Z",
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "createdAt": "2025-01-15T10:00:00Z",
    "isCurrent": true
  }
]
```

Sessions are sorted by creation date (newest first).

---

### DELETE /api/sessions/:sessionId

Revokes one of the user's own sessions.

**Authentication:** Required

**Response (200):**
```json
{
  "success": true
}
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Cannot revoke another user's session
- `404`: Session not found
- `400`: Invalid UUID format

---

### GET /api/admin/sessions

Lists all sessions with user information.

**Authentication:** Requires admin role

**Response (200):**
```json
[
  {
    "id": "uuid",
    "token": "...abc12345",
    "expiresAt": "2025-01-22T10:00:00Z",
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "createdAt": "2025-01-15T10:00:00Z",
    "user": {
      "id": "uuid",
      "username": "user",
      "displayName": "User Name"
    }
  }
]
```

---

### DELETE /api/admin/sessions/:sessionId

Revokes any session.

**Authentication:** Requires admin role

**Response (200):**
```json
{
  "success": true
}
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Not an admin
- `404`: Session not found

---

## Security Considerations

### Password Security
- Passwords hashed with bcrypt (12 rounds)
- Minimum password length: 8 characters (registration), 6 characters (admin creation)
- Never transmitted in responses

### Session Security
- HttpOnly cookies prevent JavaScript access
- Secure flag in production (HTTPS only)
- SameSite=Lax prevents CSRF
- Tokens are 64-character hex strings (32 bytes)
- Tokens masked in API responses

### Token Masking
Session tokens are masked to `...` + last 8 characters when displayed in responses.

Full token: `abc123def456...xyz789`
Masked: `...xyz789`

### Environment Variables

```env
# Authentication mode
FOVEA_MODE=multi-user           # Use 'single-user' for local dev, 'multi-user' for production
ALLOW_REGISTRATION=true         # Allow user self-registration

# Session configuration
SESSION_TIMEOUT_DAYS=7          # Default session duration
SESSION_SECRET=<random-string>  # Cookie signing secret (required)

# Admin account (required for seeding in multi-user mode)
ADMIN_PASSWORD=<secure-password>  # Generate with: openssl rand -base64 32
TEST_USER_PASSWORD=<optional>     # Optional test user password
```

### Best Practices

1. **Production Setup:**
   - Always use HTTPS in production
   - Set strong `SESSION_SECRET` (use `openssl rand -base64 32`)
   - Set strong `ADMIN_PASSWORD` (use `openssl rand -base64 32`)
   - Configure `ALLOW_REGISTRATION` based on your needs (true for open demo, false for private)

2. **Password Requirements:**
   - Enforce strong passwords in production
   - Consider password rotation policies
   - Use password managers

3. **Session Management:**
   - Review active sessions regularly
   - Revoke suspicious sessions immediately
   - Use shorter session timeouts for sensitive environments

4. **API Keys:**
   - API keys are user-scoped
   - Admins can set system-level API keys
   - Keys are encrypted at rest
   - Only last 4 characters displayed

---

## Migration from Single-User to Multi-User

When migrating from single-user mode to multi-user mode:

1. Set `FOVEA_MODE=multi-user` in your environment
2. Set `ADMIN_PASSWORD` environment variable
3. Run database seed to create admin user: `npm run seed`
4. Admin account created with password from `ADMIN_PASSWORD`
5. Default user (if exists) will not have admin privileges
6. Users must log in to access system

See [Authentication Setup Guide](../deployment/authentication-setup.md) for detailed configuration steps.
