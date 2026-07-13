/**
 * Centralized demo-mode read-widening for role-based access control.
 *
 * "Demo mode" (FOVEA_DEMO_MODE, read through {@link isDemoModeEnabled}) powers
 * the public-demo / booth deployment, where anonymous and non-admin visitors
 * must see the same system-seeded corpus the guided tours are anchored to.
 * Their CASL ability is scoped to their own data, so the normal
 * `accessibleBy(...)` filters and instance-level `ability.can(...)` checks would
 * hide the seeded content. Each demo-mode site therefore widens read access in
 * a slightly different shape.
 *
 * This module is the single source of truth for that widening. Every helper is
 * gated on {@link isDemoModeEnabled} internally, so call sites no longer scatter
 * the flag check: with demo off, every helper degrades to the plain per-user
 * RBAC decision, keeping a self-hoster's RBAC exactly as it was. The
 * demo-fixture rationale and the self-hoster-safety note travel with the rules
 * below so what demo mode exposes per subject is auditable in one place.
 *
 * This file widens read access only. The true demo on/off plugin gates live in
 * `server/src/demo/` and are out of scope here.
 *
 * @module
 */

import { Prisma } from '@prisma/client'

import { isDemoModeEnabled } from './demo-flags.js'

/**
 * Prisma WHERE fragment matching every system-seeded persona.
 *
 * The seeded personas the public tour catalogue exposes are flagged
 * `isSystemGenerated: true`. A self-hoster who never seeds system personas has
 * no rows matching this fragment, so it never widens their results.
 */
export const DEMO_PERSONA_READ_SCOPE: Prisma.PersonaWhereInput = {
  isSystemGenerated: true,
}

/**
 * Builds the persona list WHERE for the demo-mode catalogue branch.
 *
 * In demo mode the persona list exposes every system persona (hidden or not),
 * regardless of the caller's CASL ability, so the public tour catalogue can
 * enumerate them. With demo off, this returns null and the caller applies its
 * normal `hidden: false AND accessibleBy(...)` filter instead, leaving a
 * self-hoster's per-user RBAC intact.
 *
 * @returns the demo-only persona list WHERE, or null when demo mode is off
 */
export function demoPersonaListWhere(): Prisma.PersonaWhereInput | null {
  if (isDemoModeEnabled()) {
    return DEMO_PERSONA_READ_SCOPE
  }
  return null
}

/**
 * Whether demo mode permits a read against the given system-generated flag.
 *
 * Demo deployments expose seeded system personas (and their ontologies and
 * preferences) to anonymous and non-admin callers whose CASL ability would
 * otherwise deny the read. The widening is limited to system-generated rows so
 * no user's private persona is exposed. With demo off this is always false, so
 * the caller falls through to its normal CASL denial.
 *
 * @param isSystemGenerated - the candidate persona's `isSystemGenerated` flag
 * @returns true when demo mode grants the read for a system persona
 */
export function demoPermitsSystemPersonaRead(isSystemGenerated: boolean): boolean {
  return isDemoModeEnabled() && isSystemGenerated
}

/**
 * Whether demo mode grants unrestricted ('all') video access.
 *
 * In the booth flow every visitor, including auto-issued demo-anonymous-*
 * sessions, must see the same curated demo corpus the tours are anchored to.
 * The per-user sharing/group/project chain returns the empty set for anonymous
 * visitors (no projects, no group memberships, no shares), so demo mode grants
 * full video access instead. With demo off this is false, so a self-hosted
 * deployment keeps its per-user video RBAC intact.
 *
 * @returns true when demo mode grants unrestricted video access
 */
export function demoGrantsAllVideos(): boolean {
  return isDemoModeEnabled()
}

/**
 * Whether demo mode permits a VideoSummary read the caller's CASL ability denies.
 *
 * Callers whose CASL ability is scoped to their own data (anonymous demo
 * sessions, non-admin users opening a tour) still need to read summaries that
 * the seeded persona produced over the shared demo corpus. With demo off this
 * is false, so the caller raises its normal ForbiddenError.
 *
 * @returns true when demo mode permits the summary read
 */
export function demoPermitsSummaryRead(): boolean {
  return isDemoModeEnabled()
}

/**
 * Whether demo mode permits reclaiming an orphaned VideoSummary for this caller.
 *
 * VideoSummary rows in the demo deployment are routinely orphaned when the
 * idle-reset sweeper deletes a stale demo-anonymous-* user but leaves the row
 * behind with a now-dangling createdBy. Without reclaim, the next demo visitor
 * hits "Cannot update this VideoSummary" on every video any prior demo session
 * touched. Reclaiming overwrites createdBy to the current demo user; the row
 * stays scoped to the same persona + video, so no cross-user content leaks, and
 * its content is replaced by the new summarize job. Gated on demo mode AND a
 * demo-anonymous-* username so a self-hoster never reclaims another user's row.
 *
 * @param username - the calling user's username, if any
 * @returns true when demo mode permits the orphan reclaim
 */
export function demoPermitsSummaryReclaim(username: string | undefined): boolean {
  return isDemoModeEnabled() && (username?.startsWith('demo-anonymous-') ?? false)
}

/**
 * Whether demo mode widens the personal world-state read/create path.
 *
 * In demo mode an anonymous session may read its own personal world state even
 * when its CASL ability denies the read, and may lazily create its own row
 * without a WorldState:create ability (anonymous roles lack it). Every world
 * state is scoped to userId, so anonymous users never see one another's state.
 * With demo off this is false, so the caller enforces its normal CASL read and
 * create checks.
 *
 * @returns true when demo mode widens the world-state path
 */
export function demoWidensWorldState(): boolean {
  return isDemoModeEnabled()
}
