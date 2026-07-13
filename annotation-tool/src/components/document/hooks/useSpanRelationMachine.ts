/**
 * Drives the relation builder's finite-state machine over the annotator store.
 *
 * The machine walks `IDLE -> WAITING_SOURCE -> WAITING_TARGET -> WAITING_LABEL`:
 * the user starts a relation, clicks a source span, clicks a target span (never
 * the source: self-relations are rejected), then chooses a relation type, which
 * commits the edge and returns to `IDLE`. This hook exposes those transitions
 * plus a `commitLabel` that invokes the caller's create handler.
 *
 * @module
 */

import { useCallback } from 'react'

import { useSpanAnnotatorStore, useSpanAnnotatorStoreApi } from '../spanAnnotatorStoreContext'
import type { RelationPhase } from '@store/zustand/createSpanAnnotatorStore'

/**
 * The label committed for a relation once source, target, and type are chosen.
 */
export interface RelationCommit {
  /** The relation source span id. */
  sourceSpanId: string
  /** The relation target span id. */
  targetSpanId: string
  /** The chosen relation-type id. */
  relationTypeId: string
  /** The chosen relation-type display name. */
  relationTypeName: string
}

/** The relation-builder controls returned by {@link useSpanRelationMachine}. */
export interface SpanRelationMachine {
  /** The builder's current phase. */
  phase: RelationPhase
  /** The chosen source span id, or `null`. */
  sourceId: string | null
  /** The chosen target span id, or `null`. */
  targetId: string | null
  /** Begins building a relation (awaits a source pick). */
  start: () => void
  /** Picks the source span. */
  pickSource: (spanId: string) => void
  /** Picks the target span (ignored when it equals the source). */
  pickTarget: (spanId: string) => void
  /** Commits the relation type, invoking the create handler, then resets. */
  commitLabel: (relationTypeId: string, relationTypeName: string) => void
  /** Cancels building and clears source and target. */
  cancel: () => void
}

/**
 * Wires the relation-builder machine to a create handler.
 *
 * @param onCommit - called with the completed relation when a type is chosen;
 *   skipped when source or target is missing
 * @returns the machine's current phase and its transition controls
 *
 * @example
 * ```typescript
 * const machine = useSpanRelationMachine((commit) => createRelation(commit))
 * machine.start()
 * machine.pickSource('span-a')
 * machine.pickTarget('span-b')
 * machine.commitLabel('rel-type-1', 'causes')
 * ```
 */
export function useSpanRelationMachine(
  onCommit: (commit: RelationCommit) => void,
): SpanRelationMachine {
  const storeApi = useSpanAnnotatorStoreApi()
  const phase = useSpanAnnotatorStore((state) => state.relationPhase)
  const sourceId = useSpanAnnotatorStore((state) => state.relationSourceId)
  const targetId = useSpanAnnotatorStore((state) => state.relationTargetId)

  const start = useCallback(() => storeApi.getState().startRelation(), [storeApi])

  const pickSource = useCallback(
    (spanId: string) => storeApi.getState().pickRelationSource(spanId),
    [storeApi],
  )

  const pickTarget = useCallback(
    (spanId: string) => storeApi.getState().pickRelationTarget(spanId),
    [storeApi],
  )

  const cancel = useCallback(() => storeApi.getState().resetRelation(), [storeApi])

  const commitLabel = useCallback(
    (relationTypeId: string, relationTypeName: string) => {
      const state = storeApi.getState()
      const source = state.relationSourceId
      const target = state.relationTargetId
      if (source && target && source !== target) {
        onCommit({ sourceSpanId: source, targetSpanId: target, relationTypeId, relationTypeName })
      }
      state.resetRelation()
    },
    [onCommit, storeApi],
  )

  return { phase, sourceId, targetId, start, pickSource, pickTarget, commitLabel, cancel }
}
