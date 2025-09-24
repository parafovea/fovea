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
  const activeOntology = personaOntologies.find(o => o.personaId === personaId)

  const getTypeDisplay = (item: GlossItem): { name: string; found: boolean } => {
    if (item.type === 'text') {
      return { name: item.content, found: true }
    }

    // Look up the type reference
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
      found: !!typeObj
    }
  }

  if (inline) {
    // For inline rendering, return a string with type names
    return (
      <>
        {gloss.map((item, index) => {
          const display = getTypeDisplay(item)
          if (item.type === 'text') {
            return <span key={index}>{display.name}</span>
          } else {
            return (
              <Chip
                key={index}
                label={display.name}
                size="small"
                color={display.found ? 'primary' : 'default'}
                variant={display.found ? 'filled' : 'outlined'}
                sx={{ mx: 0.5, verticalAlign: 'baseline', height: 20 }}
              />
            )
          }
        })}
      </>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      {gloss.map((item, index) => {
        const display = getTypeDisplay(item)
        if (item.type === 'text') {
          return <span key={index}>{display.name}</span>
        } else {
          return (
            <Chip
              key={index}
              label={`${item.refType}: ${display.name}`}
              size="small"
              color={display.found ? 'primary' : 'default'}
              variant={display.found ? 'filled' : 'outlined'}
            />
          )
        }
      })}
    </Box>
  )
}

// Helper function for simple text rendering (no React components)
export function glossToText(gloss: GlossItem[], activeOntology?: any): string {
  return gloss.map(item => {
    if (item.type === 'text') {
      return item.content
    }
    
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
  }).join(' ')
}