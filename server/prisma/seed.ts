import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seeds the database with initial data including the Automated persona.
 *
 * This script creates the Automated persona which provides generic video analysis
 * without domain-specific focus. The Automated persona is useful for quick,
 * general-purpose video understanding and serves as a default option.
 */
async function main() {
  console.log('Starting database seed...')

  // Create the Automated persona
  const automatedPersona = await prisma.persona.upsert({
    where: { name: 'Automated' },
    update: {},
    create: {
      name: 'Automated',
      role: 'Analyst',
      informationNeed: 'Understanding the content and events in this video',
      isSystemGenerated: true,
      hidden: false
    }
  })

  console.log('Created Automated persona:', automatedPersona)

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
