import { Box, Chip, Typography, Tooltip } from '@mui/material'
import { Language as WikidataIcon } from '@mui/icons-material'

interface WikidataChipProps {
  wikidataId?: string
  wikidataUrl?: string
  importedAt?: string
  size?: 'small' | 'medium'
  showTimestamp?: boolean
}

export function WikidataChip({ 
  wikidataId, 
  wikidataUrl, 
  importedAt, 
  size = 'small',
  showTimestamp = true 
}: WikidataChipProps) {
  if (!wikidataId || !wikidataUrl) return null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    })
  }

  const chip = (
    <Chip
      icon={<WikidataIcon />}
      label={`Wikidata: ${wikidataId}`}
      size={size}
      variant="outlined"
      color="primary"
      component="a"
      href={wikidataUrl}
      target="_blank"
      clickable
      onClick={(e) => {
        e.stopPropagation()
      }}
      sx={{
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: 'primary.main',
          color: 'primary.contrastText',
          '& .MuiChip-icon': {
            color: 'inherit'
          }
        }
      }}
    />
  )

  if (importedAt && showTimestamp) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title={`Imported from Wikidata on ${formatDate(importedAt)}`}>
          {chip}
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          Imported {formatDate(importedAt)}
        </Typography>
      </Box>
    )
  }

  return (
    <Tooltip title="Imported from Wikidata">
      {chip}
    </Tooltip>
  )
}