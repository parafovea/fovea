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
  FormControlLabel,
  Checkbox,
  FormGroup,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
} from '@mui/material'
import { GroupWork as RoleIcon } from '@mui/icons-material'
import { AppDispatch, RootState } from '../store/store'
import { generateId } from '../utils/uuid'
import { addRoleToPersona, updateRoleInPersona } from '../store/personaSlice'
import { RoleType, GlossItem } from '../models/types'
import GlossEditor from './GlossEditor'
import ModeSelector from './shared/ModeSelector'
import { WikidataChip } from './shared/WikidataChip'
import { TypeObjectBadge } from './shared/TypeObjectToggle'
import WikidataSearch from './WikidataSearch'

interface RoleEditorProps {
  open: boolean
  onClose: () => void
  role: RoleType | null
  personaId: string | null
}

export default function RoleEditor({ open, onClose, role, personaId }: RoleEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [allowedFillerTypes, setAllowedFillerTypes] = useState<('entity' | 'event')[]>(['entity'])
  const [examples, setExamples] = useState<string[]>([])
  const [mode, setMode] = useState<'manual' | 'copy' | 'wikidata'>('manual')
  const [sourcePersonaId, setSourcePersonaId] = useState('')
  const [sourceRoleId, setSourceRoleId] = useState('')
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedAt, setImportedAt] = useState<string>('')

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
      importedFrom: wikidataId ? 'wikidata' : undefined,
      importedAt: importedAt || undefined,
      createdAt: role?.createdAt || now,
      updatedAt: now,
    }

    if (role) {
      dispatch(updateRoleInPersona({ personaId, role: roleData }))
    } else {
      dispatch(addRoleToPersona({ personaId, role: roleData }))
    }

    onClose()
  }

  const handleFillerTypeChange = (type: 'entity' | 'event', checked: boolean) => {
    if (checked) {
      setAllowedFillerTypes([...allowedFillerTypes, type])
    } else {
      setAllowedFillerTypes(allowedFillerTypes.filter(t => t !== type))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RoleIcon color="primary" />
          {role ? 'Edit Role Type' : 'Add Role Type'}
          <TypeObjectBadge isType={true} />
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {wikidataId && (
            <WikidataChip 
              wikidataId={wikidataId}
              wikidataUrl={wikidataUrl}
              importedAt={importedAt}
              showTimestamp={true}
            />
          )}
          
          {!role && (
            <>
              <ModeSelector 
                mode={mode} 
                onChange={(newMode) => setMode(newMode)}
                showCopy={true}
              />
              
              {mode === 'copy' && (
                <>
                  <FormControl fullWidth>
                    <InputLabel>Source Persona</InputLabel>
                    <Select
                      value={sourcePersonaId}
                      onChange={(e) => {
                        setSourcePersonaId(e.target.value)
                        setSourceRoleId('')
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
                      <InputLabel>Role Type to Copy</InputLabel>
                      <Select
                        value={sourceRoleId}
                        onChange={(e) => {
                          const selectedId = e.target.value
                          setSourceRoleId(selectedId)
                          const sourceOntology = personaOntologies.find(o => o.personaId === sourcePersonaId)
                          const sourceRole = sourceOntology?.roles.find(r => r.id === selectedId)
                          if (sourceRole) {
                            setName(sourceRole.name)
                            setGloss(sourceRole.gloss)
                            setAllowedFillerTypes(sourceRole.allowedFillerTypes)
                            setExamples(sourceRole.examples || [])
                          }
                        }}
                        label="Role Type to Copy"
                      >
                        {personaOntologies
                          .find(o => o.personaId === sourcePersonaId)
                          ?.roles.map(r => (
                            <MenuItem key={r.id} value={r.id}>{r.name}</MenuItem>
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
                    setGloss([{ type: 'text', content: data.description || `A role type from Wikidata.` }])
                    setWikidataId(data.wikidataId)
                    setWikidataUrl(data.wikidataUrl)
                    setImportedAt(new Date().toISOString())
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
            disabled={!role && ((mode === 'copy' && !sourceRoleId) || (mode === 'wikidata' && !name))}
          />
          
          <GlossEditor
            gloss={gloss}
            onChange={setGloss}
            personaId={personaId}
            disabled={!role && ((mode === 'copy' && !sourceRoleId) || (mode === 'wikidata' && !name))}
          />

          <Box>
            <Typography variant="subtitle1" gutterBottom>
              Allowed Filler Types
            </Typography>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={allowedFillerTypes.includes('entity')}
                    onChange={(e) => handleFillerTypeChange('entity', e.target.checked)}
                  />
                }
                label="Entity"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={allowedFillerTypes.includes('event')}
                    onChange={(e) => handleFillerTypeChange('event', e.target.checked)}
                  />
                }
                label="Event"
              />
            </FormGroup>
          </Box>

          <TextField
            label="Examples (comma-separated)"
            value={examples.join(', ')}
            onChange={(e) => setExamples(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            fullWidth
            multiline
            rows={2}
            helperText="Optional: Provide example uses of this role type"
            disabled={!role && ((mode === 'copy' && !sourceRoleId) || (mode === 'wikidata' && !name))}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          disabled={!name || gloss.length === 0 || allowedFillerTypes.length === 0}
        >
          {role ? 'Update' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}