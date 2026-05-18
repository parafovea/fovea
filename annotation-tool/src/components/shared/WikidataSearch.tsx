import { useState, useEffect, useMemo, useRef } from 'react'
import { Globe, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
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
  return 'items'
}

/**
 * Import data structure passed to onImport callback.
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_selectedItem, setSelectedItem] = useState<WikidataSearchResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [entityDetails, setEntityDetails] = useState<WikidataEntityDetails | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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
        setIsDropdownOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300),
    []
  )

  useEffect(() => {
    debouncedSearch(query)
  }, [query, debouncedSearch])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = async (value: WikidataSearchResult) => {
    setSelectedItem(value)
    setIsDropdownOpen(false)
    setQuery(value.label)

    setImporting(true)
    try {
      const entity = await getWikidataEntity(value.id)
      if (entity) {
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
      coordinates: entityDetails.coordinates ?? undefined,
      boundingBox: entityDetails.boundingBox ?? undefined,
      temporalData: entityDetails.temporalData ?? undefined,
      locationData: entityDetails.locationData,
      participantData: entityDetails.participantData,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertDescription>
          Search Wikidata to import {getHelpTextLabel(importType)} into your ontology.
          This will create a new {entityType === 'time' ? 'time object' : entityType === 'type' ? 'type' : 'object'} based on Wikidata information.
        </AlertDescription>
      </Alert>

      {/* Search input with dropdown */}
      <div className="relative">
        <div className="relative">
          <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            className="pl-9 pr-8"
            placeholder={`Search for ${getPlaceholderText(importType)}`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedItem(null)
              setEntityDetails(null)
            }}
            onFocus={() => { if (options.length > 0) setIsDropdownOpen(true) }}
          />
          {loading && (
            <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4" />
          )}
        </div>

        {/* Dropdown */}
        {isDropdownOpen && options.length > 0 && (
          <div
            ref={dropdownRef}
            role="listbox"
            aria-label="Wikidata search results"
            className="absolute z-50 mt-1 w-full max-h-[300px] overflow-auto rounded-lg border bg-popover shadow-md"
          >
            {options.map((option) => (
              <button
                key={option.id}
                role="option"
                aria-selected={false}
                className="w-full text-left px-3 py-2 hover:bg-accent cursor-pointer"
                onClick={() => handleSelect(option)}
              >
                <p className="text-sm">{option.label}</p>
                {option.description && (
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                )}
                <p className="text-xs text-primary">{option.id}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {importing && (
        <div className="flex justify-center p-4">
          <Spinner />
        </div>
      )}

      {entityDetails && !importing && (
        <div className="rounded-lg border p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h6 className="text-base font-semibold">{entityDetails.label}</h6>
              <a
                href={entityDetails.wikidataUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <span className="text-xs">{entityDetails.id}</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            {entityDetails.description && (
              <p className="text-sm text-muted-foreground">
                {entityDetails.description}
              </p>
            )}

            {entityDetails.aliases && entityDetails.aliases.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">
                  Also known as:
                </p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {entityDetails.aliases.map((alias: string, index: number) => (
                    <Badge key={index} variant="outline">{alias}</Badge>
                  ))}
                </div>
              </div>
            )}

            {entityType === 'type' && entityDetails.instanceOf.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">
                  Instance of:
                </p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {entityDetails.instanceOf.map((id: string) => (
                    <Badge key={id} variant="outline">{id}</Badge>
                  ))}
                </div>
              </div>
            )}

            {entityType === 'type' && entityDetails.subclassOf.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground">
                  Subclass of:
                </p>
                <div className="flex gap-1 flex-wrap mt-1">
                  {entityDetails.subclassOf.map((id: string) => (
                    <Badge key={id} variant="secondary">{id}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Display temporal data if available */}
            {entityDetails.temporalData && (
              <div>
                <p className="text-xs text-muted-foreground">
                  Temporal Information:
                </p>
                <div className="flex flex-col gap-1 mt-1">
                  {entityDetails.temporalData.pointInTime && (
                    <Badge variant="outline">
                      Point in time: {new Date(entityDetails.temporalData.pointInTime.timestamp).toLocaleDateString()} ({entityDetails.temporalData.pointInTime.granularity})
                    </Badge>
                  )}
                  {entityDetails.temporalData.startTime && (
                    <Badge variant="outline">
                      Start: {new Date(entityDetails.temporalData.startTime.timestamp).toLocaleDateString()}
                    </Badge>
                  )}
                  {entityDetails.temporalData.endTime && (
                    <Badge variant="outline">
                      End: {new Date(entityDetails.temporalData.endTime.timestamp).toLocaleDateString()}
                    </Badge>
                  )}
                  {entityDetails.temporalData.circa && (
                    <Badge variant="outline">Circa (approximate)</Badge>
                  )}
                  {entityDetails.temporalData.disputed && (
                    <Badge variant="outline">Disputed date</Badge>
                  )}
                </div>
              </div>
            )}

            <Button
              onClick={handleImport}
              className="w-full"
            >
              <Globe className="mr-2 h-4 w-4" />
              {getButtonLabel(importType, entityType, objectSubtype)}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
