---
sidebar_position: 8
title: Authentication Setup
description: Configure authentication modes and admin access for FOVEA deployments
keywords: [authentication, security, admin, multi-user, single-user, configuration]
---

# Authentication Setup

FOVEA supports two authentication modes designed for different deployment scenarios. This guide covers how to configure authentication for your deployment.

## Authentication Modes Overview

### Single-User Mode

**Use case:** Local development and testing

**Characteristics:**
- No login required - automatic authentication
- No logout functionality
- Passwordless default user with limited privileges
- No user management UI
- Best for quick local testing and development

**When to use:**
- Local development on your machine
- Quick testing and experimentation
- Single developer workflows
- Environments where security is not a concern

**Security note:** Never use single-user mode in production or publicly accessible deployments.

### Multi-User Mode

**Use case:** Production deployments and team collaboration

**Characteristics:**
- Login required for all access
- Full user management with sessions
- Admin account with secure password
- Logout functionality visible and functional
- User registration (can be enabled/disabled)
- Session-based authentication with HttpOnly cookies

**When to use:**
- Production deployments
- Demo servers (like demo.fovea.video)
- Team collaboration environments
- Any publicly accessible deployment
- Environments where security and access control matter

## Configuration

### Environment Variables

Both modes use the `FOVEA_MODE` environment variable:

```env
# Multi-user mode (production default)
FOVEA_MODE=multi-user

# Single-user mode (local development)
FOVEA_MODE=single-user
```

## Multi-User Mode Setup

### Required Configuration

1. **Set authentication mode:**
   ```env
   FOVEA_MODE=multi-user
   ```

2. **Set admin password** (required for database seeding):
   ```env
   ADMIN_PASSWORD=<your-secure-password>
   ```

   Generate a secure password:
   ```bash
   openssl rand -base64 32
   ```

3. **Set session secret:**
   ```env
   SESSION_SECRET=<your-random-secret>
   ```

   Generate a session secret:
   ```bash
   openssl rand -base64 32
   ```

4. **Configure user registration:**
   ```env
   # Allow users to self-register (good for open demos)
   ALLOW_REGISTRATION=true

   # Or disable registration (good for private deployments)
   ALLOW_REGISTRATION=false
   ```

### Complete Multi-User Example

```env
# Authentication Configuration
FOVEA_MODE=multi-user
ALLOW_REGISTRATION=true
SESSION_SECRET=ms2/25t1EUjbKtxF99NLcTixmm0HK3xmKfJ+RPNthZA=
SESSION_TIMEOUT_DAYS=7

# Admin Account (required)
ADMIN_PASSWORD=W1AAlqE3UxNQ7HC6UjkLTyve4YMVvaSStGmLnoH3lKw=

# Optional: Test user for development
TEST_USER_PASSWORD=test123
```

### Initial Setup Steps

1. **Create `.env` file** with authentication variables:
   ```bash
   cd /path/to/fovea
   cp .env.example .env
   # Edit .env and set FOVEA_MODE, ADMIN_PASSWORD, SESSION_SECRET
   ```

2. **Run database migrations:**
   ```bash
   docker compose exec backend npx prisma migrate deploy
   ```

3. **Seed the database** (creates admin user):
   ```bash
   docker compose exec backend npm run seed
   ```

4. **Verify admin user created:**
   ```bash
   docker compose exec backend npx prisma studio
   # Check that 'admin' user exists with isAdmin=true and has a passwordHash
   ```

5. **Test login:**
   - Navigate to your FOVEA instance
   - You should see a login page
   - Log in with username `admin` and your `ADMIN_PASSWORD`
   - Verify logout button appears in user menu

### Admin Account Management

#### Admin User Details

The seed script automatically creates an admin account:
- **Username:** `admin`
- **Email:** `admin@example.com`
- **Display Name:** `Administrator`
- **Password:** From `ADMIN_PASSWORD` environment variable
- **Role:** Admin (can manage users, access admin panel)

#### Changing Admin Password

**Local/Development:**
```bash
# Update ADMIN_PASSWORD in .env
ADMIN_PASSWORD=new-secure-password

# Re-run seed (updates existing admin user)
npm run seed
```

