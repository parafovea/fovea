import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Box,
  FormControlLabel,
  Checkbox,
  FormGroup,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  IconButton,
} from '@mui/material'
import { 
  GroupWork as RoleIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { AppDispatch, RootState } from '../store/store'
import { generateId } from '../utils/uuid'
import { addRoleToPersona, updateRoleInPersona, deleteRoleFromPersona } from '../store/personaSlice'
import { RoleType, GlossItem } from '../models/types'
import BaseTypeEditor from './shared/BaseTypeEditor'

interface RoleEditorProps {
  open: boolean
  onClose: () => void
  role: RoleType | null
  personaId: string | null
}

export default function RoleEditor({ open, onClose, role, personaId }: RoleEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  
  // Form state
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [allowedFillerTypes, setAllowedFillerTypes] = useState<('entity' | 'event')[]>(['entity'])
  const [examples, setExamples] = useState<string[]>([])
  const [mode, setMode] = useState<'manual' | 'copy' | 'wikidata'>('manual')
  const [sourcePersonaId, setSourcePersonaId] = useState('')
  const [sourceRoleId, setSourceRoleId] = useState('')
  const [targetPersonaIds, setTargetPersonaIds] = useState<string[]>([personaId || ''])
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedAt, setImportedAt] = useState<string>('')
  const [exampleInput, setExampleInput] = useState('')

  useEffect(() => {
    if (role) {
      setName(role.name)
      setGloss(role.gloss)
      setAllowedFillerTypes(role.allowedFillerTypes)
      setExamples(role.examples || [])
      setWikidataId(role.wikidataId || '')
      setWikidataUrl(role.wikidataUrl || '')
      setImportedAt(role.importedAt || '')
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setAllowedFillerTypes(['entity'])
      setExamples([])
      setMode('manual')
      setSourcePersonaId('')
      setSourceRoleId('')
      setWikidataId('')
      setWikidataUrl('')
      setImportedAt('')
    }
  }, [role])

  useEffect(() => {
    // When copying from another persona, populate the fields
    if (mode === 'copy' && sourcePersonaId && sourceRoleId) {
      const sourceOntology = personaOntologies.find(o => o.personaId === sourcePersonaId)
      const sourceRole = sourceOntology?.roles.find(r => r.id === sourceRoleId)
      if (sourceRole) {
        setName(sourceRole.name)
        setGloss(sourceRole.gloss)
        setAllowedFillerTypes(sourceRole.allowedFillerTypes)
        setExamples(sourceRole.examples || [])
        setWikidataId(sourceRole.wikidataId || '')
        setWikidataUrl(sourceRole.wikidataUrl || '')
        setImportedAt(sourceRole.importedAt || '')
      }
    }
  }, [mode, sourcePersonaId, sourceRoleId, personaOntologies])

  const handleSave = () => {
    if (!personaId) return
    
    const now = new Date().toISOString()
    const roleData: RoleType = {
      id: role?.id || generateId(),
      name,
      gloss,
      allowedFillerTypes,
      examples,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
      importedFrom: mode === 'wikidata' ? 'wikidata' : mode === 'copy' ? 'persona' : undefined,
      importedAt: wikidataId ? (importedAt || now) : undefined,
      createdAt: role?.createdAt || now,
      updatedAt: now,
    }
    
    if (role) {
      dispatch(updateRoleInPersona({ personaId, role: roleData }))
    } else {
      targetPersonaIds.forEach(targetId => {
        const newRoleData = { ...roleData, id: generateId() }
        dispatch(addRoleToPersona({ personaId: targetId, role: newRoleData }))
      })
    }
    
    onClose()
  }

  const handleDelete = () => {
    if (role && personaId) {
      dispatch(deleteRoleFromPersona({ personaId, roleId: role.id }))
      onClose()
    }
  }

  const handleToggleFillerType = (type: 'entity' | 'event') => {
    if (allowedFillerTypes.includes(type)) {
      setAllowedFillerTypes(allowedFillerTypes.filter(t => t !== type))
    } else {
      setAllowedFillerTypes([...allowedFillerTypes, type])
    }
  }

  const handleWikidataSelect = (data: any) => {
    setName(data.name)
    setGloss([{ type: 'text', content: data.description }])
    setWikidataId(data.wikidataId)
    setWikidataUrl(data.wikidataUrl)
    setImportedAt(new Date().toISOString())
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

  // Additional fields for role types
  const additionalFields = (
    <Box>
      <Typography variant="subtitle2" gutterBottom>Allowed Filler Types</Typography>
      <FormGroup row>
        <FormControlLabel
          control={
            <Checkbox
              checked={allowedFillerTypes.includes('entity')}
              onChange={() => handleToggleFillerType('entity')}
            />
          }
          label="Entities"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={allowedFillerTypes.includes('event')}
              onChange={() => handleToggleFillerType('event')}
            />
          }
          label="Events"
        />
      </FormGroup>

      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>Examples</Typography>
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
        />
        <IconButton onClick={handleAddExample} size="small">
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
            setSourceRoleId('')
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
      
      {sourcePersonaId && (
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Source Role Type</InputLabel>
          <Select
            value={sourceRoleId}
            onChange={(e) => setSourceRoleId(e.target.value)}
            label="Source Role Type"
          >
            {personaOntologies
              .find(o => o.personaId === sourcePersonaId)
              ?.roles.map(role => (
                <MenuItem key={role.id} value={role.id}>
                  {role.name}
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
      typeCategory="role"
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
      onWikidataSelect={handleWikidataSelect}
      onSave={handleSave}
      onDelete={role ? handleDelete : undefined}
      title={role ? 'Edit Role Type' : 'Create Role Type'}
      icon={<RoleIcon />}
      additionalFields={additionalFields}
      sourceSelector={sourceSelector}
      isEditing={!!role}
      availablePersonas={personas}
    />
  )
}