import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import { buildApp } from './app.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Initializes the data directory for video storage.
 * Checks if the data directory exists and logs the result.
 */
async function initializeDataDirectory() {
  const dataDir = join(dirname(__dirname), '..', 'data')
  try {
    await fs.access(dataDir)
    console.log(`Data directory found at: ${dataDir}`)
  } catch {
    console.log('Data directory not found, will use sample data')
  }
}

/**
 * Starts the Fastify server.
 * Initializes the data directory and starts listening on the configured port.
 */
async function start() {
  const app = await buildApp()
  const PORT = parseInt(process.env.PORT || '3001', 10)

  try {
    await initializeDataDirectory()
    await app.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()