import { FastifyInstance } from 'fastify'
import { existsSync, readFileSync } from 'fs'
import { config } from '../config.js'

/**
 * Load ID mapping from file if it exists.
 * Maps Wikidata IDs to local Wikibase IDs.
 */
function loadIdMapping(path: string | undefined): Record<string, string> | null {
  if (!path || !existsSync(path)) {
    return null
  }
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as Record<string, string>
  } catch {
    return null
  }
}

/**
 * Configuration routes.
 * Provides application configuration to the frontend.
 */
export default async function configRoutes(fastify: FastifyInstance) {
  /**
   * Get application configuration.
   * Returns mode, registration settings, and Wikidata configuration.
   *
   * @returns Configuration object with mode, allowRegistration, and wikidata settings
   */
  fastify.get('/api/config', async () => {
    const mode = config.mode.current
    const allowRegistration = config.auth.allowRegistration

    // Wikidata/Wikibase configuration
    const wikidataMode = config.wikidata.mode
    const wikidataUrl = config.wikidata.url

    // Load ID mapping for offline mode
    const idMappingPath = config.wikidata.idMappingPath
    const idMapping =
      wikidataMode === 'offline' ? loadIdMapping(idMappingPath) : null

    // External link controls. ALLOW_EXTERNAL_LINKS is a master switch
    // that defaults both specific settings; the derivation lives in config.
    const allowExternalWikidataLinks = config.externalLinks.wikidata(wikidataMode)
    const allowExternalVideoSourceLinks = config.externalLinks.videoSources

    return {
      mode: mode as 'single-user' | 'multi-user',
      allowRegistration,
      wikidata: {
        mode: wikidataMode as 'online' | 'offline',
        url: wikidataUrl,
        idMapping,
        allowExternalLinks: allowExternalWikidataLinks,
      },
      externalLinks: {
        wikidata: allowExternalWikidataLinks,
        videoSources: allowExternalVideoSourceLinks,
      },
    }
  })
}
