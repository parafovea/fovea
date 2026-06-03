import { useState, FormEvent } from 'react'
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom'

import foveaLogo from '@/assets/fovea-logo.svg'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@hooks/auth'
import { useAuthStore } from '@store/zustand/authStore'

/**
 * Login page component.
 * Displays username and password fields with validation and error handling.
 * Supports "remember me" option to extend session duration.
 */
export function LoginPage(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const allowRegistration = useAuthStore(state => state.allowRegistration)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Handles form submission and authentication.
   *
   * @param e - Form event
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username || !password) {
      setError('Username and password are required')
      return
    }

    setLoading(true)

    try {
      await login(username, password, rememberMe)
      const params = new URLSearchParams(location.search)
      const from = params.get('redirect') || '/'
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Clears error message when form fields change.
   */
  const handleFieldChange = () => {
    if (error) {
      setError(null)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="max-w-[400px] w-full mx-2">
        <CardHeader className="text-center">
          <img
            src={foveaLogo}
            alt="FOVEA logo"
            className="mx-auto size-12 mb-2"
          />
          <h1 className="text-3xl font-bold tracking-wide">FOVEA</h1>
          <p className="text-sm text-muted-foreground">
            Web-based video annotation tool for developing annotation ontologies.
          </p>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  handleFieldChange()
                }}
                required
                autoFocus
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  handleFieldChange()
                }}
                required
                disabled={loading}
              />
            </div>

            <div className="flex items-center gap-2 mt-1">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                disabled={loading}
              />
              <Label htmlFor="remember-me">Remember me (30 days)</Label>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !username || !password}
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>

            {allowRegistration && (
              <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{' '}
                <RouterLink to="/register" className="text-primary underline underline-offset-4 hover:text-primary/80">
                  Register
                </RouterLink>
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
