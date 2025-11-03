import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

/**
 * Seeds the database with initial users and system personas.
 * Creates admin user, test user, default user for single-user mode, and Automated persona.
 * Associates existing personas with the default user.
 */
async function main() {
  console.log('Starting database seed...')

  // Create default admin user for multi-user mode
  const adminPasswordHash = await bcrypt.hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@example.com',
      passwordHash: adminPasswordHash,
      displayName: 'Administrator',
      isAdmin: true,
    },
  })
  console.log('✓ Created admin user:', admin.username)

  // Create test user for development
  const testUserHash = await bcrypt.hash('test123', 12)
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
  const defaultUser = await prisma.user.upsert({
    where: { id: 'default-user' },
    update: {},
    create: {
      id: 'default-user',
      username: 'user',
      email: null,
      passwordHash: null, // No password required in single-user mode
      displayName: 'Default User',
      isAdmin: true,
    },
  })
  console.log('✓ Created default user for single-user mode:', defaultUser.username)

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
        userId: defaultUser.id,
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
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
