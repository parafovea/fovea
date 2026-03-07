import { useNavigate } from 'react-router-dom'

import { Info, LayoutDashboard, LogOut, Settings, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, useCurrentUser } from '@hooks/auth'
import { useAuthStore } from '@store/zustand/authStore'

/**
 * User menu component props.
 */
export interface UserMenuProps {
  onSettingsClick?: () => void
  onModelSettingsClick?: () => void
  onAboutClick?: () => void
  onAdminPanelClick?: () => void
}

/**
 * User menu component.
 * Displays user avatar and dropdown menu with user settings, model settings, about, admin panel, and logout options.
 * Only shown when user is authenticated.
 */
export function UserMenu({
  onSettingsClick,
  onModelSettingsClick,
  onAboutClick,
  onAdminPanelClick,
}: UserMenuProps): JSX.Element | null {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { user, isAdmin } = useCurrentUser()
  const mode = useAuthStore(state => state.mode)

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
   * Logs out user and redirects to login page.
   */
  const handleLogout = async () => {
    await logout()
    if (mode === 'multi-user') {
      navigate('/login')
    }
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-sm hidden sm:block">
        {user.displayName}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" className="rounded-full">
              <span className="flex items-center justify-center size-8 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                {getUserInitials()}
              </span>
            </Button>
          }
        />

        <DropdownMenuContent align="end" sideOffset={4}>
          <DropdownMenuLabel>
            <div>
              <p className="text-sm font-semibold">{user.displayName}</p>
              <p className="text-xs text-muted-foreground">@{user.username}</p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={onSettingsClick}>
            <Settings className="size-4" />
            User Settings
          </DropdownMenuItem>

          <DropdownMenuItem onClick={onModelSettingsClick}>
            <LayoutDashboard className="size-4" />
            Model Settings
          </DropdownMenuItem>

          <DropdownMenuItem onClick={onAboutClick}>
            <Info className="size-4" />
            About
          </DropdownMenuItem>

          {isAdmin && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onAdminPanelClick}>
                <ShieldCheck className="size-4" />
                Admin Panel
              </DropdownMenuItem>
            </>
          )}

          {mode === 'multi-user' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="size-4" />
                Logout
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
