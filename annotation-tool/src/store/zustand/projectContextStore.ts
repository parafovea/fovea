/**
 * Project Context Store (Zustand).
 *
 * Tracks the currently active project, including its ID, name, and the
 * current user's role within that project.
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { getTracer } from '../../telemetry/tracing'

/**
 * State and actions for the active project context.
 */
export interface ProjectContextState {
  /** ID of the currently active project, or null if none */
  activeProjectId: string | null
  /** Display name of the currently active project */
  activeProjectName: string | null
  /** Current user's role in the active project */
  activeProjectRole: string | null
  /** Set the active project context. */
  setActiveProject: (id: string, name: string, role: string) => void
  /** Clear the active project context. */
  clearProject: () => void
}

/**
 * Zustand store for tracking which project is currently active.
 *
 * @example
 * ```typescript
 * import { useProjectContextStore } from '@store/zustand/projectContextStore'
 *
 * function ProjectHeader() {
 *   const name = useProjectContextStore(state => state.activeProjectName)
 *   const role = useProjectContextStore(state => state.activeProjectRole)
 *   return <h1>{name} ({role})</h1>
 * }
 * ```
 */
export const useProjectContextStore = create<ProjectContextState>()(
  devtools(
    (set, get) => ({
      activeProjectId: null,
      activeProjectName: null,
      activeProjectRole: null,
      setActiveProject: (id, name, role) => {
        const previousId = get().activeProjectId
        const span = getTracer().startSpan('project.context.switch')
        try {
          span.setAttribute('project.id', id)
          span.setAttribute('project.name', name)
          span.setAttribute('project.role', role)
          span.setAttribute('project.previous_id', previousId ?? 'none')
          set(
            { activeProjectId: id, activeProjectName: name, activeProjectRole: role },
            false,
            'setActiveProject'
          )
        } finally {
          span.end()
        }
      },
      clearProject: () => {
        const previousId = get().activeProjectId
        const span = getTracer().startSpan('project.context.clear')
        try {
          span.setAttribute('project.previous_id', previousId ?? 'none')
          set(
            { activeProjectId: null, activeProjectName: null, activeProjectRole: null },
            false,
            'clearProject'
          )
        } finally {
          span.end()
        }
      },
    }),
    { name: 'project-context' }
  )
)
