/**
 * Mode selector component for choosing between manual, copy, and Wikidata input modes.
 */

import { Copy, Globe, Pencil } from 'lucide-react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface ModeSelectorProps {
  mode: 'manual' | 'copy' | 'wikidata'
  onChange: (newMode: 'manual' | 'copy' | 'wikidata') => void
  showCopy?: boolean
  disabled?: boolean
}

export function ModeSelector({ mode, onChange, showCopy = true, disabled = false }: ModeSelectorProps): JSX.Element {
  return (
    <ToggleGroup
      value={[mode]}
      onValueChange={(newValue) => {
        if (newValue.length > 0) {
          onChange(newValue[newValue.length - 1] as 'manual' | 'copy' | 'wikidata')
        }
      }}
      className="w-full"
      disabled={disabled}
    >
      <ToggleGroupItem value="manual" className="flex-1 gap-2" aria-label="Manual Entry">
        <Pencil className="size-4" />
        <span className="text-sm">Manual Entry</span>
      </ToggleGroupItem>
      {showCopy && (
        <ToggleGroupItem value="copy" className="flex-1 gap-2" aria-label="Copy from Existing">
          <Copy className="size-4" />
          <span className="text-sm">Copy from Existing</span>
        </ToggleGroupItem>
      )}
      <ToggleGroupItem value="wikidata" className="flex-1 gap-2" aria-label="Import from Wikidata">
        <Globe className="size-4" />
        <span className="text-sm">Import from Wikidata</span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
