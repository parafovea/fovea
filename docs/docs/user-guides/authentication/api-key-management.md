---
title: API Key Management
sidebar_position: 4
keywords: [api keys, external apis, encryption, anthropic, openai, google, security]
---

# API Key Management

Fovea allows you to configure API keys for external model providers, enabling AI-powered features like video summarization, audio transcription, and ontology augmentation. API keys are encrypted at rest and can be managed at both user and system levels.

## Overview

### Key Features

- **Secure Storage**: Keys encrypted with AES-256-GCM
- **User-Level Keys**: Each user manages their own keys
- **System-Level Keys**: Admins can configure fallback keys for all users
- **Multiple Providers**: Support for VLM/LLM and audio transcription services
- **Resolution Priority**: User keys → System keys → Environment variables
- **Usage Tracking**: Monitor API key usage and last used timestamps

### Supported Providers

**VLM/LLM Providers:**
- Anthropic Claude (Sonnet 4.5, 4.5 Haiku)
- OpenAI (GPT-4o, GPT-4o Mini)
- Google Gemini (2.5 Flash)

**Audio Transcription Providers:**
- AssemblyAI
- Deepgram
- Azure Speech Services
- AWS Transcribe
- Google Speech-to-Text
- Rev.ai
- Gladia

## Managing API Keys

### Accessing API Key Settings

1. Click your user avatar in the top right
2. Select **Settings**
3. Navigate to the **API Keys** tab

### Creating an API Key

1. In the API Keys panel, click **Add API Key**
2. Fill in the required fields:
   - **Provider**: Select from dropdown (ANTHROPIC, OPENAI, GOOGLE)
   - **Key Name**: Human-readable label (e.g., "My Anthropic Key")
   - **API Key**: Paste your actual API key
3. Click **Create**

The key will be encrypted and stored securely. Only the last 4 characters are shown in the UI.

**Example:**

```
Provider: ANTHROPIC
Key Name: Production Claude Key
API Key: sk-ant-api03-abc123...
Displayed As: ****...xyz9
```

### Updating an API Key

1. Locate the key in your API Keys list
2. Click the **Edit** button
3. Modify any of:
   - **Key Name**: Update the display name
   - **API Key**: Replace with a new key (will be re-encrypted)
   - **Active Status**: Enable/disable without deleting
4. Click **Save**

### Deleting an API Key

1. Locate the key in your API Keys list
2. Click the **Delete** button
3. Confirm deletion in the dialog

**Warning:** Deletion is permanent and cannot be undone. Any in-progress requests using this key will fail.

### Viewing Key Information

Each API key displays:

- **Provider**: Service name (ANTHROPIC, OPENAI, GOOGLE)
- **Key Name**: Your custom label
- **Key Mask**: Last 4 characters (`****...xyz9`)
- **Status**: Active/Inactive indicator
- **Usage Count**: Number of times the key has been used
- **Last Used**: Timestamp of most recent use
- **Created**: Key creation date

## API Key Resolution

When the model service needs an API key, it follows this resolution order:

1. **User-Level Key**: Check if the current user has a key for the provider
2. **System-Level Key**: Check if an admin has configured a shared key (userId: null)
3. **Environment Variable**: Fall back to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.

This allows flexible configuration where users can override system defaults with their own keys.

**Example Scenario:**

```
User A has personal Anthropic key → Uses User A's key
User B has no keys → Uses system key (if configured)
No user or system key → Uses ANTHROPIC_API_KEY env var
```

## System-Level API Keys (Admin Only)

Administrators can configure system-wide API keys that serve as fallbacks for all users.

### Creating System Keys

1. Navigate to **Admin Panel**
2. Select **API Keys** tab
3. Click **Add System Key**
4. Fill in provider, name, and key
5. Click **Create**

System keys have `userId: null` and are shared across all users who don't have their own keys.

### Use Cases for System Keys

