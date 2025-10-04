import { GlossItem } from '../models/types'

/**
 * Helper function for simple text rendering of gloss items (no React components)
 * @param gloss Array of gloss items to convert to text
 * @param activeOntology Optional persona ontology for type lookups
 * @param worldData Optional world data for object lookups
 * @returns Plain text representation of the gloss
 */
export function glossToText(
  gloss: GlossItem[],
  activeOntology?: any,
  worldData?: { entities: any[]; events: any[]; times: any[] }
): string {
  return gloss
    .map((item) => {
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
        return typeObj ? typeObj.name : item.content
      }

      if (item.type === 'objectRef') {
        let obj: any = null
        if (worldData) {
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
                obj = {
                  ...obj,
                  name: `Time: ${obj.type === 'instant' ? (obj as any).timestamp || 'instant' : 'interval'}`,
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
