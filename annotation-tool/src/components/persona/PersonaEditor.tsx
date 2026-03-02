import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  CircularProgress,
  FormControl,
  Select,
  MenuItem,
  type SelectChangeEvent,
  Typography,
  Divider,
  Chip,
  Autocomplete,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
} from '@mui/material'
import { Delete as DeleteIcon } from '@mui/icons-material'
import { useCreatePersona, useUpdatePersona } from '@store/queries'
import { useMyProjects } from '@store/queries/useProjects'
import { useMyGroups } from '@store/queries/useGroups'
import { useUsers } from '@store/queries/admin/useUsers'
import { useProjectContextStore } from '@store/zustand/projectContextStore'
import { Persona, User } from '@models/types'

interface ShareEntry {
  type: 'user' | 'group'
  id: string
  label: string
  permission: 'read_only' | 'forkable'
}

interface PersonaEditorProps {
  open: boolean
  onClose: () => void
  persona: Persona | null
}

export default function PersonaEditor({ open, onClose, persona }: PersonaEditorProps) {
  const { mutateAsync: createPersonaMutation, isPending: isCreating } = useCreatePersona()
  const { mutateAsync: updatePersonaMutation, isPending: isUpdating } = useUpdatePersona()

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [informationNeed, setInformationNeed] = useState('')
  const [details, setDetails] = useState('')

  // Project assignment
  const { data: myProjects = [] } = useMyProjects()
  const activeProjectId = useProjectContextStore(state => state.activeProjectId)
  const [projectId, setProjectId] = useState<string>('')

  // Sharing
  const { data: allUsers = [] } = useUsers()
  const { data: myGroups = [] } = useMyGroups()
  const [shareWith, setShareWith] = useState<ShareEntry[]>([])
  const [sharingExpanded, setSharingExpanded] = useState(false)

  const isCreateMode = !persona
  const isSaving = isCreating || isUpdating

  // All required fields must be filled
  const isFormValid =
    name.trim().length > 0 &&
    role.trim().length > 0 &&
    informationNeed.trim().length > 0

  // Reset state when dialog opens/closes or persona changes
  useEffect(() => {
    if (open) {
      if (persona) {
        setName(persona.name)
        setRole(persona.role)
        setInformationNeed(persona.informationNeed)
        setDetails(persona.details || '')
        setProjectId('')
      } else {
        setName('')
        setRole('')
        setInformationNeed('')
        setDetails('')
        setProjectId(activeProjectId ?? '')
      }
      setShareWith([])
      setSharingExpanded(false)
    }
  }, [persona, open, activeProjectId])

  const handleCancel = () => {
    onClose()
  }

  const handleProjectChange = (event: SelectChangeEvent<string>) => {
    setProjectId(event.target.value)
  }

  const addUserShare = (_event: unknown, value: User | string | null) => {
    if (!value || typeof value === 'string') return
    if (shareWith.some(s => s.type === 'user' && s.id === value.id)) return
    setShareWith(prev => [...prev, {
      type: 'user',
      id: value.id,
      label: `${value.username} (${value.displayName})`,
      permission: 'read_only',
    }])
  }

  const addGroupShare = (event: SelectChangeEvent<string>) => {
    const groupId = event.target.value
    if (!groupId || shareWith.some(s => s.type === 'group' && s.id === groupId)) return
    const group = myGroups.find(g => g.id === groupId)
    if (!group) return
    setShareWith(prev => [...prev, {
      type: 'group',
      id: groupId,
      label: group.name,
      permission: 'read_only',
    }])
  }

  const updateSharePermission = (index: number, permission: 'read_only' | 'forkable') => {
    setShareWith(prev => prev.map((s, i) => i === index ? { ...s, permission } : s))
  }

  const removeShare = (index: number) => {
    setShareWith(prev => prev.filter((_, i) => i !== index))
  }

  const handleDone = async () => {
    if (!isFormValid) return

    const personaData = {
      name: name.trim(),
      role: role.trim(),
      informationNeed: informationNeed.trim(),
      details: details.trim(),
    }

    try {
      if (isCreateMode) {
        await createPersonaMutation({
          persona: personaData,
          ontology: {
            entities: [],
            roles: [],
            events: [],
            relationTypes: [],
            relations: [],
          },
          projectId: projectId || undefined,
          shareWith: shareWith.length > 0
            ? shareWith.map(s => ({ type: s.type, id: s.id, permission: s.permission }))
            : undefined,
        })
      } else if (persona) {
        await updatePersonaMutation({
          id: persona.id,
          ...personaData,
          details: personaData.details || '',
          createdAt: persona.createdAt,
          updatedAt: new Date().toISOString(),
        })
      }
      onClose()
    } catch (error) {
      console.error('Failed to save persona:', error)
    }
  }

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="sm" fullWidth>
      <DialogTitle>{persona ? 'Edit Persona' : 'Create New Persona'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Persona Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            required
            error={name.length > 0 && name.trim().length === 0}
            helperText="A descriptive name for this persona"
          />
          <TextField
            label="Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            fullWidth
            required
            error={role.length > 0 && role.trim().length === 0}
            helperText="The persona's professional role or title"
          />
          <TextField
            label="Information Need"
            value={informationNeed}
            onChange={(e) => setInformationNeed(e.target.value)}
            fullWidth
            required
            multiline
            rows={3}
            error={informationNeed.length > 0 && informationNeed.trim().length === 0}
            helperText="What information is this persona looking for?"
          />
          <TextField
            label="Additional Details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            fullWidth
            multiline
            rows={2}
            helperText="Optional: Any additional context or details"
          />

          {/* Project Assignment - only in create mode */}
          {isCreateMode && (
            <>
              <Divider />
              <FormControl fullWidth size="small">
                <Typography variant="body2" sx={{ mb: 0.5, fontWeight: 500 }}>
                  Project Assignment
                </Typography>
                <Select
                  value={projectId}
                  onChange={handleProjectChange}
                  displayEmpty
                >
                  <MenuItem value="">Personal Workspace</MenuItem>
                  {myProjects.map((project) => (
                    <MenuItem key={project.id} value={project.id}>
                      {project.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}

          {/* Sharing - only in create mode */}
          {isCreateMode && (
            <>
              <Typography
                variant="body2"
                sx={{ fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setSharingExpanded(prev => !prev)}
              >
                Share After Creation {sharingExpanded ? '\u25BE' : '\u25B8'}
                {shareWith.length > 0 && (
                  <Chip label={shareWith.length} size="small" color="primary" sx={{ ml: 1 }} />
                )}
              </Typography>

              {sharingExpanded && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 1 }}>
                  {/* Add user share */}
                  <Autocomplete
                    freeSolo
                    size="small"
                    options={allUsers}
                    getOptionLabel={(option) =>
                      typeof option === 'string'
                        ? option
                        : `${option.username} (${option.displayName})`
                    }
                    onChange={addUserShare}
                    value={null}
                    renderInput={(params) => (
                      <TextField {...params} label="Share with user" placeholder="Search users..." />
                    )}
                  />

                  {/* Add group share */}
                  {myGroups.length > 0 && (
                    <FormControl size="small" fullWidth>
                      <Select
                        value=""
                        onChange={addGroupShare}
                        displayEmpty
                      >
                        <MenuItem value="" disabled>Share with group...</MenuItem>
                        {myGroups.map((group) => (
                          <MenuItem key={group.id} value={group.id}>
                            {group.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  {/* Pending shares list */}
                  {shareWith.map((entry, index) => (
                    <Box
                      key={`${entry.type}-${entry.id}`}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        p: 1,
                        bgcolor: 'action.hover',
                        borderRadius: 1,
                      }}
                    >
                      <Chip
                        label={entry.type === 'user' ? 'User' : 'Group'}
                        size="small"
                        variant="outlined"
                      />
                      <Typography variant="body2" sx={{ flexGrow: 1 }}>
                        {entry.label}
                      </Typography>
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={entry.permission}
                        onChange={(_, value) => {
                          if (value) updateSharePermission(index, value)
                        }}
                      >
                        <ToggleButton value="read_only" sx={{ textTransform: 'none', py: 0.25, px: 1 }}>
                          Read
                        </ToggleButton>
                        <ToggleButton value="forkable" sx={{ textTransform: 'none', py: 0.25, px: 1 }}>
                          Fork
                        </ToggleButton>
                      </ToggleButtonGroup>
                      <IconButton size="small" onClick={() => removeShare(index)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} disabled={isSaving}>Cancel</Button>
        <Button
          onClick={handleDone}
          variant="contained"
          disabled={!isFormValid || isSaving}
          startIcon={isSaving ? <CircularProgress size={16} /> : null}
        >
          {isSaving ? 'Saving...' : 'Done'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
