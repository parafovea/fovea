import { Box, Chip, Typography, Tooltip } from '@mui/material'
import { Language as WikidataIcon, Storage as WikibaseIcon } from '@mui/icons-material'
import { useWikidataConfig, useWikidataBaseUrl } from '../../hooks/useAppConfig'

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
  size = 'small',
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
    <Tooltip title="View in local Wikibase">
      <Chip
        icon={<WikibaseIcon />}
        label={`Wikibase: ${wikibaseId}`}
        size={size}
        variant="outlined"
        color="info"
        component="a"
        href={`${wikibaseBaseUrl}/wiki/${wikibaseId}`}
        target="_blank"
        clickable
        onClick={(e) => e.stopPropagation()}
        sx={{
          cursor: 'pointer',
          '&:hover': {
            backgroundColor: 'info.main',
            color: 'info.contrastText',
            '& .MuiChip-icon': {
              color: 'inherit'
            }
          }
        }}
      />
    </Tooltip>
  ) : null

  // Wikidata chip - always shown if wikidataId exists
  const wikidataChipEnabled = allowExternalLinks && wikidataUrl
  const wikidataChip = (
    <Tooltip
      title={
        wikidataChipEnabled
          ? 'View on Wikidata'
          : 'External Wikidata links disabled'
      }
    >
      <Chip
        icon={<WikidataIcon />}
        label={`Wikidata: ${wikidataId}`}
        size={size}
        variant="outlined"
        color={wikidataChipEnabled ? 'primary' : 'default'}
        {...(wikidataChipEnabled ? {
          component: 'a' as const,
          href: wikidataUrl,
          target: '_blank',
          clickable: true,
        } : {})}
        onClick={(e) => e.stopPropagation()}
        sx={{
          cursor: wikidataChipEnabled ? 'pointer' : 'default',
          ...(wikidataChipEnabled ? {
            '&:hover': {
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '& .MuiChip-icon': {
                color: 'inherit'
              }
            }
          } : {
            opacity: 0.6,
            '& .MuiChip-icon': {
              color: 'action.disabled'
            }
          })
        }}
      />
    </Tooltip>
  )

  // Combine chips
  const chips = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {wikibaseChip}
      {wikidataChip}
    </Box>
  )

  if (importedAt && showTimestamp) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {chips}
        <Typography variant="caption" color="text.secondary">
          Imported {formatDate(importedAt)}
        </Typography>
      </Box>
    )
  }

  return chips
}