**Production (GitHub Actions):**
1. Generate new password:
   ```bash
   openssl rand -base64 32
   ```

2. Update GitHub secret:
   - Go to repository Settings → Secrets → Actions
   - Edit `ADMIN_PASSWORD` secret
   - Paste new password

3. Trigger redeployment or manually update:
   ```bash
   ssh into-your-server
   cd /path/to/deployment
   export ADMIN_PASSWORD='new-password'
   docker compose exec backend npm run seed
   ```

#### Adding Additional Admins

Use the admin panel or API to promote users to admin:

**Via Admin Panel:**
1. Log in as admin
2. Navigate to Admin Panel
3. Select user to promote
4. Enable "Admin" checkbox
5. Save changes

**Via Database (emergency access):**
```bash
docker compose exec postgres psql -U fovea -d fovea -c \
  "UPDATE users SET \"isAdmin\" = true WHERE username = 'username';"
```

## Single-User Mode Setup

### Configuration

Single-user mode requires minimal configuration:

```env
# Authentication Configuration
FOVEA_MODE=single-user
```

No `ADMIN_PASSWORD` or `SESSION_SECRET` required.

### Behavior

- Auto-authenticates with a default user (username: `user`)
- No password required
- No login or logout UI
- Default user is **not** admin (for security)
- Suitable only for local development

### Setup Steps

1. **Set mode in `.env`:**
   ```bash
   echo "FOVEA_MODE=single-user" >> .env
   ```

2. **Start services:**
   ```bash
   docker compose up -d
   ```

3. **Seed creates default user:**
   ```bash
   docker compose exec backend npm run seed
   ```

4. **Access application:**
   - Navigate to http://localhost:3000
   - You will be automatically logged in
   - No logout button will appear

## Production Deployment Example

### GitHub Actions Deployment

For automated deployments (like demo.fovea.video), configure secrets:

1. **Add GitHub Secrets:**
   - Repository Settings → Secrets → Actions
   - Add `ADMIN_PASSWORD` with secure generated password
   - Optionally add `TEST_USER_PASSWORD` for development users

2. **Deployment workflow** automatically:
   - Sets `FOVEA_MODE=multi-user`
   - Injects `ADMIN_PASSWORD` from secrets
   - Sets `ALLOW_REGISTRATION=true` (or false, depending on config)
   - Runs database seed after migrations

3. **Post-deployment:**
   - Admin user automatically created with secure password
   - Login required at https://your-domain.com
   - Users can register if `ALLOW_REGISTRATION=true`

### Manual Production Setup

1. **Prepare environment:**
   ```bash
   ssh user@your-server
   cd /path/to/fovea
   ```

2. **Configure `.env`:**
   ```bash
   cat > .env <<EOF
   FOVEA_MODE=multi-user
   ALLOW_REGISTRATION=false
   SESSION_SECRET=$(openssl rand -base64 32)
   ADMIN_PASSWORD=$(openssl rand -base64 32)
   # ... other configuration
   EOF
   ```

3. **Deploy services:**
   ```bash
   docker compose up -d --build
   ```

4. **Run migrations and seed:**
   ```bash
   docker compose exec backend npx prisma migrate deploy
   docker compose exec backend npm run seed
   ```

5. **Save admin password securely:**
   ```bash
   # Extract and save admin password from .env
   grep ADMIN_PASSWORD .env
   ```

## Security Best Practices

### Password Security

1. **Generate strong passwords:**
   ```bash
   # Admin password (save this!)
   openssl rand -base64 32

   # Session secret
   openssl rand -base64 32
   ```

2. **Never commit passwords** to version control
   - Use `.env` files (gitignored)
   - Use GitHub Secrets for CI/CD
   - Use environment variables or secret managers

3. **Rotate passwords regularly:**
   - Update `ADMIN_PASSWORD` quarterly
   - Update `SESSION_SECRET` if compromised
   - Re-run seed script after password changes

### Session Security

Sessions use secure cookies:
- **HttpOnly:** Prevents JavaScript access
- **Secure flag:** HTTPS only in production
- **SameSite=Lax:** Prevents CSRF attacks
- **Expiration:** 7 days (30 days with "Remember Me")

