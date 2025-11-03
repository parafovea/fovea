import { FastifyInstance } from 'fastify'

/**
 * Configuration routes.
 * Provides application configuration to the frontend.
 */
export default async function configRoutes(fastify: FastifyInstance) {
  /**
   * Get application configuration.
   * Returns mode and registration settings.
   *
   * @returns Configuration object with mode and allowRegistration
   */
  fastify.get('/api/config', async () => {
    const mode = process.env.FOVEA_MODE || 'single-user'
    const allowRegistration = process.env.ALLOW_REGISTRATION === 'true'

    return {
      mode: mode as 'single-user' | 'multi-user',
      allowRegistration,
    }
  })
}
