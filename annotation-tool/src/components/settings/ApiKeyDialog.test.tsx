/**
 * Tests for ApiKeyDialog component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../../test/utils/test-utils.js'
import ApiKeyDialog from './ApiKeyDialog.js'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'
import { ApiKey } from '../../hooks/useApiKeys.js'

describe('ApiKeyDialog', () => {
  const mockOnClose = vi.fn()

  const mockExistingKey: ApiKey = {
    id: 'key-1',
    provider: 'openai',
    keyName: 'My OpenAI Key',
    keyPrefix: 'sk-',
    createdAt: '2025-01-01T00:00:00Z',
    lastUsedAt: null,
  }

  beforeEach(() => {
    mockOnClose.mockClear()
  })

  describe('Create Mode', () => {
    it('renders dialog with correct title', async () => {
      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')
      expect(screen.getByText('Add API Key')).toBeInTheDocument()
    })

    it('shows all form fields', async () => {
      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')

      // Wait for submit button to ensure dialog is fully rendered
      await screen.findByRole('button', { name: /add key/i })

      // Provider select
      expect(screen.getByLabelText('Provider')).toBeInTheDocument()

      // Key name text field
      expect(screen.getByRole('textbox', { name: /key name/i })).toBeInTheDocument()

      // API key text field (password field) - query by placeholder or helper text context
      const apiKeyFields = screen.getAllByLabelText(/API Key/i, { selector: 'input' })
      expect(apiKeyFields[0]).toBeInTheDocument()
    })

    it('validates key name required', async () => {
      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')
      const submitButton = await screen.findByRole('button', { name: /add key/i })

      // Submit form without filling key name
      const form = submitButton.closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('Key name is required')).toBeInTheDocument()
      })
    })

    it('validates API key required in create mode', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')
      const submitButton = await screen.findByRole('button', { name: /add key/i })

      // Fill only key name
      const keyNameField = screen.getByRole('textbox', { name: /key name/i })
      await user.type(keyNameField, 'Test Key')

      // Submit form
      const form = submitButton.closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('API key is required')).toBeInTheDocument()
      })
    })

    it('toggles API key visibility', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')
      await screen.findByRole('button', { name: /add key/i })

      const apiKeyField = screen.getAllByLabelText(/API Key/i, { selector: 'input' })[0]
      const toggleButton = screen.getByRole('button', { name: /toggle api key visibility/i })

      expect(apiKeyField).toHaveAttribute('type', 'password')

      // Click toggle button
      await user.click(toggleButton)

      await waitFor(() => {
        expect(apiKeyField).toHaveAttribute('type', 'text')
      })

      // Toggle back
      await user.click(toggleButton)

      await waitFor(() => {
        expect(apiKeyField).toHaveAttribute('type', 'password')
      })
    })

    it('submits with valid data', async () => {
      const user = userEvent.setup()

      server.use(
        http.post('/api/api-keys', async ({ request }) => {
          const body = await request.json()
          expect(body).toEqual({
            provider: 'anthropic',
            keyName: 'My Anthropic Key',
            apiKey: 'sk-ant-test123',
          })
          return HttpResponse.json({
            id: 'new-key-1',
            provider: 'anthropic',
            keyName: 'My Anthropic Key',
            keyPrefix: 'sk-ant-',
            createdAt: new Date().toISOString(),
            lastUsedAt: null,
          })
        })
      )

      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')
      const submitButton = await screen.findByRole('button', { name: /add key/i })

      // Fill form
      const keyNameField = screen.getByRole('textbox', { name: /key name/i })
      const apiKeyField = screen.getAllByLabelText(/API Key/i, { selector: 'input' })[0]

      await user.type(keyNameField, 'My Anthropic Key')
      await user.type(apiKeyField, 'sk-ant-test123')

      // Submit form
      const form = submitButton.closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })

    it('shows error on submission failure', async () => {
      const user = userEvent.setup()

      server.use(
        http.post('/api/api-keys', () => {
          return HttpResponse.json(
            { message: 'Invalid API key format' },
            { status: 400 }
          )
        })
      )

      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')
      const submitButton = await screen.findByRole('button', { name: /add key/i })

      // Fill form
      const keyNameField = screen.getByRole('textbox', { name: /key name/i })
      const apiKeyField = screen.getAllByLabelText(/API Key/i, { selector: 'input' })[0]

      await user.type(keyNameField, 'Test Key')
      await user.type(apiKeyField, 'invalid-key')

      // Submit form
      const form = submitButton.closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(screen.getByText('Invalid API key format')).toBeInTheDocument()
      })
    })

    it('disables submit button while loading', async () => {
      const user = userEvent.setup()

      let resolveRequest: (value: Response) => void
      const requestPromise = new Promise<Response>((resolve) => {
        resolveRequest = resolve
      })

      server.use(
        http.post('/api/api-keys', () => {
          return requestPromise
        })
      )

      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')
      const submitButton = await screen.findByRole('button', { name: /add key/i })

      // Fill form
      const keyNameField = screen.getByRole('textbox', { name: /key name/i })
      const apiKeyField = screen.getAllByLabelText(/API Key/i, { selector: 'input' })[0]

      await user.type(keyNameField, 'Test Key')
      await user.type(apiKeyField, 'sk-test123')

      // Submit form
      const form = submitButton.closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(submitButton).toBeDisabled()
        expect(screen.getByRole('progressbar')).toBeInTheDocument()
      })

      // Resolve request
      resolveRequest!(
        HttpResponse.json({
          id: 'new-key-1',
          provider: 'anthropic',
          keyName: 'Test Key',
          keyPrefix: 'sk-',
          createdAt: new Date().toISOString(),
          lastUsedAt: null,
        })
      )
    })
  })

  describe('Edit Mode', () => {
    it('renders with edit title', async () => {
      renderWithProviders(
        <ApiKeyDialog
          open={true}
          onClose={mockOnClose}
          mode="edit"
          existingKey={mockExistingKey}
        />
      )

      await screen.findByRole('dialog')
      expect(screen.getByText('Edit API Key')).toBeInTheDocument()
    })

    it('pre-fills provider and key name', async () => {
      renderWithProviders(
        <ApiKeyDialog
          open={true}
          onClose={mockOnClose}
          mode="edit"
          existingKey={mockExistingKey}
        />
      )

      await screen.findByRole('dialog')
      await screen.findByRole('button', { name: /save changes/i })

      // Key name should be pre-filled
      const keyNameField = screen.getByRole('textbox', { name: /key name/i })
      expect(keyNameField).toHaveValue('My OpenAI Key')

      // Provider should be pre-filled
      expect(screen.getByDisplayValue('openai')).toBeInTheDocument()
    })

    it('disables provider field in edit mode', async () => {
      renderWithProviders(
        <ApiKeyDialog
          open={true}
          onClose={mockOnClose}
          mode="edit"
          existingKey={mockExistingKey}
        />
      )

      await screen.findByRole('dialog')
      await screen.findByRole('button', { name: /save changes/i })

      // Material-UI Select uses aria-disabled on the combobox role element
      const providerSelect = screen.getByRole('combobox', { name: /provider/i })
      expect(providerSelect).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows helper text for optional API key', async () => {
      renderWithProviders(
        <ApiKeyDialog
          open={true}
          onClose={mockOnClose}
          mode="edit"
          existingKey={mockExistingKey}
        />
      )

      await screen.findByRole('dialog')
      await screen.findByRole('button', { name: /save changes/i })

      expect(screen.getByText('Leave blank to keep existing key')).toBeInTheDocument()
    })

    it('updates key name only without API key', async () => {
      const user = userEvent.setup()

      server.use(
        http.put('/api/api-keys/:keyId', async ({ request, params }) => {
          expect(params.keyId).toBe('key-1')
          const body = await request.json()
          expect(body).toEqual({
            keyName: 'Updated Key Name',
            apiKey: undefined,
          })
          return HttpResponse.json({
            ...mockExistingKey,
            keyName: 'Updated Key Name',
          })
        })
      )

      renderWithProviders(
        <ApiKeyDialog
          open={true}
          onClose={mockOnClose}
          mode="edit"
          existingKey={mockExistingKey}
        />
      )

      await screen.findByRole('dialog')
      const submitButton = await screen.findByRole('button', { name: /save changes/i })

      // Update key name
      const keyNameField = screen.getByRole('textbox', { name: /key name/i })
      await user.clear(keyNameField)
      await user.type(keyNameField, 'Updated Key Name')

      // Submit form
      const form = submitButton.closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })

    it('updates both key name and API key', async () => {
      const user = userEvent.setup()

      server.use(
        http.put('/api/api-keys/:keyId', async ({ request, params }) => {
          expect(params.keyId).toBe('key-1')
          const body = await request.json()
          expect(body).toEqual({
            keyName: 'New Name',
            apiKey: 'sk-new-key-123',
          })
          return HttpResponse.json({
            ...mockExistingKey,
            keyName: 'New Name',
          })
        })
      )

      renderWithProviders(
        <ApiKeyDialog
          open={true}
          onClose={mockOnClose}
          mode="edit"
          existingKey={mockExistingKey}
        />
      )

      await screen.findByRole('dialog')
      const submitButton = await screen.findByRole('button', { name: /save changes/i })

      // Update both fields
      const keyNameField = screen.getByRole('textbox', { name: /key name/i })
      const apiKeyField = screen.getAllByLabelText(/API Key/i, { selector: 'input' })[0]

      await user.clear(keyNameField)
      await user.type(keyNameField, 'New Name')
      await user.type(apiKeyField, 'sk-new-key-123')

      // Submit form
      const form = submitButton.closest('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('Dialog Behavior', () => {
    it('closes dialog on cancel', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <ApiKeyDialog open={true} onClose={mockOnClose} mode="create" />
      )

      await screen.findByRole('dialog')

      const cancelButton = await screen.findByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1)
      })
    })
  })
})
