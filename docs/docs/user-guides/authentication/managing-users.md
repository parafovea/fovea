---
sidebar_position: 2
---

# Managing Users

Administrator guide for user management in multi-user mode.

## Accessing the Admin Panel

1. Log in with admin credentials
2. Click the admin icon (shield) in the top-right corner
3. Select "Admin Panel" from the dropdown

The Admin Panel provides access to:
- User Management
- Session Monitoring
- System API Keys
- User Statistics

## Creating Users

### Via Admin Panel

1. Open Admin Panel
2. Click "Create User" button
3. Enter user details:
   - **Username**: 3-50 characters, unique
   - **Display Name**: User's full name
   - **Email**: Optional, for contact purposes
   - **Password**: Minimum 6 characters
   - **Admin Role**: Check to grant admin privileges
4. Click "Create"

New users can log in immediately with provided credentials.

### Via Registration (If Enabled)

When `ALLOW_REGISTRATION=true`:

1. Users visit `/register` page
2. Fill out registration form
3. System creates regular user account
4. Admin can upgrade to admin role if needed

**Security Note:** Disable registration after initial setup:
```env
ALLOW_REGISTRATION=false
```

## Viewing Users

The Admin Panel displays all users with:

- Username and display name
- Email address
- Admin status badge
- Account creation date
- Statistics:
  - Number of personas
  - Active sessions
  - Configured API keys

Users are sorted by creation date (newest first).

## Editing Users

1. Open Admin Panel
2. Find user in list
3. Click edit icon
4. Modify fields:
   - Display Name
   - Email
   - Admin Role (check/uncheck)
   - Password (leave blank to keep current)
5. Click "Save"

Changes take effect immediately. Active sessions remain valid.

### Granting Admin Access

To promote a user to administrator:

1. Edit the user
2. Check "Admin" checkbox
3. Save changes

The user gains admin privileges on next request.

### Changing Passwords

As an administrator, you can reset any user's password:

1. Edit the user
2. Enter new password
3. Save changes

The user must log in with the new password. Existing sessions are **not** automatically revoked.

**Best Practice:** Revoke existing sessions after password reset:
1. Navigate to Sessions tab in Admin Panel
2. Find user's sessions
3. Revoke all sessions

## Deleting Users

### Delete Process

1. Open Admin Panel
2. Find user in list
3. Click delete icon
4. Confirm deletion

### What Gets Deleted

User deletion cascades to:
- All user sessions (logged out immediately)
- All user-owned personas
- All user API keys
- Related ontologies
- Related annotations

### Restrictions

- Users cannot delete themselves
- Deletion is permanent and cannot be undone
- Consider exporting user data before deletion

### Alternative: Disable Instead of Delete

If you want to preserve data:
1. Reset user password to random string
2. Revoke all sessions
3. Do not delete the account

This prevents login while preserving personas and annotations.

## User Statistics

The Admin Panel shows counts for each user:

### Personas Count
Number of personas created by the user. Deleting the user deletes all their personas.

### Sessions Count
Number of active sessions. Multiple sessions indicate:
- Multiple devices
- Multiple browser windows
- Sessions not yet expired

### API Keys Count
Number of configured API keys. User keys override system keys for model service requests.

## Managing Sessions

See [Session Management](/docs/user-guides/authentication/sessions) for detailed session administration.

Quick actions:
- View all active sessions
- Filter by user
- Revoke suspicious sessions
- Monitor session activity

## Best Practices

### User Onboarding

1. Create user account with temporary password
2. Share credentials securely (not via email)
3. User changes password on first login
4. User configures display name and email
5. User adds personal API keys if needed

### Regular Maintenance

- Review user list monthly
- Remove accounts for departed team members
- Audit admin role assignments
- Monitor session activity for anomalies

### Security Guidelines

- Use strong passwords (consider requiring password managers)
- Limit admin role to essential personnel
- Enable 2FA if available (future feature)
- Regular password rotations for shared accounts
- Immediate revocation upon security concerns

### Managing Departures

When a team member leaves:

1. **Immediate:** Revoke all sessions
2. **Review:** Check personas for sensitive data
3. **Reassign:** Transfer critical personas to another user (manual process)
4. **Export:** Export user's annotations if needed
5. **Delete:** Remove user account

## Troubleshooting

### Cannot Create User

**Problem:** "Username already exists"

**Solution:** Choose a different username. Usernames must be unique across all users.

---

**Problem:** "Admin access required"

**Solution:** Verify you are logged in as an administrator. Check the admin badge in the user menu.

---

### User Cannot Log In After Creation

**Problem:** New user reports invalid credentials

**Solution:**
1. Verify username spelling
2. Check password was communicated correctly
3. Try resetting password via Admin Panel
4. Check server logs for authentication errors

---

### Password Reset Not Working

**Problem:** User still cannot log in after password reset

**Solution:**
1. Ensure password meets minimum length (6 characters)
2. Check for trailing spaces in password
3. Revoke all sessions and have user try again
4. Check database connectivity

## API Reference

For programmatic user management, see:
- [Authentication API Reference](/docs/api-reference/authentication)
- User Management endpoints (`/api/admin/users/*`)
