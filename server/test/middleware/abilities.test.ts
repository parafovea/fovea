import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FastifyRequest, FastifyReply } from 'fastify'

// Mock prisma before importing the module under test
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    rolePermission: { findMany: vi.fn().mockResolvedValue([]) },
    groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
    projectMembership: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

// Mock metrics counters and histograms
vi.mock('../../src/metrics.js', () => ({
  rbacCheckCounter: { add: vi.fn() },
  rbacCheckDuration: { record: vi.fn() },
}))

// Mock OpenTelemetry tracer
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        setAttribute: vi.fn(),
        end: vi.fn(),
      }),
    }),
  },
}))

import {
  buildAbilities,
  authorize,
  invalidatePermissionCache,
} from '../../src/middleware/abilities.js'

/**
 * Creates a mock FastifyRequest with optional user data.
 *
 * @param overrides - partial request properties to include
 * @returns a mock FastifyRequest cast through unknown
 */
function mockRequest(overrides: Record<string, unknown> = {}): FastifyRequest {
  return { ...overrides } as unknown as FastifyRequest
}

/**
 * Creates a mock FastifyReply with optional method stubs.
 *
 * @param overrides - partial reply properties to include
 * @returns a mock FastifyReply cast through unknown
 */
function mockReply(overrides: Record<string, unknown> = {}): FastifyReply {
  return { ...overrides } as unknown as FastifyReply
}

describe('buildAbilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidatePermissionCache()
  })

  it('skips when no user on request', async () => {
    const request = mockRequest()
    const reply = mockReply()

    await buildAbilities(request, reply)

    expect(request.ability).toBeUndefined()
  })

  it('attaches ability to request when user exists', async () => {
    const request = mockRequest({
      user: { id: 'user-1', systemRole: 'user' },
    })
    const reply = mockReply()

    await buildAbilities(request, reply)

    expect(request.ability).toBeDefined()
    expect(request.ability!.can).toBeTypeOf('function')
  })

  it('system_admin gets manage all ability', async () => {
    const request = mockRequest({
      user: { id: 'admin-1', systemRole: 'system_admin' },
    })
    const reply = mockReply()

    await buildAbilities(request, reply)

    expect(request.ability).toBeDefined()
    expect(request.ability!.can('manage', 'all')).toBe(true)
  })

  it('regular user does not get manage all', async () => {
    const request = mockRequest({
      user: { id: 'user-1', systemRole: 'user' },
    })
    const reply = mockReply()

    await buildAbilities(request, reply)

    expect(request.ability).toBeDefined()
    expect(request.ability!.can('manage', 'all')).toBe(false)
  })

  it('defaults systemRole to "user" when not provided', async () => {
    const request = mockRequest({
      user: { id: 'user-1' },
    })
    const reply = mockReply()

    await buildAbilities(request, reply)

    expect(request.ability).toBeDefined()
    // With no systemRole and empty permissions, should get baseline abilities only
    expect(request.ability!.can('manage', 'all')).toBe(false)
    expect(request.ability!.can('read', 'Video')).toBe(true)
  })
})

describe('authorize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when no ability on request', async () => {
    const handler = authorize('read', 'Annotation')
    const request = mockRequest()
    const codeFn = vi.fn().mockReturnThis()
    const sendFn = vi.fn()
    const reply = mockReply({ code: codeFn, send: sendFn })

    await handler(request, reply)

    expect(codeFn).toHaveBeenCalledWith(403)
    expect(sendFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' }),
    )
  })

  it('allows when ability.can returns true', async () => {
    const handler = authorize('manage', 'all')
    const mockAbility = { can: vi.fn().mockReturnValue(true) }
    const request = mockRequest({
      ability: mockAbility,
      user: { systemRole: 'system_admin' },
    })
    const codeFn = vi.fn().mockReturnThis()
    const sendFn = vi.fn()
    const reply = mockReply({ code: codeFn, send: sendFn })

    await handler(request, reply)

    expect(codeFn).not.toHaveBeenCalled()
    expect(sendFn).not.toHaveBeenCalled()
    expect(mockAbility.can).toHaveBeenCalledWith('manage', 'all')
  })

  it('returns 403 when ability.can returns false', async () => {
    const handler = authorize('delete', 'Video')
    const mockAbility = { can: vi.fn().mockReturnValue(false) }
    const request = mockRequest({
      ability: mockAbility,
      user: { systemRole: 'user' },
    })
    const codeFn = vi.fn().mockReturnThis()
    const sendFn = vi.fn()
    const reply = mockReply({ code: codeFn, send: sendFn })

    await handler(request, reply)

    expect(codeFn).toHaveBeenCalledWith(403)
    expect(sendFn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'FORBIDDEN',
        message: 'Cannot delete Video',
      }),
    )
  })

  it('checks the correct action and subject', async () => {
    const handler = authorize('create', 'Annotation')
    const mockAbility = { can: vi.fn().mockReturnValue(true) }
    const request = mockRequest({
      ability: mockAbility,
      user: { systemRole: 'user' },
    })
    const codeFn = vi.fn().mockReturnThis()
    const sendFn = vi.fn()
    const reply = mockReply({ code: codeFn, send: sendFn })

    await handler(request, reply)

    expect(mockAbility.can).toHaveBeenCalledWith('create', 'Annotation')
  })

  it('returns a function (middleware factory pattern)', () => {
    const handler = authorize('read', 'Video')
    expect(handler).toBeTypeOf('function')
  })
})

describe('invalidatePermissionCache', () => {
  it('does not throw', () => {
    expect(() => invalidatePermissionCache()).not.toThrow()
  })

  it('can be called multiple times', () => {
    expect(() => {
      invalidatePermissionCache()
      invalidatePermissionCache()
      invalidatePermissionCache()
    }).not.toThrow()
  })
})
