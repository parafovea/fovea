/**
 * Top-row transport bar.
 *
 * Groups transport, keyframe-edit, and zoom actions into three clusters
 * separated by vertical dividers, with a centered SMPTE timecode readout
 * and a right-side cluster for the shortcut palette and close button.
 * Every button has a tooltip showing its keyboard shortcut; disabled
 * state cascades from props the root computes.
 */

import { memo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  CopyCheck,
  EyeOff,
  KeyRound,
  Keyboard,
  SkipBack,
  SkipForward,
  Spline,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { formatTimecode } from './timecode'

interface Props {
  currentFrame: number
  totalFrames: number
  fps: number
  zoom: number
  minZoom: number
  maxZoom: number
  /** Disabled when no track is active. */
  canEditKeyframes: boolean
  isOnKeyframe: boolean
  canDeleteKeyframe: boolean
  canInterpolate: boolean
  canCopyPrevious: boolean
  onStepBackward: () => void
  onJumpBackward: () => void
  onStepForward: () => void
  onJumpForward: () => void
  onAddKeyframe: () => void
  onDeleteKeyframe: () => void
  onCopyPreviousFrame: () => void
  onOpenInterpolation: () => void
  onClose: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onOpenShortcuts: () => void
}

export const TransportBar = memo(function TransportBar(props: Props) {
  const {
    currentFrame,
    totalFrames,
    fps,
    zoom,
    minZoom,
    maxZoom,
    canEditKeyframes,
    isOnKeyframe,
    canDeleteKeyframe,
    canInterpolate,
    canCopyPrevious,
    onStepBackward,
    onJumpBackward,
    onStepForward,
    onJumpForward,
    onAddKeyframe,
    onDeleteKeyframe,
    onCopyPreviousFrame,
    onOpenInterpolation,
    onClose,
    onZoomIn,
    onZoomOut,
    onOpenShortcuts,
  } = props

  return (
    <div
      data-slot="timeline-transport"
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5',
        'border-b border-white/5 bg-slate-950/70 backdrop-blur',
      )}
    >
      <div className="flex items-center gap-0.5">
        <IconButton label="Jump 10 frames back (Shift + ←)" onClick={onJumpBackward}>
          <SkipBack className="size-4" />
        </IconButton>
        <IconButton label="Step 1 frame back (←)" onClick={onStepBackward}>
          <ChevronLeft className="size-4" />
        </IconButton>
        <IconButton label="Step 1 frame forward (→)" onClick={onStepForward}>
          <ChevronRight className="size-4" />
        </IconButton>
        <IconButton label="Jump 10 frames forward (Shift + →)" onClick={onJumpForward}>
          <SkipForward className="size-4" />
        </IconButton>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5 bg-white/10" />

      <div className="flex items-center gap-0.5">
        <IconButton
          label={isOnKeyframe ? 'Already a keyframe' : 'Add Keyframe (K)'}
          onClick={onAddKeyframe}
          disabled={!canEditKeyframes || isOnKeyframe}
        >
          <KeyRound className="size-4" />
        </IconButton>
        <IconButton
          label="Delete Keyframe (Del)"
          onClick={onDeleteKeyframe}
          disabled={!canDeleteKeyframe}
        >
          <Trash2 className="size-4" />
        </IconButton>
        <IconButton
          label="Copy Previous Frame (C)"
          onClick={onCopyPreviousFrame}
          disabled={!canCopyPrevious}
        >
          <CopyCheck className="size-4" />
        </IconButton>
        <IconButton
          label="Interpolation Mode (I)"
          onClick={onOpenInterpolation}
          disabled={!canInterpolate}
        >
          <Spline className="size-4" />
        </IconButton>
      </div>

      <Separator orientation="vertical" className="mx-1 h-5 bg-white/10" />

      <div className="flex items-center gap-0.5">
        <IconButton
          label="Zoom out (–)"
          onClick={onZoomOut}
          disabled={zoom <= minZoom + 1e-6}
        >
          <ZoomOut className="size-4" />
        </IconButton>
        <IconButton
          label="Zoom in (+)"
          onClick={onZoomIn}
          disabled={zoom >= maxZoom - 1e-6}
        >
          <ZoomIn className="size-4" />
        </IconButton>
      </div>

      <div className="mx-auto flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-slate-300">
          {formatTimecode(currentFrame, fps)}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-slate-500">
          frame {currentFrame} / {Math.max(0, totalFrames - 1)}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <IconButton label="Keyboard shortcuts (?)" onClick={onOpenShortcuts}>
          <Keyboard className="size-4" />
        </IconButton>
        <IconButton
          label="Hide timeline and show standard controls"
          onClick={onClose}
        >
          <EyeOff className="size-4" />
        </IconButton>
      </div>
    </div>
  )
})

function IconButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7 text-slate-300 hover:text-slate-100"
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
