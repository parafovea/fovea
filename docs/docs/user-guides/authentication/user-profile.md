---
title: User Profile Management
sidebar_position: 3
---

# User Profile Management

FOVEA users can manage their own profile information, including display name, email, and password. This guide explains how to access and update your user profile.

## Accessing Your Profile

### Via Settings Menu

1. Click the **user icon** in the top-right corner of the navigation bar
2. Select **Settings** from the dropdown menu
3. Navigate to the **Profile** tab

You'll see your current profile information displayed in an editable form.

## Profile Fields

### Username

- **Read-only**: Your username cannot be changed after account creation
- **Unique identifier**: Used for login and displayed in activity logs
- **Format**: Alphanumeric characters, typically 3-32 characters

### Display Name

- **Editable**: Update your display name at any time
- **Visible**: Shown in the UI, comments, and activity logs
- **Optional**: Can be left blank (username will be used instead)
- **Format**: Any UTF-8 characters, 1-100 characters

**Example uses**:
- Full name: "Jane Smith"
- Preferred name: "Dr. Smith"
- Team identifier: "Analyst Team A"

### Email Address

- **Editable**: Update your email at any time
- **Optional**: Email is not required for FOVEA login
- **Use cases**:
  - Password reset (if implemented)
  - Notifications (future feature)
  - Contact information for collaboration

**Note**: FOVEA does not currently send emails. The email field is for future use and optional metadata.

### Password

- **Secure**: Passwords are hashed with bcrypt (12 rounds)
- **Requirements**: Minimum 6 characters
- **Best practices**:
  - Use at least 12 characters
  - Include uppercase, lowercase, numbers, and symbols
  - Don't reuse passwords from other sites
  - Consider using a password manager

### Admin Status

- **Read-only**: You cannot change your own admin status
- **Displayed**: Shows whether you have administrator privileges
- **Note**: Only existing admins can grant/revoke admin privileges

## Updating Your Profile

### Step-by-Step

1. **Navigate to Profile tab** in Settings
2. **Edit fields** you want to change:
   - Display Name (optional)
   - Email (optional)
   - Password (optional, leave blank to keep current password)
3. **Click Save** to apply changes
4. **Confirmation**: You'll see a success message when changes are saved

### Example: Changing Display Name

```
Current: username: jsmith, display name: (empty)
Action: Enter "Jane Smith" in Display Name field
Result: Display name now shows as "Jane Smith" throughout the UI
```

### Example: Updating Password

```
1. Click "Change Password" or enter new password in Password field
2. Enter new password: mySecureP@ssw0rd123
3. Click Save
4. Next login will require new password
```

## Password Changes

### When to Change Password

- **Security concern**: If you suspect your password was compromised
- **Shared access**: After using a temporary/shared password
- **Regular rotation**: As part of security best practices (every 90 days)
- **Policy compliance**: To meet your organization's security policies

### Changing Your Password

1. Open **Settings** → **Profile** tab
2. Find the **Password** field
3. Enter your **new password** (minimum 6 characters)
4. Click **Save**
5. Your password is immediately updated

**Important**: There is no "current password" verification field. Any authenticated user can change their own password. Keep your session secure.

### Lost Password

If you forget your password:

1. Contact an **administrator** to reset your password
2. Administrators can reset passwords via:
   - Admin panel → Users → Select user → Edit → Set new password
3. Administrator will provide you with a temporary password
4. Change the temporary password immediately after first login

**Note**: Self-service password reset is not currently implemented. You must contact an administrator.

## Email Management

### Setting Your Email

```
1. Navigate to Settings → Profile
2. Enter email in Email field: jsmith@example.com
3. Click Save
```

### Updating Email

```
1. Navigate to Settings → Profile
2. Change email to new address: jane.smith@newdomain.com
3. Click Save
```

### Removing Email

```
1. Navigate to Settings → Profile
2. Clear the Email field (leave blank)
3. Click Save
```

Email is optional and can be added, changed, or removed at any time.

## Display Name Usage

Your display name appears in various places throughout FOVEA:

