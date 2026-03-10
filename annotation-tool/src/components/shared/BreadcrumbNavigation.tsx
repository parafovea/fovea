/**
 * Breadcrumb navigation component.
 * Displays hierarchical navigation based on the current route.
 */

import { useLocation, useNavigate } from 'react-router-dom'

import {
  CalendarDays,
  Clock,
  Fingerprint,
  Folder,
  Globe,
  MapPin,
  Tag,
  User,
  Video,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'
import { usePersonas, useVideos, useWorld } from '@store/queries'

interface BreadcrumbEntry {
  label: string
  path?: string
  icon?: React.ReactNode
  isActive?: boolean
}

export function BreadcrumbNavigation(): JSX.Element | null {
  const location = useLocation()
  const navigate = useNavigate()

  // TanStack Query for data
  const { data: personas = [] } = usePersonas()
  const { data: videos = [] } = useVideos()
  const { data: worldData } = useWorld()
  const entities = worldData?.entities ?? []
  const events = worldData?.events ?? []

  // Parse the current path to build breadcrumbs
  const buildBreadcrumbs = (): BreadcrumbEntry[] => {
    const pathSegments = location.pathname.split('/').filter(Boolean)
    const breadcrumbs: BreadcrumbEntry[] = []

    // Add root based on first segment
    if (pathSegments.length === 0 || pathSegments[0] === 'videos' || pathSegments[0] === 'annotate') {
      breadcrumbs.push({
        label: 'Video Browser',
        path: '/',
        icon: <Video className="size-4" />,
      })

      // Check if we're in annotation workspace
      if (pathSegments[0] === 'annotate' && pathSegments.length > 1) {
        const videoId = pathSegments[1]
        const video = videos.find(v => v.id === videoId)
        if (video) {
          // Truncate long titles for the breadcrumb
          const title = video.title && video.title.length > 40
            ? video.title.slice(0, 40) + '...'
            : video.title
          breadcrumbs.push({
            label: `Video: "${title}"`,
            path: `/videos/${videoId}`,
            isActive: true,
          })
        }
      }
    } else if (pathSegments[0] === 'ontology') {
      breadcrumbs.push({
        label: 'Persona Builder',
        path: '/ontology',
        icon: <Fingerprint className="size-4" />,
      })

      // Check if a persona is selected
      const params = new URLSearchParams(location.search)
      const personaId = params.get('persona')
      if (personaId) {
        const persona = personas.find(p => p.id === personaId)
        if (persona) {
          breadcrumbs.push({
            label: `Persona: "${persona.name}"`,
            icon: <User className="size-4" />,
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
        label: 'World Builder',
        path: '/objects',
        icon: <Globe className="size-4" />,
      })

      // Check if a specific object tab is active
      const params = new URLSearchParams(location.search)
      const objectTab = params.get('tab')
      if (objectTab) {
        const tabLabels: Record<string, { label: string; icon: React.ReactNode }> = {
          entities: { label: 'Entities', icon: <Tag className="size-4" /> },
          events: { label: 'Events', icon: <CalendarDays className="size-4" /> },
          locations: { label: 'Locations', icon: <MapPin className="size-4" /> },
          times: { label: 'Times', icon: <Clock className="size-4" /> },
          collections: { label: 'Collections', icon: <Folder className="size-4" /> },
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
    <div className="flex items-center min-w-0 flex-1">
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1

            return (
              <BreadcrumbItem key={index}>
                {index > 0 && <BreadcrumbSeparator />}
                {isLast || !crumb.path ? (
                  <BreadcrumbPage className={cn(
                    'flex items-center gap-1',
                    crumb.isActive && 'font-semibold text-primary'
                  )}>
                    {crumb.icon}
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={
                      <button
                        type="button"
                        className="flex cursor-pointer items-center gap-1"
                        onClick={() => navigate(crumb.path!)}
                      />
                    }
                  >
                    {crumb.icon}
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Optional: Add context badge */}
      {location.pathname.includes('/annotate/') && (
        <Badge variant="outline" className="ml-4">
          Annotation Mode
        </Badge>
      )}
    </div>
  )
}
