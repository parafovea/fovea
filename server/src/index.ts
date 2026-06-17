// Load and validate configuration FIRST, before any other import.
// `config` reads process.env once, fails fast on invalid/missing required
// values, and must throw before OTEL, Fastify, or Prisma initialize.
import { config } from './config.js'
// Initialize OpenTelemetry tracing before the remaining imports so
// auto-instrumentation can hook into libraries as they load.
import './tracing.js'

import fs from 'fs/promises'
import { buildApp } from './app.js'
import { ensureDefaultUser, isSingleUserMode } from './services/user-service.js'

/**
 * Initializes the data directory for video storage.
 * Checks if the data directory exists and logs the result.
 */
async function initializeDataDirectory() {
  const dataDir = config.storage.path
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
  // Only auto-sync in dev/test - production should sync manually
  if (!config.server.isProduction) {
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
 * Connects to the database with retry logic.
 * Ensures the database is reachable before accepting requests.
 */
async function connectDatabase(maxRetries = 5, delayMs = 2000) {
  const { prisma } = await import('./lib/prisma.js')

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect()
      console.log('Database connected successfully')
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === maxRetries) {
        console.error(`Failed to connect to database after ${maxRetries} attempts: ${message}`)
        throw error
      }
      console.warn(`Database connection attempt ${attempt}/${maxRetries} failed: ${message}. Retrying in ${delayMs}ms...`)
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

/**
 * Starts the Fastify server.
 * Initializes the data directory, user mode, starts listening, then syncs videos.
 */
/**
 * Replays persisted SystemConfig rows to the model-service after startup.
 *
 * Runs after ``app.listen`` so the server is healthy even when the
 * model-service isn't reachable yet. Per-row failures are logged but do
 * not abort the server — an operator can hit "Replay" from the admin UI
 * once the model-service is back.
 */
async function initializeSystemConfigReplay(app: Awaited<ReturnType<typeof buildApp>>) {
  try {
    const { replaySystemConfigOnStartup } = await import(
      './services/system-config-propagator.js'
    )
    await replaySystemConfigOnStartup(app.prisma, app.log)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    app.log.warn(`SystemConfig startup replay failed: ${message}`)
  }
}

async function start() {
  const app = await buildApp()
  const PORT = config.server.port

  try {
    await connectDatabase()
    await initializeDataDirectory()
    await initializeSingleUserMode()
    await app.listen({ port: PORT, host: '0.0.0.0' })
    // Sync videos AFTER server is listening to ensure all subsystems are initialized
    await initializeVideoSync(app)
    // Push every persisted admin-config row to the model-service so a
    // fresh model-service process picks up operator settings automatically.
    await initializeSystemConfigReplay(app)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()