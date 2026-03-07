import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { GlossItem, TimeInstant, EntityType, RoleType, EventType, RelationType, Entity, Event, Time, Location, Claim } from '@models/types'
import { usePersonaOntology, useWorld } from '@store/queries'

interface GlossRendererProps {
  gloss: GlossItem[]
  personaId?: string | null
  inline?: boolean
  claims?: Claim[]
}

export function GlossRenderer({ gloss, personaId, inline = false, claims = [] }: GlossRendererProps) {
  // TanStack Query hooks for data fetching
  const { data: activeOntology } = usePersonaOntology(personaId)
  const { data: world } = useWorld()
  const entities = world?.entities ?? []
  const events = world?.events ?? []
  const times = world?.times ?? []

  // Handle undefined or null gloss
  if (!gloss || !Array.isArray(gloss)) {
    return inline ? <span /> : <div />
  }

  const getItemDisplay = (item: GlossItem): { name: string; found: boolean; kind: 'text' | 'type' | 'object' | 'annotation' | 'claim' } => {
    if (item.type === 'text') {
      return { name: item.content, found: true, kind: 'text' }
    }

    // Look up type reference
    if (item.type === 'typeRef') {
      let typeObj: EntityType | RoleType | EventType | RelationType | undefined = undefined

      if (activeOntology) {
        switch (item.refType) {
          case 'entity':
            typeObj = activeOntology.entities.find(e => e.id === item.content)
            break
          case 'role':
            typeObj = activeOntology.roles.find(r => r.id === item.content)
            break
          case 'event':
            typeObj = activeOntology.events.find(e => e.id === item.content)
            break
          case 'relation':
            typeObj = activeOntology.relationTypes.find(r => r.id === item.content)
            break
        }
      }

      return {
        name: typeObj ? typeObj.name : item.content,
        found: !!typeObj,
        kind: 'type' as const
      }
    }

    // Look up object reference
    if (item.type === 'objectRef') {
      let foundObj: Entity | Event | Time | Location | undefined = undefined
      let displayName = item.content

      switch (item.refType) {
        case 'entity-object':
        case 'location-object':
          foundObj = entities.find(e => e.id === item.content)
          if (foundObj) displayName = foundObj.name
          break
        case 'event-object':
          foundObj = events.find(e => e.id === item.content)
          if (foundObj) displayName = foundObj.name
          break
        case 'time-object':
          foundObj = times.find(t => t.id === item.content)
          if (foundObj) {
            displayName = `Time: ${foundObj.type === 'instant' ? (foundObj as TimeInstant).timestamp || 'instant' : 'interval'}`
          }
          break
      }

      return {
        name: displayName,
        found: !!foundObj,
        kind: 'object' as const
      }
    }

    // Look up annotation reference
    if (item.type === 'annotationRef') {
      return { name: item.content, found: false, kind: 'annotation' as const }
    }

    // Look up claim reference
    if (item.type === 'claimRef') {
      const claim = claims.find(c => c.id === item.content)
      if (claim) {
        const claimText = claim.gloss
          ?.map(g => {
            if (g.type === 'text') return g.content
            const inner = getItemDisplay(g)
            return inner.name
          })
          .join('')
          .slice(0, 40) || 'Claim'
        return { name: claimText, found: true, kind: 'claim' as const }
      }
      return { name: item.content, found: false, kind: 'claim' as const }
    }

    return { name: item.content, found: false, kind: 'text' as const }
  }

  const getBadgeVariant = (kind: string): 'outline' | 'default' | 'secondary' => {
    switch (kind) {
      case 'type':       return 'outline'
      case 'object':     return 'secondary'
      case 'annotation': return 'outline'
      case 'claim':      return 'outline'
      default:           return 'outline'
    }
  }

  const getBadgeClassName = (kind: string): string => {
    switch (kind) {
      case 'type':       return 'text-primary border-primary italic'
      case 'object':     return 'text-secondary-foreground'
      case 'annotation': return 'text-orange-600 border-orange-600'
      case 'claim':      return 'text-blue-600 border-blue-600'
      default:           return ''
    }
  }

  if (inline) {
    // For inline rendering, return a span container to avoid nesting issues
    return (
      <span className="inline-flex items-center flex-wrap">
        {gloss.map((item, index) => {
          const display = getItemDisplay(item)
          if (item.type === 'text') {
            return <span key={index}>{display.name}</span>
          } else {
            return (
              <Badge
                key={index}
                variant={getBadgeVariant(display.kind)}
                className={cn('mx-1 align-baseline h-5', getBadgeClassName(display.kind))}
              >
                {display.name}
              </Badge>
            )
          }
        })}
      </span>
    )
  }

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {gloss.map((item, index) => {
        const display = getItemDisplay(item)
        if (item.type === 'text') {
          return <span key={index}>{display.name}</span>
        } else {
          return (
            <Badge
              key={index}
              variant={getBadgeVariant(display.kind)}
              className={cn(getBadgeClassName(display.kind))}
            >
              {display.name}
            </Badge>
          )
        }
      })}
    </div>
  )
}
