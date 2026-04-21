/**
 * CASL React integration.
 *
 * Provides the AbilityContext, a contextual Can component for declarative
 * permission checks in JSX, and a convenience hook for imperative checks.
 */

import { createContext } from 'react'
import { createContextualCan } from '@casl/react'
import { AppAbility, useAbilityStore } from '@store/zustand/abilityStore'

/** React context that provides the current CASL ability to the component tree. */
export const AbilityContext = createContext<AppAbility>(undefined!)

/**
 * Declarative permission check component.
 *
 * Renders its children only when the current user has the specified permission.
 *
 * @example
 * ```tsx
 * <Can I="create" a="Annotation">
 *   <button>Add Annotation</button>
 * </Can>
 * ```
 */
export const Can = createContextualCan(AbilityContext.Consumer)

/**
 * Hook to access the current CASL ability for imperative permission checks.
 *
 * @returns the current AppAbility instance
 *
 * @example
 * ```typescript
 * const ability = useAbility()
 * if (ability.can('delete', 'Video')) {
 *   // show delete button
 * }
 * ```
 */
export function useAbility(): AppAbility {
  return useAbilityStore(state => state.ability)
}
