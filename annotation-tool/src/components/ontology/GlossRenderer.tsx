import { Box, Chip } from '@mui/material'
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
    return inline ? <span /> : <Box />
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

  const getChipStyle = (kind: string) => {
    switch (kind) {
      case 'type':       return { color: 'primary' as const,   variant: 'outlined' as const, fontStyle: 'italic' }
      case 'object':     return { color: 'secondary' as const, variant: 'outlined' as const, fontStyle: 'normal' }
      case 'annotation': return { color: 'warning' as const,   variant: 'outlined' as const, fontStyle: 'normal' }
      case 'claim':      return { color: 'info' as const,      variant: 'outlined' as const, fontStyle: 'normal' }
      default:           return { color: 'default' as const,   variant: 'outlined' as const, fontStyle: 'normal' }
    }
  }

  if (inline) {
    // For inline rendering, return a span container to avoid nesting issues
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>
        {gloss.map((item, index) => {
          const display = getItemDisplay(item)
          if (item.type === 'text') {
            return <span key={index}>{display.name}</span>
          } else {
            const chipProps = getChipStyle(display.kind)
            return (
              <Chip
                key={index}
                label={display.name}
                size="small"
                color={chipProps.color}
                variant={chipProps.variant}
                component="span"
                sx={{
                  mx: 0.5,
                  verticalAlign: 'baseline',
                  height: 20,
                  fontStyle: chipProps.fontStyle,
                }}
              />
            )
          }
        })}
      </span>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      {gloss.map((item, index) => {
        const display = getItemDisplay(item)
        if (item.type === 'text') {
          return <span key={index}>{display.name}</span>
        } else {
          const chipProps = getChipStyle(display.kind)
          return (
            <Chip
              key={index}
              label={display.name}
              size="small"
              color={chipProps.color}
              variant={chipProps.variant}
              sx={{ fontStyle: chipProps.fontStyle }}
            />
          )
        }
      })}
    </Box>
  )
}