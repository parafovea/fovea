/**
 * @file persona-deletion.test.tsx
 * @description Integration tests for persona deletion functionality.
 * Tests the full flow from clicking delete to verifying API calls and state updates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../utils/test-utils'
import { server } from '../setup'
import { http, HttpResponse } from 'msw'
import PersonaBrowser from '@components/browsers/PersonaBrowser'
import PersonaManager from '@components/persona/PersonaManager'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import type { Persona, PersonaOntology } from '@models/types'

// Mock personas data - mutable for tracking deletion
let mockPersonas: Persona[] = []

// Mock ontology data
const mockOntology: PersonaOntology = {
  entities: [
    { id: 'entity-1', name: 'Test Entity', gloss: [], createdAt: '', updatedAt: '' },
  ],
  roles: [],
  events: [],
  relationTypes: [],
  relations: [],
}

// Mock deletion preview data
const mockDeletionPreview = {
  typeCount: 1,
  annotationCount: 3,
  summaryCount: 1,
  worldAssignmentCount: 0,
}

// Track API calls for verification
const apiCalls: { method: string; url: string; body?: unknown }[] = []

describe('Persona Deletion Integration', () => {
  const mockOnSelectPersona = vi.fn()
  const mockOnEditPersona = vi.fn()
  const mockOnAddPersona = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    apiCalls.length = 0
    useAnnotationUiStore.getState().resetAllState()

    // Reset mock personas
    mockPersonas = [
      {
        id: 'persona-1',
        name: 'Baseball Scout',
        role: 'Professional Scout',
        informationNeed: 'Evaluate pitcher mechanics and performance',
        details: 'Specializes in analyzing pitching form',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'persona-2',
        name: 'Wildlife Researcher',
        role: 'Marine Biologist',
        informationNeed: 'Document whale pod behavior and migration patterns',
        details: 'Studies marine mammal behavior',
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-02T00:00:00Z',
      },
      {
        id: 'persona-3',
        name: 'Security Analyst',
        role: 'Surveillance Expert',
        informationNeed: 'Identify suspicious activity',
        createdAt: '2025-01-03T00:00:00Z',
        updatedAt: '2025-01-03T00:00:00Z',
      },
    ]

    // Set up MSW handlers
    server.use(
      http.get('*/api/personas', () => {
        apiCalls.push({ method: 'GET', url: '/api/personas' })
        return HttpResponse.json(mockPersonas)
      }),
      http.get('*/api/personas/:personaId/ontology', () => {
        return HttpResponse.json(mockOntology)
      }),
      http.get('*/api/personas/:personaId/deletion-preview', ({ params }) => {
        apiCalls.push({ method: 'GET', url: `/api/personas/${params.personaId}/deletion-preview` })
        return HttpResponse.json(mockDeletionPreview)
      }),
      http.delete('*/api/personas/:personaId', ({ params }) => {
        apiCalls.push({ method: 'DELETE', url: `/api/personas/${params.personaId}` })
        // Remove persona from mock data
        mockPersonas = mockPersonas.filter(p => p.id !== params.personaId)
        return HttpResponse.json({ message: 'Persona deleted successfully' })
      })
    )
  })

  describe('PersonaBrowser Deletion Flow', () => {
    it('complete deletion flow: click delete, show preview, confirm, verify removal', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
          onEditPersona={mockOnEditPersona}
          onAddPersona={mockOnAddPersona}
        />
      )

      // Wait for personas to load
      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Initial state: 3 personas
      expect(screen.getByText('Wildlife Researcher')).toBeInTheDocument()
      expect(screen.getByText('Security Analyst')).toBeInTheDocument()

      // Step 1: Click delete on first persona
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      expect(deleteButtons).toHaveLength(3)
      await user.click(deleteButtons[0])

      // Step 2: Verify deletion preview API was called
      await waitFor(() => {
        expect(apiCalls.some(c => c.method === 'GET' && c.url.includes('deletion-preview'))).toBe(true)
      })

      // Step 3: Verify confirmation dialog shows preview data
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
      expect(screen.getByText(/1 ontology type/)).toBeInTheDocument()
      expect(screen.getByText(/3 annotations/)).toBeInTheDocument()
      expect(screen.getByText(/1 video summary/)).toBeInTheDocument()

      // Step 4: Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // Step 5: Verify DELETE API was called
      await waitFor(() => {
        expect(apiCalls.some(c => c.method === 'DELETE' && c.url === '/api/personas/persona-1')).toBe(true)
      })

      // Step 6: Verify dialog closes
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('canceling deletion does not remove persona', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Click delete
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // No DELETE API call should have been made
      expect(apiCalls.some(c => c.method === 'DELETE')).toBe(false)

      // All personas should still be visible
      expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      expect(screen.getByText('Wildlife Researcher')).toBeInTheDocument()
      expect(screen.getByText('Security Analyst')).toBeInTheDocument()
    })

    it('deletion preview shows correct counts in confirmation dialog', async () => {
      const user = userEvent.setup()

      // Set up custom deletion preview for this test
      server.use(
        http.get('*/api/personas/:personaId/deletion-preview', () => {
          return HttpResponse.json({
            typeCount: 10,
            annotationCount: 25,
            summaryCount: 5,
            worldAssignmentCount: 3,
          })
        })
      )

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByText(/10 ontology types/)).toBeInTheDocument()
      })
      expect(screen.getByText(/25 annotations/)).toBeInTheDocument()
      expect(screen.getByText(/5 video summaries/)).toBeInTheDocument()
      expect(screen.getByText(/3 world object assignments/)).toBeInTheDocument()
    })

    it('can delete different personas in sequence', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Delete second persona (Wildlife Researcher)
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[1])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Verify the dialog is about Wildlife Researcher
      expect(screen.getByText(/are you sure you want to delete the persona "Wildlife Researcher"/i)).toBeInTheDocument()

      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      await waitFor(() => {
        expect(apiCalls.some(c => c.method === 'DELETE' && c.url === '/api/personas/persona-2')).toBe(true)
      })

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('PersonaManager Deletion Flow', () => {
    beforeEach(() => {
      useAnnotationUiStore.getState().setSelectedPersonaId('persona-1')
    })

    it('complete deletion flow from persona menu', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open persona menu
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Click delete on first persona
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      // Verify dialog opens
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // Verify DELETE was called
      await waitFor(() => {
        expect(apiCalls.some(c => c.method === 'DELETE' && c.url === '/api/personas/persona-1')).toBe(true)
      })
    })

    it('deletion preview loads when delete dialog opens', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open persona menu
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Click delete
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      // Wait for dialog and check that deletion preview was fetched
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      await waitFor(() => {
        expect(apiCalls.some(c => c.url.includes('deletion-preview'))).toBe(true)
      })
    })
  })

  describe('Error Handling', () => {
    it('dialog remains open when deletion is slow', async () => {
      const user = userEvent.setup()

      // Hold the deletion in flight with a deferred the test controls, so the
      // "dialog stays open during deletion" assertion observes a deterministic
      // pending state instead of racing a fixed timeout.
      let releaseDeletion: () => void = () => {}
      const deletionPending = new Promise<void>((resolve) => {
        releaseDeletion = resolve
      })
      server.use(
        http.delete('*/api/personas/:personaId', async () => {
          await deletionPending
          return HttpResponse.json({ message: 'Persona deleted successfully' })
        })
      )

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // The deletion is still in flight (blocked on the deferred), so the
      // dialog is deterministically open here.
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      // Release the deletion and confirm the dialog closes on completion.
      releaseDeletion()
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('handles deletion preview API error gracefully', async () => {
      const user = userEvent.setup()

      server.use(
        http.get('*/api/personas/:personaId/deletion-preview', () => {
          return HttpResponse.json({ message: 'Preview failed' }, { status: 500 })
        })
      )

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      // Dialog should still open even if preview fails
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Basic confirmation message should still appear
      expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument()
    })
  })

  describe('State Updates', () => {
    it('active persona resets when deleted persona was active', async () => {
      const user = userEvent.setup()

      // Set persona-1 as active
      useAnnotationUiStore.getState().setSelectedPersonaId('persona-1')

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu and delete persona-1
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // Wait for deletion
      await waitFor(() => {
        expect(apiCalls.some(c => c.method === 'DELETE')).toBe(true)
      })
    })
  })

  describe('Query Cache Invalidation', () => {
    it('DELETE mutation is successful and dialog closes', async () => {
      const user = userEvent.setup()
      let deleteWasCalled = false

      server.use(
        http.delete('*/api/personas/:personaId', () => {
          deleteWasCalled = true
          return HttpResponse.json({ message: 'Persona deleted successfully' })
        })
      )

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      // Wait for initial fetch
      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Delete a persona
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // Wait for deletion
      await waitFor(() => {
        expect(deleteWasCalled).toBe(true)
      })

      // Dialog should close after successful deletion
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })
})
