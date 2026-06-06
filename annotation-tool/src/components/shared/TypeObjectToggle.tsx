/**
 * Toggle components for switching between Type and Object creation modes.
 */

import { Package, Tag } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type CreationMode = 'type' | 'object'

interface TypeObjectToggleProps {
  mode: CreationMode
  onChange: (mode: CreationMode) => void
  disabled?: boolean
  size?: 'sm' | 'default' | 'lg'
}

export function TypeObjectToggle({
  mode,
  onChange,
  disabled = false,
  size = 'default'
}: TypeObjectToggleProps): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        value={[mode]}
        onValueChange={(newValue) => {
          if (newValue.length > 0) {
            onChange(newValue[newValue.length - 1] as CreationMode)
          }
        }}
        disabled={disabled}
        size={size}
        className="w-full"
      >
        <ToggleGroupItem value="type" className="flex-1">
          <Tooltip>
            <TooltipTrigger render={
              <span className="flex items-center gap-2">
                <Tag className="size-4" />
                <span className="text-sm">Types</span>
              </span>
            } />
            <TooltipContent>Define categories and concepts</TooltipContent>
          </Tooltip>
        </ToggleGroupItem>
        <ToggleGroupItem value="object" className="flex-1">
          <Tooltip>
            <TooltipTrigger render={
              <span className="flex items-center gap-2">
                <Package className="size-4" />
                <span className="text-sm">Objects</span>
              </span>
            } />
            <TooltipContent>Create actual instances</TooltipContent>
          </Tooltip>
        </ToggleGroupItem>
      </ToggleGroup>

      <ModeIndicator mode={mode} />
    </div>
  )
}

interface ModeIndicatorProps {
  mode: CreationMode
  variant?: 'badge' | 'text'
}

export function ModeIndicator({ mode, variant = 'badge' }: ModeIndicatorProps): JSX.Element {
  const isType = mode === 'type'

  if (variant === 'badge') {
    return (
      <Badge
        variant={isType ? 'default' : 'secondary'}
        className={cn(
          isType && 'border-dashed italic',
        )}
      >
        {isType ? <Tag className="size-3" /> : <Package className="size-3" />}
        {isType ? 'Creating Type (Category)' : 'Creating Object (Instance)'}
      </Badge>
    )
  }

  return (
    <p className={cn(
      'text-xs',
      isType ? 'italic text-primary' : 'text-secondary-foreground',
    )}>
      {isType
        ? 'Types define categories that personas use to classify things'
        : 'Objects are actual entities, events, and times that exist in the world'}
    </p>
  )
}

interface TypeObjectBadgeProps {
  isType: boolean
  size?: 'sm' | 'default'
}

export function TypeObjectBadge({ isType, size = 'sm' }: TypeObjectBadgeProps): JSX.Element {
  return (
    <Badge
      variant={isType ? 'outline' : 'default'}
      className={cn(
        isType && 'border-dashed italic',
        !isType && 'font-bold',
        size === 'sm' ? 'h-5 text-[10px]' : 'h-6',
      )}
    >
      {isType ? 'TYPE' : 'OBJECT'}
    </Badge>
  )
}
