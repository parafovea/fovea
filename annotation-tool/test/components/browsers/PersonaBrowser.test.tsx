/**
 * @file PersonaBrowser.test.tsx
 * @description Unit tests for PersonaBrowser component focusing on persona deletion functionality.
 * Tests cover delete button rendering, confirmation dialog, deletion preview, and deletion flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../utils/test-utils'
import { server } from '../../setup'
import { http, HttpResponse } from 'msw'
import PersonaBrowser from '@components/browsers/PersonaBrowser'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import type { Persona } from '@models/types'

// Mock personas data
const mockPersonas: Persona[] = [
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
    informationNeed: 'Identify suspicious activity in video footage',
    createdAt: '2025-01-03T00:00:00Z',
    updatedAt: '2025-01-03T00:00:00Z',
  },
]

// Mock deletion preview data
const mockDeletionPreview = {
  typeCount: 3,
  annotationCount: 5,
  summaryCount: 2,
  worldAssignmentCount: 1,
}

describe('PersonaBrowser', () => {
  const mockOnSelectPersona = vi.fn()
  const mockOnEditPersona = vi.fn()
  const mockOnAddPersona = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    useAnnotationUiStore.getState().resetAllState()

    // Set up MSW handlers for this test suite
    server.use(
      http.get('*/api/personas', () => {
        return HttpResponse.json(mockPersonas)
      }),
      http.get('*/api/personas/:personaId/deletion-preview', () => {
        return HttpResponse.json(mockDeletionPreview)
      }),
      http.delete('*/api/personas/:personaId', () => {
        return HttpResponse.json({ message: 'Persona deleted successfully' })
      })
    )
  })

  describe('Rendering', () => {
    it('renders persona cards with all personas', async () => {
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

      expect(screen.getByText('Wildlife Researcher')).toBeInTheDocument()
      expect(screen.getByText('Security Analyst')).toBeInTheDocument()
    })

    it('renders delete button for each persona card', async () => {
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

      // Each persona card should have a delete button
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      expect(deleteButtons).toHaveLength(3)
    })

    it('renders search input', async () => {
      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      expect(screen.getByPlaceholderText(/search personas/i)).toBeInTheDocument()
    })

    it('renders add button when onAddPersona is provided', async () => {
      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
          onAddPersona={mockOnAddPersona}
        />
      )

      expect(screen.getByRole('button', { name: /add persona/i })).toBeInTheDocument()
    })

    it('does not render add button when onAddPersona is not provided', async () => {
      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      expect(screen.queryByRole('button', { name: /add persona/i })).not.toBeInTheDocument()
    })
  })

  describe('Delete Button', () => {
    it('clicking delete button opens confirmation dialog', async () => {
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

      // Find and click the first delete button
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      expect(screen.getByText('Delete Persona')).toBeInTheDocument()
    })

    it('clicking delete button does not trigger other handlers', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
          onEditPersona={mockOnEditPersona}
          onAddPersona={mockOnAddPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      // Other handlers should not be called
      expect(mockOnSelectPersona).not.toHaveBeenCalled()
      expect(mockOnEditPersona).not.toHaveBeenCalled()
    })
  })

  describe('Confirmation Dialog', () => {
    it('shows persona name in confirmation message', async () => {
      const user = userEvent.setup()

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
        // Check the dialog message contains both the persona name and the confirmation text
        expect(screen.getByText(/are you sure you want to delete the persona "Baseball Scout"/i)).toBeInTheDocument()
      })
    })

    it('displays deletion preview counts in dialog', async () => {
      const user = userEvent.setup()

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

      // Wait for deletion preview to load and be displayed
      await waitFor(() => {
        expect(screen.getByText(/3 ontology types/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/5 annotations/i)).toBeInTheDocument()
      expect(screen.getByText(/2 video summaries/i)).toBeInTheDocument()
      expect(screen.getByText(/1 world object assignment/i)).toBeInTheDocument()
    })

    it('shows singular form for single counts', async () => {
      const user = userEvent.setup()

      // Override handler to return singular counts
      server.use(
        http.get('*/api/personas/:personaId/deletion-preview', () => {
          return HttpResponse.json({
            typeCount: 1,
            annotationCount: 1,
            summaryCount: 1,
            worldAssignmentCount: 1,
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
        expect(screen.getByText(/1 ontology type[^s]/)).toBeInTheDocument()
      })

      expect(screen.getByText(/1 annotation[^s]/)).toBeInTheDocument()
      expect(screen.getByText(/1 video summary/)).toBeInTheDocument()
    })

    it('shows "cannot be undone" warning', async () => {
      const user = userEvent.setup()

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
        expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
      })
    })

    it('canceling closes dialog without deletion', async () => {
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

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Click cancel button
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // Delete endpoint should not have been called
      expect(deleteWasCalled).toBe(false)

      // Persona should still be in the list
      expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
    })
  })

  describe('Deletion Flow', () => {
    it('confirming deletion calls delete endpoint', async () => {
      const user = userEvent.setup()
      let deletedPersonaId: string | null = null

      server.use(
        http.delete('*/api/personas/:personaId', ({ params }) => {
          deletedPersonaId = params.personaId as string
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

      // Click delete/confirm button
      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // Wait for deletion to complete
      await waitFor(() => {
        expect(deletedPersonaId).toBe('persona-1')
      })
    })

    it('shows loading state during deletion', async () => {
      const user = userEvent.setup()

      // Make deletion slow to observe loading state
      server.use(
        http.delete('*/api/personas/:personaId', async () => {
          await new Promise(resolve => setTimeout(resolve, 100))
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

      // The dialog should still be open during loading (loading state handled by ConfirmDialog)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('closes dialog after successful deletion', async () => {
      const user = userEvent.setup()

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

      // Dialog should close after deletion
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  describe('Search Functionality', () => {
    it('filters personas by name', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search personas/i)
      await user.type(searchInput, 'wildlife')

      // Should show only Wildlife Researcher
      expect(screen.getByText('Wildlife Researcher')).toBeInTheDocument()
      expect(screen.queryByText('Baseball Scout')).not.toBeInTheDocument()
      expect(screen.queryByText('Security Analyst')).not.toBeInTheDocument()
    })

    it('filters personas by role', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search personas/i)
      await user.type(searchInput, 'biologist')

      expect(screen.getByText('Wildlife Researcher')).toBeInTheDocument()
      expect(screen.queryByText('Baseball Scout')).not.toBeInTheDocument()
    })

    it('shows no results message when search has no matches', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search personas/i)
      await user.type(searchInput, 'nonexistent')

      expect(screen.getByText(/no personas found/i)).toBeInTheDocument()
      expect(screen.getByText(/try adjusting your search/i)).toBeInTheDocument()
    })
  })

  describe('Persona Selection', () => {
    it('clicking Open button calls onSelectPersona with persona id', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
          onEditPersona={mockOnEditPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const openButtons = screen.getAllByRole('button', { name: /open/i })
      await user.click(openButtons[0])

      expect(mockOnSelectPersona).toHaveBeenCalledWith('persona-1')
    })

    it('clicking Settings button calls onEditPersona with persona', async () => {
      const user = userEvent.setup()

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
          onEditPersona={mockOnEditPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const settingsButtons = screen.getAllByRole('button', { name: /settings/i })
      await user.click(settingsButtons[0])

      expect(mockOnEditPersona).toHaveBeenCalledWith(mockPersonas[0])
    })
  })

  describe('Empty State', () => {
    it('shows empty state when no personas exist', async () => {
      server.use(
        http.get('*/api/personas', () => {
          return HttpResponse.json([])
        })
      )

      renderWithProviders(
        <PersonaBrowser
          onSelectPersona={mockOnSelectPersona}
          onAddPersona={mockOnAddPersona}
        />
      )

      await waitFor(() => {
        expect(screen.getByText(/no personas found/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/click the \+ button to create/i)).toBeInTheDocument()
    })
  })

  describe('Deletion Preview Edge Cases', () => {
    it('handles deletion preview with zero counts', async () => {
      const user = userEvent.setup()

      server.use(
        http.get('*/api/personas/:personaId/deletion-preview', () => {
          return HttpResponse.json({
            typeCount: 0,
            annotationCount: 0,
            summaryCount: 0,
            worldAssignmentCount: 0,
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
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Should not show "This will also delete" section when all counts are 0
      expect(screen.queryByText(/this will also delete/i)).not.toBeInTheDocument()

      // But should still show the confirmation message and cannot be undone warning
      expect(screen.getByText(/are you sure you want to delete the persona "Baseball Scout"/i)).toBeInTheDocument()
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    })

    it('handles deletion preview loading state', async () => {
      const user = userEvent.setup()

      // Delay the preview response
      server.use(
        http.get('*/api/personas/:personaId/deletion-preview', async () => {
          await new Promise(resolve => setTimeout(resolve, 500))
          return HttpResponse.json(mockDeletionPreview)
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

      // Dialog should open
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // The delete button should be in loading/disabled state while preview loads
      // This is handled by the loading prop passed to ConfirmDialog
    })
  })
})
