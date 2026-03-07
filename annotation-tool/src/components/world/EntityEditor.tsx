import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Package, Globe, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAddEntity, useUpdateEntity, useDeleteEntity, usePersonas, useAllPersonaOntologies } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import { Entity, EntityTypeAssignment, GlossItem } from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import WikidataImportFlow from '../shared/WikidataImportFlow'
import { useAutoSave, SaveStatusIndicator } from '../../hooks/data'

interface EntityEditorProps {
  open: boolean
  onClose: () => void
  entity: Entity | null
}

export default function EntityEditor({ open, onClose, entity }: EntityEditorProps) {
  // TanStack Query hooks for personas
  const { data: personas = [] } = usePersonas()
  const personaIds = personas.map((p) => p.id)
  const { data: personaOntologies = [] } = useAllPersonaOntologies(personaIds)
  const { mutateAsync: addEntity } = useAddEntity()
  const { mutateAsync: updateEntity } = useUpdateEntity()
  const { mutate: deleteEntity } = useDeleteEntity()

  // Active persona from Zustand store
  const activePersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [alternateNamesInput, setAlternateNamesInput] = useState('')
  const [typeAssignments, setTypeAssignments] = useState<EntityTypeAssignment[]>([])
  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')

  // Track auto-created entity ID for cancel cleanup
  const [autoCreatedEntityId, setAutoCreatedEntityId] = useState<string | null>(null)
  const autoCreatedIdRef = useRef<string | null>(null)

  // For adding new type assignment
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('')
  const [selectedEntityTypeId, setSelectedEntityTypeId] = useState<string>('')
  const [assignmentConfidence, setAssignmentConfidence] = useState<number>(1.0)
  const [assignmentJustification, setAssignmentJustification] = useState('')

  // Keep ref in sync with state for callbacks
  useEffect(() => {
    autoCreatedIdRef.current = autoCreatedEntityId
  }, [autoCreatedEntityId])

  // Auto-save hook for new entities
  const { saveStatus, lastSavedAt, errorMessage, retryCount, forceSave } = useAutoSave({
    data: { name, description, typeAssignments, wikidataId, wikidataUrl, alternateNamesInput },
    isEnabled: open && !!name && !entity, // Only for new entities, require name
    onSave: async (entityData) => {
      const now = new Date().toISOString()
      const fullEntityData: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'> = {
        name: entityData.name,
        description: entityData.description,
        typeAssignments: entityData.typeAssignments,
        wikidataId: entityData.wikidataId || undefined,
        wikidataUrl: entityData.wikidataUrl || undefined,
        importedFrom: entityData.wikidataId ? 'wikidata' : undefined,
        importedAt: entityData.wikidataId ? now : undefined,
        metadata: {
          alternateNames: entityData.alternateNamesInput.split(',').map(s => s.trim()).filter(Boolean),
          externalIds: {},
          properties: {},
        },
      }

      if (autoCreatedIdRef.current) {
        // Update the auto-created entity
        await updateEntity({
          id: autoCreatedIdRef.current,
          createdAt: now,
          updatedAt: now,
          ...fullEntityData,
        })
      } else {
        // Create new entity and track ID
        const result = await addEntity(fullEntityData)
        // Get the newly created entity ID from the result
        const newEntity = result.entities[result.entities.length - 1]
        if (newEntity) {
          setAutoCreatedEntityId(newEntity.id)
        }
      }
    },
    entityType: 'world-object',
    entityId: entity?.id || autoCreatedIdRef.current || undefined,
  })

  useEffect(() => {
    if (entity) {
      setName(entity.name)
      setDescription(entity.description)
      setAlternateNamesInput(entity.metadata?.alternateNames?.join(', ') || '')
      setTypeAssignments(entity.typeAssignments || [])
      setWikidataId(entity.wikidataId || '')
      setWikidataUrl(entity.wikidataUrl || '')
    } else {
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setAlternateNamesInput('')
      setTypeAssignments([])
      setWikidataId('')
      setWikidataUrl('')
    }
    // Reset auto-created ID when dialog opens/closes or entity changes
    setAutoCreatedEntityId(null)
  }, [entity, open])

  const handleAddTypeAssignment = () => {
    if (selectedPersonaId && selectedEntityTypeId) {
      // Get the selected type to check for sharedTypeId or wikidataId
      const selectedOntology = personaOntologies.find(o => o.personaId === selectedPersonaId)
      const selectedType = selectedOntology?.entities.find(e => e.id === selectedEntityTypeId)

      const assignments: EntityTypeAssignment[] = []

      // Check for sharedTypeId or wikidataId to find linked types across personas
      const sharedId = selectedType?.sharedTypeId || selectedType?.wikidataId

      if (sharedId) {
        // Find all types with matching sharedTypeId or wikidataId across all personas
        for (const ontology of personaOntologies) {
          const matchingType = ontology.entities.find(e =>
            e.sharedTypeId === sharedId ||
            (selectedType?.wikidataId && e.wikidataId === selectedType.wikidataId)
          )
          if (matchingType) {
            assignments.push({
              personaId: ontology.personaId,
              entityTypeId: matchingType.id,
              confidence: assignmentConfidence,
              justification: assignmentJustification || undefined,
            })
          }
        }
      } else {
        // No sharedTypeId, just add single assignment
        assignments.push({
          personaId: selectedPersonaId,
          entityTypeId: selectedEntityTypeId,
          confidence: assignmentConfidence,
          justification: assignmentJustification || undefined,
        })
      }

      // Remove existing assignments for all personas being updated
      const personaIdsToReplace = new Set(assignments.map(a => a.personaId))
      const filtered = typeAssignments.filter(a => !personaIdsToReplace.has(a.personaId))
      setTypeAssignments([...filtered, ...assignments])

      // Reset form
      setSelectedEntityTypeId('')
      setAssignmentConfidence(1.0)
      setAssignmentJustification('')
    }
  }

  const handleRemoveTypeAssignment = (personaId: string) => {
    setTypeAssignments(typeAssignments.filter(a => a.personaId !== personaId))
  }

  const handleSave = async () => {
    const now = new Date().toISOString()
    // Parse alternate names from comma-separated input
    const alternateNames = alternateNamesInput
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    const entityData: Omit<Entity, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      description,
      typeAssignments,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
      importedFrom: wikidataId ? (entity?.importedFrom || 'wikidata') : undefined,
      importedAt: wikidataId ? (entity?.importedAt || now) : undefined,
      metadata: {
        alternateNames,
        externalIds: {},
        properties: {},
      },
    }

    if (entity) {
      await updateEntity({ ...entity, ...entityData })
    } else {
      await addEntity(entityData)
    }

    onClose()
  }

  // Cancel handler deletes auto-created entity
  const handleCancel = () => {
    if (autoCreatedIdRef.current) {
      deleteEntity(autoCreatedIdRef.current)
    }
    setAutoCreatedEntityId(null)
    onClose()
  }

  // Done handler keeps the entity (already saved via autosave)
  const handleDone = async () => {
    // Force save any pending changes before closing
    if (!entity && autoCreatedIdRef.current) {
      await forceSave()
    }
    setAutoCreatedEntityId(null)
    onClose()
  }

  const getEntityTypeName = (personaId: string, entityTypeId: string): string => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    const entityType = ontology?.entities.find(e => e.id === entityTypeId)
    return entityType?.name || 'Unknown Type'
  }

  const getPersonaName = (personaId: string): string => {
    const persona = personas.find(p => p.id === personaId)
    return persona?.name || 'Unknown Persona'
  }

  const availableEntityTypes = selectedPersonaId
    ? personaOntologies.find(o => o.personaId === selectedPersonaId)?.entities || []
    : []

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="size-5 text-secondary" />
            {entity ? 'Edit Entity' : 'Create Entity'}
            <TypeObjectBadge isType={false} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Alert>
            <Package className="size-4" />
            <AlertDescription>
              An entity is an actual thing in the world (e.g., "John Smith", "The White House").
              This is different from entity types which are categories (e.g., "Person", "Building").
            </AlertDescription>
          </Alert>

          {!entity && (
            <ToggleGroup
              value={[importMode]}
              onValueChange={(value) => {
                if (value.length > 0) setImportMode(value[0] as 'manual' | 'wikidata')
              }}
              size="sm"
              className="w-full"
            >
              <ToggleGroupItem value="manual" className="flex flex-1 items-center gap-1">
                <Pencil className="size-4" />
                <span className="text-sm">Manual Entry</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="wikidata" className="flex flex-1 items-center gap-1">
                <Globe className="size-4" />
                <span className="text-sm">Import from Wikidata</span>
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          {importMode === 'wikidata' && !entity && (
            <WikidataImportFlow
              type="entity"
              entityType="object"
              objectSubtype="entity"
              onSuccess={() => onClose()}
              onCancel={onClose}
            />
          )}

          <div className="space-y-1">
            <Label>Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Entity name"
            />
            <p className="text-xs text-muted-foreground">The specific name of this entity</p>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={activePersonaId}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="alternate-names">Alternate Names</Label>
            <Input
              id="alternate-names"
              value={alternateNamesInput}
              onChange={(e) => setAlternateNamesInput(e.target.value)}
              placeholder="Other names (comma-separated)"
            />
            <p className="text-xs text-muted-foreground">Other names for this entity (comma-separated)</p>
          </div>

          {wikidataId && (
            <div className="flex items-center gap-2">
              <a href={wikidataUrl} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer">
                  Wikidata: {wikidataId}
                </Badge>
              </a>
              <span className="text-xs text-muted-foreground">
                Imported from Wikidata
              </span>
            </div>
          )}

          <Separator />

          <div>
            <h3 className="text-base font-semibold">Type Assignments by Persona</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Different personas can classify this entity with different types from their ontologies.
            </p>

            {/* List existing type assignments */}
            {typeAssignments.length > 0 && (
              <ul className="space-y-2 mb-4">
                {typeAssignments.map((assignment) => (
                  <li key={assignment.personaId} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge>{getPersonaName(assignment.personaId)}</Badge>
                      <span className="text-sm">classifies as</span>
                      <Badge variant="outline" className="italic">
                        {getEntityTypeName(assignment.personaId, assignment.entityTypeId)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div>
                        {assignment.confidence && assignment.confidence < 1 && (
                          <span className="text-xs text-muted-foreground">
                            Confidence: {(assignment.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                        {assignment.justification && (
                          <span className="text-xs text-muted-foreground block">
                            Justification: {assignment.justification}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveTypeAssignment(assignment.personaId)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Add new type assignment */}
            <div className="rounded-lg border p-4 space-y-3">
              <Label className="text-sm font-medium">Add Type Assignment</Label>
              <div className="flex flex-col gap-3">
                <Select value={selectedPersonaId} onValueChange={(value) => {
                  setSelectedPersonaId(value ?? '')
                  setSelectedEntityTypeId('')
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {personas.map(persona => (
                      <SelectItem key={persona.id} value={persona.id}>
                        {persona.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedPersonaId && (
                  <Select value={selectedEntityTypeId} onValueChange={(v) => setSelectedEntityTypeId(v ?? '')}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Entity Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableEntityTypes.map(type => (
                        <SelectItem key={type.id} value={type.id}>
                          <em>{type.name}</em>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {selectedPersonaId && selectedEntityTypeId && (
                  <>
                    <Input
                      type="number"
                      value={assignmentConfidence}
                      onChange={(e) => setAssignmentConfidence(parseFloat(e.target.value))}
                      min={0}
                      max={1}
                      step={0.1}
                      placeholder="Confidence (0-1)"
                    />
                    <textarea
                      className="flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      rows={2}
                      value={assignmentJustification}
                      onChange={(e) => setAssignmentJustification(e.target.value)}
                      placeholder="Justification (optional)"
                    />
                    <Button
                      variant="outline"
                      onClick={handleAddTypeAssignment}
                      disabled={!selectedEntityTypeId}
                    >
                      <Plus className="mr-1 size-4" />
                      Add Assignment
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="flex items-center justify-between">
          <div>
            {!entity && (
              <SaveStatusIndicator
                status={saveStatus}
                lastSavedAt={lastSavedAt}
                errorMessage={errorMessage}
                retryCount={retryCount}
                onRetry={forceSave}
              />
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel}>Cancel</Button>
            {entity ? (
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={!name || description.length === 0}
              >
                Update Entity
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={handleDone}
                disabled={!name || description.length === 0 || !autoCreatedEntityId}
              >
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
