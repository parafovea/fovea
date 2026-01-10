import { ReactNode } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Divider,
  Alert,
  Fade,
  Chip,
} from '@mui/material'
import { Public as ObjectIcon } from '@mui/icons-material'
import { GlossItem } from '../../models/types'
import GlossEditor from '../GlossEditor'
import WikidataSearch from '../WikidataSearch'
import ModeSelector from './ModeSelector'
import { WikidataChip } from './WikidataChip'
import { TypeObjectBadge } from './TypeObjectToggle'

export interface BaseObjectEditorProps {
  // Required props
  open: boolean
  onClose: () => void
  objectType: 'entity' | 'event' | 'location' | 'time'
  personaId: string | null
  
  // Form state
  name: string
  setName: (name: string) => void
  description: GlossItem[]
  setDescription: (desc: GlossItem[]) => void
  mode: 'manual' | 'copy' | 'wikidata'
  setMode: (mode: 'manual' | 'copy' | 'wikidata') => void
  
  // Metadata
  metadata?: Record<string, any>
  setMetadata?: (metadata: Record<string, any>) => void
  
  // Wikidata state
  wikidataId?: string
  wikidataUrl?: string
  wikibaseId?: string
  importedFrom?: 'wikidata' | 'persona'
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
  showPersonaSpecific?: boolean
  personaSpecificContent?: ReactNode
}

export default function BaseObjectEditor({
  open,
  onClose,
  objectType,
  personaId,
  name,
  setName,
  description,
  setDescription,
  mode,
  setMode,
  metadata,
  setMetadata: _setMetadata,
  wikidataId,
  wikidataUrl,
  wikibaseId,
  importedFrom,
  importedAt,
  onWikidataSelect,
  onSave,
  onDelete,
  title,
  icon = <ObjectIcon />,
  additionalFields,
  sourceSelector,
  validationErrors = [],
  isEditing = false,
  showPersonaSpecific = false,
  personaSpecificContent,
}: BaseObjectEditorProps) {
  const isValid = name.trim() && description.some(d => d.content.trim())
  
  
  return (
    <Fade in={open}>
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
            <Typography variant="h6">
              {title || `${isEditing ? 'Edit' : 'Create'} ${objectType}`}
            </Typography>
            <TypeObjectBadge isType={false} />
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
            {/* Mode Selection */}
            {!isEditing && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>Creation Mode</Typography>
                <ModeSelector 
                  mode={mode} 
                  onChange={setMode}
                  showCopy={true}
                />
              </Box>
            )}
            
            {/* Wikidata Chip */}
            {wikidataId && wikidataUrl && (
              <Box>
                <WikidataChip
                  wikidataId={wikidataId}
                  wikidataUrl={wikidataUrl}
                  wikibaseId={wikibaseId}
                  importedAt={importedAt}
                />
                {importedFrom === 'wikidata' && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    This {objectType} was imported from Wikidata. You can edit the fields below while preserving the Wikidata reference.
                  </Alert>
                )}
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
                    gloss={description}
                    onChange={setDescription}
                    personaId={personaId}
                  />
                </Box>
                
                {/* Additional type-specific fields */}
                {additionalFields}
                
                {/* Metadata section */}
                {metadata && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>Metadata</Typography>
                      
                      {/* Alternative Names */}
                      {metadata.alternateNames && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="caption" color="text.secondary">
                            Alternative Names
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {metadata.alternateNames.map((altName: string, idx: number) => (
                              <Chip key={idx} label={altName} size="small" />
                            ))}
                          </Box>
                        </Box>
                      )}
                      
                      {/* External IDs */}
                      {metadata.externalIds && Object.keys(metadata.externalIds).length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="caption" color="text.secondary">
                            External IDs
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {Object.entries(metadata.externalIds).map(([key, value]) => (
                              <Chip 
                                key={key} 
                                label={`${key}: ${value}`} 
                                size="small"
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                      
                      {/* Certainty */}
                      {metadata.certainty !== undefined && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="caption" color="text.secondary">
                            Certainty: {(metadata.certainty * 100).toFixed(0)}%
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </>
                )}
                
                {/* Persona-specific content (for entities and events) */}
                {showPersonaSpecific && personaSpecificContent && (
                  <>
                    <Divider />
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Persona-Specific Interpretations
                      </Typography>
                      {personaSpecificContent}
                    </Box>
                  </>
                )}
              </>
            )}
            
            {/* Wikidata Import Mode */}
            {mode === 'wikidata' && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Search Wikidata for {objectType}
                </Typography>
                <WikidataSearch
                  onImport={onWikidataSelect || (() => {})}
                  entityType="object"
                />
                <Alert severity="info" sx={{ mt: 2 }}>
                  Importing from Wikidata will populate the {objectType}'s name and description automatically.
                  The Wikidata reference will be preserved for data provenance.
                </Alert>
              </Box>
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
    </Fade>
  )
}