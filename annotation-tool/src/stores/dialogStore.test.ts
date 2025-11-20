/**
 * Tests for Dialog Store
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useDialogStore, type DialogName } from './dialogStore'

describe('DialogStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useDialogStore.getState().closeAll()
  })

  describe('Initial State', () => {
    it('should have all dialogs closed initially', () => {
      const { dialogs } = useDialogStore.getState()
      const allClosed = Object.values(dialogs).every((isOpen) => isOpen === false)
      expect(allClosed).toBe(true)
    })

    it('should have correct dialog names defined', () => {
      const { dialogs } = useDialogStore.getState()
      const dialogNames = Object.keys(dialogs)

      // Settings dialogs
      expect(dialogNames).toContain('userSettings')
      expect(dialogNames).toContain('modelSettings')
      expect(dialogNames).toContain('about')
      expect(dialogNames).toContain('adminPanel')
      expect(dialogNames).toContain('keyboardShortcuts')

      // Import/Export dialogs
      expect(dialogNames).toContain('import')
      expect(dialogNames).toContain('export')
      expect(dialogNames).toContain('importResult')

      // Video dialogs
      expect(dialogNames).toContain('videoSummary')
      expect(dialogNames).toContain('detection')

      // Ontology dialogs
      expect(dialogNames).toContain('createPersona')
      expect(dialogNames).toContain('editPersona')

      // Object dialogs
      expect(dialogNames).toContain('createEntity')
      expect(dialogNames).toContain('editEntity')
      expect(dialogNames).toContain('createEvent')
      expect(dialogNames).toContain('editEvent')

      // Admin dialogs
      expect(dialogNames).toContain('createUser')
      expect(dialogNames).toContain('editUser')
      expect(dialogNames).toContain('sessionManagement')

      // API dialogs
      expect(dialogNames).toContain('apiKey')

      // Claims dialogs
      expect(dialogNames).toContain('claimsExtraction')

      // Confirmation dialogs
      expect(dialogNames).toContain('confirm')
    })

    it('should not have any dialog open initially', () => {
      const { isAnyDialogOpen } = useDialogStore.getState()
      expect(isAnyDialogOpen()).toBe(false)
    })

    it('should have no open dialogs initially', () => {
      const { getOpenDialogs } = useDialogStore.getState()
      expect(getOpenDialogs()).toEqual([])
    })
  })

  describe('openDialog', () => {
    it('should open a dialog', () => {
      const { openDialog, dialogs } = useDialogStore.getState()
      openDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(true)
    })

    it('should open multiple dialogs independently', () => {
      const { openDialog } = useDialogStore.getState()
      openDialog('userSettings')
      openDialog('modelSettings')
      openDialog('about')

      const { dialogs } = useDialogStore.getState()
      expect(dialogs.userSettings).toBe(true)
      expect(dialogs.modelSettings).toBe(true)
      expect(dialogs.about).toBe(true)
      expect(dialogs.keyboardShortcuts).toBe(false) // Still closed
    })

    it('should not affect other dialogs when opening one', () => {
      const { openDialog, dialogs: initialDialogs } = useDialogStore.getState()
      openDialog('import')

      const { dialogs } = useDialogStore.getState()
      expect(dialogs.import).toBe(true)
      expect(dialogs.export).toBe(false)
      expect(dialogs.userSettings).toBe(false)
    })
  })

  describe('closeDialog', () => {
    it('should close an open dialog', () => {
      const { openDialog, closeDialog } = useDialogStore.getState()
      openDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(true)

      closeDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(false)
    })

    it('should not affect other open dialogs', () => {
      const { openDialog, closeDialog } = useDialogStore.getState()
      openDialog('userSettings')
      openDialog('modelSettings')
      openDialog('about')

      closeDialog('modelSettings')

      const { dialogs } = useDialogStore.getState()
      expect(dialogs.userSettings).toBe(true)
      expect(dialogs.modelSettings).toBe(false)
      expect(dialogs.about).toBe(true)
    })

    it('should be safe to close an already closed dialog', () => {
      const { closeDialog } = useDialogStore.getState()
      closeDialog('userSettings') // Already closed
      expect(useDialogStore.getState().dialogs.userSettings).toBe(false)
    })
  })

  describe('toggleDialog', () => {
    it('should toggle dialog from closed to open', () => {
      const { toggleDialog } = useDialogStore.getState()
      expect(useDialogStore.getState().dialogs.userSettings).toBe(false)

      toggleDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(true)
    })

    it('should toggle dialog from open to closed', () => {
      const { openDialog, toggleDialog } = useDialogStore.getState()
      openDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(true)

      toggleDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(false)
    })

    it('should toggle multiple times', () => {
      const { toggleDialog } = useDialogStore.getState()

      toggleDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(true)

      toggleDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(false)

      toggleDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(true)
    })
  })

  describe('closeAll', () => {
    it('should close all open dialogs', () => {
      const { openDialog, closeAll } = useDialogStore.getState()

      // Open multiple dialogs
      openDialog('userSettings')
      openDialog('modelSettings')
      openDialog('about')
      openDialog('import')
      openDialog('export')

      // Verify they're open
      let { dialogs } = useDialogStore.getState()
      expect(dialogs.userSettings).toBe(true)
      expect(dialogs.modelSettings).toBe(true)
      expect(dialogs.about).toBe(true)

      // Close all
      closeAll()

      // Verify all closed
      dialogs = useDialogStore.getState().dialogs
      const allClosed = Object.values(dialogs).every((isOpen) => isOpen === false)
      expect(allClosed).toBe(true)
    })

    it('should work when no dialogs are open', () => {
      const { closeAll } = useDialogStore.getState()
      closeAll() // Should not throw

      const { dialogs } = useDialogStore.getState()
      const allClosed = Object.values(dialogs).every((isOpen) => isOpen === false)
      expect(allClosed).toBe(true)
    })
  })

  describe('isAnyDialogOpen', () => {
    it('should return false when no dialogs are open', () => {
      const { isAnyDialogOpen } = useDialogStore.getState()
      expect(isAnyDialogOpen()).toBe(false)
    })

    it('should return true when at least one dialog is open', () => {
      const { openDialog, isAnyDialogOpen } = useDialogStore.getState()
      openDialog('userSettings')
      expect(isAnyDialogOpen()).toBe(true)
    })

    it('should return true when multiple dialogs are open', () => {
      const { openDialog, isAnyDialogOpen } = useDialogStore.getState()
      openDialog('userSettings')
      openDialog('modelSettings')
      expect(isAnyDialogOpen()).toBe(true)
    })

    it('should return false after closing all dialogs', () => {
      const { openDialog, closeAll, isAnyDialogOpen } = useDialogStore.getState()
      openDialog('userSettings')
      openDialog('modelSettings')
      expect(isAnyDialogOpen()).toBe(true)

      closeAll()
      expect(isAnyDialogOpen()).toBe(false)
    })
  })

  describe('getOpenDialogs', () => {
    it('should return empty array when no dialogs are open', () => {
      const { getOpenDialogs } = useDialogStore.getState()
      expect(getOpenDialogs()).toEqual([])
    })

    it('should return array of open dialog names', () => {
      const { openDialog, getOpenDialogs } = useDialogStore.getState()
      openDialog('userSettings')
      openDialog('modelSettings')
      openDialog('about')

      const openDialogs = getOpenDialogs()
      expect(openDialogs).toHaveLength(3)
      expect(openDialogs).toContain('userSettings')
      expect(openDialogs).toContain('modelSettings')
      expect(openDialogs).toContain('about')
    })

    it('should update after opening more dialogs', () => {
      const { openDialog, getOpenDialogs } = useDialogStore.getState()
      openDialog('userSettings')
      expect(getOpenDialogs()).toEqual(['userSettings'])

      openDialog('modelSettings')
      const openDialogs = getOpenDialogs()
      expect(openDialogs).toHaveLength(2)
      expect(openDialogs).toContain('userSettings')
      expect(openDialogs).toContain('modelSettings')
    })

    it('should update after closing dialogs', () => {
      const { openDialog, closeDialog, getOpenDialogs } = useDialogStore.getState()
      openDialog('userSettings')
      openDialog('modelSettings')
      openDialog('about')

      closeDialog('modelSettings')

      const openDialogs = getOpenDialogs()
      expect(openDialogs).toHaveLength(2)
      expect(openDialogs).toContain('userSettings')
      expect(openDialogs).toContain('about')
      expect(openDialogs).not.toContain('modelSettings')
    })
  })

  // Note: useDialog hook tests are omitted as they require React context.
  // The hook is a simple wrapper around the store methods which are already tested above.

  describe('Store Integration', () => {
    it('should update state immediately', () => {
      const { openDialog, dialogs: initialDialogs } = useDialogStore.getState()
      expect(initialDialogs.userSettings).toBe(false)

      openDialog('userSettings')
      expect(useDialogStore.getState().dialogs.userSettings).toBe(true)
    })

    it('should handle rapid open/close operations', () => {
      const { openDialog, closeDialog } = useDialogStore.getState()

      openDialog('userSettings')
      openDialog('modelSettings')
      closeDialog('userSettings')
      openDialog('about')
      closeDialog('modelSettings')

      const { dialogs } = useDialogStore.getState()
      expect(dialogs.userSettings).toBe(false)
      expect(dialogs.modelSettings).toBe(false)
      expect(dialogs.about).toBe(true)
    })

    it('should handle all dialog types', () => {
      const { openDialog } = useDialogStore.getState()
      const dialogNames: DialogName[] = [
        'userSettings',
        'modelSettings',
        'about',
        'adminPanel',
        'keyboardShortcuts',
        'import',
        'export',
        'videoSummary',
        'detection',
        'createPersona',
        'editPersona',
        'createEntity',
        'editEntity',
        'createUser',
        'editUser',
        'apiKey',
      ]

      // Open all dialogs
      dialogNames.forEach((name) => openDialog(name))

      // Verify all are open
      const { dialogs } = useDialogStore.getState()
      dialogNames.forEach((name) => {
        expect(dialogs[name]).toBe(true)
      })
    })
  })
})
