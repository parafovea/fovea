import { User } from '@prisma/client'

/**
 * Authentication provider interface.
 * Allows multiple authentication strategies (password, OAuth, SAML, etc.).
 */
export interface AuthProvider {
  /** Provider name (e.g., 'password', 'oauth-google', 'saml') */
  name: string

  /** Authenticate user with credentials */
  authenticate(credentials: AuthCredentials): Promise<AuthResult>

  /** Validate an existing token (optional, for token-based providers) */
  validateToken?(token: string): Promise<User | null>

  /** Logout handler (optional, for providers requiring server-side logout) */
  logout?(userId: string): Promise<void>
}

/**
 * Authentication credentials.
 * Different providers use different fields.
 */
export interface AuthCredentials {
  // For username/password authentication
  username?: string
  password?: string

  // For OAuth/SAML (future)
  code?: string
  state?: string
  token?: string
}

/**
 * Authentication result returned by providers.
 */
export interface AuthResult {
  success: boolean
  user?: User
  error?: string
}
