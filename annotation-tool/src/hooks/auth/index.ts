/**
 * Authentication hooks for user session management.
 * @module hooks/auth
 */

export { useAuth } from './useAuth'
export type { RegisterData } from './useAuth'

export { useCurrentUser } from './useCurrentUser'
export type { CurrentUserInfo } from './useCurrentUser'

export { useSession } from './useSession'

export { useSessionHeartbeat } from './useSessionHeartbeat'
export type { SessionHeartbeatState } from './useSessionHeartbeat'

export { useEmergencySave } from './useEmergencySave'
export type { EmergencySaveResult, EmergencySaveState } from './useEmergencySave'
