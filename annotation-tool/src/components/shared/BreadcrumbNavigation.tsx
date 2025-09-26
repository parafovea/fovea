import { useLocation, useNavigate } from 'react-router-dom'
import { Breadcrumbs, Link, Typography, Chip, Box } from '@mui/material'
import {
  NavigateNext as NavigateNextIcon,
  VideoLibrary as VideoIcon,
  School as OntologyIcon,
  Public as ObjectIcon,
  Person as PersonaIcon,
  Category as EntityIcon,
  Event as EventIcon,
  LocationOn as LocationIcon,
  AccessTime as TimeIcon,
  Folder as CollectionIcon,
} from '@mui/icons-material'
import { useSelector } from 'react-redux'
import { RootState } from '../../store/store'

interface BreadcrumbItem {
  label: string
  path?: string
  icon?: React.ReactNode
  isActive?: boolean
}

export default function BreadcrumbNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const personas = useSelector((state: RootState) => state.persona.personas)
  const videos = useSelector((state: RootState) => state.videos.videos)
  const entities = useSelector((state: RootState) => state.world.entities)
  const events = useSelector((state: RootState) => state.world.events)
  
  // Parse the current path to build breadcrumbs
  const buildBreadcrumbs = (): BreadcrumbItem[] => {
    const pathSegments = location.pathname.split('/').filter(Boolean)
    const breadcrumbs: BreadcrumbItem[] = []
    
    // Add root based on first segment
    if (pathSegments.length === 0 || pathSegments[0] === 'videos') {
      breadcrumbs.push({
        label: 'Video Browser',
        path: '/',
        icon: <VideoIcon fontSize="small" />,
      })
      
      // Check if we're in annotation workspace
      if (pathSegments.length > 1) {
        const videoId = pathSegments[1]
        const video = videos.find((v: any) => v.id === videoId)
        if (video) {
          breadcrumbs.push({
            label: `Video: "${video.title}"`,
            path: `/videos/${videoId}`,
            isActive: true,
          })
        }
      }
    } else if (pathSegments[0] === 'ontology') {
      breadcrumbs.push({
        label: 'Ontology Builder',
        path: '/ontology',
        icon: <OntologyIcon fontSize="small" />,
      })
      
      // Check if a persona is selected
      const params = new URLSearchParams(location.search)
      const personaId = params.get('persona')
      if (personaId) {
        const persona = personas.find(p => p.id === personaId)
        if (persona) {
          breadcrumbs.push({
            label: `Persona: "${persona.name}"`,
            icon: <PersonaIcon fontSize="small" />,
          })
          
          // Check if a specific type tab is active
          const typeTab = params.get('tab')
          if (typeTab) {
            const tabLabels: Record<string, string> = {
              entities: 'Entity Types',
              events: 'Event Types',
              roles: 'Role Types',
              relations: 'Relation Types',
            }
            if (tabLabels[typeTab]) {
              breadcrumbs.push({
                label: tabLabels[typeTab],
                isActive: true,
              })
            }
          }
        }
      }
    } else if (pathSegments[0] === 'objects') {
      breadcrumbs.push({
        label: 'Object Builder',
        path: '/objects',
        icon: <ObjectIcon fontSize="small" />,
      })
      
      // Check if a specific object tab is active
      const params = new URLSearchParams(location.search)
      const objectTab = params.get('tab')
      if (objectTab) {
        const tabLabels: Record<string, { label: string; icon: React.ReactNode }> = {
          entities: { label: 'Entities', icon: <EntityIcon fontSize="small" /> },
          events: { label: 'Events', icon: <EventIcon fontSize="small" /> },
          locations: { label: 'Locations', icon: <LocationIcon fontSize="small" /> },
          times: { label: 'Times', icon: <TimeIcon fontSize="small" /> },
          collections: { label: 'Collections', icon: <CollectionIcon fontSize="small" /> },
        }
        if (tabLabels[objectTab]) {
          breadcrumbs.push({
            label: tabLabels[objectTab].label,
            icon: tabLabels[objectTab].icon,
          })
          
          // Check if a specific object is being edited
          const objectId = params.get('edit')
          if (objectId) {
            let objectName = ''
            if (objectTab === 'entities') {
              const entity = entities.find(e => e.id === objectId)
              objectName = entity?.name || ''
            } else if (objectTab === 'events') {
              const event = events.find(e => e.id === objectId)
              objectName = event?.name || ''
            }
            
            if (objectName) {
              breadcrumbs.push({
                label: `${objectTab === 'entities' ? 'Entity' : 'Event'}: "${objectName}"`,
                isActive: true,
              })
            }
          }
        }
      }
    }
    
    return breadcrumbs
  }
  
  const breadcrumbs = buildBreadcrumbs()
  
  if (breadcrumbs.length === 0) {
    return null
  }
  
  return (
    <Box sx={{ 
      px: 2, 
      py: 1, 
      borderBottom: 1, 
      borderColor: 'divider',
      bgcolor: 'background.paper',
      display: 'flex',
      alignItems: 'center',
    }}>
      <Breadcrumbs 
        separator={<NavigateNextIcon fontSize="small" />}
        aria-label="breadcrumb"
        sx={{ flexGrow: 1 }}
      >
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1
          
          if (isLast || !crumb.path) {
            return (
              <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {crumb.icon}
                <Typography 
                  color={crumb.isActive ? 'primary' : 'text.primary'}
                  sx={{ fontWeight: crumb.isActive ? 600 : 400 }}
                >
                  {crumb.label}
                </Typography>
              </Box>
            )
          }
          
          return (
            <Link
              key={index}
              underline="hover"
              color="inherit"
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                cursor: 'pointer',
                '&:hover': {
                  color: 'primary.main',
                },
              }}
              onClick={() => navigate(crumb.path!)}
            >
              {crumb.icon}
              {crumb.label}
            </Link>
          )
        })}
      </Breadcrumbs>
      
      {/* Optional: Add context chips */}
      {location.pathname.includes('/videos/') && (
        <Chip
          label="Annotation Mode"
          color="primary"
          size="small"
          variant="outlined"
          sx={{ ml: 2 }}
        />
      )}
    </Box>
  )
}