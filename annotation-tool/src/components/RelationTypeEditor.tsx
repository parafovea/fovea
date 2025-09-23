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
} from '@mui/material'
import { RootState, AppDispatch } from '../store/store'
import { addRelationType, updateRelationType } from '../store/personaSlice'
import { RelationType, GlossItem } from '../models/types'
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
  
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([])
  const [sourceTypes, setSourceTypes] = useState<('entity' | 'role' | 'event')[]>([])
  const [targetTypes, setTargetTypes] = useState<('entity' | 'role' | 'event')[]>([])
  const [symmetric, setSymmetric] = useState(false)
  const [transitive, setTransitive] = useState(false)
  const [examples, setExamples] = useState<string[]>([])
  const [exampleInput, setExampleInput] = useState('')

  useEffect(() => {
    if (relationType) {
      setName(relationType.name)
      setGloss(relationType.gloss)
      setSourceTypes(relationType.sourceTypes)
      setTargetTypes(relationType.targetTypes)
      setSymmetric(relationType.symmetric || false)
      setTransitive(relationType.transitive || false)
      setExamples(relationType.examples || [])
    } else {
      setName('')
      setGloss([])
      setSourceTypes(['entity'])
      setTargetTypes(['entity'])
      setSymmetric(false)
      setTransitive(false)
      setExamples([])
    }
    setExampleInput('')
  }, [relationType])

  const handleSave = () => {
    if (!personaId) return

    const relationTypeData: RelationType = {
      id: relationType?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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