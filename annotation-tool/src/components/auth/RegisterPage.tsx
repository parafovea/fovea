import { useState, FormEvent } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'

import foveaLogo from '@/assets/fovea-logo.svg'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@hooks/auth'

/**
 * Registration page component.
 * Displays form for creating new user accounts with validation.
 * Only shown when registration is enabled in application configuration.
 */
export function RegisterPage(): JSX.Element {
  const navigate = useNavigate()
  const { register } = useAuth()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Calculates password strength score from 0 to 100.
   *
   * @param pwd - Password to evaluate
   * @returns Password strength score
   */
  const getPasswordStrength = (pwd: string): number => {
    let strength = 0
    if (pwd.length >= 8) strength += 25
    if (pwd.length >= 12) strength += 15
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) strength += 20
    if (/\d/.test(pwd)) strength += 20
    if (/[^a-zA-Z\d]/.test(pwd)) strength += 20
    return Math.min(100, strength)
  }

  const passwordStrength = getPasswordStrength(password)

  /**
   * Returns Tailwind color class for password strength indicator.
   *
   * @returns Tailwind color class for the progress indicator
   */
  const getStrengthColorClass = (): string => {
    if (passwordStrength < 40) return '[&_[data-slot=progress-indicator]]:bg-destructive'
    if (passwordStrength < 70) return '[&_[data-slot=progress-indicator]]:bg-yellow-500'
    return '[&_[data-slot=progress-indicator]]:bg-green-500'
  }

  /**
   * Handles form submission and user registration.
   *
   * @param e - Form event
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username || !displayName || !password) {
      setError('Username, display name, and password are required')
      return
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Invalid email address')
      return
    }

    setLoading(true)

    try {
      await register({
        username,
        email: email || undefined,
        password,
        displayName,
      })
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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
      <Card className="max-w-[500px] w-full mx-2">
        <CardHeader className="text-center">
          <img
            src={foveaLogo}
            alt="FOVEA logo"
            className="mx-auto size-12 mb-2"
          />
          <h1 className="text-3xl font-bold tracking-wide">FOVEA</h1>
          <p className="text-sm text-muted-foreground">
            Flexible Ontology Visual Event Analyzer
          </p>
          <p className="text-sm font-medium mt-3">Create an account.</p>
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
              <p className="text-xs text-muted-foreground">At least 3 characters, unique across all users</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value)
                  handleFieldChange()
                }}
                required
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">Your full name or preferred display name</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  handleFieldChange()
                }}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">Optional, used for account recovery</p>
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
              <p className="text-xs text-muted-foreground">At least 8 characters</p>
            </div>

            {password && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Password strength</p>
                <Progress
                  value={passwordStrength}
                  className={getStrengthColorClass()}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  handleFieldChange()
                }}
                required
                disabled={loading}
                aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
              />
              {confirmPassword.length > 0 && password !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || !username || !displayName || !password || !confirmPassword}
            >
              {loading ? 'Creating account...' : 'Register'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <RouterLink to="/login" className="text-primary underline underline-offset-4 hover:text-primary/80">
                Login
              </RouterLink>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
