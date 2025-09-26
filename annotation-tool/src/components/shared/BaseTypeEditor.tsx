import { ReactNode } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Typography,
  Divider,
  Alert,
} from '@mui/material'
import { Category as TypeIcon } from '@mui/icons-material'
import { GlossItem } from '../../models/types'
import GlossEditor from '../GlossEditor'
import WikidataSearch from '../WikidataSearch'
import ModeSelector from './ModeSelector'
import { WikidataChip } from './WikidataChip'
import { TypeObjectBadge } from './TypeObjectToggle'

export interface BaseTypeEditorProps {
  // Required props
  open: boolean
  onClose: () => void
  typeCategory: 'entity' | 'role' | 'event' | 'relation'
  personaId: string | null
  
  // Form state
  name: string
  setName: (name: string) => void
  gloss: GlossItem[]
  setGloss: (gloss: GlossItem[]) => void
  mode: 'manual' | 'copy' | 'wikidata'
  setMode: (mode: 'manual' | 'copy' | 'wikidata') => void
  
  // Import state
  sourcePersonaId: string
  setSourcePersonaId?: (id: string) => void
  targetPersonaIds: string[]
  setTargetPersonaIds: (ids: string[]) => void
  
  // Wikidata state
  wikidataId?: string
  wikidataUrl?: string
  importedAt?: string
  onWikidataSelect?: (item: any) => void
  
  // Actions
  onSave: () => void
  onDelete?: () => void
  
  // Customization
  title?: string
  icon?: ReactNode
  additionalFields?: ReactNode
  sourceSelector?: ReactNode
  validationErrors?: string[]
  isEditing?: boolean
  availablePersonas?: Array<{ id: string; name: string }>
}

export default function BaseTypeEditor({
  open,
  onClose,
  typeCategory,
  personaId,
  name,
  setName,
  gloss,
  setGloss,
  mode,
  setMode,
  sourcePersonaId,
  targetPersonaIds,
  setTargetPersonaIds,
  wikidataId,
  wikidataUrl,
  importedAt,
  onWikidataSelect,
  onSave,
  onDelete,
  title,
  icon = <TypeIcon />,
  additionalFields,
  sourceSelector,
  validationErrors = [],
  isEditing = false,
  availablePersonas = [],
}: BaseTypeEditorProps) {
  const handlePersonaToggle = (personaId: string) => {
    setTargetPersonaIds(
      targetPersonaIds.includes(personaId)
        ? targetPersonaIds.filter(id => id !== personaId)
        : [...targetPersonaIds, personaId]
    )
  }
  
  const isValid = name.trim() && gloss.some(g => g.content.trim()) && 
    (mode !== 'copy' || sourcePersonaId) &&
    targetPersonaIds.length > 0
  
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { minHeight: '60vh' } }}
    >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {icon}
            <Typography variant="h6">{title || `${isEditing ? 'Edit' : 'Create'} ${typeCategory} Type`}</Typography>
            <TypeObjectBadge isType={true} />
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
            {/* Mode Selection */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>Creation Mode</Typography>
              <ModeSelector 
                mode={mode} 
                onChange={setMode}
                showCopy={!isEditing}
                disabled={isEditing}
              />
            </Box>
            
            {/* Wikidata Chip */}
            {wikidataId && wikidataUrl && (
              <Box>
                <WikidataChip 
                  wikidataId={wikidataId}
                  wikidataUrl={wikidataUrl}
                  importedAt={importedAt}
                />
              </Box>
            )}
            
            {/* Copy Mode Source Selection */}
            {mode === 'copy' && sourceSelector}
            
            {/* Manual/Edit Mode Fields */}
            {(mode === 'manual' || isEditing) && (
              <>
                <TextField
                  label="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth
                  required
                  autoFocus
                />
                
                <Box>
                  <Typography variant="subtitle2" gutterBottom>Description</Typography>
                  <GlossEditor
                    gloss={gloss}
                    onChange={setGloss}
                    personaId={personaId}
                  />
                </Box>
                
                {additionalFields}
              </>
            )}
            
            {/* Wikidata Import Mode */}
            {mode === 'wikidata' && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>Search Wikidata</Typography>
                <WikidataSearch
                  onImport={onWikidataSelect || (() => {})}
                  entityType="type"
                />
              </Box>
            )}
            
            {/* Target Persona Selection */}
            {!isEditing && availablePersonas.length > 1 && (
              <>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Add to Personas
                  </Typography>
                  <FormGroup>
                    {availablePersonas.map(persona => (
                      <FormControlLabel
                        key={persona.id}
                        control={
                          <Checkbox
                            checked={targetPersonaIds.includes(persona.id)}
                            onChange={() => handlePersonaToggle(persona.id)}
                          />
                        }
                        label={persona.name}
                      />
                    ))}
                  </FormGroup>
                </Box>
              </>
            )}
            
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <Alert severity="error">
                {validationErrors.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </Alert>
            )}
          </Box>
        </DialogContent>
        
        <DialogActions>
          {isEditing && onDelete && (
            <Button onClick={onDelete} color="error" sx={{ mr: 'auto' }}>
              Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button 
            onClick={onSave}
            variant="contained"
            disabled={!isValid}
          >
            {isEditing ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
  )
}