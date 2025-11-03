// Initialize OpenTelemetry tracing FIRST, before any other imports
// This allows auto-instrumentation to hook into libraries as they load
import './tracing.js'

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'
import { buildApp } from './app.js'
import { ensureDefaultUser, isSingleUserMode } from './services/user-service.js'

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
 * Initializes single-user mode if enabled.
 * Ensures the default user exists in the database.
 */
async function initializeSingleUserMode() {
  if (isSingleUserMode()) {
    console.log('Running in single-user mode')
    const defaultUser = await ensureDefaultUser()
    console.log(`Default user initialized: ${defaultUser.username} (${defaultUser.id})`)
  } else {
    console.log('Running in multi-user mode')
  }
}

/**
 * Starts the Fastify server.
 * Initializes the data directory, user mode, and starts listening on the configured port.
 */
async function start() {
  const app = await buildApp()
  const PORT = parseInt(process.env.PORT || '3001', 10)

  try {
    await initializeDataDirectory()
    await initializeSingleUserMode()
    await app.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()