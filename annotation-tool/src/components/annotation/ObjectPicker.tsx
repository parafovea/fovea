import React, { useState, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tabs,
  Tab,
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Typography,
  Chip,
  InputAdornment,
  IconButton,
  Alert,
  Divider,
  Stack,
} from '@mui/material'
import {
  Search as SearchIcon,
  Person as EntityIcon,
  Event as EventIcon,
  LocationOn as LocationIcon,
  Folder as CollectionIcon,
  Clear as ClearIcon,
  AccessTime as RecentIcon,
} from '@mui/icons-material'
import { WikidataChip } from '../shared/WikidataChip'
import { useSelector } from 'react-redux'
import { RootState } from '../../store/store'
import { Location } from '../../models/types'

interface ObjectPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (object: {
    id: string
    type: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | 'time-collection'
    name: string
  }) => void
  allowedTypes?: ('entity' | 'event' | 'location' | 'collection')[]
  recentIds?: string[]
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
      id={`object-tabpanel-${index}`}
      aria-labelledby={`object-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  )
}

export default function ObjectPicker({
  open,
  onClose,
  onSelect,
  allowedTypes = ['entity', 'event', 'location', 'collection'],
  recentIds = [],
}: ObjectPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTab, setSelectedTab] = useState(0)
  const [selectedObject, setSelectedObject] = useState<any>(null)
  
  // Get world objects from store
  const entities = useSelector((state: RootState) => state.world.entities)
  const events = useSelector((state: RootState) => state.world.events)
  const entityCollections = useSelector((state: RootState) => state.world.entityCollections)
  const eventCollections = useSelector((state: RootState) => state.world.eventCollections)
  const timeCollections = useSelector((state: RootState) => state.world.timeCollections)
  const personas = useSelector((state: RootState) => state.persona.personas)
  
  // Filter locations from entities
  const locations = useMemo(() => 
    entities.filter(e => 'locationType' in e) as Location[],
    [entities]
  )
  
  // Filter non-location entities
  const regularEntities = useMemo(() => 
    entities.filter(e => !('locationType' in e)),
    [entities]
  )
  
  // Search filtering
  const filterBySearch = (items: any[], query: string) => {
    if (!query) return items
    const lowerQuery = query.toLowerCase()
    return items.filter(item => 
      item.name.toLowerCase().includes(lowerQuery) ||
      item.description?.some?.((d: any) => 
        d.gloss?.toLowerCase().includes(lowerQuery)
      )
    )
  }
  
  const filteredEntities = filterBySearch(regularEntities, searchQuery)
  const filteredEvents = filterBySearch(events, searchQuery)
  const filteredLocations = filterBySearch(locations, searchQuery)
  const filteredEntityCollections = filterBySearch(entityCollections, searchQuery)
  const filteredEventCollections = filterBySearch(eventCollections, searchQuery)
  const filteredTimeCollections = filterBySearch(timeCollections, searchQuery)
  
  // Get recent objects
  const recentObjects = useMemo(() => {
    const objects: any[] = []
    recentIds.forEach(id => {
      const entity = entities.find(e => e.id === id)
      if (entity) {
        objects.push({ ...entity, type: 'locationType' in entity ? 'location' : 'entity' })
        return
      }
      const event = events.find(e => e.id === id)
      if (event) {
        objects.push({ ...event, type: 'event' })
        return
      }
      const entityCol = entityCollections.find(c => c.id === id)
      if (entityCol) {
        objects.push({ ...entityCol, type: 'entity-collection' })
        return
      }
      const eventCol = eventCollections.find(c => c.id === id)
      if (eventCol) {
        objects.push({ ...eventCol, type: 'event-collection' })
      }
    })
    return objects
  }, [recentIds, entities, events, entityCollections, eventCollections])
  
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue)
    setSelectedObject(null)
  }
  
  const handleObjectSelect = (object: any, type: string) => {
    setSelectedObject({ ...object, type })
  }
  
  const handleConfirmSelection = () => {
    if (selectedObject) {
      onSelect({
        id: selectedObject.id,
        type: selectedObject.type,
        name: selectedObject.name,
      })
      onClose()
      setSelectedObject(null)
      setSearchQuery('')
    }
  }
  
  const handleClose = () => {
    onClose()
    setSelectedObject(null)
    setSearchQuery('')
  }
  
  const renderObjectList = (items: any[], type: string, icon: React.ReactElement) => (
    <List>
      {items.length === 0 && (
        <ListItem>
          <Typography variant="body2" color="text.secondary">
            No {type}s found. Create one in the Ontology Builder.
          </Typography>
        </ListItem>
      )}
      {items.map((item) => (
        <ListItemButton
          key={item.id}
          selected={selectedObject?.id === item.id}
          onClick={() => handleObjectSelect(item, type)}
        >
          <ListItemIcon>{icon}</ListItemIcon>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body1">{item.name}</Typography>
                <WikidataChip
                  wikidataId={item.wikidataId}
                  wikidataUrl={item.wikidataUrl}
                  wikibaseId={item.wikibaseId}
                  importedAt={item.importedAt}
                  size="small"
                  showTimestamp={false}
                />
              </Box>
            }
            secondary={
              <Stack spacing={0.5}>
                {item.description?.[0]?.gloss && (
                  <Typography variant="caption" color="text.secondary">
                    {item.description[0].gloss}
                  </Typography>
                )}
                {/* Show type assignments for entities */}
                {type === 'entity' && item.typeAssignments?.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                    {item.typeAssignments.map((assignment: any) => {
                      const persona = personas.find(p => p.id === assignment.personaId)
                      return (
                        <Chip
                          key={assignment.personaId}
                          label={`${persona?.name || 'Unknown'}: ${assignment.entityTypeId}`}
                          size="small"
                          variant="outlined"
                        />
                      )
                    })}
                  </Box>
                )}
                {/* Show interpretations for events */}
                {type === 'event' && item.personaInterpretations?.length > 0 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                    {item.personaInterpretations.map((interp: any) => {
                      const persona = personas.find(p => p.id === interp.personaId)
                      return (
                        <Chip
                          key={interp.personaId}
                          label={`${persona?.name || 'Unknown'}: ${interp.eventTypeId}`}
                          size="small"
                          variant="outlined"
                        />
                      )
                    })}
                  </Box>
                )}
                {/* Show coordinates for locations */}
                {type === 'location' && item.coordinates && (
                  <Typography variant="caption" color="text.secondary">
                    {item.coordinates.latitude && item.coordinates.longitude
                      ? `${item.coordinates.latitude.toFixed(4)}, ${item.coordinates.longitude.toFixed(4)}`
                      : `x: ${item.coordinates.x}, y: ${item.coordinates.y}`}
                  </Typography>
                )}
                {/* Show member count for collections */}
                {(type === 'entity-collection' || type === 'event-collection') && (
                  <Typography variant="caption" color="text.secondary">
                    {type === 'entity-collection' 
                      ? `${item.entityIds?.length || 0} entities`
                      : `${item.eventIds?.length || 0} events`}
                  </Typography>
                )}
              </Stack>
            }
          />
        </ListItemButton>
      ))}
    </List>
  )
  
  // Determine which tabs to show based on allowedTypes
  const showEntities = allowedTypes.includes('entity')
  const showEvents = allowedTypes.includes('event')
  const showLocations = allowedTypes.includes('location')
  const showCollections = allowedTypes.includes('collection')
  
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '80vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle>
        <Typography variant="h6">Select World Object</Typography>
      </DialogTitle>
      
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Search Bar */}
        <TextField
          fullWidth
          placeholder="Search objects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        
        {/* Recent Objects */}
        {recentObjects.length > 0 && !searchQuery && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <RecentIcon fontSize="small" />
              Recently Used
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {recentObjects.slice(0, 5).map((obj) => (
                <Chip
                  key={obj.id}
                  label={obj.name}
                  onClick={() => handleObjectSelect(obj, obj.type)}
                  icon={
                    obj.type === 'entity' ? <EntityIcon /> :
                    obj.type === 'event' ? <EventIcon /> :
                    obj.type === 'location' ? <LocationIcon /> :
                    <CollectionIcon />
                  }
                  variant={selectedObject?.id === obj.id ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
            <Divider sx={{ mt: 2 }} />
          </Box>
        )}
        
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={selectedTab} onChange={handleTabChange}>
            {showEntities && <Tab label={`Entities (${filteredEntities.length})`} />}
            {showEvents && <Tab label={`Events (${filteredEvents.length})`} />}
            {showLocations && <Tab label={`Locations (${filteredLocations.length})`} />}
            {showCollections && <Tab label="Collections" />}
          </Tabs>
        </Box>
        
        {/* Tab Panels */}
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {showEntities && (
            <TabPanel value={selectedTab} index={0}>
              {renderObjectList(filteredEntities, 'entity', <EntityIcon />)}
            </TabPanel>
          )}
          
          {showEvents && (
            <TabPanel value={selectedTab} index={showEntities ? 1 : 0}>
              {renderObjectList(filteredEvents, 'event', <EventIcon />)}
            </TabPanel>
          )}
          
          {showLocations && (
            <TabPanel value={selectedTab} index={
              (showEntities ? 1 : 0) + (showEvents ? 1 : 0)
            }>
              {renderObjectList(filteredLocations, 'location', <LocationIcon />)}
            </TabPanel>
          )}
          
          {showCollections && (
            <TabPanel value={selectedTab} index={
              (showEntities ? 1 : 0) + (showEvents ? 1 : 0) + (showLocations ? 1 : 0)
            }>
              <Typography variant="subtitle2" gutterBottom>Entity Collections</Typography>
              {renderObjectList(filteredEntityCollections, 'entity-collection', <CollectionIcon />)}
              
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>Event Collections</Typography>
              {renderObjectList(filteredEventCollections, 'event-collection', <CollectionIcon />)}
              
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>Time Collections</Typography>
              {renderObjectList(filteredTimeCollections, 'time-collection', <CollectionIcon />)}
            </TabPanel>
          )}
        </Box>
        
        {/* Selected Object Info */}
        {selectedObject && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Selected: <strong>{selectedObject.name}</strong> ({selectedObject.type})
          </Alert>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleConfirmSelection}
          variant="contained"
          disabled={!selectedObject}
        >
          Select
        </Button>
      </DialogActions>
    </Dialog>
  )
}