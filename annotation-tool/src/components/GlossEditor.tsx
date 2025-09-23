import { useState } from 'react'
import { useSelector } from 'react-redux'
import {
  Box,
  TextField,
  IconButton,
  Chip,
  Autocomplete,
  Typography,
  Paper,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { RootState } from '../store/store'
import { GlossItem } from '../models/types'

interface GlossEditorProps {
  gloss: GlossItem[]
  onChange: (gloss: GlossItem[]) => void
  availableTypes?: ('entity' | 'role' | 'event' | 'relation')[]
  personaId?: string | null
}

export default function GlossEditor({ gloss, onChange, availableTypes, personaId }: GlossEditorProps) {
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  const activeOntology = personaOntologies.find(o => o.personaId === personaId)
  const [currentText, setCurrentText] = useState('')

  const allTypes = [
    ...((!availableTypes || availableTypes.includes('entity')) ? 
      (activeOntology?.entities.map(e => ({ id: e.id, name: e.name, type: 'entity', personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('role')) ? 
      (activeOntology?.roles.map(r => ({ id: r.id, name: r.name, type: 'role', personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('event')) ? 
      (activeOntology?.events.map(e => ({ id: e.id, name: e.name, type: 'event', personaId })) || []) : []),
    ...((!availableTypes || availableTypes.includes('relation')) ? 
      (activeOntology?.relationTypes.map(r => ({ id: r.id, name: r.name, type: 'relation', personaId })) || []) : []),
  ]

  const handleAddText = () => {
    if (currentText.trim()) {
      onChange([...gloss, { type: 'text', content: currentText.trim() }])
      setCurrentText('')
    }
  }

  const handleAddTypeRef = (typeRef: any) => {
    if (typeRef) {
      onChange([...gloss, { 
        type: 'typeRef', 
        content: typeRef.id,
        refType: typeRef.type as 'entity' | 'role' | 'event' | 'relation',
        refPersonaId: typeRef.personaId
      }])
    }
  }

  const handleRemoveItem = (index: number) => {
    onChange(gloss.filter((_, i) => i !== index))
  }

  const getTypeDisplay = (item: GlossItem) => {
    if (item.type === 'text') return item.content
    
    // Check current persona first
    let typeObj = allTypes.find(t => t.id === item.content)
    
    // If not found and has refPersonaId, check other personas
    if (!typeObj && item.refPersonaId && item.refPersonaId !== personaId) {
      const otherOntology = personaOntologies.find(o => o.personaId === item.refPersonaId)
      const otherPersona = personas.find(p => p.id === item.refPersonaId)
      if (otherOntology) {
        switch (item.refType) {
          case 'entity':
            typeObj = otherOntology.entities.find(e => e.id === item.content)
            break
          case 'role':
            typeObj = otherOntology.roles.find(r => r.id === item.content)
            break
          case 'event':
            typeObj = otherOntology.events.find(e => e.id === item.content)
            break
          case 'relation':
            typeObj = otherOntology.relationTypes.find(r => r.id === item.content)
            break
        }
        if (typeObj && otherPersona) {
          return `[${item.refType} from ${otherPersona.name}: ${typeObj.name}]`
        }
      }
    }
    
    return typeObj ? `[${item.refType}: ${typeObj.name}]` : `[${item.refType}: ${item.content}]`
  }

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Gloss Definition
      </Typography>
      
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, minHeight: 40 }}>
          {gloss.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No gloss items yet. Add text or type references below.
            </Typography>
          )}
          {gloss.map((item, index) => (
            <Chip
              key={index}
              label={getTypeDisplay(item)}
              color={item.type === 'typeRef' ? 'primary' : 'default'}
              variant={item.type === 'typeRef' ? 'filled' : 'outlined'}
              onDelete={() => handleRemoveItem(index)}
              deleteIcon={<DeleteIcon />}
            />
          ))}
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label="Add text"
          value={currentText}
          onChange={(e) => setCurrentText(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddText()
            }
          }}
          size="small"
          sx={{ flex: 1 }}
        />
        <IconButton onClick={handleAddText} color="primary">
          <AddIcon />
        </IconButton>
      </Box>

      <Box sx={{ mt: 2 }}>
        <Autocomplete
          options={allTypes}
          getOptionLabel={(option) => `${option.type}: ${option.name}`}
          groupBy={(option) => option.type}
          onChange={(e, value) => {
            if (value) {
              handleAddTypeRef(value)
            }
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Add type reference"
              size="small"
            />
          )}
          value={null}
        />
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        Build your gloss by combining text and references to other types. Text appears as regular chips, while type references appear as colored chips.
      </Typography>
    </Box>
  )
}