/**
 * Notification store for global toast/alert notifications.
 * Provides centralized notification management with auto-hide functionality.
 *
 * @module store/zustand/notificationStore
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/** Notification severity level */
export type NotificationType = 'success' | 'error' | 'warning' | 'info'

/**
 * A notification to display to the user.
 */
export interface Notification {
  /** Unique identifier */
  id: string
  /** Notification type/severity */
  type: NotificationType
  /** Message to display */
  message: string
  /** Whether to auto-hide after timeout (default: true) */
  autoHide?: boolean
}

/**
 * Notification store state and actions.
 */
export interface NotificationState {
  /** Currently active notifications */
  notifications: Notification[]
  /** Add a new notification and return its ID */
  addNotification: (notification: Omit<Notification, 'id'>) => string
  /** Remove a notification by ID */
  removeNotification: (id: string) => void
  /** Clear all notifications */
  clearAll: () => void
}

/** Auto-hide timeout in milliseconds */
const AUTO_HIDE_TIMEOUT_MS = 5000

/**
 * Generate a unique notification ID.
 */
function generateNotificationId(): string {
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Notification store for displaying global alerts and toasts.
 *
 * @example
 * ```typescript
 * import { useNotificationStore } from '@store/zustand/notificationStore'
 *
 * function SaveButton() {
 *   const addNotification = useNotificationStore(state => state.addNotification)
 *
 *   const handleSave = async () => {
 *     try {
 *       await saveData()
 *       addNotification({ type: 'success', message: 'Saved successfully' })
 *     } catch {
 *       addNotification({ type: 'error', message: 'Failed to save' })
 *     }
 *   }
 *
 *   return <Button onClick={handleSave}>Save</Button>
 * }
 * ```
 */
export const useNotificationStore = create<NotificationState>()(
  devtools(
    (set) => ({
      notifications: [],

      addNotification: (notification) => {
        const id = generateNotificationId()
        set(
          (state) => ({
            notifications: [...state.notifications, { ...notification, id }],
          }),
          false,
          'addNotification'
        )

        // Auto-remove after 5 seconds if autoHide is true (default)
        if (notification.autoHide !== false) {
          setTimeout(() => {
            set(
              (state) => ({
                notifications: state.notifications.filter((n) => n.id !== id),
              }),
              false,
              'autoRemoveNotification'
            )
          }, AUTO_HIDE_TIMEOUT_MS)
        }

        return id
      },

      removeNotification: (id) => {
        set(
          (state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
          }),
          false,
          'removeNotification'
        )
      },

      clearAll: () => set({ notifications: [] }, false, 'clearAll'),
    }),
    { name: 'NotificationStore' }
  )
)
