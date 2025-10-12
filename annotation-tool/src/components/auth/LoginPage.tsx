import { useState, FormEvent } from 'react'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  FormControlLabel,
  Checkbox,
  Link,
} from '@mui/material'
import { Login as LoginIcon } from '@mui/icons-material'
import { useAuth } from '../../hooks/auth/useAuth.js'
import { RootState } from '../../store/store.js'

/**
 * Login page component.
 * Displays username and password fields with validation and error handling.
 * Supports "remember me" option to extend session duration.
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const { allowRegistration } = useSelector((state: RootState) => state.user)

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
      navigate('/')
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
          maxWidth: 400,
          width: '100%',
          mx: 2,
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <LoginIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h4" component="h1" gutterBottom>
            fovea
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Video Annotation Tool
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
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
              />
            }
            label="Remember me (30 days)"
            sx={{ mt: 1 }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading || !username || !password}
            sx={{ mt: 2 }}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>

          {allowRegistration && (
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Don't have an account?{' '}
                <Link component={RouterLink} to="/register">
                  Register
                </Link>
              </Typography>
            </Box>
          )}
        </form>
      </Paper>
    </Box>
  )
}
