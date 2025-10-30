import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  TextField,
  Autocomplete,
  Box,
  Typography,
  ListSubheader,
  Paper,
  InputAdornment,
} from '@mui/material'
import {
  Category as EntityIcon,
  AccountTree as RoleIcon,
  Event as EventIcon,
  Person as EntityObjectIcon,
  LocationOn as LocationIcon,
  Folder as CollectionIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import { setLinkTarget } from '../../store/annotationSlice'

interface AnnotationOption {
  id: string
  label: string
  category: string
  type: 'entity' | 'role' | 'event' | 'entity-object' | 'event-object' | 'location-object' | 'collection'
  icon: React.ReactNode
}

interface AnnotationAutocompleteProps {
  mode: 'type' | 'object'
  personaId?: string | null
  onSelect: (option: AnnotationOption | null) => void
  disabled?: boolean
}

export default function AnnotationAutocomplete({
  mode,
  personaId,
  onSelect,
  disabled = false
}: AnnotationAutocompleteProps) {
  const dispatch = useDispatch<AppDispatch>()
  const [value, setValue] = useState<AnnotationOption | null>(null)
  const [inputValue, setInputValue] = useState('')
  
  // Get persona ontology for type mode
  const personaOntology = useSelector((state: RootState) => 
    personaId ? state.persona.personaOntologies.find(o => o.personaId === personaId) : null
  )
  
  // Get world objects for object mode
  const entities = useSelector((state: RootState) => state.world.entities)
  const events = useSelector((state: RootState) => state.world.events)
  const entityCollections = useSelector((state: RootState) => state.world.entityCollections)
  const eventCollections = useSelector((state: RootState) => state.world.eventCollections)

  // Build options based on mode
  const options: AnnotationOption[] = React.useMemo(() => {
    const opts: AnnotationOption[] = []
    
    if (mode === 'type' && personaOntology) {
      // Add entity types
      personaOntology.entities.forEach(e => {
        opts.push({
          id: e.id,
          label: e.name,
          category: 'Entity Types',
          type: 'entity',
          icon: <EntityIcon fontSize="small" />
        })
      })
      
      // Add role types
      personaOntology.roles.forEach(r => {
        opts.push({
          id: r.id,
          label: r.name,
          category: 'Role Types',
          type: 'role',
          icon: <RoleIcon fontSize="small" />
        })
      })
      
      // Add event types
      personaOntology.events.forEach(e => {
        opts.push({
          id: e.id,
          label: e.name,
          category: 'Event Types',
          type: 'event',
          icon: <EventIcon fontSize="small" />
        })
      })
    } else if (mode === 'object') {
      // Add entity objects (excluding locations)
      entities.filter(e => !('locationType' in e)).forEach(e => {
        opts.push({
          id: e.id,
          label: e.name,
          category: 'Entities',
          type: 'entity-object',
          icon: <EntityObjectIcon fontSize="small" />
        })
      })
      
      // Add location objects
      entities.filter(e => 'locationType' in e).forEach(l => {
        opts.push({
          id: l.id,
          label: l.name,
          category: 'Locations',
          type: 'location-object',
          icon: <LocationIcon fontSize="small" />
        })
      })
      
      // Add event objects
      events.forEach(e => {
        opts.push({
          id: e.id,
          label: e.name,
          category: 'Events',
          type: 'event-object',
          icon: <EventIcon fontSize="small" />
        })
      })
      
      // Add entity collections
      entityCollections.forEach(c => {
        opts.push({
          id: c.id,
          label: c.name,
          category: 'Entity Collections',
          type: 'collection',
          icon: <CollectionIcon fontSize="small" />
        })
      })
      
      // Add event collections
      eventCollections.forEach(c => {
        opts.push({
          id: c.id,
          label: c.name,
          category: 'Event Collections',
          type: 'collection',
          icon: <CollectionIcon fontSize="small" />
        })
      })
    }
    
    return opts
  }, [mode, personaOntology, entities, events, entityCollections, eventCollections])

  // Group options by category
  const groupedOptions = React.useMemo(() => {
    const grouped: Record<string, AnnotationOption[]> = {}
    options.forEach(opt => {
      if (!grouped[opt.category]) {
        grouped[opt.category] = []
      }
      grouped[opt.category].push(opt)
    })
    return grouped
  }, [options])

  const handleChange = (_: any, newValue: AnnotationOption | null) => {
    setValue(newValue)
    onSelect(newValue)
    
    // Update Redux state for link target if in object mode
    if (mode === 'object' && newValue) {
      let targetType: any = null
      if (newValue.type === 'entity-object') targetType = 'entity'
      else if (newValue.type === 'event-object') targetType = 'event'
      else if (newValue.type === 'location-object') targetType = 'location'
      else if (newValue.type === 'collection') {
        // Determine if it's entity or event collection
        const isEntityCollection = entityCollections.some(c => c.id === newValue.id)
        targetType = isEntityCollection ? 'entity-collection' : 'event-collection'
      }
      
      dispatch(setLinkTarget({
        id: newValue.id,
        type: targetType
      }))
    }
  }

  // Generate label with counts for type mode
  const getTypeLabel = () => {
    if (mode === 'type' && personaOntology && !value) {
      const entityCount = personaOntology.entities.length
      const roleCount = personaOntology.roles.length
      const eventCount = personaOntology.events.length
      return `Select Type (${entityCount} entities, ${roleCount} roles, ${eventCount} events)`
    }
    return mode === 'type' ? 'Select Type' : 'Select Object'
  }

  return (
    <Autocomplete
      value={value}
      onChange={handleChange}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
      options={options}
      groupBy={(option) => option.category}
      getOptionLabel={(option) => option.label}
      disabled={disabled || (mode === 'type' && !personaId)}
      fullWidth
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label={getTypeLabel()}
          placeholder={
            mode === 'type' && !personaId
              ? 'Please select a persona first'
              : mode === 'type'
                ? 'Search for entity, role, or event type...'
                : 'Search for world object...'
          }
          InputProps={{
            ...params.InputProps,
            'aria-label': getTypeLabel(),
            startAdornment: value && (
              <InputAdornment position="start">
                {value.icon}
              </InputAdornment>
            ),
          }}
          inputProps={{
            ...params.inputProps,
            'aria-label': getTypeLabel(),
          }}
        />
      )}
      renderOption={(props, option) => {
        const { key, ...otherProps } = props as any
        return (
          <Box component="li" key={key} {...otherProps} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {option.icon}
            <Typography>{option.label}</Typography>
          </Box>
        )
      }}
      renderGroup={(params) => (
        <Box component="li" key={params.key}>
          <ListSubheader component="div" sx={{ backgroundColor: 'background.paper' }}>
            {params.group} ({groupedOptions[params.group].length})
          </ListSubheader>
          <Box component="ul" sx={{ padding: 0 }}>
            {params.children}
          </Box>
        </Box>
      )}
      PaperComponent={(props) => (
        <Paper {...props} elevation={8} />
      )}
    />
  )
}