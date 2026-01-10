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
import WikidataImportFlow from './WikidataImportFlow'
import ModeSelector from './ModeSelector'
import { WikidataChip } from './WikidataChip'
import { TypeObjectBadge } from './TypeObjectToggle'
import { ImportType } from '../../hooks/useWikidataImport'

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
  wikibaseId?: string
  importedAt?: string
  /** @deprecated No longer used - WikidataImportFlow handles import directly */
  _onWikidataSelect?: (item: any) => void

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
  wikibaseId,
  importedAt,
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
            <Typography sx={{ fontSize: '1.25rem', fontWeight: 500 }}>{title || `${isEditing ? 'Edit' : 'Create'} ${typeCategory} Type`}</Typography>
            <TypeObjectBadge isType={true} />
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
            {/* Mode Selection */}
            <Box>
              <Typography variant="subtitle2" component="div" gutterBottom>Creation Mode</Typography>
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
                  wikibaseId={wikibaseId}
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
                  <Typography variant="subtitle2" component="div" gutterBottom>Description</Typography>
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
                <WikidataImportFlow
                  type={`${typeCategory}-type` as ImportType}
                  personaId={personaId || undefined}
                  entityType="type"
                  onSuccess={() => onClose()}
                  onCancel={onClose}
                />
              </Box>
            )}
            
            {/* Target Persona Selection */}
            {!isEditing && availablePersonas.length > 1 && (
              <>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" component="div" gutterBottom>
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