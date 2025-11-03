---
sidebar_position: 3
---

# Session Management

Session management for users and administrators.

## Understanding Sessions

A session represents an authenticated connection between a browser and the server. Sessions allow users to remain logged in without re-entering credentials for each request.

### Session Properties

- **Session Token**: Unique 64-character identifier stored in cookie
- **Expiration**: Default 7 days, or 30 days with "Remember Me"
- **IP Address**: Client IP recorded at session creation
- **User Agent**: Browser/device information
- **Creation Time**: When the session was established

### Session Lifecycle

1. **Created**: On successful login
2. **Active**: During normal usage
3. **Expired**: After timeout period
4. **Revoked**: Manually destroyed by user or admin

## Viewing Your Sessions

### As a Regular User

1. Click your avatar (top-right corner)
2. Select "Settings"
3. Navigate to "Sessions" tab

Your sessions display:
- Masked token (last 8 characters only)
- Device/browser information
- IP address
- Creation date
- Current session indicator (green badge)

### As an Administrator

Administrators can view all sessions:

1. Click admin icon (shield icon)
2. Select "Admin Panel"
3. Navigate to "Sessions" tab

Additional information shown:
- User who owns each session
- All session metadata
- Ability to revoke any session

## Revoking Sessions

### Revoke Your Own Session

Use this to log out from:
- Lost or stolen devices
- Public computers
- Suspicious activity
- Old browser sessions

**Steps:**
1. Open Settings > Sessions
2. Find the session to revoke
3. Click "Revoke" button
4. Confirm action

**Note:** You cannot revoke your current session through the UI. Use "Logout" instead.

### Revoke As Administrator

Administrators can revoke any user's session:

1. Open Admin Panel > Sessions
2. Filter by user if needed
3. Click "Revoke" next to session
4. Confirm action

User is logged out immediately.

## Session Security

### Recognizing Your Sessions

Check sessions regularly for:
- **Unfamiliar IP addresses**: May indicate unauthorized access
- **Unknown devices**: Check user agent strings
- **Old sessions**: Sessions not used recently
- **Multiple concurrent sessions**: Expected if you use multiple devices

### When to Revoke Sessions

Revoke sessions if you notice:
- Suspicious IP addresses
- Devices you don't recognize
- Old sessions from previous devices
- After using a public computer
- After suspected security compromise

### Best Practices

1. **Review Sessions Monthly**: Check active sessions regularly
2. **Revoke Unused Sessions**: Clean up old browser sessions
3. **Use "Remember Me" Carefully**: Only on personal devices
4. **Log Out on Shared Devices**: Always log out on public computers
5. **Report Suspicious Activity**: Contact administrator immediately

## Session Timeouts

### Default Timeout

Sessions expire after **7 days** of inactivity by default. This is configured via:

```env
SESSION_TIMEOUT_DAYS=7
```

### Extended Timeout ("Remember Me")

Checking "Remember Me" at login extends the session to **30 days**. Use this for:
- Personal devices
- Devices in secure locations
- Convenience on trusted hardware

**Do not use** "Remember Me" on:
- Public computers
- Shared devices
- Devices without disk encryption

### Automatic Cleanup

The system automatically deletes expired sessions from the database. This occurs:
- On session validation attempts
- During periodic cleanup jobs

No action required from users or administrators.

## Multiple Sessions

### Why Multiple Sessions?

You may have multiple active sessions from:
- Different browsers (Chrome, Firefox, Safari)
- Different devices (laptop, tablet, phone)
- Multiple browser windows
- Private/incognito windows

This is normal and expected behavior.

### Managing Multiple Sessions

**As User:**
- Keep sessions on active devices
- Revoke sessions from old devices
- Limit concurrent sessions for security

**As Administrator:**
- Monitor unusual session counts per user
- Investigate users with excessive sessions (>5)
- Set policy on acceptable session count

## Session Cookies

Sessions are stored in HTTP-only cookies with these properties:

### Cookie Attributes

- **Name**: `session_token`
- **HttpOnly**: Cannot be accessed by JavaScript
- **Secure**: HTTPS only in production
- **SameSite**: Lax (prevents CSRF attacks)
- **Path**: `/` (entire application)

### Browser Behavior

- Cookies persist until expiration or revocation
- Closing browser may clear session (depends on browser)
- Private browsing clears session on exit
- Cookie can be cleared manually via browser settings

## Troubleshooting

### Session Expired

**Symptom:** Redirected to login page unexpectedly

**Causes:**
- Session timeout reached (7 or 30 days)
- Session revoked by administrator
- Browser cleared cookies
- Server restarted (in-memory sessions lost)

**Solution:** Log in again. Consider using "Remember Me" for longer sessions.

---

### Cannot See Sessions

**Symptom:** Sessions tab is empty or shows error

**Causes:**
- Not authenticated
- Database connectivity issue
- Browser blocking cookies

**Solution:**
1. Log out and log in again
2. Check browser allows cookies for site
3. Contact administrator if issue persists

---

### Session Shows Wrong IP

**Symptom:** IP address doesn't match your location

**Causes:**
- VPN or proxy in use
- Corporate network NAT
- Reverse proxy configuration

**Solution:** This is often normal. Verify you recognize the user agent (browser/device).

---

### Too Many Sessions

**Symptom:** Seeing many active sessions

**Causes:**
- Multiple devices logged in
- Browser windows not closed properly
- Long session timeout

**Solution:** Revoke old sessions. Only keep sessions for active devices.

---

### Session Revoked Immediately

**Symptom:** Logged out right after login

**Causes:**
- Administrator revoking sessions
- Server configuration issue
- Session secret mismatch

**Solution:** Contact administrator. May indicate security concern or configuration problem.

## API Access

Sessions can be used for API access:

1. Log in via `/api/auth/login`
2. Cookie set in response
3. Include cookie in subsequent requests
4. API respects session authentication

See [Authentication API](../../api-reference/authentication.md) for details.

## Administrative Actions

### Force Logout All Users

To revoke all sessions (emergency):

```bash
# Via SQL
DELETE FROM "Session";

# Or via API (requires admin session)
curl -X DELETE http://localhost:3001/api/admin/sessions/<session-id> \
  -b admin-cookies.txt
```

Repeat for each session or use database query to bulk delete.

### Session Monitoring

Monitor session activity through:
- Admin Panel > Sessions tab
- Server logs (authentication events)
- Database queries on `Session` table

Track:
- New session creation rates
- Session revocation events
- Expired session cleanup
- Per-user session counts

### Security Incident Response

If compromised credentials suspected:

1. **Immediate:** Revoke all user sessions
2. **Reset:** Change user password via Admin Panel
3. **Review:** Check recent annotations/activity
4. **Notify:** Inform user of security event
5. **Monitor:** Watch for new suspicious sessions

## Next Steps

- [Managing Users](./managing-users.md) (Admins)
- [API Keys](./api-key-management.md)
- [Authentication API Reference](../../api-reference/authentication.md)
