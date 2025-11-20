/**
 * Dialog Store (Zustand)
 *
 * Manages open/close state for all dialogs in the application.
 * Replaces individual `useState` hooks scattered across components.
 *
 * **Why Zustand for Dialog State?**
 * - Centralized dialog state management
 * - Avoids prop drilling of `open` and `onClose` through components
 * - Easy to add keyboard shortcuts to open dialogs from anywhere
 * - Simple API: `openDialog('name')` / `closeDialog('name')`
 * - Can track which dialog is open for analytics
 *
 * **Usage Pattern:**
 * ```typescript
 * // Before (with useState):
 * const [settingsOpen, setSettingsOpen] = useState(false)
 * <UserSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
 *
 * // After (with Zustand):
 * const { dialogs, openDialog, closeDialog } = useDialogStore()
 * <UserSettingsDialog open={dialogs.userSettings} onClose={() => closeDialog('userSettings')} />
 * ```
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/**
 * Available dialogs in the application
 */
export type DialogName =
  // Settings dialogs
  | 'userSettings'
  | 'modelSettings'
  | 'about'
  | 'adminPanel'
  | 'keyboardShortcuts'
  // Import/Export dialogs
  | 'import'
  | 'export'
  | 'importResult'
  // Video dialogs
  | 'videoSummary'
  | 'detection'
  // Ontology dialogs
  | 'createPersona'
  | 'editPersona'
  // Object dialogs
  | 'createEntity'
  | 'editEntity'
  | 'createEvent'
  | 'editEvent'
  // Admin dialogs
  | 'createUser'
  | 'editUser'
  | 'sessionManagement'
  // API dialogs
  | 'apiKey'
  // Claims dialogs
  | 'claimsExtraction'
  // Confirmation dialogs
  | 'confirm'

/**
 * Dialog state: maps dialog name to open/closed boolean
 */
type DialogState = Record<DialogName, boolean>

interface DialogStore {
  /** Dialog open/close state */
  dialogs: DialogState

  /** Open a dialog by name */
  openDialog: (name: DialogName) => void

  /** Close a dialog by name */
  closeDialog: (name: DialogName) => void

  /** Toggle a dialog by name */
  toggleDialog: (name: DialogName) => void

  /** Close all dialogs */
  closeAll: () => void

  /** Check if any dialog is open */
  isAnyDialogOpen: () => boolean

  /** Get list of open dialog names */
  getOpenDialogs: () => DialogName[]
}

/**
 * Initial state: all dialogs closed
 */
const initialDialogState: DialogState = {
  // Settings dialogs
  userSettings: false,
  modelSettings: false,
  about: false,
  adminPanel: false,
  keyboardShortcuts: false,
  // Import/Export dialogs
  import: false,
  export: false,
  importResult: false,
  // Video dialogs
  videoSummary: false,
  detection: false,
  // Ontology dialogs
  createPersona: false,
  editPersona: false,
  // Object dialogs
  createEntity: false,
  editEntity: false,
  createEvent: false,
  editEvent: false,
  // Admin dialogs
  createUser: false,
  editUser: false,
  sessionManagement: false,
  // API dialogs
  apiKey: false,
  // Claims dialogs
  claimsExtraction: false,
  // Confirmation dialogs
  confirm: false,
}

/**
 * Dialog Store
 *
 * Centralized state management for all application dialogs.
 *
 * @example
 * ```typescript
 * import { useDialogStore } from '@/stores/dialogStore'
 *
 * function SettingsButton() {
 *   const openDialog = useDialogStore(state => state.openDialog)
 *   return <Button onClick={() => openDialog('userSettings')}>Settings</Button>
 * }
 *
 * function UserSettingsDialog() {
 *   const open = useDialogStore(state => state.dialogs.userSettings)
 *   const closeDialog = useDialogStore(state => state.closeDialog)
 *   return <Dialog open={open} onClose={() => closeDialog('userSettings')}>...</Dialog>
 * }
 * ```
 */
export const useDialogStore = create<DialogStore>()(
  devtools(
    (set, get) => ({
      dialogs: initialDialogState,

      openDialog: (name) =>
        set(
          (state) => ({
            dialogs: {
              ...state.dialogs,
              [name]: true,
            },
          }),
          false,
          `openDialog(${name})`
        ),

      closeDialog: (name) =>
        set(
          (state) => ({
            dialogs: {
              ...state.dialogs,
              [name]: false,
            },
          }),
          false,
          `closeDialog(${name})`
        ),

      toggleDialog: (name) =>
        set(
          (state) => ({
            dialogs: {
              ...state.dialogs,
              [name]: !state.dialogs[name],
            },
          }),
          false,
          `toggleDialog(${name})`
        ),

      closeAll: () =>
        set(
          {
            dialogs: initialDialogState,
          },
          false,
          'closeAll'
        ),

      isAnyDialogOpen: () => {
        const { dialogs } = get()
        return Object.values(dialogs).some((isOpen) => isOpen)
      },

      getOpenDialogs: () => {
        const { dialogs } = get()
        return (Object.keys(dialogs) as DialogName[]).filter((name) => dialogs[name])
      },
    }),
    { name: 'DialogStore' }
  )
)

/**
 * Hook to get both open state and close handler for a specific dialog
 * Convenience wrapper to reduce boilerplate
 *
 * @example
 * ```typescript
 * function UserSettingsDialog() {
 *   const { open, close } = useDialog('userSettings')
 *   return <Dialog open={open} onClose={close}>...</Dialog>
 * }
 * ```
 */
export function useDialog(name: DialogName) {
  const open = useDialogStore((state) => state.dialogs[name])
  const openDialog = useDialogStore((state) => state.openDialog)
  const closeDialog = useDialogStore((state) => state.closeDialog)
  const toggleDialog = useDialogStore((state) => state.toggleDialog)

  return {
    open,
    close: () => closeDialog(name),
    toggle: () => toggleDialog(name),
    openDialog: () => openDialog(name),
  }
}
