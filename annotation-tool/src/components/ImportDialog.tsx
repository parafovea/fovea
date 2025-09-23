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
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Tabs,
  Tab,
  Chip,
  Alert,
} from '@mui/material'
import { RootState, AppDispatch } from '../store/store'
import { importFromPersona } from '../store/personaSlice'
import { ImportRequest } from '../models/types'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  targetPersonaId: string | null
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ p: 2 }}>{children}</Box>}
    </div>
  )
}

export default function ImportDialog({ open, onClose, targetPersonaId }: ImportDialogProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  
  const [sourcePersonaId, setSourcePersonaId] = useState<string>('')
  const [tabValue, setTabValue] = useState(0)
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<string[]>([])
  const [includeRelations, setIncludeRelations] = useState(false)

  const sourcePersona = personas.find(p => p.id === sourcePersonaId)
  const sourceOntology = personaOntologies.find(o => o.personaId === sourcePersonaId)
  const targetPersona = personas.find(p => p.id === targetPersonaId)

  const handleImport = () => {
    if (!targetPersonaId || !sourcePersonaId) return

    const importRequest: ImportRequest = {
      fromPersonaId: sourcePersonaId,
      toPersonaId: targetPersonaId,
      entityIds: selectedEntities,
      roleIds: selectedRoles,
      eventIds: selectedEvents,
      relationTypeIds: selectedRelationTypes,
      includeRelations,
    }

    dispatch(importFromPersona(importRequest))
    onClose()
    resetSelections()
  }

  const resetSelections = () => {
    setSelectedEntities([])
    setSelectedRoles([])
    setSelectedEvents([])
    setSelectedRelationTypes([])
    setIncludeRelations(false)
    setTabValue(0)
  }

  const toggleEntity = (entityId: string) => {
    setSelectedEntities(prev =>
      prev.includes(entityId)
        ? prev.filter(id => id !== entityId)
        : [...prev, entityId]
    )
  }

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    )
  }

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    )
  }

  const toggleRelationType = (relationTypeId: string) => {
    setSelectedRelationTypes(prev =>
      prev.includes(relationTypeId)
        ? prev.filter(id => id !== relationTypeId)
        : [...prev, relationTypeId]
    )
  }

  const selectAllInTab = () => {
    if (!sourceOntology) return
    
    switch (tabValue) {
      case 0:
        setSelectedEntities(sourceOntology.entities.map(e => e.id))
        break
      case 1:
        setSelectedRoles(sourceOntology.roles.map(r => r.id))
        break
      case 2:
        setSelectedEvents(sourceOntology.events.map(e => e.id))
        break
      case 3:
        setSelectedRelationTypes(sourceOntology.relationTypes.map(r => r.id))
        break
    }
  }

  const deselectAllInTab = () => {
    switch (tabValue) {
      case 0:
        setSelectedEntities([])
        break
      case 1:
        setSelectedRoles([])
        break
      case 2:
        setSelectedEvents([])
        break
      case 3:
        setSelectedRelationTypes([])
        break
    }
  }

  const totalSelected = selectedEntities.length + selectedRoles.length + 
                        selectedEvents.length + selectedRelationTypes.length

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import from Another Persona</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Alert severity="info">
            Importing will copy selected items to {targetPersona?.name}. The original items will remain unchanged.
          </Alert>
        </Box>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Source Persona</InputLabel>
          <Select
            value={sourcePersonaId}
            onChange={(e) => setSourcePersonaId(e.target.value)}
            label="Source Persona"
          >
            {personas
              .filter(p => p.id !== targetPersonaId)
              .map(persona => (
                <MenuItem key={persona.id} value={persona.id}>
                  <Box>
                    <Typography>{persona.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {persona.role}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
          </Select>
        </FormControl>

        {sourceOntology && (
          <>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
                <Tab label={`Entities (${sourceOntology.entities.length})`} />
                <Tab label={`Roles (${sourceOntology.roles.length})`} />
                <Tab label={`Events (${sourceOntology.events.length})`} />
                <Tab label={`Relations (${sourceOntology.relationTypes.length})`} />
              </Tabs>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', p: 1 }}>
              <Box>
                <Chip label={`${totalSelected} items selected`} size="small" color="primary" />
              </Box>
              <Box>
                <Button size="small" onClick={selectAllInTab}>Select All</Button>
                <Button size="small" onClick={deselectAllInTab}>Deselect All</Button>
              </Box>
            </Box>

            <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
              <TabPanel value={tabValue} index={0}>
                <List dense>
                  {sourceOntology.entities.map(entity => (
                    <ListItem key={entity.id} disablePadding>
                      <ListItemButton onClick={() => toggleEntity(entity.id)}>
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedEntities.includes(entity.id)}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={entity.name}
                          secondary={entity.gloss.map(g => g.content).join(' ').substring(0, 100)}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </TabPanel>

              <TabPanel value={tabValue} index={1}>
                <List dense>
                  {sourceOntology.roles.map(role => (
                    <ListItem key={role.id} disablePadding>
                      <ListItemButton onClick={() => toggleRole(role.id)}>
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedRoles.includes(role.id)}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={role.name}
                          secondary={`Allows: ${role.allowedFillerTypes.join(', ')}`}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </TabPanel>

              <TabPanel value={tabValue} index={2}>
                <List dense>
                  {sourceOntology.events.map(event => (
                    <ListItem key={event.id} disablePadding>
                      <ListItemButton onClick={() => toggleEvent(event.id)}>
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedEvents.includes(event.id)}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={event.name}
                          secondary={`${event.roles.length} roles`}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </TabPanel>

              <TabPanel value={tabValue} index={3}>
                <List dense>
                  {sourceOntology.relationTypes.map(relationType => (
                    <ListItem key={relationType.id} disablePadding>
                      <ListItemButton onClick={() => toggleRelationType(relationType.id)}>
                        <ListItemIcon>
                          <Checkbox
                            edge="start"
                            checked={selectedRelationTypes.includes(relationType.id)}
                            tabIndex={-1}
                            disableRipple
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={relationType.name}
                          secondary={`${relationType.sourceTypes.join('/')} → ${relationType.targetTypes.join('/')}`}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </TabPanel>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={totalSelected === 0}
        >
          Import {totalSelected} Item{totalSelected !== 1 ? 's' : ''}
        </Button>
      </DialogActions>
    </Dialog>
  )
}