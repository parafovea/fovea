/**
 * Tests for OntologyWorkspace component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import OntologyWorkspace from './OntologyWorkspace'
import personaSlice from '../../store/personaSlice'
import worldSlice from '../../store/worldSlice'

/**
 * Mock PersonaBrowser to simplify persona selection testing.
 */
vi.mock('../browsers/PersonaBrowser', () => ({
  default: ({ onSelectPersona, onAddPersona }: { onSelectPersona: (id: string) => void; onAddPersona: () => void }) => (
    <div data-testid="persona-browser">
      <button onClick={() => onSelectPersona('persona-urban-planner')}>Select Urban Planner</button>
      <button onClick={onAddPersona}>Add Persona</button>
    </div>
  ),
}))

/**
 * Mock PersonaEditor to avoid complex form dependencies.
 */
vi.mock('../PersonaEditor', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" data-testid="persona-editor">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

/**
 * Mock EntityTypeEditor to simplify entity type editing tests.
 */
vi.mock('../EntityTypeEditor', () => ({
  default: ({ open, onClose, entity }: { open: boolean; onClose: () => void; entity: any }) =>
    open ? (
      <div role="dialog" data-testid="entity-type-editor">
        {entity ? `Editing ${entity.name}` : 'Creating new entity type'}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

/**
 * Mock RoleEditor to simplify role editing tests.
 */
vi.mock('../RoleEditor', () => ({
  default: ({ open, onClose, role }: { open: boolean; onClose: () => void; role: any }) =>
    open ? (
      <div role="dialog" data-testid="role-editor">
        {role ? `Editing ${role.name}` : 'Creating new role'}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

/**
 * Mock EventTypeEditor to simplify event type editing tests.
 */
vi.mock('../EventTypeEditor', () => ({
  default: ({ open, onClose, event }: { open: boolean; onClose: () => void; event: any }) =>
    open ? (
      <div role="dialog" data-testid="event-type-editor">
        {event ? `Editing ${event.name}` : 'Creating new event type'}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

/**
 * Mock RelationTypeEditor to simplify relation type editing tests.
 */
vi.mock('../RelationTypeEditor', () => ({
  default: ({ open, onClose, relationType }: { open: boolean; onClose: () => void; relationType: any }) =>
    open ? (
      <div role="dialog" data-testid="relation-type-editor">
        {relationType ? `Editing ${relationType.name}` : 'Creating new relation type'}
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

/**
 * Mock OntologyAugmenter to simplify AI suggestion testing.
 */
vi.mock('../OntologyAugmenter', () => ({
  OntologyAugmenter: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="ontology-augmenter">
      <button onClick={onClose}>Close Augmenter</button>
    </div>
  ),
}))

/**
 * Mock GlossRenderer to simplify gloss display.
 */
vi.mock('../GlossRenderer', () => ({
  GlossRenderer: ({ gloss }: { gloss: any }) => <span>{Array.isArray(gloss) ? 'Gloss content' : gloss}</span>,
}))

/**
 * Mock WikidataChip to simplify Wikidata display.
 */
vi.mock('../shared/WikidataChip', () => ({
  WikidataChip: () => <span>Wikidata</span>,
}))

/**
 * Mock glossUtils to avoid circular dependencies.
 */
vi.mock('../../utils/glossUtils', () => ({
  glossToText: (gloss: any) => (Array.isArray(gloss) ? 'Gloss text' : gloss || ''),
}))

/**
 * Mock keyboard shortcuts hook.
 */
vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useWorkspaceKeyboardShortcuts: vi.fn(),
}))

/**
 * Mock preferences hook.
 */
vi.mock('../../hooks/usePreferences', () => ({
  usePreferences: () => ({
    lastPersonaId: null,
    setLastPersonaId: vi.fn(),
    getFilterState: () => ({ searchQuery: '' }),
    setFilterState: vi.fn(),
  }),
}))

/**
 * Mock model config hook with default GPU mode.
 */
const mockUseModelConfig = vi.fn(() => ({
  data: { cuda_available: true },
}))

vi.mock('../../hooks/useModelConfig', () => ({
  useModelConfig: () => mockUseModelConfig(),
}))

/**
 * Creates a test Redux store with persona and world slices.
 *
 * @param initialState - Initial state for the store
 * @returns Configured Redux store for testing
 */
function createTestStore(initialState = {}) {
  return configureStore({
    reducer: {
      persona: personaSlice,
      world: worldSlice,
    },
    preloadedState: initialState,
  })
}

/**
 * Creates a wrapper component with all required providers for OntologyWorkspace.
 *
 * @param store - Redux store instance
 * @returns React wrapper component with providers
 */
function createWrapper(store: ReturnType<typeof createTestStore>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </Provider>
  )
}

/**
 * Creates default Redux state with diverse ontology examples.
 */
function createDefaultState() {
  return {
    persona: {
      personas: [
        {
          id: 'persona-urban-planner',
          name: 'Urban Traffic Analyst',
          role: 'Transportation Engineer',
          informationNeed: 'Analyze traffic patterns and pedestrian flow for intersection optimization',
        },
        {
          id: 'persona-food-inspector',
          name: 'Health Inspector',
          role: 'Food Safety Compliance Officer',
          informationNeed: 'Document food handling violations and kitchen sanitation issues',
        },
        {
          id: 'persona-art-curator',
          name: 'Museum Curator',
          role: 'Art Collections Manager',
          informationNeed: 'Catalog artwork provenance and exhibition history',
        },
      ],
      personaOntologies: [
        {
          personaId: 'persona-urban-planner',
          entities: [
            {
              id: 'entity-vehicle',
              name: 'Vehicle',
              gloss: ['Motorized transportation on roadways'],
            },
            {
              id: 'entity-pedestrian',
              name: 'Pedestrian',
              gloss: ['Person walking or crossing street'],
            },
            {
              id: 'entity-traffic-signal',
              name: 'Traffic Signal',
              gloss: ['Light controlling traffic flow'],
              wikidataId: 'Q123456',
            },
          ],
          roles: [
            {
              id: 'role-operator',
              name: 'Operator',
              gloss: ['Entity controlling a vehicle'],
              allowedFillerTypes: ['Person', 'Vehicle'],
            },
            {
              id: 'role-location',
              name: 'Location',
              gloss: ['Where event occurs'],
              allowedFillerTypes: ['Place', 'Intersection'],
            },
          ],
          events: [
            {
              id: 'event-crossing',
              name: 'Street Crossing',
              gloss: ['Pedestrian traversing roadway'],
              roles: ['role-operator', 'role-location'],
            },
            {
              id: 'event-turning',
              name: 'Vehicle Turn',
              gloss: ['Vehicle changing direction at intersection'],
              roles: ['role-operator'],
            },
          ],
          relationTypes: [
            {
              id: 'relation-blocks',
              name: 'Blocks',
              gloss: ['One vehicle obstructs another'],
              sourceTypes: ['Vehicle'],
              targetTypes: ['Vehicle', 'Pedestrian'],
            },
            {
              id: 'relation-adjacent',
              name: 'Adjacent To',
              gloss: ['Located next to'],
              sourceTypes: ['Vehicle'],
              targetTypes: ['Vehicle'],
            },
          ],
        },
        {
          personaId: 'persona-food-inspector',
          entities: [
            {
              id: 'entity-contamination',
              name: 'Contamination Source',
              gloss: ['Unsanitary condition or material'],
            },
          ],
          roles: [
            {
              id: 'role-handler',
              name: 'Food Handler',
              gloss: ['Person preparing or serving food'],
              allowedFillerTypes: ['Person'],
            },
          ],
          events: [
            {
              id: 'event-violation',
              name: 'Health Code Violation',
              gloss: ['Failure to meet sanitation standards'],
              roles: ['role-handler'],
            },
          ],
          relationTypes: [
            {
              id: 'relation-contaminates',
              name: 'Contaminates',
              gloss: ['Source introduces unsafe material to food'],
              sourceTypes: ['Contamination Source'],
              targetTypes: ['Food Item'],
            },
          ],
        },
        {
          personaId: 'persona-art-curator',
          entities: [
            {
              id: 'entity-artwork',
              name: 'Artwork',
              gloss: ['Creative work on display'],
              wikidataId: 'Q234567',
            },
          ],
          roles: [],
          events: [],
          relationTypes: [],
        },
      ],
    },
    world: {
      entities: [],
      events: [],
      times: [],
      locations: [],
      relations: [],
      collections: [],
    },
  }
}

describe('OntologyWorkspace', () => {
  describe('Initial Rendering', () => {
    it('renders ontology workspace with first persona auto-selected', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Urban Traffic Analyst')).toBeInTheDocument()
      })
    })

    it('renders persona browser when no personas exist', () => {
      const emptyState = {
        persona: {
          personas: [],
          personaOntologies: [],
        },
        world: {
          entities: [],
          events: [],
          times: [],
          locations: [],
          relations: [],
          collections: [],
        },
      }
      const store = createTestStore(emptyState)
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      expect(screen.getByTestId('persona-browser')).toBeInTheDocument()
    })
  })

  describe('Persona Selection', () => {
    it('displays persona information in header on load', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Urban Traffic Analyst')).toBeInTheDocument()
        expect(screen.getByText(/Transportation Engineer/)).toBeInTheDocument()
      })
    })

    it('shows back button to return to persona browser', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        const buttons = screen.getAllByRole('button')
        const backButton = buttons.find(btn => {
          const svg = btn.querySelector('[data-testid="ArrowBackIcon"]')
          return svg !== null
        })
        expect(backButton).toBeInTheDocument()
      })
    })

    it('returns to persona browser when back button clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Urban Traffic Analyst')).toBeInTheDocument()
      })

      const buttons = screen.getAllByRole('button')
      const backButton = buttons.find(btn => {
        const svg = btn.querySelector('[data-testid="ArrowBackIcon"]')
        return svg !== null
      })

      if (backButton) {
        await user.click(backButton)
      }

      await waitFor(() => {
        expect(screen.getByTestId('persona-browser')).toBeInTheDocument()
      })
    })

    it('can select different persona from browser', async () => {
      const emptyState = {
        persona: {
          personas: [],
          personaOntologies: [],
        },
        world: {
          entities: [],
          events: [],
          times: [],
          locations: [],
          relations: [],
          collections: [],
        },
      }
      const store = createTestStore(emptyState)
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      expect(screen.getByTestId('persona-browser')).toBeInTheDocument()
    })
  })

  describe('Tab Navigation', () => {
    it('displays all four ontology type tabs', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types/)).toBeInTheDocument()
        expect(screen.getByText(/Role Types/)).toBeInTheDocument()
        expect(screen.getByText(/Event Types/)).toBeInTheDocument()
        expect(screen.getByText(/Relation Types/)).toBeInTheDocument()
      })
    })

    it('shows entity types in first tab by default', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
        expect(screen.getByText('Pedestrian')).toBeInTheDocument()
        expect(screen.getByText('Traffic Signal')).toBeInTheDocument()
      })
    })

    it('switches to role types tab when clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const roleTab = screen.getByText(/Role Types/)
      await user.click(roleTab)

      await waitFor(() => {
        expect(screen.getByText('Operator')).toBeInTheDocument()
        expect(screen.getByText('Location')).toBeInTheDocument()
      })
    })

    it('switches to event types tab when clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const eventTab = screen.getByText(/Event Types/)
      await user.click(eventTab)

      await waitFor(() => {
        expect(screen.getByText('Street Crossing')).toBeInTheDocument()
        expect(screen.getByText('Vehicle Turn')).toBeInTheDocument()
      })
    })

    it('switches to relation types tab when clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const relationTab = screen.getByText(/Relation Types/)
      await user.click(relationTab)

      await waitFor(() => {
        expect(screen.getByText('Blocks')).toBeInTheDocument()
        expect(screen.getByText('Adjacent To')).toBeInTheDocument()
      })
    })

    it('displays correct item count in tab labels', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types \(3\/3\)/)).toBeInTheDocument()
        expect(screen.getByText(/Role Types \(2\/2\)/)).toBeInTheDocument()
        expect(screen.getByText(/Event Types \(2\/2\)/)).toBeInTheDocument()
        expect(screen.getByText(/Relation Types \(2\/2\)/)).toBeInTheDocument()
      })
    })
  })

  describe('Search Functionality', () => {
    it('displays search input field', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search types by name/)).toBeInTheDocument()
      })
    })

    it('filters entity types by name', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/Search types by name/)
      await user.type(searchInput, 'Vehicle')

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
        expect(screen.queryByText('Pedestrian')).not.toBeInTheDocument()
      })
    })

    it('updates tab label counts when filtering', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types \(3\/3\)/)).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/Search types by name/)
      await user.type(searchInput, 'Vehicle')

      await waitFor(() => {
        expect(screen.getByText(/Entity Types \(1\/3\)/)).toBeInTheDocument()
      })
    })

    it('filters across different tabs', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/Search types by name/)
      await user.type(searchInput, 'Location')

      await user.click(screen.getByText(/Role Types/))

      await waitFor(() => {
        expect(screen.getByText('Location')).toBeInTheDocument()
        expect(screen.queryByText('Operator')).not.toBeInTheDocument()
      })
    })

    it('shows no results when search matches nothing', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/Search types by name/)
      await user.type(searchInput, 'NonexistentType')

      await waitFor(() => {
        expect(screen.queryByText('Vehicle')).not.toBeInTheDocument()
        expect(screen.queryByText('Pedestrian')).not.toBeInTheDocument()
      })
    })
  })

  describe('CRUD Operations - Entity Types', () => {
    it('opens entity type editor when add button clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /add type/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByTestId('entity-type-editor')).toBeInTheDocument()
        expect(screen.getByText('Creating new entity type')).toBeInTheDocument()
      })
    })

    it('opens entity type editor in edit mode when edit clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const editButtons = screen.getAllByRole('button', { name: '' })
      const editButton = editButtons.find(btn => btn.querySelector('svg')?.getAttribute('data-testid') === 'EditIcon')
      if (editButton) {
        await user.click(editButton)
      }

      await waitFor(() => {
        expect(screen.getByTestId('entity-type-editor')).toBeInTheDocument()
      })
    })

    it('closes entity type editor when close button clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /add type/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByTestId('entity-type-editor')).toBeInTheDocument()
      })

      const closeButton = screen.getByText('Close')
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByTestId('entity-type-editor')).not.toBeInTheDocument()
      })
    })
  })

  describe('CRUD Operations - Role Types', () => {
    it('opens role editor when add button clicked on roles tab', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      await user.click(screen.getByText(/Role Types/))
      await waitFor(() => {
        expect(screen.getByText('Operator')).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /add type/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByTestId('role-editor')).toBeInTheDocument()
        expect(screen.getByText('Creating new role')).toBeInTheDocument()
      })
    })

    it('displays allowed filler types for roles', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await user.click(screen.getByText(/Role Types/))

      await waitFor(() => {
        expect(screen.getByText(/Allowed fillers: Person, Vehicle/)).toBeInTheDocument()
      })
    })
  })

  describe('CRUD Operations - Event Types', () => {
    it('opens event type editor when add button clicked on events tab', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      await user.click(screen.getByText(/Event Types/))
      await waitFor(() => {
        expect(screen.getByText('Street Crossing')).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /add type/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByTestId('event-type-editor')).toBeInTheDocument()
        expect(screen.getByText('Creating new event type')).toBeInTheDocument()
      })
    })

    it('displays role count for event types', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await user.click(screen.getByText(/Event Types/))

      await waitFor(() => {
        expect(screen.getByText(/Roles: 2/)).toBeInTheDocument()
      })
    })
  })

  describe('CRUD Operations - Relation Types', () => {
    it('opens relation type editor when add button clicked on relations tab', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      await user.click(screen.getByText(/Relation Types/))
      await waitFor(() => {
        expect(screen.getByText('Blocks')).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /add type/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByTestId('relation-type-editor')).toBeInTheDocument()
        expect(screen.getByText('Creating new relation type')).toBeInTheDocument()
      })
    })

    it('displays source and target types for relations', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await user.click(screen.getByText(/Relation Types/))

      await waitFor(() => {
        expect(screen.getByText(/Vehicle → Vehicle, Pedestrian/)).toBeInTheDocument()
      })
    })
  })

  describe('GPU/CPU Mode Detection', () => {
    it('shows ontology augmentation button when GPU available', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        const suggestButton = screen.getByRole('button', { name: /Suggest Types/i })
        expect(suggestButton).toBeInTheDocument()
        expect(suggestButton).not.toBeDisabled()
      })
    })

    it('hides ontology augmentation in CPU-only mode', async () => {
      mockUseModelConfig.mockReturnValueOnce({
        data: { cuda_available: false },
      })

      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        const suggestButton = screen.getByRole('button', { name: /Suggest Types/i })
        expect(suggestButton).toBeDisabled()
      })
    })

    it('opens ontology augmenter when suggest button clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const suggestButton = screen.getByRole('button', { name: /Suggest Types/i })
      await user.click(suggestButton)

      await waitFor(() => {
        expect(screen.getByTestId('ontology-augmenter')).toBeInTheDocument()
      })
    })

    it('closes ontology augmenter when close clicked', async () => {
      const user = userEvent.setup()
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const suggestButton = screen.getByRole('button', { name: /Suggest Types/i })
      await user.click(suggestButton)

      await waitFor(() => {
        expect(screen.getByTestId('ontology-augmenter')).toBeInTheDocument()
      })

      const closeButton = screen.getByText('Close Augmenter')
      await user.click(closeButton)

      await waitFor(() => {
        expect(screen.queryByTestId('ontology-augmenter')).not.toBeInTheDocument()
      })
    })
  })

  describe('Empty States', () => {
    it('shows correct tab counts with first persona auto-selected', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types \(3\/3\)/)).toBeInTheDocument()
      })
    })

    it('shows empty ontology when persona has no types', async () => {
      const state = createDefaultState()
      state.persona.personaOntologies[0].entities = []
      state.persona.personaOntologies[0].roles = []
      state.persona.personaOntologies[0].events = []
      state.persona.personaOntologies[0].relationTypes = []

      const store = createTestStore(state)
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types \(0\/0\)/)).toBeInTheDocument()
        expect(screen.getByText(/Role Types \(0\/0\)/)).toBeInTheDocument()
      })
    })
  })

  describe('Diverse Domain Examples', () => {
    it('displays urban planning ontology with traffic types', async () => {
      const store = createTestStore(createDefaultState())
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
        expect(screen.getByText('Pedestrian')).toBeInTheDocument()
        expect(screen.getByText('Traffic Signal')).toBeInTheDocument()
      })
    })

    it('renders multiple persona ontologies correctly', async () => {
      const state = createDefaultState()
      const store = createTestStore(state)
      render(<OntologyWorkspace />, { wrapper: createWrapper(store) })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types/)).toBeInTheDocument()
      })
    })
  })
})
