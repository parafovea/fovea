import { useState, useCallback, useMemo } from 'react'
import { Copy, Trash2, Pencil, ChevronDown, UserPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import {
  usePersonas,
  usePersonaOntology,
  useCreatePersona,
  useUpdatePersona,
  useDeletePersona,
  useCopyPersona,
  usePersonaDeletionPreview,
} from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand'
import { Persona } from '@models/types'
import { ConfirmDialog } from '@components/shared/ConfirmDialog'
import { useUnsavedChangesPrompt } from '../../hooks/data'

export default function PersonaManager() {
  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const { mutate: createPersonaMutation } = useCreatePersona()
  const { mutate: updatePersonaMutation } = useUpdatePersona()
  const deletePersonaMutation = useDeletePersona()
  const { mutate: copyPersonaMutation } = useCopyPersona()

  // Zustand UI state
  const selectedPersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)
  const setSelectedPersonaId = useAnnotationUiStore((state) => state.setSelectedPersonaId)

  // Use selectedPersonaId as activePersonaId for backwards compatibility
  const activePersonaId = selectedPersonaId
  const activePersona = personas.find(p => p.id === activePersonaId)

  // Fetch ontology for active persona
  const { data: activeOntology } = usePersonaOntology(activePersonaId)

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [personaToDelete, setPersonaToDelete] = useState<Persona | null>(null)
  const emptyForm = useMemo(
    () => ({ name: '', role: '', informationNeed: '', details: '' }),
    []
  )
  const [formData, setFormData] = useState(emptyForm)

  // Fetch deletion preview when delete dialog is open
  const { data: deletionPreview, isFetching: isLoadingPreview } = usePersonaDeletionPreview(
    personaToDelete?.id,
    deleteDialogOpen
  )

  const isCreateDirty =
    createDialogOpen &&
    (formData.name.trim() !== '' ||
      formData.role.trim() !== '' ||
      formData.informationNeed.trim() !== '' ||
      formData.details.trim() !== '')

  const isEditDirty =
    editDialogOpen &&
    !!editingPersona &&
    (formData.name !== editingPersona.name ||
      formData.role !== editingPersona.role ||
      formData.informationNeed !== editingPersona.informationNeed ||
      formData.details !== editingPersona.details)

  const { confirmDiscard: confirmDiscardCreate } = useUnsavedChangesPrompt({
    isDirty: isCreateDirty,
  })
  const { confirmDiscard: confirmDiscardEdit } = useUnsavedChangesPrompt({
    isDirty: isEditDirty,
  })

  const handleCreateNew = () => {
    setFormData(emptyForm)
    setCreateDialogOpen(true)
  }

  const handleCancelCreate = () => {
    if (!confirmDiscardCreate()) return
    setCreateDialogOpen(false)
    setFormData(emptyForm)
  }

  const handleSaveNewPersona = () => {
    if (!formData.name.trim()) return
    createPersonaMutation(
      {
        persona: {
          name: formData.name,
          role: formData.role,
          informationNeed: formData.informationNeed,
          details: formData.details,
        },
        ontology: {
          entities: [],
          roles: [],
          events: [],
          relationTypes: [],
          relations: [],
        },
      },
      {
        onSuccess: () => {
          setCreateDialogOpen(false)
          setFormData(emptyForm)
        },
      }
    )
  }

  const handleEditPersona = (persona: Persona) => {
    setEditingPersona(persona)
    setFormData({
      name: persona.name,
      role: persona.role,
      informationNeed: persona.informationNeed,
      details: persona.details,
    })
    setEditDialogOpen(true)
  }

  const handleCancelEdit = () => {
    if (!confirmDiscardEdit()) return
    setEditDialogOpen(false)
    setEditingPersona(null)
  }

  const handleSaveEdit = () => {
    if (!editingPersona || !formData.name.trim()) return
    const updatedPersona: Persona = {
      ...editingPersona,
      name: formData.name,
      role: formData.role,
      informationNeed: formData.informationNeed,
      details: formData.details,
      updatedAt: new Date().toISOString(),
    }
    updatePersonaMutation(updatedPersona, {
      onSuccess: () => {
        setEditDialogOpen(false)
        setEditingPersona(null)
      },
    })
  }

  const handleCopyPersona = (sourcePersonaId: string) => {
    const sourcePersona = personas.find(p => p.id === sourcePersonaId)
    if (sourcePersona) {
      copyPersonaMutation({
        sourcePersonaId,
        newPersonaData: {
          name: `${sourcePersona.name} (Copy)`,
          role: sourcePersona.role,
          informationNeed: sourcePersona.informationNeed,
          details: sourcePersona.details,
        },
      })
    }
  }

  const handleDeleteClick = useCallback((persona: Persona) => {
    setPersonaToDelete(persona)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (personaToDelete) {
      await deletePersonaMutation.mutateAsync(personaToDelete.id)
      setDeleteDialogOpen(false)
      setPersonaToDelete(null)
    }
  }, [personaToDelete, deletePersonaMutation])

  const handleDeleteCancel = useCallback(() => {
    setDeleteDialogOpen(false)
    setPersonaToDelete(null)
  }, [])

  // Build confirmation message with affected items count
  const getDeleteMessage = () => {
    if (!personaToDelete) return ''

    const parts = [`Are you sure you want to delete the persona "${personaToDelete.name}"?`]

    if (deletionPreview) {
      const affectedItems: string[] = []
      if (deletionPreview.typeCount > 0) {
        affectedItems.push(`${deletionPreview.typeCount} ontology type${deletionPreview.typeCount !== 1 ? 's' : ''}`)
      }
      if (deletionPreview.annotationCount > 0) {
        affectedItems.push(`${deletionPreview.annotationCount} annotation${deletionPreview.annotationCount !== 1 ? 's' : ''}`)
      }
      if (deletionPreview.summaryCount > 0) {
        affectedItems.push(`${deletionPreview.summaryCount} video summar${deletionPreview.summaryCount !== 1 ? 'ies' : 'y'}`)
      }
      if (deletionPreview.worldAssignmentCount > 0) {
        affectedItems.push(`${deletionPreview.worldAssignmentCount} world object assignment${deletionPreview.worldAssignmentCount !== 1 ? 's' : ''}`)
      }

      if (affectedItems.length > 0) {
        parts.push(`\n\nThis will also delete: ${affectedItems.join(', ')}.`)
      }
    }

    parts.push('\n\nThis action cannot be undone.')
    return parts.join('')
  }

  // Get ontology stats for active persona from activeOntology
  const getOntologyStats = (personaId: string) => {
    // For active persona, use the loaded ontology
    if (personaId === activePersonaId && activeOntology) {
      return {
        entities: activeOntology.entities.length,
        roles: activeOntology.roles.length,
        events: activeOntology.events.length,
        relations: activeOntology.relations.length,
      }
    }
    // For other personas, return zeros (will be loaded on demand)
    return { entities: 0, roles: 0, events: 0, relations: 0 }
  }

  return (
    <div className="mb-6">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active Persona</h2>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" disabled={personas.length === 0} />
                }
              >
                {activePersona?.name || 'Select Persona'}
                <ChevronDown className="ml-1 size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[250px]">
                {personas.map((persona) => (
                  <DropdownMenuItem
                    key={persona.id}
                    onClick={() => setSelectedPersonaId(persona.id)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex flex-col">
                      <span className={persona.id === activePersonaId ? 'font-medium' : ''}>
                        {persona.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {persona.role} &middot; {getOntologyStats(persona.id).entities} entities, {getOntologyStats(persona.id).events} events
                      </span>
                    </div>
                    <div
                      className="ml-4 flex gap-1"
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="copy persona"
                              onClick={() => {
                                handleCopyPersona(persona.id)
                              }}
                            />
                          }
                        >
                          <Copy className="size-3" />
                        </TooltipTrigger>
                        <TooltipContent>Copy persona</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="delete persona"
                              onClick={() => {
                                handleDeleteClick(persona)
                              }}
                            />
                          }
                        >
                          <Trash2 className="size-3" />
                        </TooltipTrigger>
                        <TooltipContent>Delete persona</TooltipContent>
                      </Tooltip>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCreateNew}>
                  <UserPlus className="mr-2 size-4" />
                  Create New Persona
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" aria-label="add persona" onClick={handleCreateNew}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        {activePersona && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">Role:</span>
              <span className="text-sm">{activePersona.role}</span>
              <Button variant="ghost" size="icon-xs" onClick={() => handleEditPersona(activePersona)}>
                <Pencil className="size-3" />
              </Button>
            </div>
            <div className="mb-2">
              <span className="text-sm font-medium text-muted-foreground">Information Need:</span>
              <p className="text-sm">{activePersona.informationNeed}</p>
            </div>
            <div className="mt-4 flex gap-2">
              {(() => {
                const stats = getOntologyStats(activePersona.id)
                return (
                  <>
                    <Badge>{stats.entities} Entities</Badge>
                    <Badge variant="secondary">{stats.roles} Roles</Badge>
                    <Badge variant="outline">{stats.events} Events</Badge>
                    <Badge variant="secondary">{stats.relations} Relations</Badge>
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) handleCancelCreate() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Persona</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label>Persona Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">e.g., 'Tactically-Oriented Analyst', 'Strategic Planner', 'Field Operator'</p>
            </div>
            <div className="space-y-2">
              <Label>Information Need</Label>
              <Textarea
                value={formData.informationNeed}
                onChange={(e) => setFormData({ ...formData, informationNeed: e.target.value })}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">What specific information does this persona need to extract?</p>
            </div>
            <div className="space-y-2">
              <Label>Additional Details</Label>
              <Textarea
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Background, constraints, or other relevant information</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelCreate}>Cancel</Button>
            <Button
              onClick={handleSaveNewPersona}
              disabled={!formData.name.trim()}
            >
              Create Persona
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) handleCancelEdit() }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Persona</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label>Persona Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Information Need</Label>
              <Textarea
                value={formData.informationNeed}
                onChange={(e) => setFormData({ ...formData, informationNeed: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Additional Details</Label>
              <Textarea
                value={formData.details}
                onChange={(e) => setFormData({ ...formData, details: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>Cancel</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!formData.name.trim() || !isEditDirty}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteDialogOpen}
        title="Delete Persona"
        message={getDeleteMessage()}
        confirmText="Delete"
        confirmVariant="destructive"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        loading={deletePersonaMutation.isPending || isLoadingPreview}
      />
    </div>
  )
}
