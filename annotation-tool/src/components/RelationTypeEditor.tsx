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
  Typography,
  FormControlLabel,
  Checkbox,
  Chip,
  Stack,
  Tabs,
  Tab,
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
} from '@mui/material'
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  ArrowForward as ArrowIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../store/store'
import { generateId } from '../utils/uuid'
import { addRelationType, updateRelationType, addRelation, deleteRelation } from '../store/personaSlice'
import { RelationType, GlossItem, OntologyRelation } from '../models/types'
import GlossEditor from './GlossEditor'

interface RelationTypeEditorProps {
  open: boolean
  onClose: () => void
  relationType: RelationType | null
  personaId: string | null
}

export default function RelationTypeEditor({
  open,
  onClose,
  relationType,
  personaId,
}: RelationTypeEditorProps) {
  const dispatch = useDispatch<AppDispatch>()
  const ontology = useSelector((state: RootState) => 
    state.persona.personaOntologies.find(o => o.personaId === personaId)
  )
  
  const [tabValue, setTabValue] = useState(0)
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([])
  const [sourceTypes, setSourceTypes] = useState<('entity' | 'role' | 'event')[]>([])
  const [targetTypes, setTargetTypes] = useState<('entity' | 'role' | 'event')[]>([])
  const [symmetric, setSymmetric] = useState(false)
  const [transitive, setTransitive] = useState(false)
  const [examples, setExamples] = useState<string[]>([])
  const [exampleInput, setExampleInput] = useState('')
  
  // For creating relation instances
  const [sourceType, setSourceType] = useState<'entity' | 'role' | 'event'>('entity')
  const [sourceId, setSourceId] = useState<string>('')
  const [targetType, setTargetType] = useState<'entity' | 'role' | 'event'>('entity')
  const [targetId, setTargetId] = useState<string>('')

  useEffect(() => {
    if (relationType) {
      setName(relationType.name)
      setGloss(relationType.gloss)
      setSourceTypes(relationType.sourceTypes)
      setTargetTypes(relationType.targetTypes)
      setSymmetric(relationType.symmetric || false)
      setTransitive(relationType.transitive || false)
      setExamples(relationType.examples || [])
      setTabValue(0) // Start on definition tab when editing
    } else {
      setName('')
      setGloss([])
      setSourceTypes(['entity'])
      setTargetTypes(['entity'])
      setSymmetric(false)
      setTransitive(false)
      setExamples([])
      setTabValue(0)
    }
    setExampleInput('')
    setSourceId('')
    setTargetId('')
  }, [relationType])

  const handleSave = () => {
    if (!personaId) return

    const relationTypeData: RelationType = {
      id: relationType?.id || generateId(),
      name,
      gloss,
      sourceTypes,
      targetTypes,
      symmetric,
      transitive,
      examples,
      createdAt: relationType?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    if (relationType) {
      dispatch(updateRelationType({ personaId, relationType: relationTypeData }))
    } else {
      dispatch(addRelationType({ personaId, relationType: relationTypeData }))
    }

    onClose()
  }
  
  const getSourceOptions = () => {
    if (!ontology) return []
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
    if (!ontology) return []
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
  
  const handleAddRelationInstance = () => {
    if (!personaId || !relationType || !sourceId || !targetId) return

    const newRelation: OntologyRelation = {
      id: generateId(),
      relationTypeId: relationType.id,
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
  
  const handleDeleteRelationInstance = (relationId: string) => {
    if (!personaId) return
    dispatch(deleteRelation({ personaId, relationId }))
  }
  
  const getItemName = (type: 'entity' | 'role' | 'event', id: string) => {
    if (!ontology) return 'Unknown'
    switch (type) {
      case 'entity':
        return ontology.entities.find(e => e.id === id)?.name || 'Unknown'
      case 'role':
        return ontology.roles.find(r => r.id === id)?.name || 'Unknown'
      case 'event':
        return ontology.events.find(e => e.id === id)?.name || 'Unknown'
      default:
        return 'Unknown'
    }
  }
  
  // Get existing relation instances for this type
  const relationInstances = relationType 
    ? (ontology?.relations.filter(r => r.relationTypeId === relationType.id) || [])
    : []

  const toggleSourceType = (type: 'entity' | 'role' | 'event') => {
    if (sourceTypes.includes(type)) {
      setSourceTypes(sourceTypes.filter(t => t !== type))
    } else {
      setSourceTypes([...sourceTypes, type])
    }
  }

  const toggleTargetType = (type: 'entity' | 'role' | 'event') => {
    if (targetTypes.includes(type)) {
      setTargetTypes(targetTypes.filter(t => t !== type))
    } else {
      setTargetTypes([...targetTypes, type])
    }
  }

  const addExample = () => {
    if (exampleInput.trim()) {
      setExamples([...examples, exampleInput.trim()])
      setExampleInput('')
    }
  }

  const removeExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index))
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {relationType ? 'Edit Relation Type' : 'Create Relation Type'}
      </DialogTitle>
      <DialogContent>
        {relationType && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
              <Tab label="Definition" />
              <Tab label={`Instances (${relationInstances.length})`} />
            </Tabs>
          </Box>
        )}
        
        {(!relationType || tabValue === 0) && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            <TextField
              label="Relation Type Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
              helperText="e.g., 'subtype-of', 'part-of', 'causes', 'located-at'"
            />

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Source Types (can be)
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip
                  label="Entity"
                  color={sourceTypes.includes('entity') ? 'primary' : 'default'}
                  onClick={() => toggleSourceType('entity')}
                />
                <Chip
                  label="Role"
                  color={sourceTypes.includes('role') ? 'primary' : 'default'}
                  onClick={() => toggleSourceType('role')}
                />
                <Chip
                  label="Event"
                  color={sourceTypes.includes('event') ? 'primary' : 'default'}
                  onClick={() => toggleSourceType('event')}
                />
              </Stack>
            </Box>

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Target Types (can be)
              </Typography>
              <Stack direction="row" spacing={1}>
                <Chip
                  label="Entity"
                  color={targetTypes.includes('entity') ? 'primary' : 'default'}
                  onClick={() => toggleTargetType('entity')}
                />
                <Chip
                  label="Role"
                  color={targetTypes.includes('role') ? 'primary' : 'default'}
                  onClick={() => toggleTargetType('role')}
                />
                <Chip
                  label="Event"
                  color={targetTypes.includes('event') ? 'primary' : 'default'}
                  onClick={() => toggleTargetType('event')}
                />
              </Stack>
            </Box>

          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={symmetric}
                  onChange={(e) => setSymmetric(e.target.checked)}
                />
              }
              label="Symmetric (if A relates to B, then B relates to A)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={transitive}
                  onChange={(e) => setTransitive(e.target.checked)}
                />
              }
              label="Transitive (if A→B and B→C, then A→C)"
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Gloss (Definition)
            </Typography>
            <GlossEditor
              gloss={gloss}
              onChange={setGloss}
              availableTypes={['entity', 'role', 'event', 'relation']}
              personaId={personaId}
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Examples
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField
                value={exampleInput}
                onChange={(e) => setExampleInput(e.target.value)}
                placeholder="Enter an example usage"
                fullWidth
                size="small"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    addExample()
                  }
                }}
              />
              <Button onClick={addExample} size="small">
                Add
              </Button>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {examples.map((example, index) => (
                <Chip
                  key={index}
                  label={example}
                  onDelete={() => removeExample(index)}
                  size="small"
                />
              ))}
            </Stack>
          </Box>
          </Box>
        )}
        
        {relationType && tabValue === 1 && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              Create instances of the "{relationType.name}" relation between specific items in your ontology.
            </Alert>
            
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Source Type</InputLabel>
                <Select
                  value={sourceType}
                  onChange={(e) => {
                    setSourceType(e.target.value as 'entity' | 'role' | 'event')
                    setSourceId('')
                  }}
                  label="Source Type"
                >
                  {relationType.sourceTypes.map(type => (
                    <MenuItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <FormControl size="small" sx={{ flex: 1 }}>
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
              
              <ArrowIcon sx={{ alignSelf: 'center' }} />
              
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Target Type</InputLabel>
                <Select
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value as 'entity' | 'role' | 'event')
                    setTargetId('')
                  }}
                  label="Target Type"
                >
                  {relationType.targetTypes.map(type => (
                    <MenuItem key={type} value={type}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <FormControl size="small" sx={{ flex: 1 }}>
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
              
              <IconButton
                color="primary"
                onClick={handleAddRelationInstance}
                disabled={!sourceId || !targetId}
              >
                <AddIcon />
              </IconButton>
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Typography variant="subtitle2" gutterBottom>
              Existing Instances
            </Typography>
            
            {relationInstances.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No instances of this relation type yet.
              </Typography>
            ) : (
              <List>
                {relationInstances.map(relation => (
                  <ListItem key={relation.id}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip
                            label={relation.sourceType}
                            size="small"
                            variant="outlined"
                          />
                          <Typography variant="body2">
                            {getItemName(relation.sourceType, relation.sourceId)}
                          </Typography>
                          <ArrowIcon fontSize="small" />
                          <Typography variant="body2">
                            {getItemName(relation.targetType, relation.targetId)}
                          </Typography>
                          <Chip
                            label={relation.targetType}
                            size="small"
                            variant="outlined"
                          />
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        edge="end"
                        onClick={() => handleDeleteRelationInstance(relation.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={!name || sourceTypes.length === 0 || targetTypes.length === 0}
        >
          {relationType ? 'Save Changes' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}