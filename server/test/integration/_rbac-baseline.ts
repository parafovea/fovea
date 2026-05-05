/**
 * Shared helper for ported v0.1.8 multi-user isolation / fidelity tests on
 * v0.2.0+. The default test-helper `seedBaselinePermissions` (in
 * test/helpers/rbac-test-setup.ts) seeds 36 system-scope rows that grant
 * blanket update / read / share / export / create on every content type
 * to all users — convenient for route-shape tests but actively hides
 * ownership leaks. The matrix tests below exist to verify ownership, so
 * we explicitly clear those rows and re-seed an ownership-aware
 * production-like baseline that matches what a real multi-user instance
 * would have for the default 'user' systemRole: every action is `ownOnly:
 * true`, so CASL's MongoQuery conditions resolve to `{ <ownershipField>:
 * userId }` per model and cross-user access is denied at the CASL layer.
 */
import { PrismaClient } from '@prisma/client'

export async function reseedOwnershipBaseline(prisma: PrismaClient): Promise<void> {
  await prisma.rolePermission.deleteMany({ where: { scope: 'system' } })
  const ownerActions = ['create', 'read', 'update', 'delete', 'share', 'export'] as const
  const resources = ['persona', 'annotation', 'summary', 'claim', 'world_state'] as const
  await prisma.rolePermission.createMany({
    data: [
      ...resources.flatMap(rt => ownerActions.map(action => ({ scope: 'system', role: 'user', resourceType: rt, action, ownOnly: true }))),
      // Video reads are unconditional; v0.2.0 separately filters via VideoAccessService.
      { scope: 'system', role: 'user', resourceType: 'video', action: 'read', ownOnly: false },
    ],
    skipDuplicates: true,
  })
}
