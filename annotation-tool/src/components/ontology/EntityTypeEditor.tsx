import { useState, useEffect } from 'react'
import { Blocks, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { generateId } from '@utils/uuid'
import {
  usePersonas,
  usePersonaOntology,
  useAddEntityToPersona,
  useUpdateEntityInPersona,
  useDeleteEntityFromPersona,
} from '@store/queries'
import { EntityType, GlossItem } from '@models/types'
import BaseTypeEditor from '@components/shared/BaseTypeEditor'

interface EntityTypeEditorProps {
  open: boolean
  onClose: () => void
  entity: EntityType | null
  personaId: string | null
}

export default function EntityTypeEditor({ open, onClose, entity, personaId }: EntityTypeEditorProps) {
  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const { mutateAsync: addEntity } = useAddEntityToPersona()
  const { mutateAsync: updateEntity } = useUpdateEntityInPersona()
  const { mutate: deleteEntity } = useDeleteEntityFromPersona()

  // Form state
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [examples, setExamples] = useState<string[]>([])
  const [mode, setMode] = useState<'manual' | 'copy' | 'wikidata'>('manual')
  const [sourcePersonaId, setSourcePersonaIdState] = useState('')

  // Fetch source persona's ontology when copying
  const { data: sourceOntology } = usePersonaOntology(sourcePersonaId || null)

  const setSourcePersonaId = (id: string) => {
    setSourcePersonaIdState(id)
  }
  const [sourceEntityId, setSourceEntityId] = useState('')
  const [targetPersonaIds, setTargetPersonaIds] = useState<string[]>([personaId || ''])
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedAt, setImportedAt] = useState<string>('')
  const [exampleInput, setExampleInput] = useState('')

  useEffect(() => {
    if (entity) {
      setName(entity.name)
      setGloss(entity.gloss)
      setExamples(entity.examples || [])
      setMode('manual')
      // When editing, always use the current persona only
      setTargetPersonaIds([personaId || ''])
      setWikidataId(entity.wikidataId || '')
      setWikidataUrl(entity.wikidataUrl || '')
      setImportedAt(entity.importedAt || '')
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setExamples([])
      setMode('manual')
      setSourcePersonaId('')
      setSourceEntityId('')
      setTargetPersonaIds([personaId || ''])
      setWikidataId('')
      setWikidataUrl('')
      setImportedAt('')
    }
    // targetPersonaIds is intentionally NOT a dependency: this effect
    // initialises the form when the dialog opens for a new (or different)
    // entity/persona, and re-running it every time the user toggles a
    // target-persona checkbox wipes their in-progress name / gloss / examples.
  }, [entity, personaId])

  useEffect(() => {
    // When copying from another persona, populate the fields
    if (mode === 'copy' && sourcePersonaId && sourceEntityId && sourceOntology) {
      const sourceEntity = sourceOntology.entities.find(e => e.id === sourceEntityId)
      if (sourceEntity) {
        setName(sourceEntity.name)
        setGloss(sourceEntity.gloss)
        setExamples(sourceEntity.examples || [])
        setWikidataId(sourceEntity.wikidataId || '')
        setWikidataUrl(sourceEntity.wikidataUrl || '')
        setImportedAt(sourceEntity.importedAt || '')
      }
    }
  }, [mode, sourcePersonaId, sourceEntityId, sourceOntology])

  const handleSave = async () => {
    const now = new Date().toISOString()

    // If editing existing, update it
    if (entity) {
      const entityData: EntityType = {
        ...entity,
        name,
        gloss,
        examples,
        wikidataId: wikidataId || undefined,
        wikidataUrl: wikidataUrl || undefined,
        importedAt: wikidataId ? (importedAt || now) : undefined,
        updatedAt: now,
      }

      if (personaId) {
        await updateEntity({ personaId, entity: entityData })
      }
    } else {
      // Creating new entity types for selected personas
      // Generate a shared ID if creating for multiple personas
      const sharedTypeId = targetPersonaIds.length > 1 ? generateId() : undefined

      await Promise.all(targetPersonaIds.map(async (targetId) => {
        const entityData: EntityType = {
          id: generateId(),
          sharedTypeId,
          name,
          gloss,
          examples,
          wikidataId: wikidataId || undefined,
          wikidataUrl: wikidataUrl || undefined,
          importedFrom: mode === 'wikidata' ? 'wikidata' : mode === 'copy' ? 'persona' : undefined,
          importedAt: wikidataId ? now : undefined,
          createdAt: now,
          updatedAt: now,
        }

        await addEntity({ personaId: targetId, entity: entityData })
      }))
    }

    onClose()
  }

  const handleDelete = () => {
    if (entity && personaId) {
      deleteEntity({ personaId, entityId: entity.id })
      onClose()
    }
  }

  const handleAddExample = () => {
    if (exampleInput.trim()) {
      setExamples([...examples, exampleInput.trim()])
      setExampleInput('')
    }
  }

  const handleRemoveExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index))
  }

  // Additional fields for entity types
  const additionalFields = (
    <div>
      <p className="text-sm font-medium mb-2">Examples</p>
      <div className="flex gap-2 mb-2">
        <Input
          placeholder="Add example..."
          value={exampleInput}
          onChange={(e) => setExampleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddExample()
            }
          }}
          className="flex-1"
          aria-label="Add example"
        />
        <Button variant="ghost" size="icon" onClick={handleAddExample} aria-label="Add example">
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex gap-1 flex-wrap">
        {examples.map((example, index) => (
          <Badge key={index} variant="secondary" className="gap-1">
            {example}
            <button onClick={() => handleRemoveExample(index)} className="ml-1 hover:text-destructive">
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  )

  // Source selector for copy mode
  const sourceSelector = mode === 'copy' && (
    <>
      <div className="mb-4">
        <Label className="mb-2">Source Persona</Label>
        <Select
          value={sourcePersonaId}
          onValueChange={(val) => {
            if (!val) return
            setSourcePersonaId(val)
            setSourceEntityId('')
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select source persona">
              {sourcePersonaId
                ? personas.find((persona) => persona.id === sourcePersonaId)?.name ?? null
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {personas.filter(p => p.id !== personaId).map(persona => (
              <SelectItem key={persona.id} value={persona.id}>
                {persona.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sourcePersonaId && sourceOntology && (
        <div className="mb-4">
          <Label className="mb-2">Source Entity Type</Label>
          <Select
            value={sourceEntityId}
            onValueChange={(val) => val && setSourceEntityId(val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select source entity type">
                {sourceEntityId
                  ? sourceOntology.entities.find((entity) => entity.id === sourceEntityId)?.name ?? null
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sourceOntology.entities.map(entity => (
                <SelectItem key={entity.id} value={entity.id}>
                  {entity.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  )

  return (
    <BaseTypeEditor
      open={open}
      onClose={onClose}
      typeCategory="entity"
      personaId={personaId}
      name={name}
      setName={setName}
      gloss={gloss}
      setGloss={setGloss}
      mode={mode}
      setMode={setMode}
      sourcePersonaId={sourcePersonaId}
      setSourcePersonaId={setSourcePersonaId}
      targetPersonaIds={targetPersonaIds}
      setTargetPersonaIds={setTargetPersonaIds}
      wikidataId={wikidataId}
      wikidataUrl={wikidataUrl}
      importedAt={importedAt}
      onSave={handleSave}
      onDelete={entity ? handleDelete : undefined}
      title={entity ? 'Edit Entity Type' : 'Create Entity Type'}
      icon={<Blocks className="size-5" />}
      additionalFields={additionalFields}
      sourceSelector={sourceSelector}
      isEditing={!!entity}
      availablePersonas={personas}
    />
  )
}
