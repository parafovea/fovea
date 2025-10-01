/**
 * Component for requesting and displaying AI-generated ontology type suggestions.
 * Allows users to augment their ontology with entity, event, role, or relation types
 * suggested by language models based on domain context and existing types.
 */

import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  Typography,
  Chip,
  LinearProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Checkbox,
  ListItemIcon,
  Divider,
  IconButton,
  Collapse,
  Stack,
} from '@mui/material'
import {
  AutoAwesome as AutoAwesomeIcon,
  CheckCircle as CheckCircleIcon,
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import { useMutation } from '@tanstack/react-query'
import { useDispatch, useSelector } from 'react-redux'
import { v4 as uuidv4 } from 'uuid'
import {
  addEntity,
  addEvent,
  addRole,
} from '../store/ontologySlice'
import { apiClient } from '../api/client'
import { RootState } from '../store/store'
import { EntityType, EventType, RoleType } from '../models/types'

/**
 * Category of ontology type to augment.
 */
export type OntologyCategory = 'entity' | 'event' | 'role' | 'relation'

/**
 * Suggested ontology type from the AI.
 */
export interface OntologySuggestion {
  name: string
  description: string
  parent: string | null
  confidence: number
  examples: string[]
}

/**
 * Response from ontology augmentation API.
 */
export interface AugmentationResponse {
  id: string
  persona_id: string
  target_category: OntologyCategory
  suggestions: OntologySuggestion[]
  reasoning: string
}

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
 * Extended ontology interface that includes entities, events, and roles arrays.
 * This matches the Redux state structure used by ontologySlice.
 */
interface ExtendedOntology {
  entities: EntityType[]
  events: EventType[]
  roles: RoleType[]
  [key: string]: unknown
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
  const dispatch = useDispatch()
  const ontology = useSelector((state: RootState) => state.ontology.currentOntology) as ExtendedOntology | null

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
    if (!mutation.data || selectedSuggestions.size === 0) return

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
            dispatch(addEntity(entityType))
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
            dispatch(addEvent(eventType))
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
            dispatch(addRole(roleType))
            break
          }
        }
      })

    setSelectedSuggestions(new Set())
  }

  const getConfidenceColor = (confidence: number): 'success' | 'warning' | 'error' => {
    if (confidence >= 0.8) return 'success'
    if (confidence >= 0.6) return 'warning'
    return 'error'
  }

  const getConfidenceLabel = (confidence: number): string => {
    const percentage = Math.round(confidence * 100)
    return `${percentage}%`
  }

  const existingTypes = getExistingTypes()

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon color="primary" />
            <Typography variant="h6">AI Ontology Augmentation</Typography>
          </Box>
          {onClose && (
            <IconButton size="small" onClick={onClose} aria-label="close">
              <CloseIcon />
            </IconButton>
          )}
        </Box>

        {personaName && (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Persona: {personaName}
          </Typography>
        )}

        <Stack spacing={2} sx={{ mt: 2 }}>
          <FormControl fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => setCategory(e.target.value as OntologyCategory)}
              disabled={mutation.isPending}
            >
              <MenuItem value="entity">Entity Types</MenuItem>
              <MenuItem value="event">Event Types</MenuItem>
              <MenuItem value="role">Role Types</MenuItem>
              <MenuItem value="relation">Relation Types</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Domain Description"
            placeholder="E.g., Wildlife research tracking whale pod behavior and migration patterns"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            multiline
            rows={3}
            fullWidth
            disabled={mutation.isPending}
            helperText="Describe your analysis domain and what you need to annotate"
          />

          {existingTypes.length > 0 && (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Existing {category} types ({existingTypes.length}):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {existingTypes.slice(0, 10).map((type) => (
                  <Chip key={type} label={type} size="small" variant="outlined" />
                ))}
                {existingTypes.length > 10 && (
                  <Chip label={`+${existingTypes.length - 10} more`} size="small" variant="outlined" />
                )}
              </Box>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label="Max Suggestions"
              type="number"
              value={maxSuggestions}
              onChange={(e) => setMaxSuggestions(Math.max(1, Math.min(20, parseInt(e.target.value) || 10)))}
              inputProps={{ min: 1, max: 20 }}
              size="small"
              sx={{ width: 150 }}
              disabled={mutation.isPending}
            />
            <Button
              variant="contained"
              startIcon={<AutoAwesomeIcon />}
              onClick={handleGenerate}
              disabled={mutation.isPending || !domain.trim()}
              fullWidth
            >
              Generate Suggestions
            </Button>
          </Box>
        </Stack>

        {mutation.isPending && (
          <Box sx={{ mt: 3 }}>
            <LinearProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Analyzing domain and generating suggestions...
            </Typography>
          </Box>
        )}

        {mutation.isError && (
          <Alert severity="error" sx={{ mt: 3 }}>
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to generate suggestions'}
          </Alert>
        )}

        {mutation.isSuccess && mutation.data && (
          <Box sx={{ mt: 3 }}>
            {mutation.data.reasoning && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {mutation.data.reasoning}
              </Alert>
            )}

            {mutation.data.suggestions.length === 0 ? (
              <Alert severity="warning">
                No suggestions generated. Try providing more context in your domain description.
              </Alert>
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1">
                    Suggestions ({mutation.data.suggestions.length})
                  </Typography>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleAcceptSelected}
                    disabled={selectedSuggestions.size === 0}
                  >
                    Add Selected ({selectedSuggestions.size})
                  </Button>
                </Box>

                <List sx={{ bgcolor: 'background.paper', borderRadius: 1 }}>
                  {mutation.data.suggestions.map((suggestion: OntologySuggestion, index: number) => {
                    const isSelected = selectedSuggestions.has(suggestion.name)
                    const isExpanded = expandedSuggestion === suggestion.name

                    return (
                      <React.Fragment key={suggestion.name}>
                        {index > 0 && <Divider />}
                        <ListItem disablePadding>
                          <ListItemButton
                            onClick={() => handleToggleSuggestion(suggestion.name)}
                            selected={isSelected}
                          >
                            <ListItemIcon>
                              <Checkbox
                                edge="start"
                                checked={isSelected}
                                tabIndex={-1}
                                disableRipple
                              />
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Typography variant="body1" fontWeight={500}>
                                    {suggestion.name}
                                  </Typography>
                                  <Chip
                                    label={getConfidenceLabel(suggestion.confidence)}
                                    size="small"
                                    color={getConfidenceColor(suggestion.confidence)}
                                    icon={<CheckCircleIcon />}
                                  />
                                  {suggestion.parent && (
                                    <Chip
                                      label={`extends ${suggestion.parent}`}
                                      size="small"
                                      variant="outlined"
                                    />
                                  )}
                                </Box>
                              }
                              secondary={suggestion.description}
                            />
                            <IconButton
                              size="small"
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation()
                                handleToggleExpand(suggestion.name)
                              }}
                              sx={{
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.3s',
                              }}
                            >
                              <ExpandMoreIcon />
                            </IconButton>
                          </ListItemButton>
                        </ListItem>

                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ px: 9, py: 2, bgcolor: 'action.hover' }}>
                            {suggestion.examples.length > 0 && (
                              <Box sx={{ mb: 1 }}>
                                <Typography variant="caption" color="text.secondary" fontWeight={500}>
                                  Examples:
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                  {suggestion.examples.map((example: string) => (
                                    <Chip key={example} label={example} size="small" />
                                  ))}
                                </Box>
                              </Box>
                            )}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="caption" color="text.secondary">
                                Confidence Score:
                              </Typography>
                              <LinearProgress
                                variant="determinate"
                                value={suggestion.confidence * 100}
                                color={getConfidenceColor(suggestion.confidence)}
                                sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                              />
                              <Typography variant="caption" color="text.secondary">
                                {getConfidenceLabel(suggestion.confidence)}
                              </Typography>
                            </Box>
                          </Box>
                        </Collapse>
                      </React.Fragment>
                    )
                  })}
                </List>
              </>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  )
}
