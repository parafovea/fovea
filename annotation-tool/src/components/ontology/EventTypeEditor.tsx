import { useState, useEffect } from 'react'
import { CalendarDays, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { generateId } from '@utils/uuid'
import {
  usePersonas,
  usePersonaOntology,
  useAddEventToPersona,
  useUpdateEventInPersona,
  useDeleteEventFromPersona,
} from '@store/queries'
import { EventType, EventRole, GlossItem } from '@models/types'
import BaseTypeEditor from '@components/shared/BaseTypeEditor'

interface EventTypeEditorProps {
  open: boolean
  onClose: () => void
  event: EventType | null
  personaId: string | null
}

export default function EventTypeEditor({ open, onClose, event, personaId }: EventTypeEditorProps) {
  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const { data: ontology } = usePersonaOntology(personaId)
  const { mutateAsync: addEvent } = useAddEventToPersona()
  const { mutateAsync: updateEvent } = useUpdateEventInPersona()
  const { mutate: deleteEvent } = useDeleteEventFromPersona()

  // Form state
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [roles, setRoles] = useState<EventRole[]>([])
  const [examples, setExamples] = useState<string[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [mode, setMode] = useState<'manual' | 'copy' | 'wikidata'>('manual')
  const [sourcePersonaIdState, setSourcePersonaIdState] = useState('')

  // Fetch source persona's ontology when copying
  const { data: sourceOntology } = usePersonaOntology(sourcePersonaIdState || null)

  const setSourcePersonaId = (id: string) => {
    setSourcePersonaIdState(id)
  }
  const sourcePersonaId = sourcePersonaIdState
  const [sourceEventId, setSourceEventId] = useState('')
  const [targetPersonaIds, setTargetPersonaIds] = useState<string[]>([personaId || ''])
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedAt, setImportedAt] = useState<string>('')
  const [exampleInput, setExampleInput] = useState('')

  useEffect(() => {
    if (event) {
      setName(event.name)
      setGloss(event.gloss)
      setRoles(event.roles)
      setExamples(event.examples || [])
      setWikidataId(event.wikidataId || '')
      setWikidataUrl(event.wikidataUrl || '')
      setImportedAt(event.importedAt || '')
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setRoles([])
      setExamples([])
      setMode('manual')
      setSourcePersonaId('')
      setSourceEventId('')
      setWikidataId('')
      setWikidataUrl('')
      setImportedAt('')
    }
  }, [event])

  useEffect(() => {
    // When copying from another persona, populate the fields
    if (mode === 'copy' && sourcePersonaId && sourceEventId && sourceOntology) {
      const sourceEvent = sourceOntology.events.find(e => e.id === sourceEventId)
      if (sourceEvent) {
        setName(sourceEvent.name)
        setGloss(sourceEvent.gloss)
        setRoles(sourceEvent.roles)
        setExamples(sourceEvent.examples || [])
        setWikidataId(sourceEvent.wikidataId || '')
        setWikidataUrl(sourceEvent.wikidataUrl || '')
        setImportedAt(sourceEvent.importedAt || '')
      }
    }
  }, [mode, sourcePersonaId, sourceEventId, sourceOntology])

  const handleSave = async () => {
    if (!personaId) return

    const now = new Date().toISOString()

    if (event) {
      // Editing existing event type
      const eventData: EventType = {
        ...event,
        name,
        gloss,
        roles,
        examples,
        wikidataId: wikidataId || undefined,
        wikidataUrl: wikidataUrl || undefined,
        importedFrom: mode === 'wikidata' ? 'wikidata' : mode === 'copy' ? 'persona' : undefined,
        importedAt: wikidataId ? (importedAt || now) : undefined,
        updatedAt: now,
      }
      await updateEvent({ personaId, event: eventData })
    } else {
      // Creating new event types for selected personas
      // Generate a shared ID if creating for multiple personas
      const sharedTypeId = targetPersonaIds.length > 1 ? generateId() : undefined

      await Promise.all(targetPersonaIds.map(async (targetId) => {
        const newEventData: EventType = {
          id: generateId(),
          sharedTypeId,
          name,
          gloss,
          roles,
          examples,
          wikidataId: wikidataId || undefined,
          wikidataUrl: wikidataUrl || undefined,
          importedFrom: mode === 'wikidata' ? 'wikidata' : mode === 'copy' ? 'persona' : undefined,
          importedAt: wikidataId ? now : undefined,
          createdAt: now,
          updatedAt: now,
        }
        await addEvent({ personaId: targetId, event: newEventData })
      }))
    }

    onClose()
  }

  const handleDelete = () => {
    if (event && personaId) {
      deleteEvent({ personaId, eventId: event.id })
      onClose()
    }
  }

  const handleAddRole = () => {
    if (selectedRoleId && !roles.find(r => r.roleTypeId === selectedRoleId)) {
      setRoles([...roles, {
        roleTypeId: selectedRoleId,
        optional: false,
      }])
      setSelectedRoleId('')
    }
  }

  const handleRemoveRole = (roleTypeId: string) => {
    setRoles(roles.filter(r => r.roleTypeId !== roleTypeId))
  }

  const handleToggleOptional = (roleTypeId: string) => {
    setRoles(roles.map(r =>
      r.roleTypeId === roleTypeId
        ? { ...r, optional: !r.optional }
        : r
    ))
  }

  const handleAddExample = () => {
    if (exampleInput.trim()) {
      setExamples([...examples, exampleInput.trim()])
      setExampleInput('')
    }
  }

  const handleRemoveExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index))
  }

  // Additional fields for event types (roles management)
  const additionalFields = (
    <div>
      {/* Roles Management */}
      <p className="text-sm font-medium mb-2">Roles</p>
      <div className="flex gap-2 mb-4">
        <div className="flex-1">
          <Select
            value={selectedRoleId}
            onValueChange={(val) => val && setSelectedRoleId(val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Add Role">
                {selectedRoleId
                  ? ontology?.roles.find((role) => role.id === selectedRoleId)?.name ?? null
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ontology?.roles
                .filter(r => !roles.find(er => er.roleTypeId === r.id))
                .map(role => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="icon" onClick={handleAddRole} disabled={!selectedRoleId} aria-label="Add role">
          <Plus className="size-4" />
        </Button>
      </div>

      <ul className="space-y-1">
        {roles.map((eventRole) => {
          const role = ontology?.roles.find(r => r.id === eventRole.roleTypeId)
          if (!role) return null

          return (
            <li key={eventRole.roleTypeId} className="flex items-center justify-between py-1">
              <div>
                <span className="text-sm">{role.name}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Checkbox
                    checked={eventRole.optional}
                    onCheckedChange={() => handleToggleOptional(eventRole.roleTypeId)}
                  />
                  <Label className="text-xs text-muted-foreground">Optional</Label>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemoveRole(eventRole.roleTypeId)}
                aria-label={`Remove role ${role.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          )
        })}
      </ul>

      {/* Examples */}
      <p className="text-sm font-medium mb-2 mt-4">Examples</p>
      <div className="flex gap-2 mb-2">
        <Input
          placeholder="Add example..."
          value={exampleInput}
          onChange={(e) => setExampleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAddExample()
            }
          }}
          className="flex-1"
        />
        <Button variant="ghost" size="icon" onClick={handleAddExample} aria-label="Add example">
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex gap-1 flex-wrap">
        {examples.map((example, index) => (
          <Badge key={index} variant="secondary" className="gap-1">
            {example}
            <button onClick={() => handleRemoveExample(index)} className="ml-1 hover:text-destructive">
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  )

  // Source selector for copy mode
  const sourceSelector = mode === 'copy' && (
    <>
      <div className="mb-4">
        <Label className="mb-2">Source Persona</Label>
        <Select
          value={sourcePersonaId}
          onValueChange={(val) => {
            if (!val) return
            setSourcePersonaId(val)
            setSourceEventId('')
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select source persona">
              {sourcePersonaId
                ? personas.find((persona) => persona.id === sourcePersonaId)?.name ?? null
                : null}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {personas.filter(p => p.id !== personaId).map(persona => (
              <SelectItem key={persona.id} value={persona.id}>
                {persona.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sourcePersonaId && sourceOntology && (
        <div className="mb-4">
          <Label className="mb-2">Source Event Type</Label>
          <Select
            value={sourceEventId}
            onValueChange={(val) => val && setSourceEventId(val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select source event type">
                {sourceEventId
                  ? sourceOntology.events.find((event) => event.id === sourceEventId)?.name ?? null
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sourceOntology.events.map(event => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  )

  return (
    <BaseTypeEditor
      open={open}
      onClose={onClose}
      typeCategory="event"
      personaId={personaId}
      name={name}
      setName={setName}
      gloss={gloss}
      setGloss={setGloss}
      mode={mode}
      setMode={setMode}
      sourcePersonaId={sourcePersonaId}
      setSourcePersonaId={setSourcePersonaId}
      targetPersonaIds={targetPersonaIds}
      setTargetPersonaIds={setTargetPersonaIds}
      wikidataId={wikidataId}
      wikidataUrl={wikidataUrl}
      importedAt={importedAt}
      onSave={handleSave}
      onDelete={event ? handleDelete : undefined}
      title={event ? 'Edit Event Type' : 'Create Event Type'}
      icon={<CalendarDays className="size-5" />}
      additionalFields={additionalFields}
      sourceSelector={sourceSelector}
      isEditing={!!event}
      availablePersonas={personas}
    />
  )
}
