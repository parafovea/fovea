import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Zap, User, Clock, MapPin, Globe, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { useWorld, useAddEvent, useUpdateEvent, usePersonas, useAllPersonaOntologies } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import { Event, EventInterpretation, GlossItem, Location, TimeInstant, TimeInterval } from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import { TypeObjectBadge } from '../shared/TypeObjectToggle'
import WikidataImportFlow from '../shared/WikidataImportFlow'
import { useUnsavedChangesPrompt } from '../../hooks/data'

interface EventEditorProps {
  open: boolean
  onClose: () => void
  event: Event | null
}

interface ParticipantFormData {
  entityId: string
  roleTypeId: string
}

export default function EventEditor({ open, onClose, event }: EventEditorProps) {
  // TanStack Query hooks for personas
  const { data: personas = [] } = usePersonas()
  const personaIds = personas.map((p) => p.id)
  const { data: personaOntologies = [] } = useAllPersonaOntologies(personaIds)

  // Active persona from Zustand store
  const activePersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)

  const { data: worldData } = useWorld()
  const entities = useMemo(() => worldData?.entities ?? [], [worldData?.entities])
  const times = useMemo(() => worldData?.times ?? [], [worldData?.times])
  const { mutateAsync: addEvent } = useAddEvent()
  const { mutateAsync: updateEvent } = useUpdateEvent()

  const [name, setName] = useState('')
  const [description, setDescription] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [selectedTimeId, setSelectedTimeId] = useState<string>('')
  const [selectedLocationId, setSelectedLocationId] = useState<string>('')
  const [certainty, setCertainty] = useState<number>(1.0)

  // Wikidata import
  const [importMode, setImportMode] = useState<'manual' | 'wikidata'>('manual')
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')

  // For persona interpretations
  const [interpretations, setInterpretations] = useState<EventInterpretation[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('')
  const [selectedEventTypeId, setSelectedEventTypeId] = useState<string>('')
  const [participants, setParticipants] = useState<ParticipantFormData[]>([])
  const [interpretationConfidence, setInterpretationConfidence] = useState<number>(1.0)
  const [interpretationJustification, setInterpretationJustification] = useState('')

  const isDirty = open && (
    event
      ? name !== event.name ||
        selectedTimeId !== (event.time?.id || '') ||
        selectedLocationId !== (event.location?.id || '') ||
        certainty !== (event.metadata?.certainty ?? 1.0) ||
        wikidataId !== (event.wikidataId || '') ||
        wikidataUrl !== (event.wikidataUrl || '') ||
        JSON.stringify(description) !== JSON.stringify(event.description) ||
        JSON.stringify(interpretations) !== JSON.stringify(event.personaInterpretations || [])
      : !!name || interpretations.length > 0
  )

  const { confirmDiscard } = useUnsavedChangesPrompt({ isDirty })

  useEffect(() => {
    if (event) {
      setName(event.name)
      setDescription(event.description)
      setSelectedTimeId(event.time?.id || '')
      setSelectedLocationId(event.location?.id || '')
      setCertainty(event.metadata?.certainty || 1.0)
      setInterpretations(event.personaInterpretations || [])
      setWikidataId(event.wikidataId || '')
      setWikidataUrl(event.wikidataUrl || '')
    } else {
      setName('')
      setDescription([{ type: 'text', content: '' }])
      setSelectedTimeId('')
      setSelectedLocationId('')
      setCertainty(1.0)
      setInterpretations([])
      setWikidataId('')
      setWikidataUrl('')
    }
  }, [event, open])

  const handleAddParticipant = () => {
    setParticipants([...participants, { entityId: '', roleTypeId: '' }])
  }

  const handleUpdateParticipant = (index: number, field: keyof ParticipantFormData, value: string) => {
    const updated = [...participants]
    updated[index] = { ...updated[index], [field]: value }
    setParticipants(updated)
  }

  const handleRemoveParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index))
  }

  const handleAddInterpretation = () => {
    if (selectedPersonaId && selectedEventTypeId) {
      const newInterpretation: EventInterpretation = {
        personaId: selectedPersonaId,
        eventTypeId: selectedEventTypeId,
        participants: participants.filter(p => p.entityId && p.roleTypeId).map(p => ({
          entityId: p.entityId,
          roleTypeId: p.roleTypeId,
        })),
        confidence: interpretationConfidence,
        justification: interpretationJustification || undefined,
      }

      const filtered = interpretations.filter(i => i.personaId !== selectedPersonaId)
      setInterpretations([...filtered, newInterpretation])

      setSelectedEventTypeId('')
      setParticipants([])
      setInterpretationConfidence(1.0)
      setInterpretationJustification('')
    }
  }

  const handleRemoveInterpretation = (personaId: string) => {
    setInterpretations(interpretations.filter(i => i.personaId !== personaId))
  }

  const handleSave = async () => {
    const now = new Date().toISOString()

    const timeToUse = times.find(t => t.id === selectedTimeId)
    const locationToUse = entities.find(e => e.id === selectedLocationId && 'locationType' in e) as Location | undefined

    const eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      description,
      personaInterpretations: interpretations,
      time: timeToUse,
      location: locationToUse,
      wikidataId: wikidataId || undefined,
      wikidataUrl: wikidataUrl || undefined,
      importedFrom: wikidataId ? (event?.importedFrom || 'wikidata') : undefined,
      importedAt: wikidataId ? (event?.importedAt || now) : undefined,
      metadata: {
        certainty,
        properties: {},
      },
    }

    if (event) {
      await updateEvent({ ...event, ...eventData })
    } else {
      await addEvent(eventData)
    }

    onClose()
  }

  const handleCancel = () => {
    if (!confirmDiscard()) return
    onClose()
  }

  const getEventTypeName = (personaId: string, eventTypeId: string): string => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    const eventType = ontology?.events.find(e => e.id === eventTypeId)
    return eventType?.name || 'Unknown Type'
  }

  const getRoleTypeName = (personaId: string, roleTypeId: string): string => {
    const ontology = personaOntologies.find(o => o.personaId === personaId)
    const roleType = ontology?.roles.find(r => r.id === roleTypeId)
    return roleType?.name || 'Unknown Role'
  }

  const getEntityName = (entityId: string): string => {
    const entity = entities.find(e => e.id === entityId)
    return entity?.name || 'Unknown Entity'
  }

  const getPersonaName = (personaId: string): string => {
    const persona = personas.find(p => p.id === personaId)
    return persona?.name || 'Unknown Persona'
  }

  const availableEventTypes = selectedPersonaId
    ? personaOntologies.find(o => o.personaId === selectedPersonaId)?.events || []
    : []

  const availableRoleTypes = selectedPersonaId
    ? personaOntologies.find(o => o.personaId === selectedPersonaId)?.roles || []
    : []

  const locationEntities = entities.filter(e => 'locationType' in e)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent data-tour-id="event-editor" className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-secondary" />
            {event ? 'Edit Event' : 'Create Event'}
            <TypeObjectBadge isType={false} />
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Alert>
            <Zap className="size-4" />
            <AlertDescription>
              An event is something that actually happened (e.g., "The 2024 Olympics", "John's birthday party").
              This is different from event types which are categories (e.g., "Olympics", "Birthday Party").
            </AlertDescription>
          </Alert>

          {/* Import mode selector */}
          {!event && (
            <ToggleGroup
              value={[importMode]}
              onValueChange={(value) => {
                if (value.length > 0) setImportMode(value[0] as 'manual' | 'wikidata')
              }}
              size="sm"
              className="w-full"
            >
              <ToggleGroupItem value="manual" className="flex flex-1 items-center gap-1">
                <Pencil className="size-4" />
                <span className="text-sm">Manual Entry</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="wikidata" className="flex flex-1 items-center gap-1">
                <Globe className="size-4" />
                <span className="text-sm">Import from Wikidata</span>
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          {/* Wikidata import */}
          {importMode === 'wikidata' && !event && (
            <WikidataImportFlow
              type="event"
              entityType="object"
              objectSubtype="event"
              onSuccess={() => onClose()}
              onCancel={onClose}
            />
          )}

          {/* Show Wikidata chip if imported */}
          {wikidataId && (
            <div className="flex items-center gap-2">
              <a href={wikidataUrl} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer">
                  Wikidata: {wikidataId}
                </Badge>
              </a>
              <span className="text-xs text-muted-foreground">
                Imported from Wikidata
              </span>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="event-name">Name *</Label>
            <Input
              id="event-name"
              data-tour-id="event-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Event name"
            />
            <p className="text-xs text-muted-foreground">The specific name of this event</p>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <GlossEditor
              gloss={description}
              onChange={setDescription}
              personaId={activePersonaId}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-1">
              <Label className="flex items-center gap-1">
                <Clock className="size-3 text-muted-foreground" />
                Time
              </Label>
              <Select value={selectedTimeId || '_none'} onValueChange={(value) => setSelectedTimeId(!value || value === '_none' ? '' : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None">
                    {selectedTimeId
                      ? (() => {
                          const time = times.find((t) => t.id === selectedTimeId)
                          if (!time) return null
                          return time.label || (time.type === 'instant'
                            ? `Instant: ${(time as TimeInstant).timestamp}`
                            : `Interval: ${(time as TimeInterval).startTime || '?'} - ${(time as TimeInterval).endTime || '?'}`)
                        })()
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {times.map(time => (
                    <SelectItem key={time.id} value={time.id}>
                      {time.label || (time.type === 'instant'
                        ? `Instant: ${(time as TimeInstant).timestamp}`
                        : `Interval: ${(time as TimeInterval).startTime || '?'} - ${(time as TimeInterval).endTime || '?'}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 space-y-1">
              <Label className="flex items-center gap-1">
                <MapPin className="size-3 text-muted-foreground" />
                Location
              </Label>
              <Select value={selectedLocationId || '_none'} onValueChange={(value) => setSelectedLocationId(!value || value === '_none' ? '' : value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None">
                    {selectedLocationId
                      ? locationEntities.find((location) => location.id === selectedLocationId)?.name ?? null
                      : null}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">None</SelectItem>
                  {locationEntities.map(location => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1" style={{ width: 150 }}>
              <Label>Certainty</Label>
              <Input
                type="number"
                value={certainty}
                onChange={(e) => setCertainty(parseFloat(e.target.value))}
                min={0}
                max={1}
                step={0.1}
              />
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-semibold">Persona Interpretations</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Different personas can interpret this event with different event types and participant roles.
            </p>

            {/* List existing interpretations */}
            {interpretations.length > 0 && (
              <ul className="space-y-3 mb-4">
                {interpretations.map((interpretation) => (
                  <li key={interpretation.personaId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge>
                          <User className="mr-1 size-3" />
                          {getPersonaName(interpretation.personaId)}
                        </Badge>
                        <span className="text-sm">interprets as</span>
                        <Badge variant="outline" className="italic">
                          {getEventTypeName(interpretation.personaId, interpretation.eventTypeId)}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveInterpretation(interpretation.personaId)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    {interpretation.participants.length > 0 && (
                      <div className="ml-8">
                        <span className="text-xs text-muted-foreground">Participants:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {interpretation.participants.map((p, idx) => (
                            <Badge key={idx} variant="outline">
                              {getEntityName(p.entityId)} as {getRoleTypeName(interpretation.personaId, p.roleTypeId)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Add new interpretation */}
            <Accordion>
              <AccordionItem value="add-interpretation">
                <AccordionTrigger>
                  <span className="text-sm font-medium">Add Interpretation</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-3 pt-2">
                    <Select value={selectedPersonaId || '_none'} onValueChange={(value) => {
                      setSelectedPersonaId(!value || value === '_none' ? '' : value)
                      setSelectedEventTypeId('')
                      setParticipants([])
                    }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Persona">
                          {selectedPersonaId
                            ? personas.find((persona) => persona.id === selectedPersonaId)?.name ?? null
                            : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Select Persona</SelectItem>
                        {personas.map(persona => (
                          <SelectItem key={persona.id} value={persona.id}>
                            {persona.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {selectedPersonaId && (
                      <>
                        <Select value={selectedEventTypeId || '_none'} onValueChange={(value) => setSelectedEventTypeId(!value || value === '_none' ? '' : value)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select Event Type">
                              {selectedEventTypeId
                                ? availableEventTypes.find((type) => type.id === selectedEventTypeId)?.name ?? null
                                : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">Select Event Type</SelectItem>
                            {availableEventTypes.map(type => (
                              <SelectItem key={type.id} value={type.id}>
                                <em>{type.name}</em>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Participants</Label>
                          {participants.map((participant, index) => (
                            <div key={index} className="flex gap-2">
                              <Select value={participant.entityId || '_none'} onValueChange={(value) => handleUpdateParticipant(index, 'entityId', !value || value === '_none' ? '' : value)}>
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Entity">
                                    {participant.entityId
                                      ? entities.find((entity) => entity.id === participant.entityId)?.name ?? null
                                      : null}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">Select Entity</SelectItem>
                                  {entities.map(entity => (
                                    <SelectItem key={entity.id} value={entity.id}>
                                      {entity.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select value={participant.roleTypeId || '_none'} onValueChange={(value) => handleUpdateParticipant(index, 'roleTypeId', !value || value === '_none' ? '' : value)}>
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Role">
                                    {participant.roleTypeId
                                      ? availableRoleTypes.find((role) => role.id === participant.roleTypeId)?.name ?? null
                                      : null}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="_none">Select Role</SelectItem>
                                  {availableRoleTypes.map(role => (
                                    <SelectItem key={role.id} value={role.id}>
                                      <em>{role.name}</em>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRemoveParticipant(index)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleAddParticipant}
                          >
                            <Plus className="mr-1 size-4" />
                            Add Participant
                          </Button>
                        </div>

                        <Input
                          type="number"
                          value={interpretationConfidence}
                          onChange={(e) => setInterpretationConfidence(parseFloat(e.target.value))}
                          min={0}
                          max={1}
                          step={0.1}
                          placeholder="Confidence"
                        />

                        <textarea
                          className="flex min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          rows={2}
                          value={interpretationJustification}
                          onChange={(e) => setInterpretationJustification(e.target.value)}
                          placeholder="Justification (optional)"
                        />

                        <Button
                          variant="outline"
                          onClick={handleAddInterpretation}
                          disabled={!selectedEventTypeId}
                        >
                          <Plus className="mr-1 size-4" />
                          Add Interpretation
                        </Button>
                      </>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={handleSave}
            disabled={!name || description.length === 0}
          >
            {event ? 'Update Event' : 'Create Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
