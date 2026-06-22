/**
 * Component for requesting and displaying AI-generated ontology type suggestions.
 * Allows users to augment their ontology with entity, event, role, or relation types
 * suggested by language models based on domain context and existing types.
 */

import React, { useState } from 'react'
import { Sparkles, CheckCircle, ChevronDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useMutation } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import {
  usePersonaOntology,
  useAddEntityToPersona,
  useAddEventToPersona,
  useAddRoleToPersona,
} from '@store/queries'
import { apiClient } from '@api/client'
import type { OntologyCategory, OntologySuggestion } from '@api/client'
import { EntityType, EventType, RoleType } from '@models/types'

/**
 * Props for OntologyAugmenter component.
 */
export interface OntologyAugmenterProps {
  personaId: string
  personaName?: string
  onClose?: () => void
  initialCategory?: OntologyCategory
  initialDomain?: string
}

/**
 * Component for requesting AI-generated ontology type suggestions.
 * Displays suggestions with confidence scores and allows selection for addition to ontology.
 *
 * @param props - Component properties
 * @returns OntologyAugmenter component
 */
export function OntologyAugmenter({
  personaId,
  personaName,
  onClose,
  initialCategory = 'entity',
  initialDomain = '',
}: OntologyAugmenterProps) {
  // TanStack Query hooks
  const { data: ontology = null } = usePersonaOntology(personaId)
  const { mutate: addEntityMutation } = useAddEntityToPersona()
  const { mutate: addEventMutation } = useAddEventToPersona()
  const { mutate: addRoleMutation } = useAddRoleToPersona()

  const [category, setCategory] = useState<OntologyCategory>(initialCategory)
  const [domain, setDomain] = useState(initialDomain)
  const [maxSuggestions, setMaxSuggestions] = useState(10)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set())
  const [expandedSuggestion, setExpandedSuggestion] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (params: {
      personaId: string
      domain: string
      existingTypes: string[]
      targetCategory: OntologyCategory
      maxSuggestions: number
    }) => {
      const response = await apiClient.augmentOntology(params)
      return response
    },
    onSuccess: () => {
      setSelectedSuggestions(new Set())
    },
  })

  const getExistingTypes = (): string[] => {
    if (!ontology) return []

    switch (category) {
      case 'entity':
        return ontology.entities.map((entity: EntityType) => entity.name)
      case 'event':
        return ontology.events.map((event: EventType) => event.name)
      case 'role':
        return ontology.roles.map((role: RoleType) => role.name)
      case 'relation':
        return [] // Relations not implemented in Redux slice yet
      default:
        return []
    }
  }

  const handleGenerate = () => {
    if (!domain.trim()) return

    mutation.mutate({
      personaId,
      domain: domain.trim(),
      existingTypes: getExistingTypes(),
      targetCategory: category,
      maxSuggestions,
    })
  }

  const handleToggleSuggestion = (suggestionName: string) => {
    setSelectedSuggestions((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(suggestionName)) {
        newSet.delete(suggestionName)
      } else {
        newSet.add(suggestionName)
      }
      return newSet
    })
  }

  const handleToggleExpand = (suggestionName: string) => {
    setExpandedSuggestion((prev) => (prev === suggestionName ? null : suggestionName))
  }

  const handleAcceptSelected = () => {
    if (!mutation.data || selectedSuggestions.size === 0 || !personaId) return

    const now = new Date().toISOString()

    mutation.data.suggestions
      .filter((suggestion: OntologySuggestion) => selectedSuggestions.has(suggestion.name))
      .forEach((suggestion: OntologySuggestion) => {
        switch (category) {
          case 'entity': {
            const entityType: EntityType = {
              id: uuidv4(),
              name: suggestion.name,
              gloss: [{ type: 'text', content: suggestion.description }],
              examples: suggestion.examples,
              createdAt: now,
              updatedAt: now,
            }
            addEntityMutation({ personaId, entity: entityType })
            break
          }
          case 'event': {
            const eventType: EventType = {
              id: uuidv4(),
              name: suggestion.name,
              gloss: [{ type: 'text', content: suggestion.description }],
              roles: [],
              examples: suggestion.examples,
              createdAt: now,
              updatedAt: now,
            }
            addEventMutation({ personaId, event: eventType })
            break
          }
          case 'role': {
            const roleType: RoleType = {
              id: uuidv4(),
              name: suggestion.name,
              gloss: [{ type: 'text', content: suggestion.description }],
              allowedFillerTypes: ['entity', 'event'],
              examples: suggestion.examples,
              createdAt: now,
              updatedAt: now,
            }
            addRoleMutation({ personaId, role: roleType })
            break
          }
        }
      })

    setSelectedSuggestions(new Set())
  }

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'bg-green-500'
    if (confidence >= 0.6) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getConfidenceBadgeVariant = (confidence: number): 'default' | 'secondary' | 'destructive' => {
    if (confidence >= 0.8) return 'default'
    if (confidence >= 0.6) return 'secondary'
    return 'destructive'
  }

  const getConfidenceLabel = (confidence: number): string => {
    const percentage = Math.round(confidence * 100)
    return `${percentage}%`
  }

  const existingTypes = getExistingTypes()

  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <h3 className="text-base font-semibold">AI Ontology Augmentation</h3>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="close">
              <X className="size-4" />
            </Button>
          )}
        </div>

        {personaName && (
          <p className="text-sm text-muted-foreground mb-2">
            Persona: {personaName}
          </p>
        )}

        <div className="flex flex-col gap-4 mt-4">
          <div>
            <Label className="mb-2">Category</Label>
            <Select
              value={category}
              onValueChange={(val) => setCategory(val as OntologyCategory)}
              disabled={mutation.isPending}
            >
              <SelectTrigger className="w-full" data-tour-id="augmenter-import-target" aria-label="Ontology category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entity">Entity Types</SelectItem>
                <SelectItem value="event">Event Types</SelectItem>
                <SelectItem value="role">Role Types</SelectItem>
                <SelectItem value="relation">Relation Types</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div data-tour-id="augmenter-search">
            <Label className="mb-2">Domain Description</Label>
            <Textarea
              placeholder="E.g., Wildlife research tracking whale pod behavior and migration patterns"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              disabled={mutation.isPending}
              className="min-h-20"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Describe your analysis domain and what you need to annotate
            </p>
          </div>

          {existingTypes.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Existing {category} types ({existingTypes.length}):
              </p>
              <div className="flex flex-wrap gap-1">
                {existingTypes.slice(0, 10).map((type) => (
                  <Badge key={type} variant="outline">{type}</Badge>
                ))}
                {existingTypes.length > 10 && (
                  <Badge variant="outline">+{existingTypes.length - 10} more</Badge>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-4 items-center">
            <div className="w-36">
              <Label htmlFor="max-suggestions" className="mb-2">Max Suggestions</Label>
              <Input
                id="max-suggestions"
                type="number"
                value={maxSuggestions}
                onChange={(e) => setMaxSuggestions(Math.max(1, Math.min(20, parseInt(e.target.value) || 10)))}
                min={1}
                max={20}
                disabled={mutation.isPending}
              />
            </div>
            <Button
              className="flex-1 mt-5"
              onClick={handleGenerate}
              disabled={mutation.isPending || !domain.trim()}
            >
              <Sparkles className="size-4 mr-2" />
              Generate Suggestions
            </Button>
          </div>
        </div>

        {mutation.isPending && (
          <div className="mt-6">
            <Progress value={null} />
            <p className="text-sm text-muted-foreground mt-2">
              Analyzing domain and generating suggestions...
            </p>
          </div>
        )}

        {mutation.isError && (
          <Alert variant="destructive" className="mt-6">
            <AlertDescription>
              {mutation.error instanceof Error ? mutation.error.message : 'Failed to generate suggestions'}
            </AlertDescription>
          </Alert>
        )}

        {mutation.isSuccess && mutation.data && (
          <div className="mt-6" data-tour-id="augmenter-results">
            {mutation.data.reasoning && (
              <Alert className="mb-4">
                <AlertDescription>{mutation.data.reasoning}</AlertDescription>
              </Alert>
            )}

            {mutation.data.suggestions.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No suggestions generated. Try providing more context in your domain description.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm font-medium">
                    Suggestions ({mutation.data.suggestions.length})
                  </p>
                  <Button
                    size="sm"
                    onClick={handleAcceptSelected}
                    disabled={selectedSuggestions.size === 0}
                  >
                    <Plus className="size-4 mr-1" />
                    Add Selected ({selectedSuggestions.size})
                  </Button>
                </div>

                <div className="rounded-lg border bg-card">
                  {mutation.data.suggestions.map((suggestion: OntologySuggestion, index: number) => {
                    const isSelected = selectedSuggestions.has(suggestion.name)
                    const isExpanded = expandedSuggestion === suggestion.name

                    return (
                      <React.Fragment key={suggestion.name}>
                        {index > 0 && <Separator />}
                        <div
                          className={cn(
                            'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50',
                            isSelected && 'bg-accent/30'
                          )}
                          onClick={() => handleToggleSuggestion(suggestion.name)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleSuggestion(suggestion.name)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{suggestion.name}</span>
                              <Badge variant={getConfidenceBadgeVariant(suggestion.confidence)}>
                                <CheckCircle className="size-3 mr-1" />
                                {getConfidenceLabel(suggestion.confidence)}
                              </Badge>
                              {suggestion.parent && (
                                <Badge variant="outline">extends {suggestion.parent}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">{suggestion.description}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e: React.MouseEvent) => {
                              e.stopPropagation()
                              handleToggleExpand(suggestion.name)
                            }}
                            className={cn(
                              'transition-transform duration-200',
                              isExpanded && 'rotate-180'
                            )}
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="px-16 py-4 bg-accent/20">
                            {suggestion.examples.length > 0 && (
                              <div className="mb-2">
                                <p className="text-xs text-muted-foreground font-medium">
                                  Examples:
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {suggestion.examples.map((example: string) => (
                                    <Badge key={example} variant="secondary">{example}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-muted-foreground">
                                Confidence Score:
                              </p>
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={cn('h-full rounded-full', getConfidenceColor(suggestion.confidence))}
                                  style={{ width: `${suggestion.confidence * 100}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {getConfidenceLabel(suggestion.confidence)}
                              </p>
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
