import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Alert,
  Chip,
  Grid,
} from '@mui/material'
import { generateId } from '../utils/uuid'
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  ArrowForward as ArrowIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import { addRelation, deleteRelation } from '../store/personaSlice'
import { OntologyRelation } from '../models/types'

interface RelationManagerProps {
  open: boolean
  onClose: () => void
  personaId: string | null
}

export default function RelationManager({ open, onClose, personaId }: RelationManagerProps) {
  const dispatch = useDispatch<AppDispatch>()
  const ontology = useSelector((state: RootState) => 
    state.persona.personaOntologies.find(o => o.personaId === personaId)
  )
  
  const [relationTypeId, setRelationTypeId] = useState<string>('')
  const [sourceType, setSourceType] = useState<'entity' | 'role' | 'event' | 'time'>('entity')
  const [sourceId, setSourceId] = useState<string>('')
  const [targetType, setTargetType] = useState<'entity' | 'role' | 'event' | 'time'>('entity')
  const [targetId, setTargetId] = useState<string>('')

  if (!ontology) return null

  const selectedRelationType = ontology.relationTypes.find(rt => rt.id === relationTypeId)

  const getSourceOptions = () => {
    switch (sourceType) {
      case 'entity':
        return ontology.entities
      case 'role':
        return ontology.roles
      case 'event':
        return ontology.events
      default:
        return []
    }
  }

  const getTargetOptions = () => {
    switch (targetType) {
      case 'entity':
        return ontology.entities
      case 'role':
        return ontology.roles
      case 'event':
        return ontology.events
      default:
        return []
    }
  }

  const handleAddRelation = () => {
    if (!personaId || !relationTypeId || !sourceId || !targetId) return

    const newRelation: OntologyRelation = {
      id: generateId(),
      relationTypeId,
      sourceType,
      sourceId,
      targetType,
      targetId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    dispatch(addRelation({ personaId, relation: newRelation }))

    // Reset form
    setSourceId('')
    setTargetId('')
  }

  const handleDeleteRelation = (relationId: string) => {
    if (!personaId) return
    if (window.confirm('Delete this relation?')) {
      dispatch(deleteRelation({ personaId, relationId }))
    }
  }

  const getItemName = (type: 'entity' | 'role' | 'event' | 'time', itemId: string) => {
    switch (type) {
      case 'entity':
        return ontology.entities.find(e => e.id === itemId)?.name || 'Unknown'
      case 'role':
        return ontology.roles.find(r => r.id === itemId)?.name || 'Unknown'
      case 'event':
        return ontology.events.find(e => e.id === itemId)?.name || 'Unknown'
      case 'time':
        // Time relations not yet implemented in UI
        return 'Time (ID: ' + itemId + ')'
      default:
        return 'Unknown'
    }
  }

  const filteredRelations = relationTypeId 
    ? ontology.relations.filter(r => r.relationTypeId === relationTypeId)
    : ontology.relations

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Manage Relations</DialogTitle>
      <DialogContent>
        {ontology.relationTypes.length === 0 ? (
          <Alert severity="info">
            No relation types defined yet. Create relation types first to establish relationships between ontology elements.
          </Alert>
        ) : (
          <Grid container spacing={3}>
            <Grid item xs={12} md={5}>
              <Typography variant="h6" gutterBottom>
                Create New Relation
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Relation Type</InputLabel>
                  <Select
                    value={relationTypeId}
                    onChange={(e) => {
                      setRelationTypeId(e.target.value)
                      const rt = ontology.relationTypes.find(r => r.id === e.target.value)
                      if (rt) {
                        setSourceType(rt.sourceTypes[0] || 'entity')
                        setTargetType(rt.targetTypes[0] || 'entity')
                      }
                    }}
                    label="Relation Type"
                  >
                    {ontology.relationTypes.map(rt => (
                      <MenuItem key={rt.id} value={rt.id}>
                        <Box>
                          <Typography>{rt.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {rt.sourceTypes.join('/')} → {rt.targetTypes.join('/')}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {selectedRelationType && (
                  <>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <FormControl size="small">
                        <InputLabel>Source Type</InputLabel>
                        <Select
                          value={sourceType}
                          onChange={(e) => {
                            setSourceType(e.target.value as 'entity' | 'role' | 'event')
                            setSourceId('')
                          }}
                          label="Source Type"
                          disabled={selectedRelationType.sourceTypes.length === 1}
                        >
                          {selectedRelationType.sourceTypes.map(type => (
                            <MenuItem key={type} value={type}>
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl fullWidth>
                        <InputLabel>Source</InputLabel>
                        <Select
                          value={sourceId}
                          onChange={(e) => setSourceId(e.target.value)}
                          label="Source"
                        >
                          {getSourceOptions().map(item => (
                            <MenuItem key={item.id} value={item.id}>
                              {item.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                      <ArrowIcon color="action" />
                    </Box>

                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <FormControl size="small">
                        <InputLabel>Target Type</InputLabel>
                        <Select
                          value={targetType}
                          onChange={(e) => {
                            setTargetType(e.target.value as 'entity' | 'role' | 'event')
                            setTargetId('')
                          }}
                          label="Target Type"
                          disabled={selectedRelationType.targetTypes.length === 1}
                        >
                          {selectedRelationType.targetTypes.map(type => (
                            <MenuItem key={type} value={type}>
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl fullWidth>
                        <InputLabel>Target</InputLabel>
                        <Select
                          value={targetId}
                          onChange={(e) => setTargetId(e.target.value)}
                          label="Target"
                        >
                          {getTargetOptions().map(item => (
                            <MenuItem key={item.id} value={item.id}>
                              {item.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>

                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleAddRelation}
                      disabled={!sourceId || !targetId}
                    >
                      Add Relation
                    </Button>

                    {selectedRelationType.symmetric && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        This is a symmetric relation: if A relates to B, then B also relates to A
                      </Alert>
                    )}
                    {selectedRelationType.transitive && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        This is a transitive relation: if A→B and B→C, then A→C is implied
                      </Alert>
                    )}
                  </>
                )}
              </Box>
            </Grid>

            <Grid item xs={12} md={7}>
              <Typography variant="h6" gutterBottom>
                Existing Relations ({filteredRelations.length})
              </Typography>
              
              <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                {filteredRelations.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                    No relations defined yet
                  </Typography>
                ) : (
                  filteredRelations.map(relation => {
                    const relationType = ontology.relationTypes.find(rt => rt.id === relation.relationTypeId)
                    return (
                      <React.Fragment key={relation.id}>
                        <ListItem>
                          <ListItemText
                            primary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Chip
                                  label={getItemName(relation.sourceType, relation.sourceId)}
                                  size="small"
                                  color="primary"
                                />
                                <Typography variant="body2" color="text.secondary">
                                  {relationType?.name || 'unknown'}
                                </Typography>
                                <ArrowIcon fontSize="small" color="action" />
                                <Chip
                                  label={getItemName(relation.targetType, relation.targetId)}
                                  size="small"
                                  color="secondary"
                                />
                              </Box>
                            }
                            secondary={
                              <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                <Chip label={relation.sourceType} size="small" variant="outlined" />
                                <Chip label={relation.targetType} size="small" variant="outlined" />
                              </Box>
                            }
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              edge="end"
                              onClick={() => handleDeleteRelation(relation.id)}
                              aria-label={`Delete relation from ${getItemName(relation.sourceType, relation.sourceId)} to ${getItemName(relation.targetType, relation.targetId)}`}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                        <Divider />
                      </React.Fragment>
                    )
                  })
                )}
              </List>
            </Grid>
          </Grid>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}