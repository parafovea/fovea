import { useState, useRef, useEffect } from 'react'
import { usePreferences } from '@hooks/preferences'
import { useCommands, useCommandContext } from '@hooks/commands'
import { useAnnotationUiStore } from '@store/zustand'
import {
  Plus,
  Pencil,
  Trash2,
  Blocks,
  Users,
  CalendarDays,
  Share2,
  ArrowLeft,
  Search,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import PersonaBrowser from '../browsers/PersonaBrowser'
import PersonaEditor from '@components/persona/PersonaEditor'
import EntityTypeEditor from '@components/ontology/EntityTypeEditor'
import RoleEditor from '@components/ontology/RoleEditor'
import EventTypeEditor from '@components/ontology/EventTypeEditor'
import RelationTypeEditor from '@components/ontology/RelationTypeEditor'
import { GlossRenderer } from '@components/ontology/GlossRenderer'
import { glossToText } from '@utils/glossUtils'
import { WikidataChip } from '../shared/WikidataChip'
import {
  usePersonas,
  usePersonaOntology,
  useAddEntityToPersona,
  useAddRoleToPersona,
  useAddEventToPersona,
  useAddRelationTypeToPersona,
  useDeleteEntityFromPersona,
  useDeleteRoleFromPersona,
  useDeleteEventFromPersona,
  useDeleteRelationTypeFromPersona,
  useSavePersonaOntology,
  useWorld,
} from '@store/queries'
import { OntologyAugmenter, OntologyCategory } from '@components/ontology/OntologyAugmenter'
import { useModelConfig } from '@store/queries/useModelConfig'
import { EntityType, RoleType, EventType, RelationType, GlossItem } from '@models/types'
import { generateId } from '@utils/uuid'
import { buildDuplicateOntologyType } from './duplicateOntologyType'
import { config } from '@/config'

/**
 * Union type for any ontology type item that can be filtered/edited.
 */
type OntologyTypeItem = {
  id: string
  name: string
  gloss: GlossItem[]
  wikidataId?: string
}

/**
 * Ontology workspace for managing persona-specific type definitions.
 * Provides tabbed interface for entity, role, event, and relation types with search,
 * CRUD operations, and AI-powered type suggestions.
 *
 * @returns React component rendering persona browser or ontology editor with tabs
 */
export default function OntologyWorkspace() {
  // TanStack Query hooks for data
  const { data: personas = [] } = usePersonas()
  const { data: world } = useWorld()
  const entities = world?.entities || []
  const events = world?.events || []
  const times = world?.times || []
  const { data: modelConfig, error: modelConfigError } = useModelConfig()
  // Treat AI models as disabled if model service is unavailable (e.g., in E2E tests)
  const modelsDisabled = !!modelConfigError || (!modelConfig?.cudaAvailable && !modelConfig?.cpuModelsAvailable)

  // TanStack Query mutations
  const { mutate: deleteEntityMutation } = useDeleteEntityFromPersona()
  const { mutate: deleteRoleMutation } = useDeleteRoleFromPersona()
  const { mutate: deleteEventMutation } = useDeleteEventFromPersona()
  const { mutate: deleteRelationTypeMutation } = useDeleteRelationTypeFromPersona()
  const { mutate: addEntityMutation } = useAddEntityToPersona()
  const { mutate: addRoleMutation } = useAddRoleToPersona()
  const { mutate: addEventMutation } = useAddEventToPersona()
  const { mutate: addRelationTypeMutation } = useAddRelationTypeToPersona()
  const { mutate: saveOntologyMutation } = useSavePersonaOntology()

  // Use preferences for smart defaults
  const {
    setLastPersonaId,
    getFilterState,
    setFilterState,
  } = usePreferences()

  // Get ontology workspace UI state from Zustand store
  // This persists across navigation - user stays on persona browser or editing persona
  const selectedPersonaId = useAnnotationUiStore((state) => state.ontologySelectedPersonaId)
  const setSelectedPersonaIdStore = useAnnotationUiStore((state) => state.setOntologySelectedPersonaId)
  const tabValue = useAnnotationUiStore((state) => state.ontologyTabIndex)
  const setTabValue = useAnnotationUiStore((state) => state.setOntologyTabIndex)

  // Wrapper to also save to preferences when selecting a persona
  const setSelectedPersonaId = (id: string | null) => {
    setSelectedPersonaIdStore(id)
    if (id) setLastPersonaId(id)
  }

  const [personaEditorOpen, setPersonaEditorOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<typeof personas[0] | null>(null)

  // Initialize search from saved filter state
  const initialFilterState = getFilterState('ontology')
  const [searchTerm, setSearchTermState] = useState(initialFilterState.searchQuery || '')

  // Wrapper to also save search term
  const setSearchTerm = (term: string) => {
    setSearchTermState(term)
    setFilterState('ontology', { ...getFilterState('ontology'), searchQuery: term })
  }

  // Type editor states
  const [entityTypeEditorOpen, setEntityTypeEditorOpen] = useState(false)
  const [roleEditorOpen, setRoleEditorOpen] = useState(false)
  const [eventTypeEditorOpen, setEventTypeEditorOpen] = useState(false)
  const [relationTypeEditorOpen, setRelationTypeEditorOpen] = useState(false)

  const [selectedEntityType, setSelectedEntityType] = useState<any>(null)
  const [selectedRole, setSelectedRole] = useState<any>(null)
  const [selectedEventType, setSelectedEventType] = useState<any>(null)
  const [selectedRelationType, setSelectedRelationType] = useState<any>(null)

  // Ontology Augmenter state
  const [augmenterOpen, setAugmenterOpen] = useState(false)
  const [augmenterCategory, setAugmenterCategory] = useState<OntologyCategory>('entity')

  // Refs for managing focus
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1)

  const selectedPersona = personas.find(p => p.id === selectedPersonaId)
  const { data: selectedOntology } = usePersonaOntology(selectedPersonaId)

  // Reset selectedPersonaId if the persona no longer exists (e.g., deleted)
  useEffect(() => {
    if (selectedPersonaId && personas.length > 0 && !selectedPersona) {
      setSelectedPersonaIdStore(null)
    }
  }, [selectedPersonaId, personas, selectedPersona, setSelectedPersonaIdStore])

  // Auto-select the first available persona on a deployment that
  // mounts the public tour catalogue (VITE_DEMO_PUBLIC=1). The
  // ontology workspace renders <PersonaBrowser /> whenever
  // selectedPersonaId is null and only renders the type-list tabs
  // once a persona is picked, which means the ontology-rooted tours
  // (ontology-authoring, wikidata-augmentation) launch into a
  // workspace whose anchor (ontology-workspace-tabs) has not
  // mounted. Auto-selecting the seeded Automated persona for a
  // visitor who has not made an explicit choice yet brings the
  // workspace into its expected state without forcing the visitor
  // to click through a browser they did not ask for. The effect
  // only fires when VITE_DEMO_PUBLIC=1, so the standard PersonaBrowser-
  // first flow stays intact on every self-hosted deployment where
  // an admin expects new users to pick a persona deliberately.
  useEffect(() => {
    if (
      config.deploymentMode.publicBooth &&
      !selectedPersonaId &&
      personas.length > 0
    ) {
      setSelectedPersonaIdStore(personas[0].id)
    }
  }, [selectedPersonaId, personas, setSelectedPersonaIdStore])

  // Auto-save persona ontology on changes (debounced 1 second)
  useEffect(() => {
    if (!selectedPersonaId || !selectedOntology) return

    const timeoutId = setTimeout(() => {
      saveOntologyMutation({
        personaId: selectedPersonaId,
        ontology: selectedOntology
      })
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [selectedPersonaId, selectedOntology, saveOntologyMutation])

  /**
   * Filters ontology type items by search term.
   * Searches across name, gloss text, and Wikidata ID fields.
   *
   * @param item - Ontology type item (entity, role, event, or relation type)
   * @returns True if item matches search term, false otherwise
   */
  const filterBySearchTerm = (item: OntologyTypeItem) => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()

    // Check name
    if (item.name?.toLowerCase().includes(searchLower)) return true

    const glossText = glossToText(item.gloss, selectedOntology, { entities, events, times })
    if (glossText.toLowerCase().includes(searchLower)) return true

    // Check wikidataId
    if (item.wikidataId?.toLowerCase().includes(searchLower)) return true

    return false
  }

  const filteredEntities = (selectedOntology?.entities ?? []).filter(filterBySearchTerm)
  const filteredRoles = (selectedOntology?.roles ?? []).filter(filterBySearchTerm)
  const filteredEvents = (selectedOntology?.events ?? []).filter(filterBySearchTerm)
  const filteredRelations = (selectedOntology?.relationTypes ?? []).filter(filterBySearchTerm)

  const handleSelectPersona = (personaId: string) => {
    setSelectedPersonaId(personaId)
  }

  const handleEditPersona = (persona: typeof personas[0]) => {
    setEditingPersona(persona)
    setPersonaEditorOpen(true)
  }

  const handleAddPersona = () => {
    setEditingPersona(null)
    setPersonaEditorOpen(true)
  }

  /**
   * Returns to persona browser view, clearing selected persona.
   */
  const handleBackToBrowser = () => {
    setSelectedPersonaId(null)
    setTabValue(0)
  }

  /**
   * Opens the appropriate type editor dialog based on active tab.
   * Creates a new entity, role, event, or relation type.
   */
  const handleAddType = () => {
    switch (tabValue) {
      case 0:
        setSelectedEntityType(null)
        setEntityTypeEditorOpen(true)
        break
      case 1:
        setSelectedRole(null)
        setRoleEditorOpen(true)
        break
      case 2:
        setSelectedEventType(null)
        setEventTypeEditorOpen(true)
        break
      case 3:
        setSelectedRelationType(null)
        setRelationTypeEditorOpen(true)
        break
    }
  }

  const handleEditEntityType = (type: EntityType) => {
    setSelectedEntityType(type)
    setEntityTypeEditorOpen(true)
  }

  const handleEditRole = (role: RoleType) => {
    setSelectedRole(role)
    setRoleEditorOpen(true)
  }

  const handleEditEventType = (event: EventType) => {
    setSelectedEventType(event)
    setEventTypeEditorOpen(true)
  }

  const handleEditRelationType = (relation: RelationType) => {
    setSelectedRelationType(relation)
    setRelationTypeEditorOpen(true)
  }

  /**
   * Opens the ontology augmenter dialog for AI-powered type suggestions.
   *
   * @param category - Ontology category to generate suggestions for
   */
  const handleOpenAugmenter = (category: OntologyCategory) => {
    setAugmenterCategory(category)
    setAugmenterOpen(true)
  }

  /**
   * Gets the currently visible list items based on active tab.
   *
   * @returns Filtered list of items for the current tab (entities, roles, events, or relations)
   */
  const getCurrentItems = () => {
    switch(tabValue) {
      case 0: return filteredEntities
      case 1: return filteredRoles
      case 2: return filteredEvents
      case 3: return filteredRelations
      default: return []
    }
  }

  // Map numeric tabValue to string keys for the Tabs component
  const tabKeys = ['entities', 'roles', 'events', 'relations']
  const currentTabKey = tabKeys[tabValue] || 'entities'

  // Set command context for when clauses
  useCommandContext({
    ontologyWorkspaceActive: selectedPersonaId !== null,
    personaBrowserActive: selectedPersonaId === null,
    annotationWorkspaceActive: false,
    objectWorkspaceActive: false,
    videoBrowserActive: false,
    dialogOpen: personaEditorOpen || entityTypeEditorOpen || roleEditorOpen || eventTypeEditorOpen || relationTypeEditorOpen || augmenterOpen,
    inputFocused: false, // Updated dynamically by focus events in App.tsx
    typeSelected: selectedItemIndex >= 0,
  })

  // Register command handlers
  useCommands({
    'persona.new': () => handleAddPersona(),
    'ontology.newType': () => handleAddType(),
    'ontology.nextTab': () => setTabValue((tabValue + 1) % 4),
    'ontology.previousTab': () => setTabValue((tabValue - 1 + 4) % 4),
    'ontology.suggestTypes': () => {
      const categoryMap: Record<number, OntologyCategory> = {
        0: 'entity',
        1: 'role',
        2: 'event',
        3: 'relation',
      }
      const category = categoryMap[tabValue] || 'entity'
      handleOpenAugmenter(category)
    },
    'ontology.editType': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length) {
        const item = items[selectedItemIndex]
        switch(tabValue) {
          case 0: handleEditEntityType(item as EntityType); break
          case 1: handleEditRole(item as RoleType); break
          case 2: handleEditEventType(item as EventType); break
          case 3: handleEditRelationType(item as RelationType); break
        }
      }
    },
    'ontology.deleteType': () => {
      const items = getCurrentItems()
      if (selectedItemIndex >= 0 && selectedItemIndex < items.length && selectedPersonaId) {
        const item = items[selectedItemIndex]
        switch(tabValue) {
          case 0: deleteEntityMutation({ personaId: selectedPersonaId, entityId: item.id }); break
          case 1: deleteRoleMutation({ personaId: selectedPersonaId, roleId: item.id }); break
          case 2: deleteEventMutation({ personaId: selectedPersonaId, eventId: item.id }); break
          case 3: deleteRelationTypeMutation({ personaId: selectedPersonaId, relationTypeId: item.id }); break
        }
      }
    },
    'ontology.duplicateType': () => {
      const items = getCurrentItems()
      if (!selectedPersonaId) return
      if (selectedItemIndex < 0 || selectedItemIndex >= items.length) return
      const item = items[selectedItemIndex]
      switch (tabValue) {
        case 0: {
          const duped = buildDuplicateOntologyType(item as EntityType, generateId())
          addEntityMutation({ personaId: selectedPersonaId, entity: duped })
          break
        }
        case 1: {
          const duped = buildDuplicateOntologyType(item as RoleType, generateId())
          addRoleMutation({ personaId: selectedPersonaId, role: duped })
          break
        }
        case 2: {
          const duped = buildDuplicateOntologyType(item as EventType, generateId())
          addEventMutation({ personaId: selectedPersonaId, event: duped })
          break
        }
        case 3: {
          const duped = buildDuplicateOntologyType(item as RelationType, generateId())
          addRelationTypeMutation({ personaId: selectedPersonaId, relationType: duped })
          break
        }
      }
    },
    'ontology.search': () => {
      searchInputRef.current?.focus()
    },
  }, {
    context: 'ontologyWorkspace'
  })

  // Handle item selection with mouse
  const handleItemClick = (index: number) => {
    setSelectedItemIndex(index)
  }

  // Reset selection when tab or search changes
  useEffect(() => {
    setSelectedItemIndex(-1)
  }, [tabValue, searchTerm])

  if (!selectedPersonaId) {
    return (
      <div>
        <PersonaBrowser
          onSelectPersona={handleSelectPersona}
          onEditPersona={handleEditPersona}
          onAddPersona={handleAddPersona}
        />

        <PersonaEditor
          open={personaEditorOpen}
          onClose={() => {
            setPersonaEditorOpen(false)
            setEditingPersona(null)
          }}
          persona={editingPersona}
        />
      </div>
    )
  }

  const renderTypeList = (
    items: Array<{ id: string; name: string; gloss: GlossItem[]; wikidataId?: string; wikidataUrl?: string; wikibaseId?: string; importedAt?: string; [key: string]: any }>,
    onEdit: (item: any) => void,
    onDelete: (item: any) => void,
    renderSecondary?: (item: any) => React.ReactNode,
  ) => (
    <ul>
      {items.map((item, index) => (
        <li
          key={item.id}
          className={cn(
            'flex items-center justify-between py-2 px-3 border-b cursor-pointer hover:bg-accent/50',
            selectedItemIndex === index && 'bg-accent/30'
          )}
          onClick={() => handleItemClick(index)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm">{item.name}</span>
              <WikidataChip
                wikidataId={item.wikidataId}
                wikidataUrl={item.wikidataUrl}
                wikibaseId={item.wikibaseId}
                importedAt={item.importedAt}
                size="small"
                showTimestamp={false}
              />
            </div>
            <div className="mt-0.5">
              <GlossRenderer gloss={item.gloss} personaId={selectedPersonaId} />
              {renderSecondary && renderSecondary(item)}
            </div>
          </div>
          <div className="flex gap-1 ml-2 shrink-0">
            <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onEdit(item) }} aria-label={`Edit ${item.name}`}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); onDelete(item) }} aria-label={`Delete ${item.name}`}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  )

  const renderSuggestButton = (category: OntologyCategory) => (
    <div className="mb-4 flex justify-end">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenAugmenter(category)}
                disabled={modelsDisabled}
              />
            }
          >
            <Sparkles className="size-4 mr-1" />
            Suggest Types
          </TooltipTrigger>
          {modelsDisabled && (
            <TooltipContent>No AI models available for type suggestions</TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  )

  return (
    <div className="h-full flex flex-col">
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="Search types by name or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 px-4 py-2 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={handleBackToBrowser} aria-label="Back to persona browser">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">
            {selectedPersona?.name}
          </h2>
          <p className="text-xs text-muted-foreground truncate">
            {selectedPersona?.role} - {selectedPersona?.informationNeed}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => handleEditPersona(selectedPersona!)}>
          <Pencil className="size-4 mr-1" />
          Edit Persona
        </Button>
      </div>

      <Tabs
        value={currentTabKey}
        onValueChange={(val) => setTabValue(tabKeys.indexOf(val))}
        className="flex-1 flex flex-col"
      >
        <TabsList className="mx-4 mt-2" data-tour-id="ontology-workspace-tabs">
          <TabsTrigger value="entities" data-tour-id="ontology-tab-entities">
            <Blocks className="size-4 mr-1" />
            Entity Types ({filteredEntities.length}/{selectedOntology?.entities.length || 0})
          </TabsTrigger>
          <TabsTrigger value="roles" data-tour-id="ontology-tab-roles">
            <Users className="size-4 mr-1" />
            Role Types ({filteredRoles.length}/{selectedOntology?.roles.length || 0})
          </TabsTrigger>
          <TabsTrigger value="events" data-tour-id="ontology-tab-events">
            <CalendarDays className="size-4 mr-1" />
            Event Types ({filteredEvents.length}/{selectedOntology?.events.length || 0})
          </TabsTrigger>
          <TabsTrigger value="relations" data-tour-id="ontology-tab-relations">
            <Share2 className="size-4 mr-1" />
            Relation Types ({filteredRelations.length}/{selectedOntology?.relationTypes.length || 0})
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          <TabsContent value="entities" className="p-6">
            {renderSuggestButton('entity')}
            {renderTypeList(
              filteredEntities,
              handleEditEntityType,
              (entity) => deleteEntityMutation({ personaId: selectedPersonaId, entityId: entity.id }),
            )}
          </TabsContent>

          <TabsContent value="roles" className="p-6">
            {renderSuggestButton('role')}
            {renderTypeList(
              filteredRoles,
              handleEditRole,
              (role) => deleteRoleMutation({ personaId: selectedPersonaId, roleId: role.id }),
              (role) => (
                <span className="text-xs text-muted-foreground block">
                  Allowed fillers: {(role.allowedFillerTypes || []).join(', ')}
                </span>
              ),
            )}
          </TabsContent>

          <TabsContent value="events" className="p-6">
            {renderSuggestButton('event')}
            {renderTypeList(
              filteredEvents,
              handleEditEventType,
              (event) => deleteEventMutation({ personaId: selectedPersonaId, eventId: event.id }),
              (event) => (event.roles?.length ?? 0) > 0 ? (
                <span className="text-xs text-muted-foreground block">
                  Roles: {event.roles?.length ?? 0}
                </span>
              ) : null,
            )}
          </TabsContent>

          <TabsContent value="relations" className="p-6">
            {renderSuggestButton('relation')}
            {renderTypeList(
              filteredRelations,
              handleEditRelationType,
              (relation) => deleteRelationTypeMutation({ personaId: selectedPersonaId, relationTypeId: relation.id }),
              (relation) => (
                <span className="text-xs text-muted-foreground block">
                  {(relation.sourceTypes ?? []).join(', ')} -&gt; {(relation.targetTypes ?? []).join(', ')}
                </span>
              ),
            )}
          </TabsContent>
        </div>
      </Tabs>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-lg"
                className="absolute bottom-4 right-4 rounded-full shadow-lg"
                aria-label="add type"
                data-tour-id="ontology-add-type-button"
                onClick={handleAddType}
              />
            }
          >
            <Plus className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="left">Add New Type (Cmd/Ctrl+N)</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Type Editors */}
      <EntityTypeEditor
        open={entityTypeEditorOpen}
        onClose={() => {
          setEntityTypeEditorOpen(false)
          setSelectedEntityType(null)
        }}
        entity={selectedEntityType}
        personaId={selectedPersonaId}
      />

      <RoleEditor
        open={roleEditorOpen}
        onClose={() => {
          setRoleEditorOpen(false)
          setSelectedRole(null)
        }}
        role={selectedRole}
        personaId={selectedPersonaId}
      />

      <EventTypeEditor
        open={eventTypeEditorOpen}
        onClose={() => {
          setEventTypeEditorOpen(false)
          setSelectedEventType(null)
        }}
        event={selectedEventType}
        personaId={selectedPersonaId}
      />

      <RelationTypeEditor
        open={relationTypeEditorOpen}
        onClose={() => {
          setRelationTypeEditorOpen(false)
          setSelectedRelationType(null)
        }}
        relationType={selectedRelationType}
        personaId={selectedPersonaId}
      />

      <PersonaEditor
        open={personaEditorOpen}
        onClose={() => {
          setPersonaEditorOpen(false)
          setEditingPersona(null)
        }}
        persona={editingPersona}
      />

      {/* Ontology Augmenter Dialog */}
      {augmenterOpen && selectedPersonaId && (
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 max-w-[800px] w-[90%] max-h-[90vh] overflow-auto"
        >
          <OntologyAugmenter
            personaId={selectedPersonaId}
            personaName={selectedPersona?.name}
            initialCategory={augmenterCategory}
            onClose={() => setAugmenterOpen(false)}
          />
        </div>
      )}
    </div>
  )
}
