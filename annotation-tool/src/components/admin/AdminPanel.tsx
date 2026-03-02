/**
 * Admin panel component.
 * Provides tabs for user, group, project, video access, permissions, session, and settings management.
 * Only accessible to users with isAdmin flag set to true.
 */

import { useState } from 'react'
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
  Group as GroupIcon,
  Folder as FolderIcon,
  VideoLibrary as VideoLibraryIcon,
  Security as SecurityIcon,
  Lock as LockIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'
import { useAuthStore } from '@store/zustand/authStore'
import UserManagementPage from './UserManagementPage'
import SessionManagementPage from './SessionManagementPage'
import GroupManagementPage from './GroupManagementPage'
import ProjectManagementPage from './ProjectManagementPage'
import VideoAssignmentPage from './VideoAssignmentPage'
import PermissionsPage from './PermissionsPage'

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
 * Displays tabs for users, groups, projects, video access, permissions, sessions, and settings.
 * Redirects non-admin users to home page.
 */
export default function AdminPanel() {
  const currentUser = useAuthStore(state => state.currentUser)
  const [currentTab, setCurrentTab] = useState(0)

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
  }

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Admin Panel
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Manage users, groups, projects, video access, permissions, sessions, and system settings
        </Typography>
      </Box>

      <Paper sx={{ width: '100%' }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          aria-label="admin panel tabs"
          variant="scrollable"
          scrollButtons="auto"
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
            icon={<GroupIcon />}
            iconPosition="start"
            label="Groups"
            id="admin-tab-1"
            aria-controls="admin-tabpanel-1"
          />
          <Tab
            icon={<FolderIcon />}
            iconPosition="start"
            label="Projects"
            id="admin-tab-2"
            aria-controls="admin-tabpanel-2"
          />
          <Tab
            icon={<VideoLibraryIcon />}
            iconPosition="start"
            label="Video Access"
            id="admin-tab-3"
            aria-controls="admin-tabpanel-3"
          />
          <Tab
            icon={<SecurityIcon />}
            iconPosition="start"
            label="Permissions"
            id="admin-tab-4"
            aria-controls="admin-tabpanel-4"
          />
          <Tab
            icon={<LockIcon />}
            iconPosition="start"
            label="Sessions"
            id="admin-tab-5"
            aria-controls="admin-tabpanel-5"
          />
          <Tab
            icon={<SettingsIcon />}
            iconPosition="start"
            label="Settings"
            id="admin-tab-6"
            aria-controls="admin-tabpanel-6"
          />
        </Tabs>

        <TabPanel value={currentTab} index={0}>
          <UserManagementPage />
        </TabPanel>

        <TabPanel value={currentTab} index={1}>
          <GroupManagementPage />
        </TabPanel>

        <TabPanel value={currentTab} index={2}>
          <ProjectManagementPage />
        </TabPanel>

        <TabPanel value={currentTab} index={3}>
          <VideoAssignmentPage />
        </TabPanel>

        <TabPanel value={currentTab} index={4}>
          <PermissionsPage />
        </TabPanel>

        <TabPanel value={currentTab} index={5}>
          <SessionManagementPage />
        </TabPanel>

        <TabPanel value={currentTab} index={6}>
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
    </Container>
  )
}
