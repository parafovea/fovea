import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { usePersonas, usePersonaOntology, useImportFromPersona } from '@store/queries'
import { glossToText } from '@/utils/glossUtils'
import { ImportRequest } from '@models/types'

interface ImportDialogProps {
  open: boolean
  onClose: () => void
  targetPersonaId: string | null
}

export default function ImportDialog({ open, onClose, targetPersonaId }: ImportDialogProps) {
  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const { mutate: importFromPersonaMutation } = useImportFromPersona()

  const [sourcePersonaId, setSourcePersonaId] = useState<string>('')
  const [activeTab, setActiveTab] = useState('entities')
  const [selectedEntities, setSelectedEntities] = useState<string[]>([])
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<string[]>([])
  const [includeRelations, setIncludeRelations] = useState(false)

  // Fetch source persona's ontology
  const { data: sourceOntology } = usePersonaOntology(sourcePersonaId || null)
  const targetPersona = personas.find(p => p.id === targetPersonaId)

  const handleImport = () => {
    if (!targetPersonaId || !sourcePersonaId) return

    const importRequest: ImportRequest = {
      fromPersonaId: sourcePersonaId,
      toPersonaId: targetPersonaId,
      entityIds: selectedEntities,
      roleIds: selectedRoles,
      eventIds: selectedEvents,
      relationTypeIds: selectedRelationTypes,
      includeRelations,
    }

    importFromPersonaMutation(importRequest)
    onClose()
    resetSelections()
  }

  const resetSelections = () => {
    setSelectedEntities([])
    setSelectedRoles([])
    setSelectedEvents([])
    setSelectedRelationTypes([])
    setIncludeRelations(false)
    setActiveTab('entities')
  }

  const toggleEntity = (entityId: string) => {
    setSelectedEntities(prev =>
      prev.includes(entityId)
        ? prev.filter(id => id !== entityId)
        : [...prev, entityId]
    )
  }

  const toggleRole = (roleId: string) => {
    setSelectedRoles(prev =>
      prev.includes(roleId)
        ? prev.filter(id => id !== roleId)
        : [...prev, roleId]
    )
  }

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    )
  }

  const toggleRelationType = (relationTypeId: string) => {
    setSelectedRelationTypes(prev =>
      prev.includes(relationTypeId)
        ? prev.filter(id => id !== relationTypeId)
        : [...prev, relationTypeId]
    )
  }

  const selectAllInTab = () => {
    if (!sourceOntology) return

    switch (activeTab) {
      case 'entities':
        setSelectedEntities(sourceOntology.entities.map(e => e.id))
        break
      case 'roles':
        setSelectedRoles(sourceOntology.roles.map(r => r.id))
        break
      case 'events':
        setSelectedEvents(sourceOntology.events.map(e => e.id))
        break
      case 'relations':
        setSelectedRelationTypes(sourceOntology.relationTypes.map(r => r.id))
        break
    }
  }

  const deselectAllInTab = () => {
    switch (activeTab) {
      case 'entities':
        setSelectedEntities([])
        break
      case 'roles':
        setSelectedRoles([])
        break
      case 'events':
        setSelectedEvents([])
        break
      case 'relations':
        setSelectedRelationTypes([])
        break
    }
  }

  const totalSelected = selectedEntities.length + selectedRoles.length +
                        selectedEvents.length + selectedRelationTypes.length

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
      <DialogContent data-tour-id="import-dialog" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import from Another Persona</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Alert>
            <AlertDescription>
              Importing will copy selected items to {targetPersona?.name}. The original items will remain unchanged.
            </AlertDescription>
          </Alert>

          <div>
            <Label className="mb-2">Source Persona</Label>
            <Select value={sourcePersonaId} onValueChange={(val) => { if (val !== null) setSourcePersonaId(val) }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a persona" />
              </SelectTrigger>
              <SelectContent>
                {personas
                  .filter(p => p.id !== targetPersonaId)
                  .map(persona => (
                    <SelectItem key={persona.id} value={persona.id}>
                      <div>
                        <span>{persona.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {persona.role}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {sourceOntology && (
            <>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                  <TabsTrigger value="entities">
                    Entities ({sourceOntology.entities.length})
                  </TabsTrigger>
                  <TabsTrigger value="roles">
                    Roles ({sourceOntology.roles.length})
                  </TabsTrigger>
                  <TabsTrigger value="events">
                    Events ({sourceOntology.events.length})
                  </TabsTrigger>
                  <TabsTrigger value="relations">
                    Relations ({sourceOntology.relationTypes.length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex items-center justify-between py-2">
                  <Badge>
                    {totalSelected} items selected
                  </Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={selectAllInTab}>Select All</Button>
                    <Button size="sm" variant="ghost" onClick={deselectAllInTab}>Deselect All</Button>
                  </div>
                </div>

                <div className="max-h-[300px] overflow-auto">
                  <TabsContent value="entities">
                    <ul className="space-y-1">
                      {sourceOntology.entities.map(entity => (
                        <li key={entity.id}>
                          <label
                            className="flex items-center gap-3 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
                            onClick={() => toggleEntity(entity.id)}
                          >
                            <Checkbox
                              checked={selectedEntities.includes(entity.id)}
                              tabIndex={-1}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{entity.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {glossToText(entity.gloss, sourceOntology ?? undefined).substring(0, 100)}
                              </p>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </TabsContent>

                  <TabsContent value="roles">
                    <ul className="space-y-1">
                      {sourceOntology.roles.map(role => (
                        <li key={role.id}>
                          <label
                            className="flex items-center gap-3 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
                            onClick={() => toggleRole(role.id)}
                          >
                            <Checkbox
                              checked={selectedRoles.includes(role.id)}
                              tabIndex={-1}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{role.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Allows: {role.allowedFillerTypes.join(', ')}
                              </p>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </TabsContent>

                  <TabsContent value="events">
                    <ul className="space-y-1">
                      {sourceOntology.events.map(event => (
                        <li key={event.id}>
                          <label
                            className="flex items-center gap-3 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
                            onClick={() => toggleEvent(event.id)}
                          >
                            <Checkbox
                              checked={selectedEvents.includes(event.id)}
                              tabIndex={-1}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{event.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {event.roles.length} roles
                              </p>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </TabsContent>

                  <TabsContent value="relations">
                    <ul className="space-y-1">
                      {sourceOntology.relationTypes.map(relationType => (
                        <li key={relationType.id}>
                          <label
                            className="flex items-center gap-3 rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent"
                            onClick={() => toggleRelationType(relationType.id)}
                          >
                            <Checkbox
                              checked={selectedRelationTypes.includes(relationType.id)}
                              tabIndex={-1}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{relationType.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {relationType.sourceTypes.join('/')} &rarr; {relationType.targetTypes.join('/')}
                              </p>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </TabsContent>
                </div>
              </Tabs>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={totalSelected === 0}
          >
            Import {totalSelected} Item{totalSelected !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
