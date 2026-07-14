/**
 * Orchestrates the token span-annotation UI over one tokenized element.
 *
 * Composes the tokenized text, the relation-arc overlay, the label and
 * relation-type pickers, and the span and relation side panels, wiring them to
 * an instance-scoped store so the component can mount more than once on a page.
 * Persistence is host-owned: the component reads `spans` and `relations` from
 * props and emits create/delete intents, so a document page or a video panel
 * can translate those intents into layers writes.
 *
 * @module
 */

import { useCallback, useMemo, useRef } from 'react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'
import {
  assignSpanColors,
  computeTokenSpanMap,
  tokenKey,
  type SpanRelation,
  type SpanSegment,
  type TextSpan,
  type TokenizedElement,
} from '@/lib/spans'
import type { RelationType } from '@models/ontology'

import { RelationArcOverlay } from './RelationArcOverlay'
import { RelationSidePanel } from './RelationSidePanel'
import { RelationTypePicker } from './RelationTypePicker'
import { SpanLabelPicker, type SpanLabelMode, type SpanLabelOption } from './SpanLabelPicker'
import { SpanSidePanel } from './SpanSidePanel'
import { TokenizedTextView } from './TokenizedTextView'
import { SpanAnnotatorStoreProvider } from './SpanAnnotatorStoreProvider'
import {
  useSpanAnnotatorStore,
  useSpanAnnotatorStoreApi,
} from './spanAnnotatorStoreContext'
import { useSpanAnnotatorHotkeys } from './hooks/useSpanAnnotatorHotkeys'
import { useSpanPositions } from './hooks/useSpanPositions'
import { useSpanRelationMachine } from './hooks/useSpanRelationMachine'
import { tokenFromNode, useTokenSelection } from './hooks/useTokenSelection'

/** A span create intent: the selection's segments plus the chosen label. */
export interface SpanDraft {
  /** One segment per element the selection covers. */
  segments: SpanSegment[]
  /** Whether the label is an ontology type or a world object. */
  mode: SpanLabelMode
  /** The chosen option. */
  option: SpanLabelOption
}

/** A relation create intent from the completed relation builder. */
export interface RelationDraftCommit {
  /** The source span id. */
  sourceSpanId: string
  /** The target span id. */
  targetSpanId: string
  /** The chosen relation-type id. */
  relationTypeId: string
  /** The chosen relation-type display name. */
  relationTypeName: string
}

/** Display and behavior toggles for the annotator. */
export interface SpanAnnotatorConfig {
  /** Whether to draw and list relations. Defaults to `true`. */
  showRelations?: boolean
  /** Whether to show the span and relation side panels. Defaults to `true`. */
  showSidePanels?: boolean
  /** Whether the surface is read-only. Defaults to `false`. */
  readOnly?: boolean
}

/**
 * Props for {@link SpanAnnotator}.
 */
export interface SpanAnnotatorProps {
  /** The tokenized element to annotate. */
  tokenization: TokenizedElement
  /** The source text, used to render whitespace faithfully. */
  text?: string | null
  /** The spans over the element. */
  spans: TextSpan[]
  /** The relations between spans. */
  relations?: SpanRelation[]
  /** The active persona, whose ontology backs type mode. */
  personaId?: string | null
  /** The persona's relation types (for the relation-type picker). */
  relationTypes?: RelationType[]
  /** Quick labels applied by the digit keys (1-based). */
  quickLabels?: SpanLabelOption[]
  /** Resolves a relation's display label; defaults to its relation-type name. */
  resolveRelationLabel?: (relation: SpanRelation) => string
  /** Resolves the relation-source/target kinds a span admits. */
  spanKindResolver?: (span: TextSpan) => string[]
  /** Called with a span create intent. */
  onCreateSpan?: (draft: SpanDraft) => void
  /** Called with a span id to delete. */
  onDeleteSpan?: (spanId: string) => void
  /** Called with a relation create intent. */
  onCreateRelation?: (commit: RelationDraftCommit) => void
  /** Called with a relation id to delete. */
  onDeleteRelation?: (relationId: string) => void
  /** Display and behavior toggles. */
  config?: SpanAnnotatorConfig
  /** Extra classes for the root element. */
  className?: string
}

/** Default mapping from a span's kind to the relation kinds it admits. */
function defaultSpanKinds(span: TextSpan): string[] {
  return span.spanType === 'object' ? ['entity', 'event'] : ['entity', 'role', 'event']
}

/**
 * The interactive body of the annotator, mounted inside the store provider.
 */
