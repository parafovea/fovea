import { GlossItem, PersonaOntology, WorldStateData, TimeInstant } from '../models/types'

/**
 * Helper function for simple text rendering of gloss items (no React components)
 * @param gloss Array of gloss items to convert to text
 * @param activeOntology Optional persona ontology for type lookups
 * @param worldData Optional world data for object lookups
 * @returns Plain text representation of the gloss
 */
export function glossToText(
  gloss: GlossItem[],
  activeOntology?: PersonaOntology,
  worldData?: WorldStateData
): string {
  return gloss
    .map((item) => {
      if (item.type === 'text') {
        return item.content
      }

      if (item.type === 'typeRef') {
        let typeObj: { name: string } | undefined
        if (activeOntology) {
          switch (item.refType) {
            case 'entity':
              typeObj = activeOntology.entities.find((e) => e.id === item.content)
              break
            case 'role':
              typeObj = activeOntology.roles.find((r) => r.id === item.content)
              break
            case 'event':
              typeObj = activeOntology.events.find((e) => e.id === item.content)
              break
          }
        }
        return typeObj ? typeObj.name : item.content
      }

      if (item.type === 'objectRef') {
        let obj: { name: string } | undefined
        if (worldData) {
          switch (item.refType) {
            case 'entity-object':
            case 'location-object':
              obj = worldData.entities.find((e) => e.id === item.content)
              break
            case 'event-object':
              obj = worldData.events.find((e) => e.id === item.content)
              break
            case 'time-object':
              const timeObj = worldData.times.find((t) => t.id === item.content)
              if (timeObj) {
                obj = {
                  name: `Time: ${timeObj.type === 'instant' ? (timeObj as TimeInstant).timestamp || 'instant' : 'interval'}`,
                }
              }
              break
          }
        }
        return obj ? obj.name : item.content
      }

      return item.content
    })
    .join(' ')
}
