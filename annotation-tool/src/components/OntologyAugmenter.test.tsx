/**
 * Tests for OntologyAugmenter component.
 * Tests cover diverse domain examples across sports, wildlife, retail, medical, and film domains.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { OntologyAugmenter, AugmentationResponse } from './OntologyAugmenter'
import personaReducer from '../store/personaSlice'
import * as apiClient from '../api/client'

const createMockStore = () => {
  const store = configureStore({
    reducer: {
      persona: personaReducer as any,
    },
    preloadedState: {
      persona: {
        personas: [
          {
            id: 'persona-1',
            name: 'Test Persona',
            role: 'Test Role',
            informationNeed: 'Test information need',
            details: '',
            createdAt: '2025-10-01T00:00:00Z',
            updatedAt: '2025-10-01T00:00:00Z',
          },
        ],
        personaOntologies: [
          {
            id: 'ont-1',
            personaId: 'persona-1',
            entities: [
              {
                id: 'entity-1',
                name: 'Player',
                gloss: [{ type: 'text', content: 'A person playing the game' }],
                createdAt: '2025-10-01T00:00:00Z',
                updatedAt: '2025-10-01T00:00:00Z',
              },
            ],
            events: [
              {
                id: 'event-1',
                name: 'Goal',
                gloss: [{ type: 'text', content: 'A scoring event' }],
                roles: [],
                createdAt: '2025-10-01T00:00:00Z',
                updatedAt: '2025-10-01T00:00:00Z',
              },
            ],
            roles: [
              {
                id: 'role-1',
                name: 'Scorer',
                gloss: [{ type: 'text', content: 'The player who scores' }],
                allowedFillerTypes: ['entity' as const],
                createdAt: '2025-10-01T00:00:00Z',
                updatedAt: '2025-10-01T00:00:00Z',
              },
            ],
            relationTypes: [],
            relations: [],
            createdAt: '2025-10-01T00:00:00Z',
            updatedAt: '2025-10-01T00:00:00Z',
          },
        ],
        activePersonaId: 'persona-1',
        isLoading: false,
        error: null,
        unsavedChanges: false,
      },
    },
  })
  return store
}

const renderWithProviders = (
  ui: React.ReactElement,
  store = createMockStore()
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </Provider>
  )
}

describe('OntologyAugmenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Initial Render', () => {
    it('renders component with default category', () => {
      renderWithProviders(
        <OntologyAugmenter personaId="persona-1" personaName="Baseball Scout" />
      )

      expect(screen.getByText('AI Ontology Augmentation')).toBeInTheDocument()
      expect(screen.getByText('Persona: Baseball Scout')).toBeInTheDocument()
      expect(screen.getAllByText('Category')[0]).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i)).toBeInTheDocument()
    })

    it('renders with initial category and domain', () => {
      renderWithProviders(
        <OntologyAugmenter
          personaId="persona-1"
          initialCategory="event"
          initialDomain="Wildlife research tracking whale migration"
        />
      )

      expect(screen.getByDisplayValue('Wildlife research tracking whale migration')).toBeInTheDocument()
    })

    it('displays existing entity types', () => {
      renderWithProviders(
        <OntologyAugmenter personaId="persona-1" initialCategory="entity" />
      )

      expect(screen.getByText('Existing entity types (1):')).toBeInTheDocument()
      expect(screen.getByText('Player')).toBeInTheDocument()
    })

    it('displays close button when onClose is provided', () => {
      const onClose = vi.fn()
      renderWithProviders(
        <OntologyAugmenter personaId="persona-1" onClose={onClose} />
      )

      expect(screen.getByLabelText('close')).toBeInTheDocument()
    })
  })

  describe('Category Selection', () => {
    it('updates existing types display when category changes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      expect(screen.getByText('Existing entity types (1):')).toBeInTheDocument()

      await user.click(screen.getByRole('combobox'))
      await user.click(screen.getByText('Event Types'))

      await waitFor(() => {
        expect(screen.getByText('Existing event types (1):')).toBeInTheDocument()
      })
    })

    it('shows role types when role category is selected', async () => {
      const user = userEvent.setup()
      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.click(screen.getByRole('combobox'))
      await user.click(screen.getByText('Role Types'))

      await waitFor(() => {
        expect(screen.getByText('Existing role types (1):')).toBeInTheDocument()
      })
    })
  })

  describe('Generate Button', () => {
    it('disables generate button when domain is empty', () => {
      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      expect(screen.getByRole('button', { name: /generate suggestions/i })).toBeDisabled()
    })

    it('enables generate button when domain is provided', async () => {
      const user = userEvent.setup()
      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(
        screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i),
        'Sports analytics tracking player performance in soccer matches'
      )

      expect(screen.getByRole('button', { name: /generate suggestions/i })).toBeEnabled()
    })
  })

  describe('Suggestion Generation - Sports Analytics', () => {
    it('displays loading state during generation', async () => {
      const user = userEvent.setup()
      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockImplementation(() => new Promise(() => {}))

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(
        screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i),
        'Baseball scouting tracking pitcher mechanics and pitch types'
      )
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      expect(screen.getByText('Analyzing domain and generating suggestions...')).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('displays suggestions with confidence scores for sports analytics', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-1',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'Pitcher',
            description: 'Player who throws the ball to the batter',
            parent: 'Player',
            confidence: 0.95,
            examples: ['Starting Pitcher', 'Relief Pitcher', 'Closer'],
          },
          {
            name: 'Batter',
            description: 'Player attempting to hit the pitched ball',
            parent: 'Player',
            confidence: 0.92,
            examples: ['Lead-off Hitter', 'Cleanup Hitter', 'Pinch Hitter'],
          },
        ],
        reasoning: 'Generated 2 entity type suggestions for baseball scouting domain',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(
        screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i),
        'Baseball scouting tracking pitcher mechanics'
      )
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByText('Pitcher')).toBeInTheDocument()
        expect(screen.getByText('Player who throws the ball to the batter')).toBeInTheDocument()
        expect(screen.getByText('95%')).toBeInTheDocument()
        expect(screen.getAllByText('extends Player').length).toBeGreaterThanOrEqual(1)
      })
    })
  })

  describe('Suggestion Generation - Wildlife Research', () => {
    it('displays suggestions for wildlife research domain', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-2',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'Whale',
            description: 'Large marine mammal being tracked',
            parent: null,
            confidence: 0.88,
            examples: ['Humpback Whale', 'Orca', 'Gray Whale'],
          },
          {
            name: 'Pod',
            description: 'Group of whales traveling together',
            parent: null,
            confidence: 0.85,
            examples: ['Family Pod', 'Feeding Pod', 'Migration Group'],
          },
        ],
        reasoning: 'Generated 2 entity type suggestions for marine biology research',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(
        screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i),
        'Marine biology research tracking whale pod behavior and migration'
      )
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByText('Whale')).toBeInTheDocument()
        expect(screen.getByText('Pod')).toBeInTheDocument()
        expect(screen.getByText('88%')).toBeInTheDocument()
      })
    })
  })

  describe('Suggestion Generation - Retail Analysis', () => {
    it('displays suggestions for retail analysis domain', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-3',
        persona_id: 'persona-1',
        target_category: 'event',
        suggestions: [
          {
            name: 'ProductInteraction',
            description: 'Customer interacts with store product',
            parent: null,
            confidence: 0.82,
            examples: ['Product Pickup', 'Product Inspection', 'Product Comparison'],
          },
          {
            name: 'CheckoutEvent',
            description: 'Customer completes purchase transaction',
            parent: null,
            confidence: 0.90,
            examples: ['Self-Checkout', 'Cashier Checkout', 'Mobile Checkout'],
          },
        ],
        reasoning: 'Generated 2 event type suggestions for retail analytics',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(
        <OntologyAugmenter personaId="persona-1" initialCategory="event" />
      )

      await user.type(
        screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i),
        'Retail store analysis tracking customer flow and product interactions'
      )
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByText('ProductInteraction')).toBeInTheDocument()
        expect(screen.getByText('CheckoutEvent')).toBeInTheDocument()
        expect(screen.getByText('90%')).toBeInTheDocument()
      })
    })
  })

  describe('Suggestion Generation - Medical Training', () => {
    it('displays suggestions for medical training domain', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-4',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'SurgicalInstrument',
            description: 'Tool used during laparoscopic procedure',
            parent: null,
            confidence: 0.87,
            examples: ['Laparoscope', 'Grasper', 'Scissors', 'Cautery Device'],
          },
          {
            name: 'Tissue',
            description: 'Anatomical tissue being operated on',
            parent: null,
            confidence: 0.84,
            examples: ['Gallbladder', 'Appendix', 'Liver', 'Intestine'],
          },
        ],
        reasoning: 'Generated 2 entity type suggestions for surgical training',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(
        screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i),
        'Medical training analyzing laparoscopic surgical techniques'
      )
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByText('SurgicalInstrument')).toBeInTheDocument()
        expect(screen.getByText('Tissue')).toBeInTheDocument()
        expect(screen.getByText('87%')).toBeInTheDocument()
      })
    })
  })

  describe('Suggestion Generation - Film Production', () => {
    it('displays suggestions for film production domain', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-5',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'Prop',
            description: 'Physical object used in scene',
            parent: null,
            confidence: 0.91,
            examples: ['Weapon Prop', 'Furniture', 'Vehicle', 'Hand Prop'],
          },
          {
            name: 'Costume',
            description: 'Clothing worn by character',
            parent: null,
            confidence: 0.89,
            examples: ['Period Costume', 'Contemporary Outfit', 'Uniform'],
          },
        ],
        reasoning: 'Generated 2 entity type suggestions for film continuity tracking',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(
        screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i),
        'Film continuity editing tracking props and costumes across takes'
      )
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByText('Prop')).toBeInTheDocument()
        expect(screen.getByText('Costume')).toBeInTheDocument()
        expect(screen.getByText('91%')).toBeInTheDocument()
      })
    })
  })

  describe('Suggestion Selection', () => {
    it('allows selecting and deselecting suggestions', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-1',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'Defender',
            description: 'Player in defensive position',
            parent: 'Player',
            confidence: 0.88,
            examples: ['Center Back', 'Full Back', 'Sweeper'],
          },
        ],
        reasoning: 'Generated 1 entity type suggestion',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i), 'Soccer analysis')
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByText('Defender')).toBeInTheDocument()
      })

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()

      await user.click(checkbox)
      expect(checkbox).toBeChecked()
      expect(screen.getByRole('button', { name: /add selected \(1\)/i })).toBeInTheDocument()

      await user.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })

    it('enables add button when suggestions are selected', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-1',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'Forward',
            description: 'Attacking player',
            parent: 'Player',
            confidence: 0.90,
            examples: ['Striker', 'Winger'],
          },
        ],
        reasoning: 'Generated 1 entity type suggestion',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i), 'Soccer tactics')
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add selected \(0\)/i })).toBeDisabled()
      })

      await user.click(screen.getByRole('checkbox'))

      expect(screen.getByRole('button', { name: /add selected \(1\)/i })).toBeEnabled()
    })
  })

  describe('Expand/Collapse Details', () => {
    it('expands suggestion to show examples and confidence bar', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-1',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'Goalkeeper',
            description: 'Player defending the goal',
            parent: 'Player',
            confidence: 0.93,
            examples: ['Shot Stopper', 'Sweeper Keeper'],
          },
        ],
        reasoning: 'Generated 1 entity type suggestion',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i), 'Soccer positions')
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByText('Goalkeeper')).toBeInTheDocument()
      })

      expect(screen.queryByText('Examples:')).not.toBeInTheDocument()

      const expandButton = screen.getByRole('button', { name: '' })
      await user.click(expandButton)

      await waitFor(() => {
        expect(screen.getByText('Examples:')).toBeInTheDocument()
        expect(screen.getByText('Shot Stopper')).toBeInTheDocument()
        expect(screen.getByText('Sweeper Keeper')).toBeInTheDocument()
        expect(screen.getByText('Confidence Score:')).toBeInTheDocument()
      })
    })
  })

  describe('Error Handling', () => {
    it('displays error message when API call fails', async () => {
      const user = userEvent.setup()
      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockRejectedValue(new Error('Network error'))

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i), 'Test domain')
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
        expect(screen.getByRole('alert')).toHaveTextContent('Network error')
      })
    })

    it('displays warning when no suggestions are generated', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-1',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [],
        reasoning: 'Unable to generate suggestions with provided context',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i), 'Vague description')
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/no suggestions generated/i)
        ).toBeInTheDocument()
      })
    })
  })

  describe('Confidence Indicators', () => {
    it('shows success color for high confidence suggestions', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-1',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'HighConfidence',
            description: 'Test',
            parent: null,
            confidence: 0.95,
            examples: [],
          },
        ],
        reasoning: 'Test',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i), 'Test')
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        const chip = screen.getByText('95%').closest('.MuiChip-root')
        expect(chip).toHaveClass('MuiChip-colorSuccess')
      })
    })

    it('shows warning color for medium confidence suggestions', async () => {
      const user = userEvent.setup()
      const mockResponse: AugmentationResponse = {
        id: 'aug-1',
        persona_id: 'persona-1',
        target_category: 'entity',
        suggestions: [
          {
            name: 'MediumConfidence',
            description: 'Test',
            parent: null,
            confidence: 0.7,
            examples: [],
          },
        ],
        reasoning: 'Test',
      }

      const mockAugment = vi.spyOn(apiClient.apiClient, 'augmentOntology')
      mockAugment.mockResolvedValue(mockResponse)

      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      await user.type(screen.getByPlaceholderText(/Wildlife research tracking whale pod behavior/i), 'Test')
      await user.click(screen.getByRole('button', { name: /generate suggestions/i }))

      await waitFor(() => {
        const chip = screen.getByText('70%').closest('.MuiChip-root')
        expect(chip).toHaveClass('MuiChip-colorWarning')
      })
    })
  })

  describe('Max Suggestions Control', () => {
    it('allows changing max suggestions value', async () => {
      const user = userEvent.setup()
      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      const input = screen.getByLabelText('Max Suggestions')
      expect(input).toHaveValue(10)

      await user.clear(input)
      await user.type(input, '15')

      // Value is clamped on input change
      expect(input).toHaveValue(20)
    })

    it('clamps max suggestions to valid range', async () => {
      const user = userEvent.setup()
      renderWithProviders(<OntologyAugmenter personaId="persona-1" />)

      const input = screen.getByLabelText('Max Suggestions')

      await user.clear(input)
      await user.type(input, '25')

      // Component clamps to 20 immediately
      expect(input).toHaveValue(20)
    })
  })

  describe('Close Functionality', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      renderWithProviders(
        <OntologyAugmenter personaId="persona-1" onClose={onClose} />
      )

      await user.click(screen.getByLabelText('close'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
