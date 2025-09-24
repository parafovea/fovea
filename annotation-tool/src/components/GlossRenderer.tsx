import { Box, Chip } from '@mui/material'
import { useSelector } from 'react-redux'
import { GlossItem } from '../models/types'
import { RootState } from '../store/store'

interface GlossRendererProps {
  gloss: GlossItem[]
  personaId?: string | null
  inline?: boolean
}

export function GlossRenderer({ gloss, personaId, inline = false }: GlossRendererProps) {
  const { personaOntologies } = useSelector((state: RootState) => state.persona)
  const { entities, events, times } = useSelector((state: RootState) => state.world)
  const activeOntology = personaOntologies.find(o => o.personaId === personaId)

  const getItemDisplay = (item: GlossItem): { name: string; found: boolean; isObject?: boolean } => {
    if (item.type === 'text') {
      return { name: item.content, found: true }
    }

    // Look up type reference
    if (item.type === 'typeRef') {
      let typeObj: any = null
      
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
        }
      }

      return {
        name: typeObj ? typeObj.name : item.content,
        found: !!typeObj,
        isObject: false
      }
    }

    // Look up object reference
    if (item.type === 'objectRef') {
      let obj: any = null
      
      switch (item.refType) {
        case 'entity-object':
        case 'location-object':
          obj = entities.find(e => e.id === item.content)
          break
        case 'event-object':
          obj = events.find(e => e.id === item.content)
          break
        case 'time-object':
          obj = times.find(t => t.id === item.content)
          if (obj) {
            obj = { ...obj, name: `Time: ${obj.type === 'instant' ? (obj as any).timestamp || 'instant' : 'interval'}` }
          }
          break
      }

      return {
        name: obj ? obj.name : item.content,
        found: !!obj,
        isObject: true
      }
    }

    return { name: item.content, found: false }
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
            return (
              <Chip
                key={index}
                label={display.name}
                size="small"
                color={display.isObject ? 'secondary' : 'primary'}
                variant={display.isObject ? 'filled' : 'outlined'}
                component="span"
                sx={{ 
                  mx: 0.5, 
                  verticalAlign: 'baseline', 
                  height: 20,
                  fontStyle: display.isObject ? 'normal' : 'italic'
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
          return (
            <Chip
              key={index}
              label={display.name}
              size="small"
              color={display.isObject ? 'secondary' : 'primary'}
              variant={display.isObject ? 'filled' : 'outlined'}
              sx={{ fontStyle: display.isObject ? 'normal' : 'italic' }}
            />
          )
        }
      })}
    </Box>
  )
}

// Helper function for simple text rendering (no React components)
export function glossToText(gloss: GlossItem[], activeOntology?: any, worldData?: { entities: any[], events: any[], times: any[] }): string {
  return gloss.map(item => {
    if (item.type === 'text') {
      return item.content
    }
    
    if (item.type === 'typeRef') {
      let typeObj: any = null
      if (activeOntology) {
        switch (item.refType) {
          case 'entity':
            typeObj = activeOntology.entities.find((e: any) => e.id === item.content)
            break
          case 'role':
            typeObj = activeOntology.roles.find((r: any) => r.id === item.content)
            break
          case 'event':
            typeObj = activeOntology.events.find((e: any) => e.id === item.content)
            break
        }
      }
      return typeObj ? `[${typeObj.name}]` : `[${item.content}]`
    }
    
    if (item.type === 'objectRef' && worldData) {
      let obj: any = null
      switch (item.refType) {
        case 'entity-object':
        case 'location-object':
          obj = worldData.entities.find((e: any) => e.id === item.content)
          break
        case 'event-object':
          obj = worldData.events.find((e: any) => e.id === item.content)
          break
        case 'time-object':
          obj = worldData.times.find((t: any) => t.id === item.content)
          if (obj) {
            obj = { ...obj, name: `Time: ${obj.type === 'instant' ? obj.timestamp || 'instant' : 'interval'}` }
          }
          break
      }
      return obj ? `[${obj.name}]` : `[${item.content}]`
    }
    
    return `[${item.content}]`
  }).join(' ')
}