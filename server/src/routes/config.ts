import { FastifyInstance } from 'fastify'
import { existsSync, readFileSync } from 'fs'

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
    const mode = process.env.FOVEA_MODE || 'single-user'
    const allowRegistration = process.env.ALLOW_REGISTRATION === 'true'

    // Wikidata/Wikibase configuration
    const wikidataMode = process.env.WIKIDATA_MODE || 'online'
    const wikidataUrl =
      process.env.WIKIDATA_URL || 'https://www.wikidata.org/w/api.php'

    // Load ID mapping for offline mode
    const idMappingPath = process.env.WIKIBASE_ID_MAPPING_PATH
    const idMapping =
      wikidataMode === 'offline' ? loadIdMapping(idMappingPath) : null

    // External link controls
    // ALLOW_EXTERNAL_LINKS is a master switch that defaults both specific settings
    const masterExternalLinks = process.env.ALLOW_EXTERNAL_LINKS !== 'false'

    // Wikidata links: In online mode, always allowed. In offline mode, controlled by env var.
    const allowExternalWikidataLinks =
      wikidataMode === 'online' ||
      (process.env.ALLOW_EXTERNAL_WIKIDATA_LINKS === 'true' ||
        (process.env.ALLOW_EXTERNAL_WIKIDATA_LINKS !== 'false' && masterExternalLinks))

    // Video source links (uploaderUrl, webpageUrl): controlled by env var
    const allowExternalVideoSourceLinks =
      process.env.ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS === 'true' ||
      (process.env.ALLOW_EXTERNAL_VIDEO_SOURCE_LINKS !== 'false' && masterExternalLinks)

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
