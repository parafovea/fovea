/**
 * Encryption utilities for API keys.
 * Uses AES-256-GCM with unique IV for each encryption operation.
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Gets the encryption key from environment variable.
 *
 * @returns Encryption key as Buffer
 * @throws Error if API_KEY_ENCRYPTION_KEY not configured or invalid length
 */
function getEncryptionKey(): Buffer {
  const key = process.env.API_KEY_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('API_KEY_ENCRYPTION_KEY environment variable not set');
  }

  const keyBuffer = Buffer.from(key, 'hex');
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(`API_KEY_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex characters)`);
  }

  return keyBuffer;
}

/**
 * Encrypts an API key using AES-256-GCM.
 *
 * @param apiKey - Plaintext API key to encrypt
 * @returns Object containing encrypted key (base64) and display mask
 */
export function encryptApiKey(apiKey: string): { encrypted: string; mask: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(apiKey, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, authTag, encrypted]);
  const encryptedString = combined.toString('base64');

  const mask = apiKey.length >= 4
    ? `...${apiKey.slice(-4)}`
    : '...';

  return { encrypted: encryptedString, mask };
}

/**
 * Decrypts an API key using AES-256-GCM.
 *
 * @param encryptedData - Base64-encoded encrypted data (iv + authTag + ciphertext)
 * @returns Decrypted API key as plaintext string
 */
export function decryptApiKey(encryptedData: string): string {
  const key = getEncryptionKey();
  const combined = Buffer.from(encryptedData, 'base64');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Validates that the encryption key is properly configured.
 *
 * @returns True if encryption key is valid, false otherwise
 */
export function validateEncryptionKey(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
