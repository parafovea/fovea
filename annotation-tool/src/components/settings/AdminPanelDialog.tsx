/**
 * Admin panel dialog component.
 * Provides tabs for user management, session management, and settings.
 */

import { useState } from 'react'
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
  Typography,
} from '@mui/material'
import {
  People as PeopleIcon,
  Lock as LockIcon,
  Settings as SettingsIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import UserManagementPage from '../admin/UserManagementPage.js'
import SessionManagementPage from '../admin/SessionManagementPage.js'

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
      {value === index && <Box>{children}</Box>}
    </div>
  )
}

/**
 * Props for AdminPanelDialog component.
 */
interface AdminPanelDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Admin panel dialog.
 * Displays user management, session management, and settings tabs.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns Admin panel dialog
 */
export default function AdminPanelDialog({ open, onClose }: AdminPanelDialogProps) {
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
    <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Admin Panel
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
        aria-label="admin panel tabs"
        sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}
      >
        <Tab
          icon={<PeopleIcon />}
          iconPosition="start"
          label="Users"
          id="admin-tab-0"
          aria-controls="admin-tabpanel-0"
        />
        <Tab
          icon={<LockIcon />}
          iconPosition="start"
          label="Sessions"
          id="admin-tab-1"
          aria-controls="admin-tabpanel-1"
        />
        <Tab
          icon={<SettingsIcon />}
          iconPosition="start"
          label="Settings"
          id="admin-tab-2"
          aria-controls="admin-tabpanel-2"
        />
      </Tabs>

      <DialogContent sx={{ minHeight: 500 }}>
        <TabPanel value={currentTab} index={0}>
          <UserManagementPage />
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <SessionManagementPage />
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              System Settings
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Settings panel coming soon.
            </Typography>
          </Box>
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
