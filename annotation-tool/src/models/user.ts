/**
 * @interface User
 * @description Represents a user account in the system.
 * Users can have administrative privileges and own personas.
 */
export interface User {
  /** Unique identifier for the user */
  id: string
  /** Username for login (must be unique) */
  username: string
  /** Email address (optional, used for notifications) */
  email?: string
  /** Display name shown in the UI */
  displayName: string
  /** Whether the user has administrative privileges */
  isAdmin: boolean
  /** ISO 8601 timestamp of when the user was created */
  createdAt: string
  /** ISO 8601 timestamp of the last update */
  updatedAt: string
}

/**
 * @interface Persona
 * @description Represents an annotation persona: a perspective or role
 * from which annotations are made. Each persona has their own ontology
 * and can interpret the same content differently.
 */
export interface Persona {
  /** Unique identifier for the persona */
  id: string
  /** Display name for the persona */
  name: string
  /** Role description (e.g., "domain expert", "casual viewer") */
  role: string
  /** What information this persona is looking for */
  informationNeed: string
  /** Extended description of the persona's background and perspective */
  details: string
  /** ID of the user who owns this persona (optional) */
  userId?: string
  /** ISO 8601 timestamp of when the persona was created */
  createdAt: string
  /** ISO 8601 timestamp of the last update */
  updatedAt: string
}
