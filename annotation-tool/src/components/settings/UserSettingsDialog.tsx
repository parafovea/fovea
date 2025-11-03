/**
 * User settings dialog component.
 * Provides tabs for profile settings, API key management, and preferences.
 */

import { useState } from 'react'
import { useSelector } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  IconButton,
} from '@mui/material'
import {
  Person as PersonIcon,
  VpnKey as KeyIcon,
  Settings as SettingsIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import { RootState } from '../../store/store.js'
import ProfileTab from './ProfileTab.js'
import ApiKeyManagementPanel from './ApiKeyManagementPanel.js'

/**
 * Tab panel component.
 * Displays content for the selected tab.
 *
 * @param children - Tab content
 * @param value - Current tab value
 * @param index - Tab index
 * @returns Tab panel content
 */
interface TabPanelProps {
  children?: React.ReactNode
  value: number
  index: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  )
}

/**
 * Props for UserSettingsDialog component.
 */
interface UserSettingsDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * User settings dialog.
 * Displays user profile, API keys, and preferences in tabs.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns User settings dialog
 */
export default function UserSettingsDialog({ open, onClose }: UserSettingsDialogProps) {
  const { mode } = useSelector((state: RootState) => state.user)
  const [currentTab, setCurrentTab] = useState(0)

  /**
   * Handles tab change.
   *
   * @param _ - Change event (unused)
   * @param newValue - New tab index
   */
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue)
  }

  /**
   * Resets dialog state on close.
   */
  const handleClose = () => {
    setCurrentTab(0)
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          User Settings
          <IconButton
            aria-label="close"
            onClick={handleClose}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        aria-label="user settings tabs"
        sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}
      >
        <Tab
          icon={<PersonIcon />}
          iconPosition="start"
          label="Profile"
          id="settings-tab-0"
          aria-controls="settings-tabpanel-0"
        />
        <Tab
          icon={<KeyIcon />}
          iconPosition="start"
          label="API Keys"
          id="settings-tab-1"
          aria-controls="settings-tabpanel-1"
        />
        <Tab
          icon={<SettingsIcon />}
          iconPosition="start"
          label="Preferences"
          id="settings-tab-2"
          aria-controls="settings-tabpanel-2"
        />
      </Tabs>

      <DialogContent sx={{ minHeight: 400 }}>
        <TabPanel value={currentTab} index={0}>
          <ProfileTab showPasswordChange={mode === 'multi-user'} />
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <ApiKeyManagementPanel />
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          <Box sx={{ p: 2 }}>
            <p>Preferences settings coming soon.</p>
          </Box>
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
