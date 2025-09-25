import { useState, useEffect, useCallback } from 'react'
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
import { searchWikidata, getWikidataEntity, extractWikidataInfo } from '../services/wikidataApi'
import debounce from 'lodash/debounce'

interface WikidataSearchProps {
  onImport: (data: {
    name: string
    description: string
    wikidataId: string
    wikidataUrl: string
    aliases?: string[]
    coordinates?: any
    boundingBox?: any
    temporalData?: any
  }) => void
  entityType: 'type' | 'object' | 'time'
}

export default function WikidataSearch({ onImport, entityType }: WikidataSearchProps) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [importing, setImporting] = useState(false)
  const [entityDetails, setEntityDetails] = useState<any>(null)

  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string) => {
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

  const handleSelect = async (value: any) => {
    setSelectedItem(value)
    if (!value) {
      setEntityDetails(null)
      return
    }

    setImporting(true)
    try {
      const entity = await getWikidataEntity(value.id)
      if (entity) {
        const info = extractWikidataInfo(entity)
        setEntityDetails(info)
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
      coordinates: entityDetails.coordinates,
      boundingBox: entityDetails.boundingBox,
      temporalData: entityDetails.temporalData,
    })
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Alert severity="info" icon={<WikidataIcon />}>
        Search Wikidata to import {entityType === 'type' ? 'entity types' : entityType === 'time' ? 'temporal data' : 'entity instances'} into your ontology.
        This will create a new {entityType === 'time' ? 'time object' : entityType} based on Wikidata information.
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
            placeholder={`Search for ${entityType === 'type' ? 'concepts (e.g., "Person", "Building")' : entityType === 'time' ? 'events or periods (e.g., "Battle of Waterloo", "Renaissance")' : 'entities (e.g., "Albert Einstein", "Eiffel Tower")'}`}
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
              Import as {entityType === 'type' ? 'Entity Type' : entityType === 'time' ? 'Time Object' : 'Entity'}
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  )
}