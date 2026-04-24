import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  TextField,
  Autocomplete,
  CircularProgress,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  Link,
} from '@mui/material'
import {
  Language as WikidataIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material'
import { searchWikidata, getWikidataEntity, extractWikidataInfo } from '@services/wikidataApi'
import { getWikidataBaseUrl } from '@services/wikidataConfig'
import {
  WikidataCoordinates,
  WikidataBoundingBox,
  WikidataTemporalData,
  WikidataLocationData,
  WikidataParticipantData,
} from '@hooks/wikidata/useWikidataImport'
import debounce from 'lodash/debounce'

/**
 * Wikidata search result item from the API.
 */
interface WikidataSearchResult {
  id: string
  wikidataId: string
  label: string
  description?: string
  concepturi: string
  match?: {
    text: string
    type: string
  }
}

/**
 * Extracted entity details from Wikidata.
 */
interface WikidataEntityDetails {
  id: string
  wikidataId: string
  label: string
  description: string
  instanceOf: string[]
  subclassOf: string[]
  aliases: string[]
  coordinates: WikidataCoordinates | null
  boundingBox: WikidataBoundingBox | null
  temporalData: WikidataTemporalData | null
  locationData: WikidataLocationData[]
  participantData: WikidataParticipantData[]
  wikidataUrl: string
}

/**
 * Gets the appropriate button label based on import type
 */
function getButtonLabel(
  importType?: string,
  entityType?: string,
  objectSubtype?: string
): string {
  if (importType) {
    const labels: Record<string, string> = {
      'entity-type': 'Import as Entity Type',
      'event-type': 'Import as Event Type',
      'role-type': 'Import as Role Type',
      'relation-type': 'Import as Relation Type',
      'entity': 'Import as Entity',
      'event': 'Import as Event',
      'location': 'Import as Location',
      'time': 'Import as Time Object',
    }
    return labels[importType] || 'Import'
  }

  // Fallback to old logic if importType not provided
  if (entityType === 'type') return 'Import as Entity Type'
  if (entityType === 'time') return 'Import as Time Object'
  if (objectSubtype === 'event') return 'Import as Event'
  if (objectSubtype === 'location') return 'Import as Location'
  return 'Import as Entity'
}

/**
 * Gets the appropriate help text label based on import type
 */
function getHelpTextLabel(importType?: string): string {
  if (importType) {
    const labels: Record<string, string> = {
      'entity-type': 'entity types',
      'event-type': 'event types',
      'role-type': 'role types',
      'relation-type': 'relation types',
      'entity': 'entities',
      'event': 'events',
      'location': 'locations',
      'time': 'temporal data',
    }
    return labels[importType] || 'items'
  }
  // Generic fallback
  return 'items'
}

/**
 * Gets the appropriate placeholder text based on import type
 */
function getPlaceholderText(importType?: string): string {
  if (importType) {
    const placeholders: Record<string, string> = {
      'entity-type': 'concepts (e.g., "Person", "Building")',
      'event-type': 'event concepts (e.g., "Protest", "Election")',
      'role-type': 'role concepts (e.g., "Participant", "Organizer")',
      'relation-type': 'relation concepts (e.g., "Part of", "Located in")',
      'entity': 'entities (e.g., "Albert Einstein", "Eiffel Tower")',
      'event': 'events (e.g., "Battle of Waterloo", "2024 Olympics")',
      'location': 'locations (e.g., "Paris", "Mount Everest")',
      'time': 'events or periods (e.g., "Renaissance", "World War II")',
    }
    return placeholders[importType] || 'items'
  }
  // Generic fallback
  return 'items'
}

/**
 * Import data structure passed to onImport callback.
 * These fields are optional and may be undefined if Wikidata doesn't have the data.
 */
export interface WikidataImportCallbackData {
  name: string
  description: string
  wikidataId: string
  wikidataUrl: string
  aliases?: string[]
  coordinates?: WikidataCoordinates
  boundingBox?: WikidataBoundingBox
  temporalData?: WikidataTemporalData
  locationData?: WikidataLocationData[]
  participantData?: WikidataParticipantData[]
}

interface WikidataSearchProps {
  onImport: (data: WikidataImportCallbackData) => void
  entityType: 'type' | 'object' | 'time'
  objectSubtype?: 'entity' | 'event' | 'location'
  importType?: 'entity-type' | 'role-type' | 'event-type' | 'relation-type' | 'entity' | 'event' | 'location' | 'time'
}

export default function WikidataSearch({ onImport, entityType, objectSubtype = 'entity', importType }: WikidataSearchProps) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<WikidataSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<WikidataSearchResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [entityDetails, setEntityDetails] = useState<WikidataEntityDetails | null>(null)

  const debouncedSearch = useMemo(
    () => debounce(async (searchQuery: string) => {
      if (!searchQuery || searchQuery.length < 2) {
        setOptions([])
        return
      }

      setLoading(true)
      try {
        const results = await searchWikidata(searchQuery)
        setOptions(results)
      } finally {
        setLoading(false)
      }
    }, 300),
    []
  )

  useEffect(() => {
    debouncedSearch(query)
  }, [query, debouncedSearch])

  const handleSelect = async (value: WikidataSearchResult | null) => {
    setSelectedItem(value)
    if (!value) {
      setEntityDetails(null)
      return
    }

    setImporting(true)
    try {
      const entity = await getWikidataEntity(value.id)
      if (entity) {
        // Get the base URL for wiki links (may be local Wikibase)
        const baseUrl = await getWikidataBaseUrl()
        const info = extractWikidataInfo(entity, { baseUrl })
        setEntityDetails(info as WikidataEntityDetails)
      }
    } finally {
      setImporting(false)
    }
  }

  const handleImport = () => {
    if (!entityDetails) return

    onImport({
      name: entityDetails.label,
      description: entityDetails.description,
      wikidataId: entityDetails.id,
      wikidataUrl: entityDetails.wikidataUrl,
      aliases: entityDetails.aliases,
      // Convert null to undefined for optional fields
      coordinates: entityDetails.coordinates ?? undefined,
      boundingBox: entityDetails.boundingBox ?? undefined,
      temporalData: entityDetails.temporalData ?? undefined,
      locationData: entityDetails.locationData,
      participantData: entityDetails.participantData,
    })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Alert severity="info" icon={<WikidataIcon />}>
        Search Wikidata to import {getHelpTextLabel(importType)} into your ontology.
        This will create a new {entityType === 'time' ? 'time object' : entityType === 'type' ? 'type' : 'object'} based on Wikidata information.
      </Alert>

      <Autocomplete
        options={options}
        loading={loading}
        value={selectedItem}
        onChange={(_, value) => handleSelect(value)}
        onInputChange={(_, value) => setQuery(value)}
        getOptionLabel={(option) => option.label || ''}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Search Wikidata"
            placeholder={`Search for ${getPlaceholderText(importType)}`}
            InputProps={{
              ...params.InputProps,
              startAdornment: <WikidataIcon sx={{ mr: 1, color: 'action.active' }} />,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        renderOption={(props, option) => (
          <Box component="li" {...props}>
            <Box sx={{ width: '100%' }}>
              <Typography variant="body1">{option.label}</Typography>
              {option.description && (
                <Typography variant="caption" color="text.secondary">
                  {option.description}
                </Typography>
              )}
              <Typography variant="caption" color="primary.main" sx={{ display: 'block' }}>
                {option.id}
              </Typography>
            </Box>
          </Box>
        )}
      />

      {importing && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress />
        </Box>
      )}

      {entityDetails && !importing && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6">{entityDetails.label}</Typography>
              <Link
                href={entityDetails.wikidataUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                <Typography variant="caption">{entityDetails.id}</Typography>
                <OpenInNewIcon fontSize="small" />
              </Link>
            </Box>

            {entityDetails.description && (
              <Typography variant="body2" color="text.secondary">
                {entityDetails.description}
              </Typography>
            )}

            {entityDetails.aliases && entityDetails.aliases.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Also known as:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {entityDetails.aliases.map((alias: string, index: number) => (
                    <Chip key={index} label={alias} size="small" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {entityType === 'type' && entityDetails.instanceOf.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Instance of:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {entityDetails.instanceOf.map((id: string) => (
                    <Chip key={id} label={id} size="small" color="primary" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {entityType === 'type' && entityDetails.subclassOf.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Subclass of:
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                  {entityDetails.subclassOf.map((id: string) => (
                    <Chip key={id} label={id} size="small" color="secondary" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {/* Display temporal data if available */}
            {entityDetails.temporalData && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Temporal Information:
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 0.5 }}>
                  {entityDetails.temporalData.pointInTime && (
                    <Chip 
                      label={`Point in time: ${new Date(entityDetails.temporalData.pointInTime.timestamp).toLocaleDateString()} (${entityDetails.temporalData.pointInTime.granularity})`}
                      size="small" 
                      color="info" 
                      variant="outlined" 
                    />
                  )}
                  {entityDetails.temporalData.startTime && (
                    <Chip 
                      label={`Start: ${new Date(entityDetails.temporalData.startTime.timestamp).toLocaleDateString()}`}
                      size="small" 
                      color="info" 
                      variant="outlined" 
                    />
                  )}
                  {entityDetails.temporalData.endTime && (
                    <Chip 
                      label={`End: ${new Date(entityDetails.temporalData.endTime.timestamp).toLocaleDateString()}`}
                      size="small" 
                      color="info" 
                      variant="outlined" 
                    />
                  )}
                  {entityDetails.temporalData.circa && (
                    <Chip label="Circa (approximate)" size="small" variant="outlined" />
                  )}
                  {entityDetails.temporalData.disputed && (
                    <Chip label="Disputed date" size="small" variant="outlined" color="warning" />
                  )}
                </Box>
              </Box>
            )}

            <Button
              variant="contained"
              onClick={handleImport}
              startIcon={<WikidataIcon />}
              fullWidth
            >
              {getButtonLabel(importType, entityType, objectSubtype)}
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  )
}