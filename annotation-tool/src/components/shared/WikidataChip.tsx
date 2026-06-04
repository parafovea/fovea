import { Globe, Database } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useWikidataConfig, useWikidataBaseUrl } from '@hooks/config'

interface WikidataChipProps {
  /** Original Wikidata Q-identifier (e.g., Q42) */
  wikidataId?: string
  /** URL to Wikidata entity page */
  wikidataUrl?: string
  /** Local Wikibase ID (only in offline mode, e.g., Q4) */
  wikibaseId?: string
  /** Import timestamp */
  importedAt?: string
  /** Chip size */
  size?: 'small' | 'medium'
  /** Whether to show import timestamp */
  showTimestamp?: boolean
}

export function WikidataChip({
  wikidataId,
  wikidataUrl,
  wikibaseId,
  importedAt,
  size: _size = 'small',
  showTimestamp = true
}: WikidataChipProps) {
  const { mode, allowExternalLinks } = useWikidataConfig()
  const wikibaseBaseUrl = useWikidataBaseUrl()

  if (!wikidataId) return null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // In offline mode with a local wikibaseId, show both chips
  const isOfflineWithLocalId = mode === 'offline' && wikibaseId

  // Wikibase chip (local instance) - only shown in offline mode
  const wikibaseChip = isOfflineWithLocalId && wikibaseBaseUrl ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={`${wikibaseBaseUrl}/wiki/${wikibaseId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <Badge variant="outline" className="cursor-pointer gap-1 hover:bg-accent">
          <Database className="size-3" />
          Wikibase: {wikibaseId}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>View in local Wikibase</TooltipContent>
    </Tooltip>
  ) : null

  // Wikidata chip - always shown if wikidataId exists
  const wikidataChipEnabled = allowExternalLinks && wikidataUrl

  const wikidataChipElement = wikidataChipEnabled ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={wikidataUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <Badge variant="outline" className="cursor-pointer gap-1 hover:bg-primary hover:text-primary-foreground">
          <Globe className="size-3" />
          Wikidata: {wikidataId}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>View on Wikidata</TooltipContent>
    </Tooltip>
  ) : (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="outline" className="gap-1 opacity-60 cursor-default">
          <Globe className="size-3" />
          Wikidata: {wikidataId}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>External Wikidata links disabled</TooltipContent>
    </Tooltip>
  )

  // Combine chips
  const chips = (
    <div className="flex items-center gap-1">
      {wikibaseChip}
      {wikidataChipElement}
    </div>
  )

  if (importedAt && showTimestamp) {
    return (
      <div className="flex items-center gap-2">
        {chips}
        <span className="text-xs text-muted-foreground">
          Imported {formatDate(importedAt)}
        </span>
      </div>
    )
  }

  return chips
}
