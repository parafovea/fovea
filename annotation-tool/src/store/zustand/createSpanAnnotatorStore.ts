/**
 * Instance-scoped Zustand store for one mounted span annotator.
 *
 * The span-annotation UI can mount more than once on a page (the video-text
 * panel and a standalone document page), so its UI state cannot live in a
 * global singleton store. This factory builds a fresh vanilla store per mount
 * via zustand's `createStore`; `SpanAnnotatorStoreProvider` owns one instance
 * and exposes it through React context. The store holds only ephemeral UI
 * state: the committed token selection, whether a drag gesture is in progress,
 * the pending label-picker draft, the active and hovered ids, and the relation
 * builder's finite-state machine.
 *
 * @module
 */

import { createStore } from 'zustand/vanilla'

import type { Rect, SpanSegment, TokenSelection } from '@/lib/spans'

/**
 * The phase of the relation builder's finite-state machine.
 *
 * A relation is built by picking a source span, then a target span, then a
 * relation type: `IDLE` (not building), `WAITING_SOURCE`, `WAITING_TARGET`,
 * `WAITING_LABEL`.
 */
export type RelationPhase = 'IDLE' | 'WAITING_SOURCE' | 'WAITING_TARGET' | 'WAITING_LABEL'

/**
 * A committed selection awaiting a label. Carries the resolved segments (one per
 * element, gaps preserved) and the selection's bounding box so the label picker
 * can anchor to it.
 */
export interface PendingLabelSpanDraft {
  /** One segment per element the selection touches. */
  segments: SpanSegment[]
  /** The selection's bounding rectangle in content space, or `null` if unknown. */
  bbox: Rect | null
}

/**
 * The full UI state and actions for one mounted span annotator.
 */
export interface SpanAnnotatorState {
  /** Committed token selection, keyed by element name to its ascending index set. */
  committedSelection: Record<string, number[]>
  /** Whether a pointer drag gesture is currently in progress. */
  gestureInProgress: boolean
  /** The token the current gesture or range-extend anchors from. */
  gestureAnchor: TokenSelection | null
  /** The selection awaiting a label, or `null` when the picker is closed. */
  pendingLabelSpanDraft: PendingLabelSpanDraft | null
  /** The id of the currently active (focused) span, or `null`. */
  activeSpanId: string | null
  /** The ids of spans currently hovered. */
  hoveredSpanIds: string[]
  /** The id of the currently hovered relation, or `null`. */
  hoveredRelationId: string | null
  /** The relation builder's current phase. */
  relationPhase: RelationPhase
  /** The chosen source span id while building a relation, or `null`. */
  relationSourceId: string | null
  /** The chosen target span id while building a relation, or `null`. */
  relationTargetId: string | null

  /** Replaces the committed selection with the given per-element index sets. */
  setSelection: (selection: Record<string, number[]>) => void
  /** Clears the committed selection and gesture anchor. */
  clearSelection: () => void
  /** Sets whether a gesture is in progress and, optionally, its anchor token. */
  setGesture: (active: boolean, anchor?: TokenSelection | null) => void
  /** Opens the label picker for a committed selection. */
  openLabelDraft: (draft: PendingLabelSpanDraft) => void
  /** Closes the label picker and clears the committed selection. */
  closeLabelDraft: () => void
  /** Sets the active span id. */
  setActiveSpanId: (id: string | null) => void
  /** Sets the hovered span ids. */
  setHoveredSpanIds: (ids: string[]) => void
  /** Sets the hovered relation id. */
  setHoveredRelationId: (id: string | null) => void
  /** Begins the relation builder, awaiting a source pick. */
  startRelation: () => void
  /** Picks the relation source; advances to awaiting a target. */
  pickRelationSource: (id: string) => void
  /** Picks the relation target, guarding self-relations; advances to awaiting a label. */
  pickRelationTarget: (id: string) => void
  /** Cancels the relation builder and clears its source and target. */
  resetRelation: () => void
  /** Resets all UI state to its initial values. */
  reset: () => void
}

/** The vanilla store API produced by {@link createSpanAnnotatorStore}. */
export type SpanAnnotatorStore = ReturnType<typeof createSpanAnnotatorStore>

/** The initial UI state for a freshly mounted annotator. */
const initialState = {
  committedSelection: {} as Record<string, number[]>,
  gestureInProgress: false,
  gestureAnchor: null as TokenSelection | null,
  pendingLabelSpanDraft: null as PendingLabelSpanDraft | null,
  activeSpanId: null as string | null,
  hoveredSpanIds: [] as string[],
  hoveredRelationId: null as string | null,
  relationPhase: 'IDLE' as RelationPhase,
  relationSourceId: null as string | null,
  relationTargetId: null as string | null,
}

/**
 * Builds a fresh vanilla store for one mounted span annotator.
 *
 * Each call returns an independent store so two annotators on the same page do
 * not share selection, hover, or relation-builder state. The relation
 * transitions are guarded: a target pick is ignored when it equals the source
 * (no self-relations), and picks are honored only in the matching phase.
 *
 * @returns a vanilla zustand store scoped to one annotator mount
 *
 * @example
 * ```typescript
 * const store = createSpanAnnotatorStore()
 * store.getState().startRelation()
 * store.getState().pickRelationSource('span-a')
 * store.getState().pickRelationTarget('span-a') // ignored: self-relation
 * store.getState().relationPhase // => 'WAITING_TARGET'
 * ```
 */
export function createSpanAnnotatorStore() {
  return createStore<SpanAnnotatorState>((set) => ({
    ...initialState,

    setSelection: (committedSelection) => set({ committedSelection }),

    clearSelection: () => set({ committedSelection: {}, gestureAnchor: null }),

    setGesture: (gestureInProgress, gestureAnchor) =>
      set((state) => ({
        gestureInProgress,
        gestureAnchor: gestureAnchor === undefined ? state.gestureAnchor : gestureAnchor,
      })),

    openLabelDraft: (pendingLabelSpanDraft) => set({ pendingLabelSpanDraft }),

    closeLabelDraft: () =>
      set({ pendingLabelSpanDraft: null, committedSelection: {}, gestureAnchor: null }),

    setActiveSpanId: (activeSpanId) => set({ activeSpanId }),

    setHoveredSpanIds: (hoveredSpanIds) => set({ hoveredSpanIds }),

    setHoveredRelationId: (hoveredRelationId) => set({ hoveredRelationId }),

    startRelation: () =>
      set({ relationPhase: 'WAITING_SOURCE', relationSourceId: null, relationTargetId: null }),

    pickRelationSource: (id) =>
      set((state) => {
        if (state.relationPhase !== 'WAITING_SOURCE') return state
        return { relationSourceId: id, relationPhase: 'WAITING_TARGET' }
      }),

    pickRelationTarget: (id) =>
      set((state) => {
        if (state.relationPhase !== 'WAITING_TARGET') return state
        if (id === state.relationSourceId) return state
        return { relationTargetId: id, relationPhase: 'WAITING_LABEL' }
      }),

    resetRelation: () =>
      set({ relationPhase: 'IDLE', relationSourceId: null, relationTargetId: null }),

    reset: () => set({ ...initialState }),
  }))
}