- **Small Teams**: Centralized billing, single key for all users
- **Free Tier Users**: Let users without API keys access external features
- **Testing**: Provide demo keys for evaluation
- **Fallback**: Ensure service availability even if user keys fail

## Security Considerations

### Encryption

- **Algorithm**: AES-256-GCM with authentication
- **Key Storage**: Encryption key stored in `API_KEY_ENCRYPTION_KEY` environment variable
- **Key Derivation**: Uses 64-character hexadecimal key (32 bytes)
- **Database Storage**: Only encrypted ciphertext stored in database
- **In-Transit**: Keys transmitted over HTTPS only

### Best Practices

1. **Rotation**: Regularly rotate API keys and update in Fovea
2. **Least Privilege**: Use provider-specific keys with minimal permissions
3. **Monitoring**: Check usage counts to detect anomalies
4. **Deactivation**: Use the "Active" toggle instead of deletion for temporary disablement
5. **Never Share**: Each user should have their own keys, not share accounts

### Key Masking

API keys are never displayed in full after creation. The UI shows only:
- First 4 characters: `sk-a`
- Last 4 characters: `xyz9`
- Format: `****...xyz9`

This prevents shoulder surfing and accidental exposure in screenshots.

## Integration with Model Service

When you request an AI-powered feature (e.g., video summarization with external API), the workflow is:

1. **User initiates request** → Backend receives request with user ID
2. **Backend queries database** → Checks for user's API key
3. **Key resolution** → Follows priority order (user → system → env)
4. **Decryption** → Backend decrypts key before forwarding to model service
5. **Model service call** → Uses decrypted key to call external API
6. **Usage tracking** → Increments usage count, updates last used timestamp

**API Call Flow:**

```
Frontend                Backend               Model Service         External API
   |                      |                       |                     |
   |--Video Summary------>|                       |                     |
   |                      |--Get User Key-------->|                     |
   |                      |<--Encrypted Key-------|                     |
   |                      |--Decrypt Key          |                     |
   |                      |--Forward Request w/ Key------------------->|
   |                      |                       |                     |
   |                      |<--Summary Response--------------------------|
   |                      |--Update Usage Count   |                     |
   |<--Result-------------|                       |                     |
```

## API Endpoints

For programmatic access, see the [Authentication API Reference](../../api-reference/authentication.md).

**User Endpoints:**
- `GET /api/api-keys` - List your API keys
- `POST /api/api-keys` - Create new key
- `PUT /api/api-keys/:keyId` - Update key
- `DELETE /api/api-keys/:keyId` - Delete key

**Admin Endpoints:**
- `GET /api/admin/api-keys` - List system keys
- `POST /api/admin/api-keys` - Create system key
- `DELETE /api/admin/api-keys/:keyId` - Delete any key

## Troubleshooting

### "API key for this provider already exists"

Each user can have only one key per provider. Update or delete the existing key before creating a new one.

**Solution:**
1. Find the existing key in your list
2. Click **Edit** to update it, or **Delete** to remove it
3. Create the new key

### "API key not found" error

The key may have been deleted or you don't have permission to access it.

**Solution:**
- Verify the key exists in your API Keys list
- Check that you're logged in as the correct user
- Confirm the key ID in the URL is correct

### External API calls failing

Your API key may be invalid, expired, or rate-limited by the provider.

**Solution:**
1. Check the provider's dashboard for key status
2. Verify you have sufficient credits/quota
3. Generate a new key from the provider
4. Update the key in Fovea

### "Usage count not incrementing"

Usage is only tracked when the key is actually used for an API call.

**Reasons:**
- Using a different key (system or env var)
- Request failed before reaching external API
- Caching prevented external call

## See Also

- [Authentication Overview](./overview.md) - Authentication system architecture
- [User Management](./managing-users.md) - Creating and managing user accounts
- [External API Configuration](../external-apis.md) - Configuring external providers
- [External API Integration](../../concepts/external-api-integration.md) - Technical architecture
- [Environment Variables](../../reference/environment-variables.md) - Environment-based key configuration
