/**
 * World UI Store (Zustand)
 *
 * Manages UI state for the world/object workspace.
 * This store contains ONLY UI state (selections, expanded items).
 *
 * **Architectural Decision:**
 * - UI State (ephemeral, local) → Zustand (this store)
 * - Server State (world data) → TanStack Query (useWorld.ts)
 *
 * **What belongs in this store:**
 * - Selected entity/event/time/collection for editing
 * - UI view state (expanded sections, active tabs)
 *
 * **What does NOT belong here:**
 * - Entity/event/time data from backend (use useWorld hooks)
 * - Relations data (use useWorld hooks)
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import {
  Entity,
  Event,
  Time,
  Location,
  EntityCollection,
  EventCollection,
  TimeCollection,
} from '../../models/types'

export interface WorldUiState {
  // ========== Selection State ==========
  /** Currently selected entity for editing */
  selectedEntity: Entity | null
  /** Currently selected event for editing */
  selectedEvent: Event | null
  /** Currently selected time for editing */
  selectedTime: Time | null
  /** Currently selected location (derived from entity if it's a location) */
  selectedLocation: Location | null
  /** Currently selected collection for editing */
  selectedCollection: EntityCollection | EventCollection | TimeCollection | null

  // ========== Actions ==========
  // Selection actions
  selectEntity: (entity: Entity | null) => void
  selectEvent: (event: Event | null) => void
  selectTime: (time: Time | null) => void
  selectCollection: (collection: EntityCollection | EventCollection | TimeCollection | null) => void
  clearAllSelections: () => void

  // Utility actions
  resetAllState: () => void
}

/**
 * Initial state values
 */
const initialState = {
  selectedEntity: null,
  selectedEvent: null,
  selectedTime: null,
  selectedLocation: null,
  selectedCollection: null,
}

/**
 * World UI Store
 *
 * Use this store for world/object workspace UI state.
 *
 * @example
 * ```typescript
 * import { useWorldUiStore } from '@/store/zustand'
 *
 * function EntityList() {
 *   const selectedEntity = useWorldUiStore(state => state.selectedEntity)
 *   const selectEntity = useWorldUiStore(state => state.selectEntity)
 *
 *   return (
 *     <List>
 *       {entities.map(entity => (
 *         <ListItem
 *           key={entity.id}
 *           selected={selectedEntity?.id === entity.id}
 *           onClick={() => selectEntity(entity)}
 *         />
 *       ))}
 *     </List>
 *   )
 * }
 * ```
 */
export const useWorldUiStore = create<WorldUiState>()(
  devtools(
    (set) => ({
      ...initialState,

      // Selection actions
      selectEntity: (entity) =>
        set(
          {
            selectedEntity: entity,
            // If it's a location, also set selectedLocation
            selectedLocation:
              entity && 'locationType' in entity ? (entity as Location) : null,
          },
          false,
          'selectEntity'
        ),

      selectEvent: (event) =>
        set({ selectedEvent: event }, false, 'selectEvent'),

      selectTime: (time) =>
        set({ selectedTime: time }, false, 'selectTime'),

      selectCollection: (collection) =>
        set({ selectedCollection: collection }, false, 'selectCollection'),

      clearAllSelections: () =>
        set(
          {
            selectedEntity: null,
            selectedEvent: null,
            selectedTime: null,
            selectedLocation: null,
            selectedCollection: null,
          },
          false,
          'clearAllSelections'
        ),

      // Utility actions
      resetAllState: () => set(initialState, false, 'resetAllState'),
    }),
    { name: 'WorldUiStore' }
  )
)
