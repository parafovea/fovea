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
  const dataDir = process.env.STORAGE_PATH || join(dirname(__dirname), '..', 'videos')
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
 * Syncs videos from storage to database on startup.
 * Only runs in development and test environments.
 * Production deployments should use manual sync via API.
 */
async function initializeVideoSync(app: Awaited<ReturnType<typeof buildApp>>) {
  const nodeEnv = process.env.NODE_ENV || 'development'

  // Only auto-sync in dev/test - production should sync manually
  if (nodeEnv !== 'production') {
    try {
      // Import storage modules
      const { loadStorageConfig, createVideoStorageProvider } = await import('./services/videoStorage.js')
      const { syncVideosFromStorage } = await import('./services/videoSync.js')

      // Initialize storage provider
      const storageConfig = loadStorageConfig()
      const storageProvider = createVideoStorageProvider(storageConfig)

      console.log(`Auto-syncing videos from ${storageConfig.type} storage to database...`)

      // Run sync
      const result = await syncVideosFromStorage(
        app.prisma,
        app.log,
        storageProvider,
        { type: storageConfig.type, localPath: storageConfig.localPath }
      )

      console.log(
        `Video sync complete: ${result.added} added, ${result.updated} updated, ` +
        `${result.errors} errors (${result.total} total)`
      )

      // Log warning if errors occurred
      if (result.errors > 0) {
        console.warn(`⚠️  ${result.errors} videos failed to sync - check logs for details`)
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Video sync error:', errorMessage)

      // In development/test, fail fast so issues are caught immediately
      throw error
    }
  } else {
    console.log('Production mode: Skipping auto-sync. Use POST /api/videos/sync to sync manually.')
  }
}

/**
 * Starts the Fastify server.
 * Initializes the data directory, user mode, starts listening, then syncs videos.
 */
async function start() {
  const app = await buildApp()
  const PORT = parseInt(process.env.PORT || '3001', 10)

  try {
    await initializeDataDirectory()
    await initializeSingleUserMode()
    await app.listen({ port: PORT, host: '0.0.0.0' })
    // Sync videos AFTER server is listening to ensure all subsystems are initialized
    await initializeVideoSync(app)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()