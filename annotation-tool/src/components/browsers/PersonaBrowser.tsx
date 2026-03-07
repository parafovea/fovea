import { useState, useCallback } from 'react'
import { Pencil, User, Search, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip'
import { usePersonas, useDeletePersona, usePersonaDeletionPreview } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand'
import { Persona } from '@models/types'
import { ConfirmDialog } from '@components/shared/ConfirmDialog'

interface PersonaBrowserProps {
  onSelectPersona: (personaId: string) => void
  onEditPersona?: (persona: Persona) => void
  onAddPersona?: () => void
}

export default function PersonaBrowser({
  onSelectPersona,
  onEditPersona,
  onAddPersona
}: PersonaBrowserProps) {
  const { data: personas = [] } = usePersonas()
  const setSelectedPersonaId = useAnnotationUiStore((state) => state.setSelectedPersonaId)
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [personaToDelete, setPersonaToDelete] = useState<Persona | null>(null)

  const deletePersonaMutation = useDeletePersona()
  const { data: deletionPreview, isFetching: isLoadingPreview } = usePersonaDeletionPreview(
    personaToDelete?.id,
    deleteDialogOpen
  )

  // Filter out hidden personas (defense-in-depth, backend also filters)
  // and apply search term
  const filteredPersonas = personas
    .filter(persona => !persona.hidden)
    .filter(persona =>
      persona.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      persona.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      persona.informationNeed.toLowerCase().includes(searchTerm.toLowerCase())
    )

  const handlePersonaClick = (persona: Persona) => {
    setSelectedPersonaId(persona.id)
    onSelectPersona(persona.id)
  }

  const handleEditPersona = (persona: Persona, event: React.MouseEvent) => {
    event.stopPropagation()
    if (onEditPersona) {
      onEditPersona(persona)
    }
  }

  const handleDeleteClick = useCallback((persona: Persona, event: React.MouseEvent) => {
    event.stopPropagation()
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

  return (
    <div>
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search personas by name, role, or information need..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredPersonas.map((persona) => {
            return (
              <Card
                key={persona.id}
                data-persona-id={persona.id}
                className="flex h-full flex-col"
              >
                <CardContent className="flex-1">
                  <div className="mb-4 flex items-center">
                    <div className="mr-4 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <User className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-medium">{persona.name}</h3>
                      <p className="text-sm text-muted-foreground">{persona.role}</p>
                    </div>
                  </div>

                  <p className="mb-4 min-h-[2.5em] text-sm">
                    {persona.informationNeed.length > 100
                      ? persona.informationNeed.substring(0, 100) + '...'
                      : persona.informationNeed}
                  </p>

                  {persona.details && (
                    <p className="mt-2 text-xs italic text-muted-foreground">
                      {persona.details.length > 80
                        ? persona.details.substring(0, 80) + '...'
                        : persona.details}
                    </p>
                  )}
                </CardContent>

                <CardFooter>
                  <Button
                    size="sm"
                    onClick={() => handlePersonaClick(persona)}
                  >
                    <Pencil className="size-3" />
                    Open
                  </Button>
                  {onEditPersona && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleEditPersona(persona, e)}
                    >
                      Settings
                    </Button>
                  )}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="ml-auto text-destructive"
                          onClick={(e) => handleDeleteClick(persona, e)}
                        />
                      }
                    >
                      <Trash2 className="size-4" />
                    </TooltipTrigger>
                    <TooltipContent>Delete persona</TooltipContent>
                  </Tooltip>
                </CardFooter>
              </Card>
            )
          })}
      </div>

      {filteredPersonas.length === 0 && (
        <div className="flex h-[300px] flex-col items-center justify-center">
          <h3 className="text-lg font-medium text-muted-foreground">No personas found</h3>
          {searchTerm && (
            <p className="text-sm text-muted-foreground">Try adjusting your search query</p>
          )}
          {!searchTerm && (
            <p className="text-sm text-muted-foreground">Click the + button to create your first persona</p>
          )}
        </div>
      )}

      {onAddPersona && (
        <Button
          size="icon-lg"
          className="fixed bottom-6 right-6 rounded-full shadow-lg"
          aria-label="add persona"
          onClick={onAddPersona}
        >
          <Plus className="size-5" />
        </Button>
      )}

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
