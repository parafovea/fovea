import { useState, FormEvent } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  LinearProgress,
} from '@mui/material'
import { PersonAdd as RegisterIcon } from '@mui/icons-material'
import { useAuth } from '../../hooks/auth/useAuth.js'

/**
 * Registration page component.
 * Displays form for creating new user accounts with validation.
 * Only shown when registration is enabled in application configuration.
 */
export default function RegisterPage() {
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
   * Returns color for password strength indicator.
   *
   * @returns MUI color name
   */
  const getStrengthColor = (): 'error' | 'warning' | 'success' => {
    if (passwordStrength < 40) return 'error'
    if (passwordStrength < 70) return 'warning'
    return 'success'
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
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Paper
        sx={{
          p: 4,
          maxWidth: 500,
          width: '100%',
          mx: 2,
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <RegisterIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h4" component="h1" gutterBottom>
            Create Account
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Register for fovea
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            label="Username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              handleFieldChange()
            }}
            fullWidth
            required
            margin="normal"
            autoFocus
            disabled={loading}
            helperText="At least 3 characters, unique across all users"
          />

          <TextField
            label="Display Name"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value)
              handleFieldChange()
            }}
            fullWidth
            required
            margin="normal"
            disabled={loading}
            helperText="Your full name or preferred display name"
          />

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              handleFieldChange()
            }}
            fullWidth
            margin="normal"
            disabled={loading}
            helperText="Optional, used for account recovery"
          />

          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              handleFieldChange()
            }}
            fullWidth
            required
            margin="normal"
            disabled={loading}
            helperText="At least 8 characters"
          />

          {password && (
            <Box sx={{ mt: 1, mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Password strength
              </Typography>
              <LinearProgress
                variant="determinate"
                value={passwordStrength}
                color={getStrengthColor()}
                sx={{ height: 6, borderRadius: 3 }}
              />
            </Box>
          )}

          <TextField
            label="Confirm Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value)
              handleFieldChange()
            }}
            fullWidth
            required
            margin="normal"
            disabled={loading}
            error={confirmPassword.length > 0 && password !== confirmPassword}
            helperText={
              confirmPassword.length > 0 && password !== confirmPassword
                ? 'Passwords do not match'
                : ''
            }
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading || !username || !displayName || !password || !confirmPassword}
            sx={{ mt: 2 }}
          >
            {loading ? 'Creating account...' : 'Register'}
          </Button>

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Already have an account?{' '}
              <Link component={RouterLink} to="/login">
                Login
              </Link>
            </Typography>
          </Box>
        </form>
      </Paper>
    </Box>
  )
}
