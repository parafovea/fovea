/**
 * Tests for OntologyWorkspace component.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import React from 'react'
import OntologyWorkspace from './OntologyWorkspace'
import { server } from '@test/setup'
import { useAnnotationUiStore } from '@store/zustand'

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
vi.mock('@components/persona/PersonaEditor', () => ({
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
vi.mock('@components/ontology/EntityTypeEditor', () => ({
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
vi.mock('@components/ontology/RoleEditor', () => ({
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
vi.mock('@components/ontology/EventTypeEditor', () => ({
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
vi.mock('@components/ontology/RelationTypeEditor', () => ({
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
vi.mock('@components/ontology/OntologyAugmenter', () => ({
  OntologyAugmenter: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="ontology-augmenter">
      <button onClick={onClose}>Close Augmenter</button>
    </div>
  ),
}))

/**
 * Mock GlossRenderer to simplify gloss display.
 */
vi.mock('@components/ontology/GlossRenderer', () => ({
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
 * Mock preferences hook - mock both the old path and the new barrel export.
 */
vi.mock('@hooks/preferences', () => ({
  usePreferences: () => ({
    lastPersonaId: null,
    setLastPersonaId: vi.fn(),
    getFilterState: () => ({ searchQuery: '' }),
    setFilterState: vi.fn(),
  }),
  useTimelineKeyboardShortcuts: vi.fn(),
}))

/**
 * Mock model config hook with default GPU mode.
 * Returns TanStack Query result shape.
 */
const mockUseModelConfig = vi.fn(() => ({
  data: { cudaAvailable: true, modelsAvailable: true, cpuModelsAvailable: false },
  error: null,
  isLoading: false,
  isError: false,
}))

vi.mock('../../store/queries/useModelConfig', () => ({
  useModelConfig: () => mockUseModelConfig(),
}))

/**
 * Creates a wrapper component with QueryClientProvider.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

// Mock data
const mockPersonas = [
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
]

const mockOntologies: Record<string, any> = {
  'persona-urban-planner': {
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
  'persona-food-inspector': {
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
  'persona-art-curator': {
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
}

const mockWorld = {
  entities: [],
  events: [],
  times: [],
  locations: [],
  relations: [],
  collections: [],
}

/**
 * Sets up default MSW handlers for all APIs.
 */
function setupDefaultHandlers(personas = mockPersonas, ontologies = mockOntologies) {
  server.use(
    http.get('/api/personas', () => {
      return HttpResponse.json(personas)
    }),
    http.get('/api/personas/:personaId/ontology', ({ params }) => {
      const ontology = ontologies[params.personaId as string]
      if (ontology) {
        return HttpResponse.json(ontology)
      }
      return HttpResponse.json({ entities: [], roles: [], events: [], relationTypes: [] })
    }),
    http.get('/api/world', () => {
      return HttpResponse.json(mockWorld)
    })
  )
}

/**
 * Helper to pre-select a persona in Zustand store before rendering.
 * This simulates the user having previously selected a persona.
 */
function preSelectPersona(personaId: string) {
  useAnnotationUiStore.getState().setOntologySelectedPersonaId(personaId)
}

describe('OntologyWorkspace', () => {
  beforeEach(() => {
    server.resetHandlers()
    // Reset model config mock to default GPU-available state
    mockUseModelConfig.mockReturnValue({
      data: { cudaAvailable: true, modelsAvailable: true, cpuModelsAvailable: false },
      error: null,
      isLoading: false,
      isError: false,
    })
  })

  afterEach(() => {
    // Reset Zustand store state after each test
    useAnnotationUiStore.getState().setOntologySelectedPersonaId(null)
    useAnnotationUiStore.getState().setOntologyTabIndex(0)
  })

  describe('Initial Rendering', () => {
    it('renders persona browser by default (no auto-select)', async () => {
      setupDefaultHandlers()
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByTestId('persona-browser')).toBeInTheDocument()
      })
    })

    it('renders ontology workspace when persona was previously selected', async () => {
      setupDefaultHandlers()
      // Pre-select a persona (simulating returning to the workspace)
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Urban Traffic Analyst')).toBeInTheDocument()
      })
    })

    it('renders persona browser when no personas exist', async () => {
      setupDefaultHandlers([], {})

      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByTestId('persona-browser')).toBeInTheDocument()
      })
    })
  })

  describe('Persona Selection', () => {
    it('displays persona information in header when persona selected', async () => {
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Urban Traffic Analyst')).toBeInTheDocument()
        expect(screen.getByText(/Transportation Engineer/)).toBeInTheDocument()
      })
    })

    it('shows back button to return to persona browser', async () => {
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /back to persona browser/i })).toBeInTheDocument()
      })
    })

    it('returns to persona browser when back button clicked', async () => {
      const user = userEvent.setup()
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Urban Traffic Analyst')).toBeInTheDocument()
      })

      const backButton = screen.getByRole('button', { name: /back to persona browser/i })
      await user.click(backButton)

      await waitFor(() => {
        expect(screen.getByTestId('persona-browser')).toBeInTheDocument()
      })
    })

    it('can select persona from browser', async () => {
      const user = userEvent.setup()
      setupDefaultHandlers()

      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByTestId('persona-browser')).toBeInTheDocument()
      })

      // Click to select a persona
      await user.click(screen.getByText('Select Urban Planner'))

      await waitFor(() => {
        expect(screen.getByText('Urban Traffic Analyst')).toBeInTheDocument()
      })
    })
  })

  describe('Tab Navigation', () => {
    it('displays all four ontology type tabs', async () => {
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types/)).toBeInTheDocument()
        expect(screen.getByText(/Role Types/)).toBeInTheDocument()
        expect(screen.getByText(/Event Types/)).toBeInTheDocument()
        expect(screen.getByText(/Relation Types/)).toBeInTheDocument()
      })
    })

    it('shows entity types in first tab by default', async () => {
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
        expect(screen.getByText('Pedestrian')).toBeInTheDocument()
        expect(screen.getByText('Traffic Signal')).toBeInTheDocument()
      })
    })

    it('switches to role types tab when clicked', async () => {
      const user = userEvent.setup()
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Search types by name/)).toBeInTheDocument()
      })
    })

    it('filters entity types by name', async () => {
      const user = userEvent.setup()
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const editButton = screen.getByRole('button', { name: 'Edit Vehicle' })
      await user.click(editButton)

      await waitFor(() => {
        expect(screen.getByTestId('entity-type-editor')).toBeInTheDocument()
      })
    })

    it('closes entity type editor when close button clicked', async () => {
      const user = userEvent.setup()
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      await user.click(screen.getByText(/Role Types/))

      await waitFor(() => {
        expect(screen.getByText(/Allowed fillers: Person, Vehicle/)).toBeInTheDocument()
      })
    })
  })

  describe('CRUD Operations - Event Types', () => {
    it('opens event type editor when add button clicked on events tab', async () => {
      const user = userEvent.setup()
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      await user.click(screen.getByText(/Event Types/))

      await waitFor(() => {
        expect(screen.getByText(/Roles: 2/)).toBeInTheDocument()
      })
    })
  })

  describe('CRUD Operations - Relation Types', () => {
    it('opens relation type editor when add button clicked on relations tab', async () => {
      const user = userEvent.setup()
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      await user.click(screen.getByText(/Relation Types/))

      await waitFor(() => {
        expect(screen.getByText(/Vehicle.*->.*Vehicle, Pedestrian/)).toBeInTheDocument()
      })
    })
  })

  describe('GPU/CPU Mode Detection', () => {
    it('shows ontology augmentation button when GPU available', async () => {
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        const suggestButton = screen.getByRole('button', { name: /Suggest Types/i })
        expect(suggestButton).toBeInTheDocument()
        expect(suggestButton).not.toBeDisabled()
      })
    })

    it('disables ontology augmentation when no models available', async () => {
      // Override mock to return no models available
      mockUseModelConfig.mockReturnValue({
        data: { cudaAvailable: false, modelsAvailable: false, cpuModelsAvailable: false },
        error: null,
        isLoading: false,
        isError: false,
      })

      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
      })

      const suggestButton = screen.getByRole('button', { name: /Suggest Types/i })
      expect(suggestButton).toBeDisabled()
    })

    it('opens ontology augmenter when suggest button clicked', async () => {
      const user = userEvent.setup()
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

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
    it('shows correct tab counts with persona selected', async () => {
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types \(3\/3\)/)).toBeInTheDocument()
      })
    })

    it('shows empty ontology when persona has no types', async () => {
      // Set up with only art curator persona, which has empty roles, events, relationTypes
      const artCuratorOnly = [mockPersonas[2]] // persona-art-curator
      setupDefaultHandlers(artCuratorOnly, mockOntologies)
      preSelectPersona('persona-art-curator')

      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types \(1\/1\)/)).toBeInTheDocument()
        expect(screen.getByText(/Role Types \(0\/0\)/)).toBeInTheDocument()
      })
    })
  })

  describe('Diverse Domain Examples', () => {
    it('displays urban planning ontology with traffic types', async () => {
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText('Vehicle')).toBeInTheDocument()
        expect(screen.getByText('Pedestrian')).toBeInTheDocument()
        expect(screen.getByText('Traffic Signal')).toBeInTheDocument()
      })
    })

    it('renders multiple persona ontologies correctly', async () => {
      setupDefaultHandlers()
      preSelectPersona('persona-urban-planner')
      render(<OntologyWorkspace />, { wrapper: createWrapper() })

      await waitFor(() => {
        expect(screen.getByText(/Entity Types/)).toBeInTheDocument()
      })
    })
  })
})
