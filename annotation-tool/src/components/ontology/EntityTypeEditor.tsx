import { useState, useEffect } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  IconButton,
  Typography,
} from '@mui/material'
import {
  Category as EntityTypeIcon,
  Add as AddIcon,
} from '@mui/icons-material'
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
      await Promise.all(targetPersonaIds.map(async (targetId) => {
        const entityData: EntityType = {
          id: generateId(),
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
    <Box>
      <Typography variant="subtitle2" component="div" gutterBottom>Examples</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <TextField
          size="small"
          placeholder="Add example..."
          value={exampleInput}
          onChange={(e) => setExampleInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddExample()
            }
          }}
          fullWidth
          aria-label="Add example"
        />
        <IconButton onClick={handleAddExample} size="small" aria-label="Add example">
          <AddIcon />
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {examples.map((example, index) => (
          <Chip
            key={index}
            label={example}
            onDelete={() => handleRemoveExample(index)}
            size="small"
          />
        ))}
      </Box>
    </Box>
  )

  // Source selector for copy mode
  const sourceSelector = mode === 'copy' && (
    <>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Source Persona</InputLabel>
        <Select
          value={sourcePersonaId}
          onChange={(e) => {
            setSourcePersonaId(e.target.value)
            setSourceEntityId('')
          }}
          label="Source Persona"
        >
          {personas.filter(p => p.id !== personaId).map(persona => (
            <MenuItem key={persona.id} value={persona.id}>
              {persona.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {sourcePersonaId && sourceOntology && (
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Source Entity Type</InputLabel>
          <Select
            value={sourceEntityId}
            onChange={(e) => setSourceEntityId(e.target.value)}
            label="Source Entity Type"
          >
            {sourceOntology.entities.map(entity => (
              <MenuItem key={entity.id} value={entity.id}>
                {entity.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
      icon={<EntityTypeIcon />}
      additionalFields={additionalFields}
      sourceSelector={sourceSelector}
      isEditing={!!entity}
      availablePersonas={personas}
    />
  )
}