- **Navigation bar**: Shows display name (or username if not set)
- **Activity logs**: Displays who created/modified entities
- **Comments**: Shows display name next to comments (future feature)
- **Export metadata**: Includes display name in exported data
- **Collaboration**: Helps team members identify contributors

### Best Practices

- **Use real name**: For team environments where accountability matters
- **Use role name**: For role-based analysis ("Geospatial Analyst")
- **Keep consistent**: Don't change frequently to avoid confusion

## Privacy and Security

### What Admins Can See

Administrators can view all user profiles, including:
- Username
- Email
- Display name
- Admin status
- Account creation date

Administrators **cannot** see user passwords (stored as secure hashes).

### What Other Users Can See

Non-admin users can only see:
- **Their own profile** via Settings
- **Display names** of other users in activity logs and UI elements

Non-admin users cannot browse or search other user profiles.

### Data Retention

- **Profile data**: Stored indefinitely while account exists
- **Password history**: Not stored; only current password hash
- **Login history**: Not currently tracked
- **Account deletion**: Contact administrator to delete your account

## Troubleshooting

### Can't Update Profile

**Error: "Unauthorized"**
- You may have been logged out. Refresh the page and log in again.
- Check that you're on the Profile tab in Settings.

**Changes not saving**
- Ensure you click the **Save** button after making changes
- Check browser console for error messages
- Verify all fields meet requirements (e.g., password ≥ 6 characters)

### Password Not Working After Change

**Possible causes**:
1. **Password not saved**: Ensure you clicked Save after entering new password
2. **Typo**: Passwords are case-sensitive; check Caps Lock
3. **Browser autofill**: Clear autofill and type password manually

**Solution**: Contact administrator to reset your password.

### Email Not Receiving Messages

**Expected behavior**: FOVEA does not currently send emails.

Email field is for:
- Future notification features
- Contact metadata
- Optional user information

If your organization requires email notifications, check with your administrator about custom integrations.

## Keyboard Shortcuts

When editing profile:

- **Tab**: Navigate between fields
- **Enter**: Save form (if in text input)
- **Esc**: Cancel edit (if implemented)

## API Access

Developers can access the profile API programmatically:

### Get Current User Profile

```bash
GET /api/user/profile

# Response
{
  "id": "user-uuid",
  "username": "jsmith",
  "email": "jsmith@example.com",
  "displayName": "Jane Smith",
  "isAdmin": false,
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-20T14:30:00Z"
}
```

### Update Profile

```bash
PUT /api/user/profile
Content-Type: application/json

{
  "displayName": "Dr. Jane Smith",
  "email": "jane.smith@example.com",
  "password": "newSecureP@ssword123"
}

# Response: Updated user object
```

**Note**: Users can only update their own profile via this endpoint.

## Administrator Profile Management

Administrators have additional capabilities:

- View all user profiles
- Edit other users' information
- Reset other users' passwords
- Grant/revoke admin privileges
- Delete user accounts

See [Managing Users](./managing-users.md) for administrator documentation.

## Security Best Practices

### Password Security

1. **Strong passwords**: Use 12+ characters with mixed case, numbers, symbols
2. **Unique passwords**: Don't reuse from other services
3. **Password manager**: Use a password manager to generate/store passwords
4. **Change on breach**: Change immediately if you suspect compromise

### Account Security

1. **Log out on shared computers**: Always log out on public/shared devices
2. **Close browser tabs**: Close FOVEA tabs when done working
3. **Report suspicious activity**: Contact administrator if you notice unusual account activity
4. **Keep browser updated**: Use an up-to-date, secure browser

### Session Security

1. **Session timeout**: Sessions expire after inactivity (configurable by administrator)
2. **Automatic logout**: You'll be logged out after extended inactivity
3. **Multiple devices**: You can be logged in on multiple devices simultaneously
4. **Session invalidation**: Changing password does not invalidate existing sessions

## See Also

- [Authentication Overview](./overview.md): How FOVEA authentication works
- [Managing Users](./managing-users.md): Administrator guide to user management
- [Sessions](./sessions.md): Understanding sessions and authentication
