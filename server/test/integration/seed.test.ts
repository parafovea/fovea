import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { seedDatabase } from '../../prisma/seed'

/**
 * Integration tests for database seeding script.
 * Validates that the seed script properly creates admin users with ADMIN_PASSWORD.
 */
describe('Database Seed Integration', () => {
  let prisma: PrismaClient

  beforeAll(() => {
    prisma = new PrismaClient()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // Clean database before each test
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()
  })

  describe('ADMIN_PASSWORD requirement', () => {
    it('fails without ADMIN_PASSWORD environment variable', async () => {
      // Save original env
      const originalPassword = process.env.ADMIN_PASSWORD
      delete process.env.ADMIN_PASSWORD

      try {
        await expect(seedDatabase(prisma)).rejects.toThrow('ADMIN_PASSWORD environment variable is required')
      } finally {
        // Restore env
        if (originalPassword) {
          process.env.ADMIN_PASSWORD = originalPassword
        }
      }
    })

    it('succeeds with ADMIN_PASSWORD environment variable', async () => {
      const testPassword = 'test-secure-password-12345'
      process.env.ADMIN_PASSWORD = testPassword

      await seedDatabase(prisma)

      // Verify admin user was created
      const adminUser = await prisma.user.findUnique({
        where: { username: 'admin' }
      })

      expect(adminUser).toBeDefined()
      expect(adminUser!.username).toBe('admin')
      expect(adminUser!.isAdmin).toBe(true)
      expect(adminUser!.passwordHash).toBeDefined()
    })
  })

  describe('Admin user creation', () => {
    it('creates admin user with proper bcrypt hash', async () => {
      const testPassword = 'secure-password-789'
      process.env.ADMIN_PASSWORD = testPassword

      await seedDatabase(prisma)

      const adminUser = await prisma.user.findUnique({
        where: { username: 'admin' }
      })

      expect(adminUser).toBeDefined()
      expect(adminUser!.passwordHash).toBeDefined()

      // Verify password is properly hashed with bcrypt
      const isValidHash = await bcrypt.compare(testPassword, adminUser!.passwordHash!)
      expect(isValidHash).toBe(true)

      // Verify hash has proper bcrypt format (12 rounds)
      expect(adminUser!.passwordHash).toMatch(/^\$2[ayb]\$12\$/)
    })

    it('creates admin user with correct properties', async () => {
      process.env.ADMIN_PASSWORD = 'test-password-123'

      await seedDatabase(prisma)

      const adminUser = await prisma.user.findUnique({
        where: { username: 'admin' }
      })

      expect(adminUser).toMatchObject({
        username: 'admin',
        email: 'admin@example.com',
        displayName: 'Administrator',
        isAdmin: true
      })
    })

    it('updates admin password when re-running seed', async () => {
      // First seed with initial password
      const initialPassword = 'initial-password-456'
      process.env.ADMIN_PASSWORD = initialPassword
      await seedDatabase(prisma)

      const adminAfterFirst = await prisma.user.findUnique({
        where: { username: 'admin' }
      })
      const firstPasswordHash = adminAfterFirst!.passwordHash

      // Re-run seed with different password
      const newPassword = 'new-password-789'
      process.env.ADMIN_PASSWORD = newPassword
      await seedDatabase(prisma)

      const adminAfterSecond = await prisma.user.findUnique({
        where: { username: 'admin' }
      })

      // Password hash should have changed
      expect(adminAfterSecond!.passwordHash).not.toBe(firstPasswordHash)

      // Old password should not work
      const oldPasswordWorks = await bcrypt.compare(initialPassword, adminAfterSecond!.passwordHash!)
      expect(oldPasswordWorks).toBe(false)

      // New password should work
      const newPasswordWorks = await bcrypt.compare(newPassword, adminAfterSecond!.passwordHash!)
      expect(newPasswordWorks).toBe(true)
    })
  })

  describe('Test user creation', () => {
    it('creates test user with default password if not specified', async () => {
      process.env.ADMIN_PASSWORD = 'admin-password'
      delete process.env.TEST_USER_PASSWORD

      await seedDatabase(prisma)

      const testUser = await prisma.user.findUnique({
        where: { username: 'testuser' }
      })

      expect(testUser).toBeDefined()
      expect(testUser!.username).toBe('testuser')
      expect(testUser!.isAdmin).toBe(false)

      // Verify default password 'test123' works
      const passwordWorks = await bcrypt.compare('test123', testUser!.passwordHash!)
      expect(passwordWorks).toBe(true)
    })

    it('creates test user with custom password when TEST_USER_PASSWORD set', async () => {
      const customTestPassword = 'custom-test-password'
      process.env.ADMIN_PASSWORD = 'admin-password'
      process.env.TEST_USER_PASSWORD = customTestPassword

      await seedDatabase(prisma)

      const testUser = await prisma.user.findUnique({
        where: { username: 'testuser' }
      })

      expect(testUser).toBeDefined()

      // Verify custom password works
      const passwordWorks = await bcrypt.compare(customTestPassword, testUser!.passwordHash!)
      expect(passwordWorks).toBe(true)
    })
  })

  describe('FOVEA_MODE behavior', () => {
    it('creates default user in single-user mode', async () => {
      process.env.ADMIN_PASSWORD = 'admin-password'
      process.env.FOVEA_MODE = 'single-user'

      await seedDatabase(prisma)

      const defaultUser = await prisma.user.findUnique({
        where: { id: 'default-user' }
      })

      expect(defaultUser).toBeDefined()
      expect(defaultUser!.username).toBe('user')
      expect(defaultUser!.passwordHash).toBeNull()
      expect(defaultUser!.isAdmin).toBe(false)
    })

    it('does not create default user in multi-user mode', async () => {
      process.env.ADMIN_PASSWORD = 'admin-password'
      process.env.FOVEA_MODE = 'multi-user'

      await seedDatabase(prisma)

      const defaultUser = await prisma.user.findUnique({
        where: { id: 'default-user' }
      })

      expect(defaultUser).toBeNull()
    })
  })

  describe('Persona creation', () => {
    it('creates Automated persona owned by appropriate user', async () => {
      process.env.ADMIN_PASSWORD = 'admin-password'
      process.env.FOVEA_MODE = 'multi-user'

      await seedDatabase(prisma)

      const automatedPersona = await prisma.persona.findFirst({
        where: { name: 'Automated' }
      })

      expect(automatedPersona).toBeDefined()
      expect(automatedPersona!.role).toBe('Analyst')
      expect(automatedPersona!.isSystemGenerated).toBe(true)

      // Should be owned by admin in multi-user mode
      const admin = await prisma.user.findUnique({
        where: { username: 'admin' }
      })
      expect(automatedPersona!.userId).toBe(admin!.id)
    })

    it('creates test ontology for Automated persona', async () => {
      process.env.ADMIN_PASSWORD = 'admin-password'

      await seedDatabase(prisma)

      const automatedPersona = await prisma.persona.findFirst({
        where: { name: 'Automated' }
      })

      const ontology = await prisma.ontology.findUnique({
        where: { personaId: automatedPersona!.id }
      })

      expect(ontology).toBeDefined()
      expect(ontology!.entityTypes).toBeDefined()
      // @ts-expect-error - entityTypes is JSON
      expect(ontology!.entityTypes.length).toBeGreaterThan(0)
    })
  })
})
