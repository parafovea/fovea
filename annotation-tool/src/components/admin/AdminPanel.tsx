/**
 * Admin panel component.
 * Provides tabs for user management, session management, and settings.
 * Only accessible to users with isAdmin flag set to true.
 */

import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Navigate } from 'react-router-dom'
import {
  Box,
  Container,
  Paper,
  Tabs,
  Tab,
  Typography,
} from '@mui/material'
import {
  People as PeopleIcon,
  Lock as LockIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'
import { RootState } from '../../store/store.js'
import UserManagementPage from './UserManagementPage.js'
import SessionManagementDialog from './SessionManagementDialog.js'

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
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  )
}

/**
 * Admin panel component.
 * Displays user management, session management, and settings tabs.
 * Redirects non-admin users to home page.
 */
export default function AdminPanel() {
  const { currentUser } = useSelector((state: RootState) => state.user)
  const [currentTab, setCurrentTab] = useState(0)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)

  // Redirect if not admin
  if (!currentUser?.isAdmin) {
    return <Navigate to="/" replace />
  }

  /**
   * Handles tab change.
   *
   * @param _ - Change event (unused)
   * @param newValue - New tab index
   */
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue)

    // Open session dialog when Sessions tab is clicked
    if (newValue === 1) {
      setSessionDialogOpen(true)
    }
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Admin Panel
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage users, sessions, and system settings
        </Typography>
      </Box>

      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          aria-label="admin panel tabs"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
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

        <TabPanel value={currentTab} index={0}>
          <UserManagementPage />
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              Session management is available through the dialog.
            </Typography>
          </Box>
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
      </Paper>

      {/* Session Management Dialog */}
      <SessionManagementDialog
        open={sessionDialogOpen}
        onClose={() => {
          setSessionDialogOpen(false)
          setCurrentTab(0) // Return to Users tab
        }}
      />
    </Container>
  )
}
