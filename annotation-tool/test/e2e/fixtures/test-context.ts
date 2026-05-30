import { test as base } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AnnotationWorkspacePage } from '../page-objects/AnnotationWorkspacePage.js'
import { VideoBrowserPage } from '../page-objects/VideoBrowserPage.js'
import { OntologyWorkspacePage } from '../page-objects/OntologyWorkspacePage.js'
import { ObjectWorkspacePage } from '../page-objects/ObjectWorkspacePage.js'
import { DatabaseHelper, User, Persona, Video, EntityType, EventType, RoleType, RelationType } from '../utils/database-helpers.js'

/**
 * Worker-scoped fixtures (shared across all tests in a worker).
 */
type WorkerFixtures = {
  workerDb: DatabaseHelper
  workerUser: User
  workerSessionToken: string
  /**
   * Worker-scoped microvent seed: imports the filtered microvent JSONL
   * (4 realistic personas — "Automated"/Analyst, "Tech-Curious
   * Spectator", "USCG Marine Inspector", "LoanDepot Park Guest Services
   * Usher" — with their ontologies including types like gunshot, race,
   * humanoid robot, dust cloud, citizen journalist, plus 13 summaries
   * and 97 claims linked to videos that exist in the videos/ directory)
   * into the worker user exactly once per worker. Tour E2E specs read
   * this for the realistic running-example state they drive against.
   */
  microventSeed: MicroventSeedInfo
}

interface MicroventSeedInfo {
  /** Video IDs (md5(filename)[0:16]) that have at least one imported summary. */
  videosWithSummaries: string[]
  /** Video IDs that have at least one imported claim. */
  videosWithClaims: string[]
  /** Total import summary line counts as reported by /api/import. */
  totalLines: number
  /** Names of the personas that successfully imported under the worker user. */
  personaNames: string[]
}

/**
 * Test-scoped fixtures (created fresh for each test).
 */
type TestFixtures = {
  annotationWorkspace: AnnotationWorkspacePage
  videoBrowser: VideoBrowserPage
  ontologyWorkspace: OntologyWorkspacePage
  objectWorkspace: ObjectWorkspacePage
  db: DatabaseHelper
  testUser: User
  testPersona: Persona
  testPersonaPersistent: Persona
  testVideo: Video
  testEntityType: EntityType
  testEntityTypePersistent: EntityType
  testEventType: EventType
  testRoleType: RoleType
  testRelationType: RelationType
  testClaimRelationType: RelationType
}