function SpanAnnotatorInner({
  tokenization,
  text,
  spans,
  relations = [],
  personaId,
  relationTypes = [],
  quickLabels = [],
  resolveRelationLabel,
  spanKindResolver = defaultSpanKinds,
  onCreateSpan,
  onDeleteSpan,
  onCreateRelation,
  onDeleteRelation,
  config = {},
  className,
}: SpanAnnotatorProps): JSX.Element {
  const { showRelations = true, showSidePanels = true, readOnly = false } = config

  const contentRef = useRef<HTMLDivElement>(null)
  const annotatorAnchorRef = useTourAnchor('span-annotator')
  const storeApi = useSpanAnnotatorStoreApi()

  const selection = useSpanAnnotatorStore((state) => state.committedSelection)
  const pendingDraft = useSpanAnnotatorStore((state) => state.pendingLabelSpanDraft)
  const activeSpanId = useSpanAnnotatorStore((state) => state.activeSpanId)
  const hoveredRelationId = useSpanAnnotatorStore((state) => state.hoveredRelationId)
  const relationPhase = useSpanAnnotatorStore((state) => state.relationPhase)
  const relationSourceId = useSpanAnnotatorStore((state) => state.relationSourceId)
  const relationTargetId = useSpanAnnotatorStore((state) => state.relationTargetId)

  const colorMap = useMemo(() => assignSpanColors(spans), [spans])
  const tokenSpanMap = useMemo(() => computeTokenSpanMap(spans), [spans])

  const selectionHandlers = useTokenSelection(contentRef)
  const positions = useSpanPositions(contentRef, spans)

  const machine = useSpanRelationMachine((commit) => onCreateRelation?.(commit))

  const relationLabel = useCallback(
    (relation: SpanRelation): string => {
      if (resolveRelationLabel) return resolveRelationLabel(relation)
      const rt = relationTypes.find((type) => type.id === relation.relationTypeId)
      return rt?.name ?? relation.relationTypeId ?? 'related'
    },
    [resolveRelationLabel, relationTypes],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (readOnly) return
      const token = tokenFromNode(event.target as Element)

      if (token && (relationPhase === 'WAITING_SOURCE' || relationPhase === 'WAITING_TARGET')) {
        const spanIds = tokenSpanMap.get(tokenKey(token.elementName, token.tokenIndex)) ?? []
        if (spanIds.length > 0) {
          if (relationPhase === 'WAITING_SOURCE') machine.pickSource(spanIds[0])
          else machine.pickTarget(spanIds[0])
        }
        event.preventDefault()
        return
      }

      if (token) {
        const spanIds = tokenSpanMap.get(tokenKey(token.elementName, token.tokenIndex)) ?? []
        if (spanIds.length > 0) storeApi.getState().setActiveSpanId(spanIds[0])
      }
      selectionHandlers.onPointerDown(event)
    },
    [machine, readOnly, relationPhase, selectionHandlers, storeApi, tokenSpanMap],
  )

  const handleSpanLabelSelect = useCallback(
    (mode: SpanLabelMode, option: SpanLabelOption) => {
      if (pendingDraft) onCreateSpan?.({ segments: pendingDraft.segments, mode, option })
      storeApi.getState().closeLabelDraft()
    },
    [onCreateSpan, pendingDraft, storeApi],
  )

  const handleSelectSpan = useCallback(
    (spanId: string) => {
      // While the relation builder awaits an endpoint, a span-row click picks
      // that span as the source or target, so an overlapping (non-primary) span
      // can be a relation endpoint. Read-only mode never enters those phases, so
      // the click just makes the span active.
      const phase = storeApi.getState().relationPhase
      if (!readOnly && phase === 'WAITING_SOURCE') machine.pickSource(spanId)
      else if (!readOnly && phase === 'WAITING_TARGET') machine.pickTarget(spanId)
      else storeApi.getState().setActiveSpanId(spanId)
    },
    [machine, readOnly, storeApi],
  )

  useSpanAnnotatorHotkeys({
    enabled: !readOnly,
    onCancel: () => {
      const state = storeApi.getState()
      if (state.relationPhase !== 'IDLE') state.resetRelation()
      else if (state.pendingLabelSpanDraft) state.closeLabelDraft()
      else state.clearSelection()
    },
    onDeleteActive: () => {
      const id = storeApi.getState().activeSpanId
      if (id) {
        onDeleteSpan?.(id)
        storeApi.getState().setActiveSpanId(null)
      }
    },
    onQuickLabel: (digit) => {
      const state = storeApi.getState()
      const option = quickLabels[digit - 1]
      if (state.pendingLabelSpanDraft && option) {
        onCreateSpan?.({ segments: state.pendingLabelSpanDraft.segments, mode: 'type', option })
        state.closeLabelDraft()
      }
    },
    onStartRelation: () => machine.start(),
  })

  const relationSourceKinds = useMemo(() => {
    const span = spans.find((s) => s.id === relationSourceId)
    return span ? spanKindResolver(span) : undefined
  }, [spans, relationSourceId, spanKindResolver])

  const relationTargetKinds = useMemo(() => {
    const span = spans.find((s) => s.id === relationTargetId)
    return span ? spanKindResolver(span) : undefined
  }, [spans, relationTargetId, spanKindResolver])

  const relationAnchor = relationTargetId ? positions.get(relationTargetId) ?? null : null

  return (
    <div ref={annotatorAnchorRef} className={cn('flex gap-4', className)} data-testid="span-annotator">
      <div className="min-w-0 flex-1">
        <div className="relative max-h-[60vh] overflow-auto rounded-lg border bg-card p-4">
          <TokenizedTextView
            element={tokenization}
            text={text}
            spans={spans}
            colorMap={colorMap}
            selection={selection}
            activeSpanId={activeSpanId}
            relationSourceId={relationSourceId}
            relationTargetId={relationTargetId}
            onSpanHover={(id) => storeApi.getState().setHoveredSpanIds(id ? [id] : [])}
            selectionHandlers={{
              onPointerDown: handlePointerDown,
              onPointerMove: readOnly ? () => {} : selectionHandlers.onPointerMove,
              onPointerUp: readOnly ? () => {} : selectionHandlers.onPointerUp,
            }}
            containerRef={contentRef}
          >
            {showRelations && (
              <RelationArcOverlay
                relations={relations}
                positions={positions}
                resolveLabel={relationLabel}
                hoveredRelationId={hoveredRelationId}
                onHoverRelation={(id) => storeApi.getState().setHoveredRelationId(id)}
                onSelectRelation={(id) => storeApi.getState().setHoveredRelationId(id)}
                onDeleteRelation={readOnly ? undefined : onDeleteRelation}
              />
            )}
            {pendingDraft && !readOnly && (
              <SpanLabelPicker
                draft={pendingDraft}
                personaId={personaId}
                onSelect={handleSpanLabelSelect}
                onCancel={() => storeApi.getState().closeLabelDraft()}
              />
            )}
            {relationPhase === 'WAITING_LABEL' && !readOnly && (
              <RelationTypePicker
                relationTypes={relationTypes}
                sourceKinds={relationSourceKinds}
                targetKinds={relationTargetKinds}
                bbox={relationAnchor}
                onSelect={(rt) => machine.commitLabel(rt.id, rt.name)}
                onCancel={() => machine.cancel()}
              />
            )}
          </TokenizedTextView>
        </div>

        {relationPhase !== 'IDLE' && (
          <div
            className="mt-2 flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm"
            data-testid="relation-status"
          >
            <span className="font-medium">
              {relationPhase === 'WAITING_SOURCE' && 'Click the source span'}
              {relationPhase === 'WAITING_TARGET' && 'Click the target span'}
              {relationPhase === 'WAITING_LABEL' && 'Choose a relation type'}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => machine.cancel()}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {showSidePanels && (
        <div className="flex w-72 shrink-0 flex-col gap-4">
          <SpanSidePanel
            spans={spans}
            colorMap={colorMap}
            activeSpanId={activeSpanId}
            onSelectSpan={handleSelectSpan}
            onDeleteSpan={(id) => onDeleteSpan?.(id)}
            onStartRelation={() => machine.start()}
            relationPhase={relationPhase}
            relationSourceId={relationSourceId}
            readOnly={readOnly}
          />
          {showRelations && (
            <RelationSidePanel
              relations={relations}
              spans={spans}
              resolveLabel={relationLabel}
              hoveredRelationId={hoveredRelationId}
              onHoverRelation={(id) => storeApi.getState().setHoveredRelationId(id)}
              onDeleteRelation={(id) => onDeleteRelation?.(id)}
              readOnly={readOnly}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The token span-annotation surface.
 *
 * Mounts its own instance-scoped store, so two annotators on one page keep
 * independent selection and relation-builder state.
 *
 * @param props - the tokenization, spans, relations, and persistence intents
 * @returns the annotator element
 */
export function SpanAnnotator(props: SpanAnnotatorProps): JSX.Element {
  return (
    <SpanAnnotatorStoreProvider>
      <SpanAnnotatorInner {...props} />
    </SpanAnnotatorStoreProvider>
  )
}