### Registration Security

For public demos:
```env
ALLOW_REGISTRATION=true  # Allow anyone to register
```

For private deployments:
```env
ALLOW_REGISTRATION=false  # Admin must create users
```

### HTTPS Requirement

**Always use HTTPS in production:**
- Cookies marked Secure (HTTPS only)
- Prevents credential interception
- Use reverse proxy (nginx, Traefik, Caddy)

## Troubleshooting

### Cannot Log In (Multi-User Mode)

**Check mode configuration:**
```bash
docker compose exec backend printenv | grep FOVEA_MODE
# Should show: FOVEA_MODE=multi-user
```

**Verify admin user exists:**
```bash
docker compose exec postgres psql -U fovea -d fovea -c \
  "SELECT username, \"isAdmin\", \"passwordHash\" IS NOT NULL as has_password FROM users WHERE username='admin';"
```

Expected output:
```
username | isAdmin | has_password
---------+---------+--------------
admin    | t       | t
```

**If admin user missing, run seed:**
```bash
docker compose exec backend npm run seed
```

### Logout Button Not Visible

**Check frontend detects multi-user mode:**
```bash
curl http://localhost:3001/api/config
# Should return: {"mode":"multi-user","allowRegistration":true}
```

**If showing single-user, check backend environment:**
```bash
docker compose exec backend printenv | grep FOVEA_MODE
```

**Restart backend if needed:**
```bash
docker compose restart backend
```

### Auto-Login in Multi-User Mode

If you're auto-logged in when you shouldn't be:

1. **Clear browser cookies:**
   - Chrome: Settings → Privacy → Cookies → Clear
   - Firefox: Settings → Privacy → Cookies and Site Data → Clear

2. **Check mode is correct:**
   ```bash
   curl http://localhost:3001/api/config
   ```

3. **Verify no default user with admin:**
   ```bash
   docker compose exec postgres psql -U fovea -d fovea -c \
     "SELECT username, \"isAdmin\" FROM users WHERE \"passwordHash\" IS NULL;"
   ```

   Should return no results or non-admin users only.

### Seed Script Fails

**Error: "ADMIN_PASSWORD environment variable is required"**

Solution: Set `ADMIN_PASSWORD` before running seed:
```bash
export ADMIN_PASSWORD=$(openssl rand -base64 32)
docker compose exec backend npm run seed
```

**Error: "tsx: not found"**

Solution: Use compiled seed script (should be automatic in Docker):
```bash
# In production container, use:
node prisma/seed.js

# In development, use:
npx tsx prisma/seed.ts
```

### Registration Not Working

**Check ALLOW_REGISTRATION:**
```bash
curl http://localhost:3001/api/config
# Should show: "allowRegistration":true
```

**If false, update environment:**
```bash
# Edit .env
ALLOW_REGISTRATION=true

# Restart backend
docker compose restart backend
```

## Migration Guide

### From Single-User to Multi-User

1. **Stop services:**
   ```bash
   docker compose down
   ```

2. **Update `.env`:**
   ```env
   FOVEA_MODE=multi-user
   ADMIN_PASSWORD=$(openssl rand -base64 32)
   SESSION_SECRET=$(openssl rand -base64 32)
   ALLOW_REGISTRATION=false
   ```

3. **Start services:**
   ```bash
   docker compose up -d
   ```

4. **Run seed:**
   ```bash
   docker compose exec backend npm run seed
   ```

5. **Verify:**
   - Visit your FOVEA instance
   - Should see login page
   - Log in with admin credentials
   - Logout button should be visible

### From Multi-User to Single-User

**Warning:** Not recommended for production. Only for development.

1. **Update `.env`:**
   ```env
   FOVEA_MODE=single-user
   ```

2. **Restart:**
   ```bash
   docker compose restart backend
   ```

3. **Access:**
   - Auto-login should occur
   - No login/logout UI

## Additional Resources

- [Authentication API Reference](../api-reference/authentication.md)
- [Environment Variables](../reference/environment-variables.md)
- [Deployment Configuration](./configuration.md)
- [Security Best Practices](../operations/common-tasks.md#security)
