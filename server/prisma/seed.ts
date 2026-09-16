import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

import { writeOntologyAggregate } from '../src/services/layers-bridge/ontology-bridge.js'
import { writeVideoAnnotation } from '../src/services/layers-bridge/annotation-bridge.js'
import { deriveId } from '../src/services/layers-id-map.js'
import type { BoundingBoxSequence } from '../src/services/layers-conversion-service.js'
import { seedPermissions } from './seed-permissions.js'

/**
 * Seeds the database with initial users and system personas.
 * Creates admin user, test user, default user for single-user mode, and Automated persona.
 * Associates existing personas with the default user.
 *
 * @param prismaClient - Optional Prisma client instance (for testing)
 */
export async function seedDatabase(prismaClient?: PrismaClient) {
  const prisma = prismaClient || new PrismaClient()

  console.log('Starting database seed...')

  // Create default admin user for multi-user mode
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD environment variable is required for seeding')
  }
  const adminPasswordHash = await bcrypt.hash(adminPassword, 12)
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    // Re-seed against an existing row also re-asserts systemRole: the
    // VideoAccessService and ability rules gate every "see all videos"
    // / "manage system" branch on `systemRole === 'system_admin'`,
    // and the prior `update` block only refreshed the password. A
    // deploy whose initial seed predated the systemRole column left
    // admin sitting at the column default of 'user' — the demo.fovea.video
    // "No videos found" regression on 2026-06-04 traced directly to
    // this: 99 synced videos in the DB but the admin's accessible-id
    // list was empty because the role gate evaluated false.
    update: {
      passwordHash: adminPasswordHash,
      systemRole: 'system_admin',
      isAdmin: true,
    },
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      displayName: 'Administrator',
      isAdmin: true,
      systemRole: 'system_admin',
    },
  })
  console.log('✓ Created admin user:', admin.username, '(systemRole:', admin.systemRole + ')')

  // Create test user for development (optional)
  const testPassword = process.env.TEST_USER_PASSWORD || 'test123'
  const testUserHash = await bcrypt.hash(testPassword, 12)
  const testUser = await prisma.user.upsert({
    where: { username: 'testuser' },
    update: {},
    create: {
      username: 'testuser',
      email: 'test@example.com',
      passwordHash: testUserHash,
      displayName: 'Test User',
      isAdmin: false,
    },
  })
  console.log('✓ Created test user:', testUser.username)

  // Create default user for single-user mode (no password)
  // Only create in single-user mode - not needed in multi-user mode
  const mode = process.env.FOVEA_MODE || 'single-user'
  let personaOwner

  if (mode === 'single-user') {
    const defaultUser = await prisma.user.upsert({
      where: { id: 'default-user' },
      update: {},
      create: {
        id: 'default-user',
        username: 'user',
        email: null,
        passwordHash: null, // No password required in single-user mode
        displayName: 'Default User',
        isAdmin: false, // NOT admin - security precaution
      },
    })
    console.log('✓ Created default user for single-user mode:', defaultUser.username)
    console.warn('⚠️  Default user has no password - only use FOVEA_MODE=single-user in local development!')
    personaOwner = defaultUser
  } else {
    console.log('ℹ️  Skipping default user creation (multi-user mode)')
    // In multi-user mode, assign personas to admin user
    personaOwner = admin
  }

  // Create or update the Automated persona
  const existingAutomated = await prisma.persona.findFirst({
    where: { name: 'Automated' },
  })

  // Automated persona hidden-flag policy:
  //
  // Non-demo deployments keep the Automated persona hidden so it does
  // not surface in the persona dropdown for end users — it exists so
  // the system has something to attribute admin-run inference to,
  // not so a user sees it as a workspace they can join.
  //
  // FOVEA_DEMO_MODE deployments need it visible: the public tour
  // catalogue's persona-rooted tours (ontology-authoring,
  // wikidata-augmentation, world-layer) all anchor against the
  // PersonaBrowser / persona dropdown, and an empty browser strands
  // every one of those tours with the "No personas found" empty
  // state in front of the StepCard. Unhiding it lets the seeded
  // ontology + persona double as the demo content the tours walk
  // visitors through, without inventing a separate demo-only persona
  // every operator would have to keep in sync with the tour scripts.
  const automatedHiddenFlag = process.env.FOVEA_DEMO_MODE !== 'true'
  let automatedPersona
  if (existingAutomated) {
    automatedPersona = await prisma.persona.update({
      where: { id: existingAutomated.id },
      data: {
        isSystemGenerated: true,
        hidden: automatedHiddenFlag,
      },
    })
    console.log(
      '✓ Updated Automated persona:',
      automatedPersona.name,
      '(hidden:',
      automatedHiddenFlag + ')',
    )
  } else {
    automatedPersona = await prisma.persona.create({
      data: {
        name: 'Automated',
        role: 'Analyst',
        informationNeed: 'Understanding the content and events in this video',
        isSystemGenerated: true,
        hidden: automatedHiddenFlag,
        userId: personaOwner.id,
      },
    })
    console.log(
      '✓ Created Automated persona:',
      automatedPersona.name,
      '(hidden:',
      automatedHiddenFlag + ')',
    )
  }

  // Create test ontology for Automated persona (for E2E tests) in the layers
  // store. writeOntologyAggregate upserts the LayersOntology and recreates its
  // TypeDefs, so re-seeding is idempotent.
  await writeOntologyAggregate(
    prisma,
    automatedPersona.id,
    {
      entityTypes: [
        {
          id: 'test-entity-person',
          name: 'Person',
          description: 'A person in the video',
          color: '#FF5722',
        },
        {
          id: 'test-entity-vehicle',
          name: 'Vehicle',
          description: 'A vehicle in the video',
          color: '#2196F3',
        },
        {
          id: 'test-entity-object',
          name: 'Object',
          description: 'An object in the video',
          color: '#4CAF50',
        },
      ],
      eventTypes: [],
      roleTypes: [],
      relationTypes: [],
    },
    {
      name: `${automatedPersona.name} ontology`,
      description: automatedPersona.informationNeed,
      domain: automatedPersona.domain,
    },
    { projectId: automatedPersona.projectId, createdByUserId: automatedPersona.userId },
  )
  console.log('✓ Seeded test ontology for Automated persona')

  // ─────────────────────────────────────────────────────────────
  // Demo-mode hand-authored personas + ontologies.
  //
  // FOVEA_DEMO_MODE deployments serve a curated tour catalogue that
  // walks visitors through specific real-world videos. Anchoring
  // every tour against the same generic Automated persona produces a
  // demo that feels untextured — visitors see "Person", "Vehicle",
  // "Object" types regardless of whether they are looking at a
  // ballpark crowd or a container-port collapse.
  //
  // These two personas give each tour-video pair a domain-shaped
  // ontology that reads as something an actual analyst working that
  // beat would author. Annotations the tour engine surfaces (foul
  // ball trajectories, container fall arcs) reference these
  // personas' types directly. Non-demo deployments keep the personas
  // hidden so they do not pollute a self-hoster's persona list.
  // ─────────────────────────────────────────────────────────────
  const demoPersonaHidden = process.env.FOVEA_DEMO_MODE !== 'true'

  async function upsertDemoPersona(args: {
    name: string
    role: string
    informationNeed: string
    ontology: {
      entityTypes: Array<{ id: string; name: string; description: string; color: string }>
      roleTypes?: Array<{ id: string; name: string; description: string; color: string }>
      eventTypes?: Array<{ id: string; name: string; description: string; color: string }>
      relationTypes?: Array<{ id: string; name: string; description: string; color: string }>
    }
  }) {
    let persona = await prisma.persona.findFirst({ where: { name: args.name } })
    if (persona) {
      persona = await prisma.persona.update({
        where: { id: persona.id },
        data: {
          role: args.role,
          informationNeed: args.informationNeed,
          isSystemGenerated: true,
          hidden: demoPersonaHidden,
        },
      })
      console.log(`✓ Updated demo persona: ${persona.name} (hidden: ${demoPersonaHidden})`)
    } else {
      persona = await prisma.persona.create({
        data: {
          name: args.name,
          role: args.role,
          informationNeed: args.informationNeed,
          isSystemGenerated: true,
          hidden: demoPersonaHidden,
          userId: personaOwner.id,
        },
      })
      console.log(`✓ Created demo persona: ${persona.name} (hidden: ${demoPersonaHidden})`)
    }
    await writeOntologyAggregate(
      prisma,
      persona.id,
      {
        entityTypes: args.ontology.entityTypes,
        roleTypes: args.ontology.roleTypes ?? [],
        eventTypes: args.ontology.eventTypes ?? [],
        relationTypes: args.ontology.relationTypes ?? [],
      },
      { name: `${persona.name} ontology`, description: persona.informationNeed, domain: persona.domain },
      { projectId: persona.projectId, createdByUserId: persona.userId },
    )
    console.log(`  ✓ Seeded ontology for ${persona.name}`)
    return persona
  }

  // Persona 1: Ballpark Guest Services Supervisor.
  // Anchors first-annotation, events-roles-claims, world-layer, and
  // summaries-and-claims tours (the 3 Phillies-Karen videos). The
  // ontology centres on spectators, foul balls, and the role
  // structure that distinguishes who-had-the-ball-when, which is
  // what the events-roles-claims tour's derived claim hinges on.
  const ballparkPersona = await upsertDemoPersona({
    name: 'Ballpark Guest Services Supervisor',
    role: 'Stadium operations analyst documenting spectator interactions for guest-experience review.',
    informationNeed:
      'Who had which souvenir, who took it from whom, and what crowd dynamics surrounded the exchange.',
    ontology: {
      entityTypes: [
        { id: 'type-spectator', name: 'Spectator', description: 'A fan attending the game in the stands.', color: '#3B82F6' },
        { id: 'type-foul-ball', name: 'Foul Ball', description: 'A baseball that has left the field of play into the stands.', color: '#F59E0B' },
        { id: 'type-souvenir', name: 'Souvenir', description: 'A keepable object received from in-game play (foul ball, broken bat, batting glove).', color: '#FB923C' },
        { id: 'type-seating-area', name: 'Seating Area', description: 'A contiguous section of stadium seats.', color: '#22C55E' },
        { id: 'type-staff', name: 'Stadium Staff', description: 'Employees of the venue: ushers, security, guest services.', color: '#10B981' },
      ],
      roleTypes: [
        { id: 'role-recipient', name: 'Recipient', description: 'The person who received the souvenir from someone else.', color: '#A78BFA' },
        { id: 'role-prior-holder', name: 'Prior Holder', description: 'The person who held the souvenir immediately before the current holder.', color: '#8B5CF6' },
        { id: 'role-grabber', name: 'Grabber', description: 'A person who took the souvenir from another spectator without that spectator consenting.', color: '#EF4444' },
        { id: 'role-witness', name: 'Witness', description: 'A spectator who observed the exchange but was not a party to it.', color: '#6B7280' },
      ],
      eventTypes: [
        { id: 'event-ball-catch', name: 'Ball Catch', description: 'A spectator catching a ball that came off the field of play.', color: '#F59E0B' },
        { id: 'event-ball-handoff', name: 'Ball Handoff', description: 'A spectator voluntarily giving a souvenir ball to another spectator (typically a child).', color: '#84CC16' },
        { id: 'event-ball-grab', name: 'Ball Grab', description: "A spectator taking a souvenir ball out of another spectator's possession without consent.", color: '#DC2626' },
        { id: 'event-ball-return', name: 'Ball Return', description: 'A spectator returning a souvenir to a prior holder after a guest-services intervention.', color: '#14B8A6' },
      ],
      relationTypes: [
        { id: 'relation-handed-to', name: 'handed-to', description: 'The source spectator voluntarily transferred the souvenir to the target spectator.', color: '#65A30D' },
        { id: 'relation-taken-from', name: 'taken-from', description: 'The source spectator took the souvenir out of the target spectator’s possession.', color: '#B91C1C' },
        { id: 'relation-witnessed-by', name: 'witnessed-by', description: 'The event was directly observed by the witness spectator.', color: '#6B7280' },
        { id: 'relation-located-in', name: 'located-in', description: 'The entity is in the named seating area.', color: '#0EA5E9' },
      ],
    },
  })

  // Persona 2: Port Safety Incident Investigator.
  // Anchors the model-in-the-loop tour against the ABC7 shipping
  // container collapse video. Ontology centres on cargo handling,
  // stack geometry, fall events, and the role structure that
  // matters for incident reports — which container originated
  // the cascade, which container struck which equipment, etc.
  const portPersona = await upsertDemoPersona({
    name: 'Port Safety Incident Investigator',
    role: 'Maritime safety analyst documenting cargo-handling incidents at container terminals.',
    informationNeed:
      'Which container failed first, what equipment was struck, and how the cascade propagated through the stack.',
    ontology: {
      entityTypes: [
        { id: 'type-container', name: 'Shipping Container', description: 'A standard intermodal cargo container (20-ft or 40-ft TEU/FEU).', color: '#EA580C' },
        { id: 'type-crane', name: 'Gantry Crane', description: 'A ship-to-shore gantry crane used to load and unload containers.', color: '#0EA5E9' },
        { id: 'type-stack', name: 'Container Stack', description: 'A vertical column of stacked containers on a vessel or in a yard.', color: '#92400E' },
        { id: 'type-vessel', name: 'Container Vessel', description: 'A ship that carries shipping containers.', color: '#1E3A8A' },
        { id: 'type-stevedore', name: 'Stevedore', description: 'A dockworker responsible for loading and unloading cargo.', color: '#10B981' },
      ],
      roleTypes: [
        { id: 'role-tipped-container', name: 'Tipped Container', description: 'The container that lost stability first.', color: '#F97316' },
        { id: 'role-falling-container', name: 'Falling Container', description: 'A container in active descent.', color: '#DC2626' },
        { id: 'role-impact-target', name: 'Impact Target', description: 'The object struck by a falling container.', color: '#B91C1C' },
        { id: 'role-origin-stack', name: 'Origin Stack', description: 'The stack where the cascade originated.', color: '#7C2D12' },
      ],
      eventTypes: [
        { id: 'event-container-tip', name: 'Container Tip', description: 'A container loses stability and begins to lean off its stack.', color: '#F97316' },
        { id: 'event-container-fall', name: 'Container Fall', description: 'A container falls from its stack.', color: '#DC2626' },
        { id: 'event-cargo-loss', name: 'Cargo Loss', description: 'Cargo is damaged or lost overboard during a handling incident.', color: '#991B1B' },
        { id: 'event-crane-collapse', name: 'Crane Collapse', description: 'Structural failure of a gantry crane.', color: '#7F1D1D' },
      ],
      relationTypes: [
        { id: 'relation-fell-from', name: 'fell-from', description: 'The falling container originated from the named stack.', color: '#9A3412' },
        { id: 'relation-struck', name: 'struck', description: 'The source object impacted the target object during the incident.', color: '#B91C1C' },
        { id: 'relation-on-vessel', name: 'on-vessel', description: 'The container is loaded on the named vessel.', color: '#1E3A8A' },
      ],
    },
  })

  // ─────────────────────────────────────────────────────────────
  // Demo-mode hand-authored annotations on the four tour videos.
  //
  // Anchor + tracker tours (first-annotation, events-roles-claims,
  // model-in-the-loop, world-layer, summaries-and-claims) all
  // expect the workspace to mount with annotations already present
  // — they walk through what an analyst would DO with a tracked
  // box, not how to draw one for the first time. Without these
  // seeds the workspace renders an empty canvas and every tour
  // step that anchors against a panel that mounts conditionally on
  // a selected annotation (quick-actions, tracking-results, claim
  // editor, claim relations viewer, motion-path overlay) paints
  // the missing-anchor banner.
  //
  // The sequences below are hand-authored against the real video
  // content (Phillies-Karen ball-grab, ABC7 container collapse).
  // They use the standard BoundingBoxSequence shape — same as
  // tracker output — so the workspace cannot tell them from a
  // real model-service run, and the tour narration's references
  // ('Phillies fan Karen', 'the foul ball', 'Container A')
  // line up with the bounding boxes a visitor sees on-screen.
  //
  // Admins authoring tours for a different corpus replace this
  // block with their own sequences (or, when GPU is available,
  // POST /api/videos/:id/detect with enableTracking=true against
  // their own clips and persist the response here).
  // ─────────────────────────────────────────────────────────────

  // The four tour videos, computed as md5(filename).slice(0, 16).
  const VIDEO_IDS = {
    crossingBroad: '049f160046238b2f',
    collinRugg: '8d9e6762f54408f4',
    amiriKing: 'cd0b278719bea692',
    abc7Containers: '1fd9993237cbc33b',
  } as const

  type Box = { frameNumber: number; x: number; y: number; width: number; height: number; confidence: number; isKeyframe: true }
  type SegType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  function makeFrames(keyframes: Box[], segTypes?: SegType[]): unknown {
    const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
    const start = sorted[0].frameNumber
    const end = sorted[sorted.length - 1].frameNumber
    const total = end - start + 1
    return {
      boxes: sorted,
      interpolationSegments: sorted.slice(0, -1).map((k, i) => ({
        startFrame: k.frameNumber,
        endFrame: sorted[i + 1].frameNumber,
        type: segTypes?.[i] ?? 'linear',
      })),
      visibilityRanges: [{ startFrame: start, endFrame: end, visible: true }],
      trackingSource: 'samurai',
      trackingConfidence: 0.92,
      totalFrames: total,
      keyframeCount: sorted.length,
      interpolatedFrameCount: Math.max(0, total - sorted.length),
    }
  }

  async function upsertDemoAnnotation(args: {
    stableId: string
    videoId: string
    personaId: string
    label: string
    frames: unknown
    confidence: number
    notes?: string
  }) {
    // The stableId derives the annotation's layers id so multiple distinct
    // tracks with the same label (three Spectator instances on Crossing Broad:
    // Karen, son, father) each persist as their own row, and re-seeding upserts
    // the same rows idempotently. The source is tagged 'demo-fixture:<stableId>'.
    await writeVideoAnnotation(
      prisma,
      {
        id: deriveId('demo-annotation', args.stableId),
        videoId: args.videoId,
        personaId: args.personaId,
        type: 'type',
        label: args.label,
        linkType: null,
        frames: args.frames as BoundingBoxSequence,
        confidence: args.confidence,
        source: `demo-fixture:${args.stableId}`,
      },
      { userId: personaOwner.id, projectId: null },
    )
  }

  // Verify the demo videos are in the database (they get there via
  // the S3 sync route on deployment startup). If they are missing
  // we skip annotation seeding entirely — there is nothing to attach
  // an annotation to, and a half-seeded set of demo videos would
  // produce a tour with anchors that resolve on some videos and not
  // others, which is more confusing than uniformly empty.
  const presentVideos = await prisma.video.findMany({
    where: { id: { in: Object.values(VIDEO_IDS) } },
    select: { id: true },
  })
  const haveAllVideos = presentVideos.length === Object.values(VIDEO_IDS).length

  if (haveAllVideos) {
    // Demo-fixture annotations are seeded with deterministic ids derived from
    // their stableId, so re-seeding upserts the same rows idempotently.

    // ABC7 shipping containers — model-in-the-loop tour. Three
    // tracked objects: Container A falls first (ease-in segments
    // describe the gravity-driven descent), Container B pivots
    // then follows, gantry crane stays put EXCEPT for a deliberate
    // tracker drift at frame 214 (the Tour 6 step 10 narration
    // walks the visitor through correcting the drift).
    await upsertDemoAnnotation({
      stableId: 'abc7-container-a',
      videoId: VIDEO_IDS.abc7Containers,
      personaId: portPersona.id,
      label: 'Shipping Container',
      confidence: 0.91,
      frames: makeFrames(
        [
          { frameNumber: 0,   x: 440, y: 140, width: 220, height: 240, confidence: 0.96, isKeyframe: true },
          { frameNumber: 30,  x: 438, y: 148, width: 220, height: 240, confidence: 0.95, isKeyframe: true },
          { frameNumber: 60,  x: 432, y: 168, width: 222, height: 240, confidence: 0.94, isKeyframe: true },
          { frameNumber: 90,  x: 422, y: 198, width: 224, height: 242, confidence: 0.92, isKeyframe: true },
          { frameNumber: 120, x: 410, y: 252, width: 226, height: 244, confidence: 0.90, isKeyframe: true },
          { frameNumber: 150, x: 396, y: 326, width: 228, height: 246, confidence: 0.88, isKeyframe: true },
          { frameNumber: 180, x: 376, y: 412, width: 230, height: 248, confidence: 0.85, isKeyframe: true },
          { frameNumber: 210, x: 350, y: 502, width: 232, height: 250, confidence: 0.82, isKeyframe: true },
        ],
        ['linear', 'ease-in', 'ease-in', 'ease-in', 'ease-in', 'ease-in', 'ease-in'],
      ),
    })
    await upsertDemoAnnotation({
      stableId: 'abc7-container-b',
      videoId: VIDEO_IDS.abc7Containers,
      personaId: portPersona.id,
      label: 'Shipping Container',
      confidence: 0.88,
      frames: makeFrames(
        [
          { frameNumber: 0,   x: 690, y: 120, width: 210, height: 250, confidence: 0.95, isKeyframe: true },
          { frameNumber: 60,  x: 690, y: 124, width: 210, height: 250, confidence: 0.95, isKeyframe: true },
          { frameNumber: 120, x: 686, y: 138, width: 212, height: 252, confidence: 0.93, isKeyframe: true },
          { frameNumber: 180, x: 676, y: 174, width: 216, height: 256, confidence: 0.90, isKeyframe: true },
          { frameNumber: 240, x: 656, y: 244, width: 220, height: 262, confidence: 0.86, isKeyframe: true },
          { frameNumber: 300, x: 628, y: 348, width: 226, height: 268, confidence: 0.82, isKeyframe: true },
        ],
        ['linear', 'ease-in', 'ease-in', 'ease-in', 'ease-in'],
      ),
    })
    await upsertDemoAnnotation({
      stableId: 'abc7-crane',
      videoId: VIDEO_IDS.abc7Containers,
      personaId: portPersona.id,
      label: 'Gantry Crane',
      confidence: 0.72,
      frames: makeFrames([
        { frameNumber: 0,   x: 60, y: 50, width: 80, height: 580, confidence: 0.97, isKeyframe: true },
        { frameNumber: 100, x: 60, y: 50, width: 80, height: 580, confidence: 0.97, isKeyframe: true },
        // Deliberate drift — water splash to the right of the gantry
        // briefly fools the tracker. The Tour 6 narration on this
        // keyframe asks the visitor to drag the bbox back onto the
        // crane and re-anchor the interpolation.
        { frameNumber: 214, x: 220, y: 280, width: 96, height: 240, confidence: 0.42, isKeyframe: true },
        { frameNumber: 240, x: 60, y: 50, width: 80, height: 580, confidence: 0.96, isKeyframe: true },
        { frameNumber: 300, x: 60, y: 50, width: 80, height: 580, confidence: 0.97, isKeyframe: true },
      ]),
    })

    // Crossing Broad — first-annotation + wikidata-augmentation tours.
    // Three Spectator instances: the woman who took the ball (Karen),
    // the boy who had it (son), the father who caught it.
    await upsertDemoAnnotation({
      stableId: 'crossingBroad-karen',
      videoId: VIDEO_IDS.crossingBroad,
      personaId: ballparkPersona.id,
      label: 'Spectator',
      confidence: 0.93,
      frames: makeFrames(
        [
          { frameNumber: 0,   x: 320, y: 180, width: 110, height: 220, confidence: 0.93, isKeyframe: true },
          { frameNumber: 30,  x: 322, y: 178, width: 110, height: 222, confidence: 0.93, isKeyframe: true },
          { frameNumber: 60,  x: 334, y: 192, width: 112, height: 216, confidence: 0.92, isKeyframe: true },
          { frameNumber: 90,  x: 360, y: 218, width: 116, height: 210, confidence: 0.91, isKeyframe: true },
          { frameNumber: 120, x: 378, y: 224, width: 118, height: 208, confidence: 0.90, isKeyframe: true },
          { frameNumber: 150, x: 358, y: 198, width: 116, height: 220, confidence: 0.91, isKeyframe: true },
        ],
        ['linear', 'ease-in-out', 'ease-in-out', 'linear', 'ease-out'],
      ),
    })
    await upsertDemoAnnotation({
      stableId: 'crossingBroad-son',
      videoId: VIDEO_IDS.crossingBroad,
      personaId: ballparkPersona.id,
      label: 'Spectator',
      confidence: 0.90,
      frames: makeFrames([
        { frameNumber: 0,   x: 560, y: 260, width: 78, height: 160, confidence: 0.91, isKeyframe: true },
        { frameNumber: 60,  x: 560, y: 260, width: 78, height: 160, confidence: 0.91, isKeyframe: true },
        { frameNumber: 90,  x: 556, y: 258, width: 80, height: 160, confidence: 0.90, isKeyframe: true },
        { frameNumber: 120, x: 552, y: 262, width: 80, height: 160, confidence: 0.88, isKeyframe: true },
        { frameNumber: 150, x: 556, y: 268, width: 80, height: 162, confidence: 0.89, isKeyframe: true },
      ]),
    })
    await upsertDemoAnnotation({
      stableId: 'crossingBroad-father',
      videoId: VIDEO_IDS.crossingBroad,
      personaId: ballparkPersona.id,
      label: 'Spectator',
      confidence: 0.94,
      frames: makeFrames([
        { frameNumber: 0,   x: 780, y: 220, width: 130, height: 240, confidence: 0.94, isKeyframe: true },
        { frameNumber: 60,  x: 778, y: 220, width: 130, height: 240, confidence: 0.94, isKeyframe: true },
        { frameNumber: 120, x: 776, y: 222, width: 130, height: 240, confidence: 0.94, isKeyframe: true },
      ]),
    })

    // Collin Rugg — events-roles-claims + summaries-and-claims tours.
    // The close-up angle on the ball-grab moment. Includes a Foul
    // Ball tracker that traces the contested object's path from
    // father → son → Karen, which is what the events-roles-claims
    // tour's derived claim ('Karen took the ball from the boy')
    // anchors against.
    await upsertDemoAnnotation({
      stableId: 'collinRugg-karen',
      videoId: VIDEO_IDS.collinRugg,
      personaId: ballparkPersona.id,
      label: 'Spectator',
      confidence: 0.94,
      frames: makeFrames(
        [
          { frameNumber: 0,   x: 480, y: 140, width: 150, height: 280, confidence: 0.95, isKeyframe: true },
          { frameNumber: 30,  x: 480, y: 142, width: 152, height: 280, confidence: 0.95, isKeyframe: true },
          { frameNumber: 60,  x: 488, y: 158, width: 156, height: 282, confidence: 0.94, isKeyframe: true },
          { frameNumber: 90,  x: 504, y: 192, width: 162, height: 286, confidence: 0.92, isKeyframe: true },
          { frameNumber: 120, x: 510, y: 200, width: 164, height: 286, confidence: 0.93, isKeyframe: true },
          { frameNumber: 180, x: 502, y: 178, width: 162, height: 286, confidence: 0.94, isKeyframe: true },
          { frameNumber: 240, x: 498, y: 168, width: 162, height: 286, confidence: 0.95, isKeyframe: true },
        ],
        ['linear', 'ease-in', 'ease-in', 'linear', 'ease-out', 'linear'],
      ),
    })
    await upsertDemoAnnotation({
      stableId: 'collinRugg-son',
      videoId: VIDEO_IDS.collinRugg,
      personaId: ballparkPersona.id,
      label: 'Spectator',
      confidence: 0.91,
      frames: makeFrames([
        { frameNumber: 0,   x: 680, y: 240, width: 100, height: 200, confidence: 0.93, isKeyframe: true },
        { frameNumber: 60,  x: 682, y: 240, width: 100, height: 200, confidence: 0.93, isKeyframe: true },
        { frameNumber: 90,  x: 680, y: 244, width: 100, height: 198, confidence: 0.91, isKeyframe: true },
        { frameNumber: 120, x: 678, y: 252, width: 100, height: 196, confidence: 0.88, isKeyframe: true },
        { frameNumber: 180, x: 676, y: 258, width: 102, height: 194, confidence: 0.90, isKeyframe: true },
        { frameNumber: 240, x: 676, y: 252, width: 102, height: 196, confidence: 0.91, isKeyframe: true },
      ]),
    })
    await upsertDemoAnnotation({
      stableId: 'collinRugg-father',
      videoId: VIDEO_IDS.collinRugg,
      personaId: ballparkPersona.id,
      label: 'Spectator',
      confidence: 0.93,
      frames: makeFrames([
        { frameNumber: 0,   x: 800, y: 220, width: 130, height: 260, confidence: 0.94, isKeyframe: true },
        { frameNumber: 60,  x: 802, y: 220, width: 130, height: 260, confidence: 0.94, isKeyframe: true },
        { frameNumber: 120, x: 804, y: 222, width: 132, height: 260, confidence: 0.94, isKeyframe: true },
        { frameNumber: 240, x: 806, y: 224, width: 132, height: 260, confidence: 0.93, isKeyframe: true },
      ]),
    })
    await upsertDemoAnnotation({
      stableId: 'collinRugg-foulBall',
      videoId: VIDEO_IDS.collinRugg,
      personaId: ballparkPersona.id,
      label: 'Foul Ball',
      confidence: 0.83,
      frames: makeFrames(
        [
          { frameNumber: 0,   x: 820, y: 280, width: 26, height: 26, confidence: 0.86, isKeyframe: true },
          { frameNumber: 15,  x: 760, y: 286, width: 26, height: 26, confidence: 0.85, isKeyframe: true },
          { frameNumber: 30,  x: 720, y: 296, width: 26, height: 26, confidence: 0.84, isKeyframe: true },
          { frameNumber: 45,  x: 700, y: 302, width: 26, height: 26, confidence: 0.83, isKeyframe: true },
          { frameNumber: 60,  x: 696, y: 304, width: 26, height: 26, confidence: 0.84, isKeyframe: true },
          { frameNumber: 90,  x: 640, y: 280, width: 26, height: 26, confidence: 0.82, isKeyframe: true },
          { frameNumber: 105, x: 580, y: 240, width: 28, height: 28, confidence: 0.80, isKeyframe: true },
          { frameNumber: 120, x: 540, y: 218, width: 28, height: 28, confidence: 0.81, isKeyframe: true },
        ],
        ['ease-out', 'ease-in', 'linear', 'linear', 'ease-in-out', 'ease-out', 'ease-in'],
      ),
    })

    // Amiri King — world-layer tour. Wide crowd shot used to
    // demonstrate linking annotations to a specific world entity
    // (LoanDepot Park) + a specific time collection (Sep 2025 games).
    await upsertDemoAnnotation({
      stableId: 'amiriKing-karen',
      videoId: VIDEO_IDS.amiriKing,
      personaId: ballparkPersona.id,
      label: 'Spectator',
      confidence: 0.90,
      frames: makeFrames([
        { frameNumber: 0,   x: 420, y: 200, width: 120, height: 240, confidence: 0.91, isKeyframe: true },
        { frameNumber: 60,  x: 426, y: 204, width: 120, height: 238, confidence: 0.90, isKeyframe: true },
        { frameNumber: 120, x: 432, y: 208, width: 122, height: 238, confidence: 0.89, isKeyframe: true },
        { frameNumber: 180, x: 430, y: 206, width: 122, height: 238, confidence: 0.90, isKeyframe: true },
      ]),
    })
    await upsertDemoAnnotation({
      stableId: 'amiriKing-son',
      videoId: VIDEO_IDS.amiriKing,
      personaId: ballparkPersona.id,
      label: 'Spectator',
      confidence: 0.89,
      frames: makeFrames([
        { frameNumber: 0,   x: 640, y: 280, width: 90, height: 180, confidence: 0.89, isKeyframe: true },
        { frameNumber: 60,  x: 638, y: 282, width: 90, height: 180, confidence: 0.89, isKeyframe: true },
        { frameNumber: 120, x: 640, y: 284, width: 90, height: 180, confidence: 0.88, isKeyframe: true },
        { frameNumber: 180, x: 640, y: 284, width: 90, height: 180, confidence: 0.89, isKeyframe: true },
      ]),
    })

    console.log('✓ Seeded demo annotations on the four tour videos')
  } else {
    console.log(
      `ℹ️  Skipping demo annotation seeding (need ${Object.values(VIDEO_IDS).length} videos, found ${presentVideos.length}). ` +
      'Run /api/videos/sync first to pull the corpus from S3, then re-run the seeder.',
    )
  }

  // Seed role permissions for RBAC
  const permCount = await seedPermissions(prisma)
  console.log(`✓ Seeded ${permCount} role permissions`)

  console.log('Database seed completed successfully')

  // Only disconnect if we created our own client
  if (!prismaClient) {
    await prisma.$disconnect()
  }
}

// Run seed when executed directly, skip when imported by tests
// Tests set VITEST=true or NODE_ENV=test
const isTestEnvironment = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'

if (!isTestEnvironment) {
  seedDatabase()
    .catch((e) => {
      console.error('Error seeding database:', e)
      process.exit(1)
    })
}
