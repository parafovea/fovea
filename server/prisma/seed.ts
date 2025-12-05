import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

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
    update: { passwordHash: adminPasswordHash }, // Update password on re-seed
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      displayName: 'Administrator',
      isAdmin: true,
    },
  })
  console.log('✓ Created admin user:', admin.username)

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

  // Create the Automated persona if it doesn't exist
  const existingAutomated = await prisma.persona.findFirst({
    where: { name: 'Automated' },
  })

  let automatedPersona
  if (existingAutomated) {
    automatedPersona = existingAutomated
    console.log('✓ Automated persona already exists:', automatedPersona.name)
  } else {
    automatedPersona = await prisma.persona.create({
      data: {
        name: 'Automated',
        role: 'Analyst',
        informationNeed: 'Understanding the content and events in this video',
        isSystemGenerated: true,
        hidden: false,
        userId: personaOwner.id,
      },
    })
    console.log('✓ Created Automated persona:', automatedPersona.name)
  }

  // Create test ontology for Automated persona (for E2E tests)
  const existingOntology = await prisma.ontology.findUnique({
    where: { personaId: automatedPersona.id },
  })

  if (!existingOntology) {
    await prisma.ontology.create({
      data: {
        personaId: automatedPersona.id,
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
      },
    })
    console.log('✓ Created test ontology for Automated persona')
  } else {
    console.log('✓ Ontology for Automated persona already exists')
  }

  console.log('Database seed completed successfully')

  // Only disconnect if we created our own client
  if (!prismaClient) {
    await prisma.$disconnect()
  }
}

// Run seed when executed directly
if (require.main === module) {
  seedDatabase()
    .catch((e) => {
      console.error('Error seeding database:', e)
      process.exit(1)
    })
}
