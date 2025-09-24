import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Typography,
  Divider,
  Chip,
} from '@mui/material'
import { AppDispatch, RootState } from '../store/store'
import { generateId } from '../utils/uuid'
import { addEntityToPersona, updateEntityInPersona } from '../store/personaSlice'
import { EntityType, GlossItem } from '../models/types'
import GlossEditor from './GlossEditor'
import WikidataSearch from './WikidataSearch'

interface EntityTypeEditorProps {
  open: boolean
  onClose: () => void
  entity: EntityType | null
  personaId: string | null
}

export default function EntityTypeEditor({ open, onClose, entity, personaId }: EntityTypeEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [examples, setExamples] = useState<string[]>([])
  const [mode, setMode] = useState<'new' | 'copy' | 'wikidata'>('new')
  const [sourcePersonaId, setSourcePersonaId] = useState('')
  const [sourceEntityId, setSourceEntityId] = useState('')
  const [targetPersonaIds, setTargetPersonaIds] = useState<string[]>([personaId || ''])
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')

  useEffect(() => {
    if (entity) {
      setName(entity.name)
      setGloss(entity.gloss)
      setExamples(entity.examples || [])
      setMode('new')
      setTargetPersonaIds([personaId || ''])
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setExamples([])
      setMode('new')
      setSourcePersonaId('')
      setSourceEntityId('')
      setTargetPersonaIds([personaId || ''])
    }
  }, [entity, personaId])

  useEffect(() => {
    // When copying from another persona, populate the fields
    if (mode === 'copy' && sourcePersonaId && sourceEntityId) {
      const sourceOntology = personaOntologies.find(o => o.personaId === sourcePersonaId)
      const sourceEntity = sourceOntology?.entities.find(e => e.id === sourceEntityId)
      if (sourceEntity) {
        setName(sourceEntity.name)
        setGloss(sourceEntity.gloss)
        setExamples(sourceEntity.examples || [])
      }
    }
  }, [mode, sourcePersonaId, sourceEntityId, personaOntologies])

  const handleSave = () => {
    const now = new Date().toISOString()
    
    // If editing existing, update it and optionally copy to other personas
    if (entity) {
      const entityData: EntityType = {
        ...entity,
        name,
        gloss,
        examples,
        updatedAt: now,
      }
      
      // Update in original persona
      if (personaId) {
        dispatch(updateEntityInPersona({ personaId, entity: entityData }))
      }
      
      // Copy to additional personas if selected
      targetPersonaIds.forEach(targetId => {
        if (targetId && targetId !== personaId) {
          const newEntity: EntityType = {
            id: generateId(),
            name,
            gloss,
            examples,
            createdAt: now,
            updatedAt: now,
          }
          dispatch(addEntityToPersona({ personaId: targetId, entity: newEntity }))
        }
      })
    } else {
      // Adding new - add to all selected personas
      targetPersonaIds.forEach(targetId => {
        if (targetId) {
          const entityData: EntityType = {
            id: generateId(),
            name,
            gloss,
            examples,
            createdAt: now,
            updatedAt: now,
          }
          dispatch(addEntityToPersona({ personaId: targetId, entity: entityData }))
        }
      })
    }

    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{entity ? 'Edit Entity Type' : 'Add Entity Type'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {!entity && (
            <>
              <FormControl fullWidth>
                <InputLabel>Mode</InputLabel>
                <Select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as 'new' | 'copy' | 'wikidata')}
                  label="Mode"
                >
                  <MenuItem value="new">Create New Type</MenuItem>
                  <MenuItem value="copy">Copy from Existing Type</MenuItem>
                  <MenuItem value="wikidata">Import from Wikidata</MenuItem>
                </Select>
              </FormControl>
              
              {mode === 'copy' && (
                <>
                  <FormControl fullWidth>
                    <InputLabel>Source Persona</InputLabel>
                    <Select
                      value={sourcePersonaId}
                      onChange={(e) => {
                        setSourcePersonaId(e.target.value)
                        setSourceEntityId('')
                      }}
                      label="Source Persona"
                    >
                      {personas.map(p => (
                        <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  
                  {sourcePersonaId && (
                    <FormControl fullWidth>
                      <InputLabel>Entity Type to Copy</InputLabel>
                      <Select
                        value={sourceEntityId}
                        onChange={(e) => setSourceEntityId(e.target.value)}
                        label="Entity Type to Copy"
                      >
                        {personaOntologies
                          .find(o => o.personaId === sourcePersonaId)
                          ?.entities.map(e => (
                            <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>
                          ))}
                      </Select>
                    </FormControl>
                  )}
                </>
              )}
              
              {mode === 'wikidata' && (
                <WikidataSearch
                  entityType="type"
                  onImport={(data) => {
                    setName(data.name)
                    setGloss([{ type: 'text', content: data.description || `A type of ${data.name} from Wikidata.` }])
                    setWikidataId(data.wikidataId)
                    setWikidataUrl(data.wikidataUrl)
                    if (data.aliases) {
                      setExamples(data.aliases)
                    }
                  }}
                />
              )}
            </>
          )}
          
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            disabled={(mode === 'copy' && !sourceEntityId) || (mode === 'wikidata' && !name)}
          />
          <GlossEditor
            gloss={gloss}
            onChange={setGloss}
            personaId={personaId}
            disabled={(mode === 'copy' && !sourceEntityId) || (mode === 'wikidata' && !name)}
          />
          <TextField
            label="Examples (comma-separated)"
            value={examples.join(', ')}
            onChange={(e) => setExamples(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            fullWidth
            multiline
            rows={2}
            helperText="Optional: Provide example instances of this entity type"
            disabled={(mode === 'copy' && !sourceEntityId) || (mode === 'wikidata' && !name)}
          />
          
          {wikidataId && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip 
                label={`Wikidata: ${wikidataId}`}
                size="small"
                color="primary"
                variant="outlined"
                component="a"
                href={wikidataUrl}
                target="_blank"
                clickable
              />
              <Typography variant="caption" color="text.secondary">
                Imported from Wikidata
              </Typography>
            </Box>
          )}
          
          <Divider />
          
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              {entity ? 'Copy to Other Personas' : 'Add to Personas'}
            </Typography>
            <FormGroup row>
              {personas.map(persona => (
                <FormControlLabel
                  key={persona.id}
                  control={
                    <Checkbox
                      checked={targetPersonaIds.includes(persona.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTargetPersonaIds([...targetPersonaIds, persona.id])
                        } else {
                          setTargetPersonaIds(targetPersonaIds.filter(id => id !== persona.id))
                        }
                      }}
                      disabled={entity && persona.id === personaId}
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {persona.name}
                      {entity && persona.id === personaId && (
                        <Chip label="current" size="small" color="primary" />
                      )}
                    </Box>
                  }
                />
              ))}
            </FormGroup>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" disabled={!name || gloss.length === 0}>
          {entity ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}