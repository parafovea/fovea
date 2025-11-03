---
sidebar_position: 1
---

# Authentication Overview

Fovea supports two authentication modes to accommodate different deployment scenarios.

## Authentication Modes

### Single-User Mode (Default)

Single-user mode provides automatic authentication without requiring login. This mode is ideal for:

- Personal deployments
- Local development
- Single-analyst workflows
- Quick prototyping

In this mode:
- No login screen appears
- User is automatically authenticated
- All personas belong to the default user
- No user management interface

### Multi-User Mode

Multi-user mode enables session-based authentication with full user management. This mode is ideal for:

- Team deployments
- Shared analysis environments
- Environments requiring audit trails
- Deployments with multiple analysts

In this mode:
- Login required for access
- User accounts with roles (user/admin)
- Session management
- Per-user personas
- Admin panel for user management

## Switching Modes

### Enable Multi-User Mode

Set the following environment variables:

```env
SINGLE_USER_MODE=false
ALLOW_REGISTRATION=true
```

Restart the server. An admin account is created automatically from:

```env
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=admin123
```

**Important:** Change the default admin password immediately after first login.

### Return to Single-User Mode

Set:

```env
SINGLE_USER_MODE=true
```

Existing user accounts remain in the database but are not used for authentication.

## User Roles

### Regular Users

Regular users can:
- Create and manage their own personas
- Create annotations
- View their own sessions
- Manage their own API keys
- Access all application features

Regular users **cannot**:
- View or manage other users
- Access the admin panel
- View system-level logs
- Manage other users' sessions

### Administrators

Administrators have all regular user permissions plus:
- Create, view, update, and delete any user
- View all sessions across all users
- Revoke any session
- Set system-level API keys
- Access admin panel

## Security Features

### Password Security

- Passwords hashed with bcrypt (12 rounds)
- Minimum 8 characters for registration
- Never logged or transmitted in plain text
- Changed via admin panel or user settings

### Session Security

- HttpOnly session cookies
- Secure cookies in production (HTTPS)
- SameSite=Lax for CSRF protection
- Configurable session timeout (default: 7 days)
- Extended sessions with "Remember Me" (30 days)

### Session Management

Users can:
- View all active sessions
- See current session indicator
- Revoke specific sessions
- View session metadata (IP, user agent, creation time)

Administrators can:
- View all users' sessions
- Revoke any session
- Monitor session activity

## API Keys

API keys are user-scoped in multi-user mode:

- Each user can manage their own API keys
- Keys for: Anthropic, OpenAI, Google, AWS, Azure, etc.
- Admins can set system-level keys (userId: null)
- User keys take precedence over system keys
- Keys encrypted at rest
- Only last 4 characters displayed

See [API Key Management](./api-key-management.md) for details.

## Getting Started

### For Regular Users

1. Navigate to the application URL
2. Log in with provided credentials
3. Access settings via user menu (top-right)
4. Update display name and email if desired
5. Add personal API keys in settings

### For Administrators

1. Log in with admin credentials
2. Click admin icon (top-right)
3. Open Admin Panel
4. Create user accounts as needed
5. Set system-level API keys if desired
6. Monitor active sessions

## Troubleshooting

### Cannot Log In

- Verify `SINGLE_USER_MODE=false` is set
- Check admin credentials in environment variables
- Ensure session secret is set: `SESSION_SECRET`
- Check server logs for authentication errors

### Session Expired

- Session timeout may be too short
- Increase `SESSION_TIMEOUT_DAYS` environment variable
- Use "Remember Me" for longer sessions
- Check if session was revoked by administrator

### Forgot Password

Administrators can reset user passwords:

1. Open Admin Panel
2. Find the user
3. Click edit
4. Enter new password
5. Save changes

Users cannot reset their own passwords without admin intervention.

### Registration Disabled

If registration returns 403:

- Check `ALLOW_REGISTRATION=true` in environment
- Contact administrator to create account
- Use admin panel for account creation

## Next Steps

- [Managing Users](./managing-users.md) (Admins)
- [API Key Management](./api-key-management.md)
- [Session Management](./sessions.md)
- [Deployment Configuration](../../deployment/configuration.md)
