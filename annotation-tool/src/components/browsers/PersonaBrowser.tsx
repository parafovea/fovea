import { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import {
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  TextField,
  InputAdornment,
  Fab,
  Chip,
  Avatar,
  Button,
} from '@mui/material'
import {
  Edit as EditIcon,
  Person as PersonIcon,
  Search as SearchIcon,
  Add as AddIcon,
  Category as TypeIcon,
  Event as EventIcon,
  GroupWork as RoleIcon,
  Share as RelationIcon,
} from '@mui/icons-material'
import { RootState, AppDispatch } from '../../store/store'
import { setActivePersona } from '../../store/personaSlice'
import { Persona } from '../../models/types'

interface PersonaBrowserProps {
  onSelectPersona: (personaId: string) => void
  onEditPersona?: (persona: Persona) => void
  onAddPersona?: () => void
}

export default function PersonaBrowser({ 
  onSelectPersona, 
  onEditPersona,
  onAddPersona 
}: PersonaBrowserProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredPersonas = personas.filter(persona =>
    persona.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    persona.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
    persona.informationNeed.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getOntologyStats = (personaId: string) => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    if (!ontology) return { entities: 0, events: 0, roles: 0, relations: 0 }
    
    return {
      entities: ontology.entities.length,
      events: ontology.events.length,
      roles: ontology.roles.length,
      relations: ontology.relationTypes.length,
    }
  }

  const handlePersonaClick = (persona: Persona) => {
    dispatch(setActivePersona(persona.id))
    onSelectPersona(persona.id)
  }

  const handleEditPersona = (persona: Persona, event: React.MouseEvent) => {
    event.stopPropagation()
    if (onEditPersona) {
      onEditPersona(persona)
    }
  }

  return (
    <Box>
      <Box mb={3}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search personas by name, role, or information need..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Grid container spacing={3}>
          {filteredPersonas.map((persona) => {
            const stats = getOntologyStats(persona.id)
            return (
              <Grid item xs={12} sm={6} md={4} lg={3} key={persona.id}>
                <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }} data-persona-id={persona.id}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                        <PersonIcon />
                      </Avatar>
                      <Box>
                        <Typography variant="h3" sx={{ fontSize: '1.25rem' }} component="div" noWrap>
                          {persona.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {persona.role}
                        </Typography>
                      </Box>
                    </Box>
                    
                    <Typography variant="body2" sx={{ mb: 2, minHeight: '2.5em' }}>
                      {persona.informationNeed.length > 100 
                        ? persona.informationNeed.substring(0, 100) + '...'
                        : persona.informationNeed}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      <Chip 
                        icon={<TypeIcon />} 
                        label={`${stats.entities} types`} 
                        size="small" 
                        variant="outlined"
                      />
                      <Chip 
                        icon={<EventIcon />} 
                        label={`${stats.events} events`} 
                        size="small" 
                        variant="outlined"
                      />
                      <Chip 
                        icon={<RoleIcon />} 
                        label={`${stats.roles} roles`} 
                        size="small" 
                        variant="outlined"
                      />
                      <Chip 
                        icon={<RelationIcon />} 
                        label={`${stats.relations} relations`} 
                        size="small" 
                        variant="outlined"
                      />
                    </Box>

                    {persona.details && (
                      <Typography 
                        variant="caption" 
                        color="text.secondary" 
                        sx={{ 
                          display: 'block', 
                          mt: 1,
                          fontStyle: 'italic',
                        }}
                      >
                        {persona.details.length > 80 
                          ? persona.details.substring(0, 80) + '...'
                          : persona.details}
                      </Typography>
                    )}
                  </CardContent>
                  
                  <CardActions>
                    <Button
                      size="small"
                      startIcon={<EditIcon />}
                      onClick={() => handlePersonaClick(persona)}
                    >
                      Open
                    </Button>
                    {onEditPersona && (
                      <Button
                        size="small"
                        onClick={(e) => handleEditPersona(persona, e)}
                      >
                        Settings
                      </Button>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            )
          })}
      </Grid>

      {filteredPersonas.length === 0 && (
        <Box
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          height="300px"
        >
          <Typography variant="h3" sx={{ fontSize: '1.25rem' }} color="text.secondary">
            No personas found
          </Typography>
          {searchTerm && (
            <Typography variant="body2" color="text.secondary">
              Try adjusting your search query
            </Typography>
          )}
          {!searchTerm && (
            <Typography variant="body2" color="text.secondary">
              Click the + button to create your first persona
            </Typography>
          )}
        </Box>
      )}

      {onAddPersona && (
        <Fab
          color="primary"
          aria-label="add persona"
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
          }}
          onClick={onAddPersona}
        >
          <AddIcon />
        </Fab>
      )}
    </Box>
  )
}