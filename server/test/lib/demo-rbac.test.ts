/**
 * Unit tests for the centralized demo-mode read-widening helpers.
 *
 * Each helper must widen access only when FOVEA_DEMO_MODE is on and degrade to
 * the plain per-user RBAC decision when it is off. config.demo.enabled reads the
 * env var live through a getter, so toggling process.env.FOVEA_DEMO_MODE flips
 * every helper without re-importing the module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEMO_PERSONA_READ_SCOPE,
  demoPersonaListWhere,
  demoPermitsSystemPersonaRead,
  demoGrantsAllVideos,
  demoPermitsSummaryRead,
  demoPermitsSummaryReclaim,
  demoWidensWorldState,
} from '../../src/lib/demo-rbac.js'

describe('demo-rbac', () => {
  const originalDemoMode = process.env.FOVEA_DEMO_MODE

  beforeEach(() => {
    delete process.env.FOVEA_DEMO_MODE
  })

  afterEach(() => {
    if (originalDemoMode === undefined) {
      delete process.env.FOVEA_DEMO_MODE
    } else {
      process.env.FOVEA_DEMO_MODE = originalDemoMode
    }
  })

  function enableDemo() {
    process.env.FOVEA_DEMO_MODE = 'true'
  }

  describe('read-scope fragments', () => {
    it('persona scope matches system-generated personas', () => {
      expect(DEMO_PERSONA_READ_SCOPE).toEqual({ isSystemGenerated: true })
    })
  })

  describe('demoPersonaListWhere', () => {
    it('returns null when demo is off', () => {
      expect(demoPersonaListWhere()).toBeNull()
    })

    it('returns the system-persona filter when demo is on', () => {
      enableDemo()
      expect(demoPersonaListWhere()).toEqual({ isSystemGenerated: true })
    })
  })

  describe('demoPermitsSystemPersonaRead', () => {
    it('denies for any persona when demo is off', () => {
      expect(demoPermitsSystemPersonaRead(true)).toBe(false)
      expect(demoPermitsSystemPersonaRead(false)).toBe(false)
    })

    it('permits only system-generated personas when demo is on', () => {
      enableDemo()
      expect(demoPermitsSystemPersonaRead(true)).toBe(true)
      expect(demoPermitsSystemPersonaRead(false)).toBe(false)
    })
  })

  describe('demoGrantsAllVideos', () => {
    it('is false when demo is off', () => {
      expect(demoGrantsAllVideos()).toBe(false)
    })

    it('is true when demo is on', () => {
      enableDemo()
      expect(demoGrantsAllVideos()).toBe(true)
    })
  })

  describe('demoPermitsSummaryRead', () => {
    it('is false when demo is off', () => {
      expect(demoPermitsSummaryRead()).toBe(false)
    })

    it('is true when demo is on', () => {
      enableDemo()
      expect(demoPermitsSummaryRead()).toBe(true)
    })
  })

  describe('demoPermitsSummaryReclaim', () => {
    it('is false when demo is off, even for a demo-anonymous username', () => {
      expect(demoPermitsSummaryReclaim('demo-anonymous-abc')).toBe(false)
    })

    it('requires a demo-anonymous username when demo is on', () => {
      enableDemo()
      expect(demoPermitsSummaryReclaim('demo-anonymous-abc')).toBe(true)
      expect(demoPermitsSummaryReclaim('alice')).toBe(false)
      expect(demoPermitsSummaryReclaim(undefined)).toBe(false)
    })
  })

  describe('demoWidensWorldState', () => {
    it('is false when demo is off', () => {
      expect(demoWidensWorldState()).toBe(false)
    })

    it('is true when demo is on', () => {
      enableDemo()
      expect(demoWidensWorldState()).toBe(true)
    })
  })
})
