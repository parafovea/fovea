/**
 * @file PersonaManager.test.tsx
 * @description Unit tests for PersonaManager component focusing on persona deletion functionality.
 * Tests cover delete button in menu, confirmation dialog with deletion preview, and deletion flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../utils/test-utils'
import { server } from '../../setup'
import { http, HttpResponse } from 'msw'
import PersonaManager from '@components/persona/PersonaManager'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import type { Persona, PersonaOntology } from '@models/types'

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
]

// Mock ontology data
const mockOntology: PersonaOntology = {
  entities: [
    { id: 'entity-1', name: 'Pitcher', gloss: [], createdAt: '', updatedAt: '' },
  ],
  roles: [
    { id: 'role-1', name: 'Starting', gloss: [], allowedFillerTypes: ['entity'], createdAt: '', updatedAt: '' },
  ],
  events: [],
  relationTypes: [],
  relations: [],
}

// Mock deletion preview data
const mockDeletionPreview = {
  typeCount: 3,
  annotationCount: 5,
  summaryCount: 2,
  worldAssignmentCount: 1,
}

describe('PersonaManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAnnotationUiStore.getState().resetAllState()

    // Set selected persona ID to first persona
    useAnnotationUiStore.getState().setSelectedPersonaId('persona-1')

    // Set up MSW handlers for this test suite
    server.use(
      http.get('*/api/personas', () => {
        return HttpResponse.json(mockPersonas)
      }),
      http.get('*/api/personas/:personaId/ontology', () => {
        return HttpResponse.json(mockOntology)
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
    it('renders active persona information', async () => {
      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      expect(screen.getByText(/Professional Scout/)).toBeInTheDocument()
      expect(screen.getByText(/Evaluate pitcher mechanics/)).toBeInTheDocument()
    })

    it('renders persona selector button', async () => {
      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // The button should show the active persona name
      expect(screen.getByRole('button', { name: /Baseball Scout/i })).toBeInTheDocument()
    })

    it('renders add persona button', async () => {
      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Look for the add persona icon button by its aria-label
      expect(screen.getByRole('button', { name: /add persona/i })).toBeInTheDocument()
    })
  })

  describe('Persona Menu', () => {
    it('opens menu when clicking persona selector', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      // Menu should open and show all personas
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Both personas should be in the menu
      const menu = screen.getByRole('menu')
      expect(within(menu).getByText('Baseball Scout')).toBeInTheDocument()
      expect(within(menu).getByText('Wildlife Researcher')).toBeInTheDocument()
    })

    it('shows delete button for each persona in menu', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Should have delete buttons (one per persona)
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      expect(deleteButtons.length).toBeGreaterThanOrEqual(2)
    })

    it('shows copy button for each persona in menu', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Should have copy buttons (one per persona)
      const copyButtons = screen.getAllByRole('button', { name: /copy persona/i })
      expect(copyButtons.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Delete Button in Menu', () => {
    it('clicking delete opens confirmation dialog', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open the menu
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Click the first delete button
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      // Confirmation dialog should appear
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      expect(screen.getByText('Delete Persona')).toBeInTheDocument()
    })

    it('clicking delete does not select the persona', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open the menu
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Click delete on the second persona (Wildlife Researcher)
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[1])

      // The active persona should still be Baseball Scout
      // (checking that stopPropagation worked)
      expect(useAnnotationUiStore.getState().selectedPersonaId).toBe('persona-1')
    })
  })

  describe('Confirmation Dialog', () => {
    it('displays persona name in confirmation message', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu and click delete on first persona
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(screen.getByText(/are you sure you want to delete the persona "Baseball Scout"/i)).toBeInTheDocument()
      })
    })

    it('displays deletion preview with affected items count', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu and click delete
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[0])

      // Wait for dialog and deletion preview
      await waitFor(() => {
        expect(screen.getByText(/3 ontology types/i)).toBeInTheDocument()
      })

      expect(screen.getByText(/5 annotations/i)).toBeInTheDocument()
      expect(screen.getByText(/2 video summaries/i)).toBeInTheDocument()
      expect(screen.getByText(/1 world object assignment/i)).toBeInTheDocument()
    })

    it('displays "cannot be undone" warning', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu and click delete
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
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

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu and click delete
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

      // Click cancel button
      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })

      // Delete endpoint should not have been called
      expect(deleteWasCalled).toBe(false)
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

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu and click delete
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

      // Click delete/confirm button
      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // Wait for deletion to complete
      await waitFor(() => {
        expect(deletedPersonaId).toBe('persona-1')
      })
    })

    it('closes dialog after successful deletion', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu and click delete
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

      // Click confirm button
      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // Dialog should close after deletion
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })

    it('can delete second persona from menu', async () => {
      const user = userEvent.setup()
      let deletedPersonaId: string | null = null

      server.use(
        http.delete('*/api/personas/:personaId', ({ params }) => {
          deletedPersonaId = params.personaId as string
          return HttpResponse.json({ message: 'Persona deleted successfully' })
        })
      )

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Click delete on the second persona
      const deleteButtons = screen.getAllByRole('button', { name: /delete persona/i })
      await user.click(deleteButtons[1])

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })

      // Verify the dialog mentions Wildlife Researcher
      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByText(/Wildlife Researcher/)).toBeInTheDocument()

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /^delete$/i })
      await user.click(confirmButton)

      // Wait for deletion - should delete persona-2
      await waitFor(() => {
        expect(deletedPersonaId).toBe('persona-2')
      })
    })
  })

  describe('Deletion Preview Edge Cases', () => {
    it('handles zero counts in deletion preview', async () => {
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

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu and click delete
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

      // Should not show "This will also delete" when all counts are 0
      expect(screen.queryByText(/this will also delete/i)).not.toBeInTheDocument()

      // Should still show the confirmation message
      expect(screen.getByText(/are you sure you want to delete the persona "Baseball Scout"/i)).toBeInTheDocument()
    })
  })

  describe('Ontology Stats Display', () => {
    it('displays ontology stats as chips for active persona', async () => {
      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Wait for ontology to load
      await waitFor(() => {
        expect(screen.getByText('1 Entities')).toBeInTheDocument()
      })

      expect(screen.getByText('1 Roles')).toBeInTheDocument()
      expect(screen.getByText('0 Events')).toBeInTheDocument()
      expect(screen.getByText('0 Relations')).toBeInTheDocument()
    })
  })

  describe('Persona Selection', () => {
    it('selecting a persona from menu updates active persona', async () => {
      const user = userEvent.setup()

      renderWithProviders(<PersonaManager />)

      await waitFor(() => {
        expect(screen.getByText('Baseball Scout')).toBeInTheDocument()
      })

      // Open menu
      const selectorButton = screen.getByRole('button', { name: /Baseball Scout/i })
      await user.click(selectorButton)

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument()
      })

      // Click on Wildlife Researcher menu item
      const menu = screen.getByRole('menu')
      const wildlifeMenuItem = within(menu).getByText('Wildlife Researcher')
      await user.click(wildlifeMenuItem)

      // Active persona should change
      await waitFor(() => {
        expect(useAnnotationUiStore.getState().selectedPersonaId).toBe('persona-2')
      })
    })
  })
})
