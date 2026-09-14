/**
 * Draws relation arcs over the tokenized text.
 *
 * The overlay is an absolutely positioned SVG filling the content wrapper, so
 * its user units match the content-space rectangles from `useSpanPositions`.
 * Each relation is a quadratic bow from its source span to its target (via
 * `arcPath`), staggered by index so stacked arcs clear one another, with an
 * arrowhead when directed. A clickable label sits at each arc's apex; the SVG
 * itself is click-through, and only the labels opt back into pointer events.
 *
 * @module
 */

import { useCallback, useId } from 'react'

import { cn } from '@/lib/utils'
import { arcPath, type Rect, type SpanRelation } from '@/lib/spans'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

/** Matches `ARC_BASE_HEIGHT` in the span geometry library. */
const ARC_BASE_HEIGHT = 20

/** Matches `ARC_LEVEL_SPACING` in the span geometry library. */
const ARC_LEVEL_SPACING = 14

/**
 * Props for {@link RelationArcOverlay}.
 */
export interface RelationArcOverlayProps {
  /** The relations to draw. */
  relations: SpanRelation[]
  /** Span id to bounding rectangle, from `useSpanPositions`. */
  positions: Map<string, Rect>
  /** Resolves a relation's display label. */
  resolveLabel?: (relation: SpanRelation) => string
  /** The hovered relation id. */
  hoveredRelationId?: string | null
  /** Called with a relation id (or `null`) as the pointer enters or leaves its label. */
  onHoverRelation?: (relationId: string | null) => void
  /** Called when a relation's label is clicked. */
  onSelectRelation?: (relationId: string) => void
  /** Called when a relation's delete affordance is clicked. */
  onDeleteRelation?: (relationId: string) => void
}

/** Computes the apex point of a relation's bow, where its label sits. */
function apexOf(source: Rect, target: Rect, stagger: number): { x: number; y: number } {
  const x1 = source.x + source.width / 2
  const x2 = target.x + target.width / 2
  const bow = Math.abs(x2 - x1) * 0.3 + ARC_BASE_HEIGHT + stagger * ARC_LEVEL_SPACING
  const midX = (x1 + x2) / 2
  const midY = Math.min(source.y, target.y) - bow / 2 - 8
  return { x: midX, y: midY }
}

/**
 * Renders the relation-arc SVG overlay.
 *
 * @param props - the relations, their span positions, and interaction handlers
 * @returns the overlay SVG element
 */
export function RelationArcOverlay({
  relations,
  positions,
  resolveLabel,
  hoveredRelationId,
  onHoverRelation,
  onSelectRelation,
  onDeleteRelation,
}: RelationArcOverlayProps): JSX.Element {
  const markerId = useId().replace(/[:]/g, '')
  const registerOverlayAnchor = useTourAnchor('relation-arc-overlay')
  // The registry positions spotlights from a node's bounding rect, which every
  // Element exposes, so the SVG node feeds the same registry as HTML anchors.
  const overlayAnchorRef = useCallback(
    (element: SVGSVGElement | null) =>
      registerOverlayAnchor(element as Element as HTMLElement | null),
    [registerOverlayAnchor],
  )

  return (
    <svg
      ref={overlayAnchorRef}
      className="absolute inset-0 h-full w-full overflow-visible pointer-events-none"
      data-testid="relation-arc-overlay"
      aria-hidden
    >
      <defs>
        <marker
          id={`arrow-${markerId}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-foreground/60" />
        </marker>
      </defs>

      {relations.map((relation, index) => {
        const source = positions.get(relation.sourceSpanId)
        const target = positions.get(relation.targetSpanId)
        if (!source || !target) return null

        const d = arcPath(source, target, index)
        const apex = apexOf(source, target, index)
        const label = resolveLabel?.(relation) ?? relation.relationTypeId ?? 'related'
        const isHovered = hoveredRelationId === relation.id
        const labelWidth = Math.max(24, label.length * 7 + 20)

        return (
          <g key={relation.id} data-relation-id={relation.id}>
            <path
              d={d}
              fill="none"
              className={cn(
                'stroke-foreground/40 transition-[stroke]',
                isHovered && 'stroke-primary',
              )}
              strokeWidth={isHovered ? 2 : 1.5}
              markerEnd={relation.directed ? `url(#arrow-${markerId})` : undefined}
            />
            <g
              className="pointer-events-auto cursor-pointer"
              transform={`translate(${apex.x - labelWidth / 2}, ${apex.y - 10})`}
              onMouseEnter={() => onHoverRelation?.(relation.id)}
              onMouseLeave={() => onHoverRelation?.(null)}
              onClick={() => onSelectRelation?.(relation.id)}
            >
              <rect
                width={labelWidth}
                height={18}
                rx={4}
                className={cn('fill-card stroke-border', isHovered && 'stroke-primary')}
              />
              <text
                x={labelWidth / 2 - (onDeleteRelation ? 5 : 0)}
                y={13}
                textAnchor="middle"
                className="fill-foreground text-[11px]"
              >
                {label}
              </text>
              {onDeleteRelation && (
                <text
                  x={labelWidth - 8}
                  y={13}
                  textAnchor="middle"
                  className="fill-destructive text-[11px] font-semibold"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteRelation(relation.id)
                  }}
                >
                  ×
                </text>
              )}
            </g>
          </g>
        )
      })}
    </svg>
  )
}