/**
 * Extended test with custom fixtures.
 * Use this instead of @playwright/test's test export to get access to fixtures.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  /**
   * Annotation workspace page object.
   * Automatically created for each test.
   * Depends on testUser to ensure authentication is set up.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  annotationWorkspace: async ({ page, testUser }, use) => {
    const workspace = new AnnotationWorkspacePage(page)
    await use(workspace)
  },

  /**
   * Video browser page object.
   * Automatically created for each test.
   * Depends on testUser to ensure authentication is set up.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  videoBrowser: async ({ page, testUser }, use) => {
    const browser = new VideoBrowserPage(page)
    await use(browser)
  },

  // Worker-scoped fixtures (shared across all tests in worker)
  // @ts-expect-error - browser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  workerDb: [async ({ browser }, use) => {
    const db = new DatabaseHelper('http://localhost:3000')
    await db.connect()
    await use(db)
    await db.disconnect()
  }, { scope: 'worker' }],

  workerUser: [async ({ workerDb }, use, workerInfo) => {
    const timestamp = Date.now()
    const username = `test-worker-${workerInfo.workerIndex}-${timestamp}`
    const displayName = `Test User (Worker ${workerInfo.workerIndex})`
    const password = 'test-password-123'

    // Worker users get systemRole='system_admin' so the buildAbilities()
    // shortcut (`if (roles.systemRole === 'system_admin')`) returns
    // can('manage', 'all') and every CASL check downstream short-circuits
    // to allowed. Without this, persona/world-state/annotation creates
    // return 403 because no RolePermission rows are seeded for the
    // per-worker users we create on the fly. (isAdmin alone does NOT
    // bypass CASL — only systemRole does.)
    const user = await workerDb.createUser({
      username,
      displayName,
      password,
      isAdmin: true,
      systemRole: 'system_admin'
    })

    await use(user)

    // Cleanup: delete user and all associated data
    await workerDb.deleteUser(user.id)
  }, { scope: 'worker' }],

  workerSessionToken: [async ({ workerUser, workerDb }, use) => {
    const password = 'test-password-123'

    // Authenticate to get session token
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: workerUser.username, password })
    })

    if (!loginResponse.ok) {
      throw new Error(`Failed to login as ${workerUser.username}: ${loginResponse.status}`)
    }

    // Extract session token
    const cookies = loginResponse.headers.get('set-cookie')
    const cookieMatch = cookies?.match(/session_token=([^;]+)/)

    if (!cookieMatch) {
      throw new Error('Failed to extract session token from login response')
    }

    // Inject the worker user's token into workerDb so every create*Type /
    // ontology fetch resolves to the worker user (otherwise unauthenticated
    // requests fall into the "only system personas visible" branch and 404).
    workerDb.setSessionToken(cookieMatch[1])

    await use(cookieMatch[1])

    workerDb.setSessionToken(null)
  }, { scope: 'worker' }],

  /**
   * Worker-scoped microvent seed. Parses the bundled microvent JSONL
   * and replays it onto the worker user through the regular
   * DatabaseHelper.createPersona / createEntityType / createEventType /
   * createRoleType / createRelationType helpers — the same path every
   * other E2E fixture in this file uses. We deliberately do NOT round-
   * trip through /api/import here; that endpoint is exercised by its
   * own dedicated tests, and using it from a test fixture would just
   * add file-upload boilerplate without changing what we're seeding.
   *
   * The seeded state: four realistic personas — "Automated" / Analyst
   * (richest ontology: gunshot, race, humanoid robot, music,
   * loudspeaker, building, construction worker, dust cloud, citizen
   * journalist), "Tech-Curious Spectator", "USCG Marine Inspector",
   * "LoanDepot Park Guest Services Usher" — each with their ontology
   * rows (entity types, event types, roles, relation types). Summary
   * and claim rows from the export are skipped here because those need
   * specific videoIds to exist as Video rows AND a non-trivial seeding
   * sequence (claim → summary → audio) that would be reseeded by Tour 7
   * itself when it runs through the summaries-and-claims pipeline.
   *
   * The fixture returns the names of the personas that landed plus
   * their persona IDs so tour-flow specs can pick a specific persona
   * for the right tour ("Automated" for the rich-ontology tours,
   * "Tech-Curious Spectator" for the on-ramp / Tour 1).
   */
  microventSeed: [async ({ workerDb, workerUser, workerSessionToken }, use) => {
    void workerSessionToken // dependency: ensures cookie injection ran
    const jsonlPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      'microvent-seed.jsonl',
    )
    const lines = readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean)

    interface ExportPersona { id: string; name: string; role: string; informationNeed?: string }
    interface ExportOntology {
      personaId: string
      entityTypes?: Array<{ name: string; gloss?: unknown; wikidataId?: string | null }>
      eventTypes?: Array<{ name: string; gloss?: unknown }>
      roles?: Array<{ name: string; gloss?: unknown; allowedFillerTypes?: string[] }>
      relationTypes?: Array<{ name: string; gloss?: unknown; sourceTypes?: string[]; targetTypes?: string[] }>
    }
    interface ExportRow { type: string; data: unknown }

    const personaIdMap = new Map<string, string>()
    const personaNames: string[] = []

    // Pass 1: personas. The export's ids are someone else's UUIDs; we
    // remap to whatever the worker user's createPersona returns.
    for (const line of lines) {
      const row = JSON.parse(line) as ExportRow
      if (row.type !== 'persona') continue
      const d = row.data as ExportPersona
      // createPersona reads the session token from its second arg (not
      // from the helper's internal state) — pass it explicitly so the
      // POST is authenticated. The createEntityType / createEventType /
      // createRoleType / createRelationType helpers use authHeaders()
      // off internal state, which workerSessionToken set above.
      const created = await workerDb.createPersona({
        userId: workerUser.id,
        name: d.name,
        role: d.role,
      }, workerSessionToken)
      personaIdMap.set(d.id, created.id)
      personaNames.push(d.name)
    }

    // Pass 2: ontology rows — entity / event / role / relation types.
    // Each row carries the OLD personaId; we use the remap to find
    // which new persona owns the types.
    for (const line of lines) {
      const row = JSON.parse(line) as ExportRow
      if (row.type !== 'ontology') continue
      const o = row.data as ExportOntology
      const newPersonaId = personaIdMap.get(o.personaId)
      if (!newPersonaId) continue
      // The DB helpers take `definition` as a plain string; the export
      // stores `gloss` as `[{type: 'text', content: '...'}, ...]`. Pull
      // the first text segment so the seeded types display reasonably.
      const glossText = (g: unknown): string => {
        if (Array.isArray(g)) {
          const first = g.find(
            (x): x is { type: string; content: string } =>
              !!x && typeof x === 'object' && (x as { type?: string }).type === 'text',
          )
          if (first) return first.content
        }
        return ''
      }
      for (const t of o.entityTypes ?? []) {
        await workerDb.createEntityType(newPersonaId, {
          name: t.name,
          definition: glossText(t.gloss),
        })
      }
      for (const t of o.eventTypes ?? []) {
        await workerDb.createEventType(newPersonaId, {
          name: t.name,
          definition: glossText(t.gloss),
        })
      }
      for (const t of o.roles ?? []) {
        await workerDb.createRoleType(newPersonaId, {
          name: t.name,
          definition: glossText(t.gloss),
          allowedFillerTypes: t.allowedFillerTypes ?? [],
        })
      }
      for (const t of o.relationTypes ?? []) {
        await workerDb.createRelationType(newPersonaId, {
          name: t.name,
          definition: glossText(t.gloss),
          sourceTypes: t.sourceTypes ?? [],
          targetTypes: t.targetTypes ?? [],
        })
      }
    }

    // Pass 3: collect videoIds-with-data hints from the export so tour-
    // flow specs can pick a "rich" video when needed. We don't seed
    // summaries/claims here — Tour 7 will exercise those code paths
    // itself via the UI.
    const videosWithSummaries = new Set<string>()
    const videosWithClaims = new Set<string>()
    const summaryToVideo = new Map<string, string>()
    for (const line of lines) {
      const row = JSON.parse(line) as ExportRow
      if (row.type === 'summary') {
        const d = row.data as { id?: string; videoId?: string }
        if (d.id && d.videoId) {
          summaryToVideo.set(d.id, d.videoId)
          videosWithSummaries.add(d.videoId)
        }
      }
    }
    for (const line of lines) {
      const row = JSON.parse(line) as ExportRow
      if (row.type === 'claim') {
        const d = row.data as { summaryId?: string }
        const v = d.summaryId ? summaryToVideo.get(d.summaryId) : null
        if (v) videosWithClaims.add(v)
      }
    }

    await use({
      videosWithSummaries: Array.from(videosWithSummaries),
      videosWithClaims: Array.from(videosWithClaims),
      totalLines: lines.length,
      personaNames,
    })
  }, { scope: 'worker' }],

  // Test-scoped fixtures (use worker fixtures)
  db: async ({ workerDb, workerUser }, use) => {
    // Clean WorldState before each test to ensure isolation
    // (all tests in a worker share the same user/WorldState)
    await workerDb.cleanup(workerUser.id)
    await use(workerDb)
    // No cleanup after - let the next test's beforeEach cleanup handle it
  },

  testUser: async ({ workerUser, workerSessionToken, context }, use) => {
    // Add authentication cookie to this test's browser context
    await context.addCookies([{
      name: 'session_token',
      value: workerSessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax'
    }])

    await use(workerUser)
  },

  /**
   * Test persona fixture.
   * Creates a test persona before the test and cleans up after.
   * Depends on testUser fixture.
   */
  testPersona: async ({ db, testUser, workerSessionToken }, use) => {
    const persona = await db.createPersona({
      userId: testUser.id,
      name: 'Test Analyst',
      role: 'Intelligence Analyst'
    }, workerSessionToken)
    await use(persona)
    await db.deletePersona(persona.id)
  },

  /**
   * Persistent test persona fixture for persistence tests.
   *
   * Returns ONE persona per worker user, identified by the unique
   * (userId, name="Test Analyst (Persistent)") tuple. Earlier versions
   * of this fixture unconditionally created a new persona on every
   * test, accumulating duplicates within a worker — the summary-
   * persistence and annotation-persistence specs then hit a strict-mode
   * violation when `getByRole('option').filter({ hasText: 'Test Analyst
   * (Persistent)' })` resolved to N copies of the same-named persona.
   * Dedupe by querying the user's personas first and reusing an
   * existing match; only create a fresh persona on the first call.
   * Worker-level cleanup still owns the deletion at the end of the
   * worker's lifecycle (the test does NOT delete on teardown so
   * persisted-annotation data survives the reload assertion).
   */
  // Name includes workerIndex + first 8 chars of testUser.id so admin
  // sessions see globally-unique options even when previous test runs
  // left orphans in the database.
  testPersonaPersistent: async ({ db, testUser, workerSessionToken }, use, testInfo) => {
    const personaName = `Test Analyst (Persistent W${testInfo.workerIndex}-${testUser.id.slice(0, 8)})`
    const existing = await db.findPersonaByName(testUser.id, personaName, workerSessionToken)
    const persona = existing ?? await db.createPersona({
      userId: testUser.id,
      name: personaName,
      role: 'Intelligence Analyst'
    }, workerSessionToken)
    await use(persona)
  },

  /**
   * Test video fixture.
   * Fetches the first available video from the backend.
   * Test data only contains webm files for browser compatibility.
   */
  testVideo: async ({ workerSessionToken }, use, testInfo) => {
    const response = await fetch('http://localhost:3001/api/videos', {
      headers: { Cookie: `session_token=${workerSessionToken}` }
    })
    const videos = await response.json()

    if (!Array.isArray(videos) || videos.length === 0) {
      throw new Error('No videos found in test environment. Ensure test-data directory has videos.')
    }

    // Spread workers across the available videos so parallel test runs
    // don't all hit annotations on the same video row.
    const video = videos[testInfo.workerIndex % videos.length]

    // Delete annotations + summaries on this video before each test so
    // residue from a prior test in the same worker (or a parallel worker
    // before the testVideo stripe rotation) doesn't bleed into the
    // current test's assertions about counts / persistence / visibility.
    const annsRes = await fetch(`http://localhost:3001/api/annotations/${video.id}`, {
      headers: { Cookie: `session_token=${workerSessionToken}` },
    })
    if (annsRes.ok) {
      const anns = (await annsRes.json()) as Array<{ id: string }>
      await Promise.all(
        anns.map((a) =>
          fetch(`http://localhost:3001/api/annotations/${video.id}/${a.id}`, {
            method: 'DELETE',
            headers: { Cookie: `session_token=${workerSessionToken}` },
          }),
        ),
      )
    }
    const summariesRes = await fetch(`http://localhost:3001/api/videos/${video.id}/summaries`, {
      headers: { Cookie: `session_token=${workerSessionToken}` },
    })
    if (summariesRes.ok) {
      const summaries = (await summariesRes.json()) as Array<{ id: string; personaId: string }>
      await Promise.all(
        summaries.map((s) =>
          fetch(`http://localhost:3001/api/videos/${video.id}/summaries/${s.personaId}`, {
            method: 'DELETE',
            headers: { Cookie: `session_token=${workerSessionToken}` },
          }),
        ),
      )
    }

    await use({
      id: video.id,
      filename: video.filename,
      duration: video.duration,
      fps: video.fps || 30
    })
  },

  /**
   * Ontology workspace page object.
   * Automatically created for each test.
   * Depends on testUser to ensure authentication is set up.
   * Clears localStorage to ensure fresh Zustand state.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ontologyWorkspace: async ({ page, testUser }, use) => {
    // Clear localStorage to ensure fresh state for ontology workspace tests
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())

    const workspace = new OntologyWorkspacePage(page)
    await use(workspace)
  },

  /**
   * Object workspace page object.
   * Automatically created for each test.
   * Depends on testUser to ensure authentication is set up.
   */
  // @ts-expect-error - testUser parameter establishes fixture dependency but is not used in function body
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  objectWorkspace: async ({ page, testUser }, use) => {
    const workspace = new ObjectWorkspacePage(page)
    await use(workspace)
  },

  /**
   * Test entity type fixture.
   * Creates a test entity type before the test and cleans up after.
   * Depends on testPersona fixture.
   */
  testEntityType: async ({ db, testPersona }, use) => {
    const entityType = await db.createEntityType(testPersona.id, {
      name: 'Test Entity Type',
      definition: 'A test entity type for E2E testing'
    })
    await use(entityType)
    // Cleanup is handled by persona deletion
  },

  /**
   * Persistent test entity type fixture for persistence tests.
   * Creates an entity type but does NOT delete it after the test.
   * Depends on testPersonaPersistent fixture.
   */
  testEntityTypePersistent: async ({ db, testPersonaPersistent }, use) => {
    const entityType = await db.createEntityType(testPersonaPersistent.id, {
      name: 'Test Entity Type (Persistent)',
      definition: 'A test entity type for persistence E2E testing'
    })
    await use(entityType)
    // Don't delete - let worker cleanup handle it
  },

  /**
   * Test event type fixture.
   * Creates a test event type before the test and cleans up after.
   * Depends on testPersona fixture.
   */
  testEventType: async ({ db, testPersona }, use) => {
    const eventType = await db.createEventType(testPersona.id, {
      name: 'Test Event Type',
      definition: 'A test event type for E2E testing'
    })
    await use(eventType)
    // Cleanup is handled by persona deletion
  },

  /**
   * Test role type fixture.
   * Creates a test role type before the test and cleans up after.
   * Depends on testPersona fixture.
   */
  testRoleType: async ({ db, testPersona }, use) => {
    const roleType = await db.createRoleType(testPersona.id, {
      name: 'Test Role Type',
      definition: 'A test role type for E2E testing',
      allowedFillerTypes: ['Person', 'Organization']
    })
    await use(roleType)
    // Cleanup is handled by persona deletion
  },

  /**
   * Test relation type fixture.
   * Creates a test relation type before the test and cleans up after.
   * Depends on testPersona fixture.
   */
  testRelationType: async ({ db, testPersona }, use) => {
    const relationType = await db.createRelationType(testPersona.id, {
      name: 'Test Relation Type',
      definition: 'A test relation type for E2E testing',
      sourceTypes: ['Person'],
      targetTypes: ['Organization']
    })
    await use(relationType)
    // Cleanup is handled by persona deletion
  },

  /**
   * Test claim relation type fixture.
   * Creates a claim-to-claim relation type for testing claim relations.
   * Depends on testPersona fixture.
   */
  testClaimRelationType: async ({ db, testPersona }, use) => {
    const relationType = await db.createRelationType(testPersona.id, {
      name: 'Supports',
      definition: 'One claim supports another claim',
      sourceTypes: ['claim'],
      targetTypes: ['claim']
    })
    await use(relationType)
    // Cleanup is handled by persona deletion
  }
})

/**
 * Export expect from @playwright/test for consistency.
 */
export { expect } from '@playwright/test'
