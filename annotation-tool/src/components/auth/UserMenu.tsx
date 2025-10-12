import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Box,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  Typography,
  Divider,
  ListItemIcon,
} from '@mui/material'
import {
  Settings as SettingsIcon,
  AdminPanelSettings as AdminIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material'
import { useAuth } from '../../hooks/auth/useAuth.js'
import { useCurrentUser } from '../../hooks/auth/useCurrentUser.js'
import { RootState } from '../../store/store.js'

/**
 * User menu component props.
 */
export interface UserMenuProps {
  onSettingsClick?: () => void
}

/**
 * User menu component.
 * Displays user avatar and dropdown menu with profile, settings, admin panel, and logout options.
 * Only shown when user is authenticated.
 */
export default function UserMenu({ onSettingsClick }: UserMenuProps) {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { user, isAdmin } = useCurrentUser()
  const { mode } = useSelector((state: RootState) => state.user)

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  if (!user) {
    return null
  }

  /**
   * Returns user initials for avatar display.
   *
   * @returns User initials (up to 2 characters)
   */
  const getUserInitials = (): string => {
    const parts = user.displayName.split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return user.displayName.slice(0, 2).toUpperCase()
  }

  /**
   * Opens user menu.
   *
   * @param event - Click event
   */
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }

  /**
   * Closes user menu.
   */
  const handleClose = () => {
    setAnchorEl(null)
  }

  /**
   * Opens settings dialog.
   */
  const handleSettings = () => {
    handleClose()
    if (onSettingsClick) {
      onSettingsClick()
    }
  }

  /**
   * Navigates to admin panel.
   */
  const handleAdmin = () => {
    handleClose()
    navigate('/admin')
  }

  /**
   * Logs out user and redirects to login page.
   */
  const handleLogout = async () => {
    handleClose()
    await logout()
    if (mode === 'multi-user') {
      navigate('/login')
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
        {user.displayName}
      </Typography>
      <IconButton onClick={handleClick} size="small">
        <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
          {getUserInitials()}
        </Avatar>
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem disabled>
          <Box>
            <Typography variant="body2" fontWeight="bold">
              {user.displayName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              @{user.username}
            </Typography>
          </Box>
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleSettings}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>

        {isAdmin && (
          <MenuItem onClick={handleAdmin}>
            <ListItemIcon>
              <AdminIcon fontSize="small" />
            </ListItemIcon>
            Admin Panel
          </MenuItem>
        )}

        {mode === 'multi-user' && (
          <>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </>
        )}
      </Menu>
    </Box>
  )
}
