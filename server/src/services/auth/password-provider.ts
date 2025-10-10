import bcrypt from 'bcrypt'
import { prisma } from '../../lib/prisma.js'
import { AuthProvider, AuthCredentials, AuthResult } from './types.js'

/**
 * Password-based authentication provider.
 * Uses bcrypt for password hashing and verification with constant-time comparison.
 */
export class PasswordAuthProvider implements AuthProvider {
  name = 'password'

  /**
   * Authenticate user with username and password.
   *
   * @param credentials - Authentication credentials containing username and password
   * @returns Authentication result with user data or error message
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const { username, password } = credentials

    if (!username || !password) {
      return { success: false, error: 'Username and password required' }
    }

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username },
    })

    if (!user) {
      // Use constant-time comparison to prevent timing attacks
      await bcrypt.hash(password, 12)
      return { success: false, error: 'Invalid credentials' }
    }

    // Allow login without password for single-user mode default user
    if (!user.passwordHash) {
      return { success: true, user }
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)

    if (!valid) {
      return { success: false, error: 'Invalid credentials' }
    }

    return { success: true, user }
  }
}
