/**
 * CASL Ability Store (Zustand).
 *
 * Manages the current user's CASL permissions as a MongoAbility instance.
 * Rules are fetched from the server and stored here so that permission
 * checks are available throughout the component tree.
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { createMongoAbility, MongoAbility, RawRuleOf } from '@casl/ability'

/** Actions that can be performed on resources. */
type Actions =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'share'
  | 'export'
  | 'assign'
  | 'manage_members'
  | 'fork'
  | 'review'
  | 'manage'

/** Resource subjects that actions apply to. */
type Subjects =
  | 'Annotation'
  | 'Claim'
  | 'Persona'
  | 'WorldState'
  | 'Video'
  | 'VideoSummary'
  | 'Project'
  | 'UserGroup'
  | 'User'
  | 'all'

/** Application-wide CASL ability type. */
export type AppAbility = MongoAbility<[Actions, Subjects]>

/**
 * State and actions for the CASL ability store.
 */
export interface AbilityState {
  /** Current ability instance containing permission rules. */
  ability: AppAbility
  /** Replace the ability with a new set of raw rules from the server. */
  setAbility: (rules: RawRuleOf<AppAbility>[]) => void
}

/**
 * Zustand store for CASL permissions.
 *
 * @example
 * ```typescript
 * import { useAbilityStore } from '@store/zustand/abilityStore'
 *
 * function ProtectedButton() {
 *   const ability = useAbilityStore(state => state.ability)
 *   if (ability.can('create', 'Annotation')) {
 *     return <button>Add Annotation</button>
 *   }
 *   return null
 * }
 * ```
 */
export const useAbilityStore = create<AbilityState>()(
  devtools(
    (set) => ({
      ability: createMongoAbility<[Actions, Subjects]>(),
      setAbility: (rules) =>
        set(
          { ability: createMongoAbility<[Actions, Subjects]>(rules) },
          false,
          'setAbility'
        ),
    }),
    { name: 'ability' }
  )
)
