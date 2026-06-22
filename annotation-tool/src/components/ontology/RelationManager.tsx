import React, { useState } from 'react'
import { Trash2, Plus, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
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
import { generateId } from '@utils/uuid'
import { usePersonaOntology, useAddRelationToPersona, useDeleteRelationFromPersona } from '@store/queries'
import { OntologyRelation } from '@models/types'

interface RelationManagerProps {
  open: boolean
  onClose: () => void
  personaId: string | null
}

export default function RelationManager({ open, onClose, personaId }: RelationManagerProps) {
  // TanStack Query hooks
  const { data: ontology } = usePersonaOntology(personaId)
  const { mutate: addRelationMutation } = useAddRelationToPersona()
  const { mutate: deleteRelationMutation } = useDeleteRelationFromPersona()

  const [relationTypeId, setRelationTypeId] = useState<string>('')
  const [sourceType, setSourceType] = useState<'entity' | 'role' | 'event' | 'time' | 'claim'>('entity')
  const [sourceId, setSourceId] = useState<string>('')
  const [targetType, setTargetType] = useState<'entity' | 'role' | 'event' | 'time' | 'claim'>('entity')
  const [targetId, setTargetId] = useState<string>('')

  if (!ontology) return null

  const selectedRelationType = ontology.relationTypes.find(rt => rt.id === relationTypeId)

  const getSourceOptions = () => {
    switch (sourceType) {
      case 'entity':
        return ontology.entities
      case 'role':
        return ontology.roles
      case 'event':
        return ontology.events
      case 'claim':
        // Claims are not in ontology, they're in video summaries
        // Claim relations should be created from ClaimsViewer, not here
        return []
      default:
        return []
    }
  }

  const getTargetOptions = () => {
    switch (targetType) {
      case 'entity':
        return ontology.entities
      case 'role':
        return ontology.roles
      case 'event':
        return ontology.events
      case 'claim':
        // Claims are not in ontology, they're in video summaries
        // Claim relations should be created from ClaimsViewer, not here
        return []
      default:
        return []
    }
  }

  const handleAddRelation = () => {
    if (!personaId || !relationTypeId || !sourceId || !targetId) return

    const newRelation: OntologyRelation = {
      id: generateId(),
      relationTypeId,
      sourceType,
      sourceId,
      targetType,
      targetId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    addRelationMutation({ personaId, relation: newRelation })

    // Reset form
    setSourceId('')
    setTargetId('')
  }

  const handleDeleteRelation = (relationId: string) => {
    if (!personaId) return
    if (window.confirm('Delete this relation?')) {
      deleteRelationMutation({ personaId, relationId })
    }
  }

  const getItemName = (type: 'entity' | 'role' | 'event' | 'time' | 'claim', itemId: string) => {
    switch (type) {
      case 'entity':
        return ontology.entities.find(e => e.id === itemId)?.name || 'Unknown'
      case 'role':
        return ontology.roles.find(r => r.id === itemId)?.name || 'Unknown'
      case 'event':
        return ontology.events.find(e => e.id === itemId)?.name || 'Unknown'
      case 'time':
        // Time relations not yet implemented in UI
        return 'Time (ID: ' + itemId + ')'
      case 'claim':
        // Claims are in summaries, not ontology
        // Show truncated ID; actual claim relations created in ClaimsViewer
        return 'Claim (ID: ' + itemId.substring(0, 8) + '...)'
      default:
        return 'Unknown'
    }
  }

  const filteredRelations = relationTypeId
    ? ontology.relations.filter(r => r.relationTypeId === relationTypeId)
    : ontology.relations

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Manage Relations</DialogTitle>
        </DialogHeader>

        {ontology.relationTypes.length === 0 ? (
          <Alert>
            <AlertDescription>
              No relation types defined yet. Create relation types first to establish relationships between ontology elements.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Create New Relation
              </h3>

              <div className="flex flex-col gap-4">
                <div>
                  <Label className="mb-2">Relation Type</Label>
                  <Select
                    value={relationTypeId}
                    onValueChange={(val) => {
                      if (!val) return
                      setRelationTypeId(val)
                      const rt = ontology.relationTypes.find(r => r.id === val)
                      if (rt) {
                        setSourceType(rt.sourceTypes[0] || 'entity')
                        setTargetType(rt.targetTypes[0] || 'entity')
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select relation type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ontology.relationTypes.map(rt => (
                        <SelectItem key={rt.id} value={rt.id}>
                          <div>
                            <span>{rt.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {rt.sourceTypes.join('/')} -&gt; {rt.targetTypes.join('/')}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRelationType && (
                  <>
                    <div className="flex gap-2 items-center">
                      {selectedRelationType.sourceTypes.length > 1 && (
                        <div>
                          <Label className="mb-2">Source Type</Label>
                          <Select
                            value={sourceType}
                            onValueChange={(val) => {
                              setSourceType(val as 'entity' | 'role' | 'event')
                              setSourceId('')
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedRelationType.sourceTypes.map(type => (
                                <SelectItem key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="flex-1">
                        <Label className="mb-2">Source</Label>
                        <Select
                          value={sourceId}
                          onValueChange={(val) => val && setSourceId(val)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select source">
                              {sourceId
                                ? getSourceOptions().find((item) => item.id === sourceId)?.name ?? null
                                : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {getSourceOptions().map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      <ArrowRight className="size-5 text-muted-foreground" />
                    </div>

                    <div className="flex gap-2 items-center">
                      {selectedRelationType.targetTypes.length > 1 && (
                        <div>
                          <Label className="mb-2">Target Type</Label>
                          <Select
                            value={targetType}
                            onValueChange={(val) => {
                              setTargetType(val as 'entity' | 'role' | 'event')
                              setTargetId('')
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {selectedRelationType.targetTypes.map(type => (
                                <SelectItem key={type} value={type}>
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="flex-1">
                        <Label className="mb-2">Target</Label>
                        <Select
                          value={targetId}
                          onValueChange={(val) => val && setTargetId(val)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select target">
                              {targetId
                                ? getTargetOptions().find((item) => item.id === targetId)?.name ?? null
                                : null}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {getTargetOptions().map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button
                      onClick={handleAddRelation}
                      disabled={!sourceId || !targetId}
                    >
                      <Plus className="size-4 mr-2" />
                      Add Relation
                    </Button>

                    {selectedRelationType.symmetric && (
                      <Alert className="mt-2">
                        <AlertDescription>
                          This is a symmetric relation: if A relates to B, then B also relates to A
                        </AlertDescription>
                      </Alert>
                    )}
                    {selectedRelationType.transitive && (
                      <Alert className="mt-2">
                        <AlertDescription>
                          This is a transitive relation: if A-&gt;B and B-&gt;C, then A-&gt;C is implied
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">
                Existing Relations ({filteredRelations.length})
              </h3>

              <div className="max-h-96 overflow-auto">
                {filteredRelations.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">
                    No relations defined yet
                  </p>
                ) : (
                  <ul>
                    {filteredRelations.map(relation => {
                      const relationType = ontology.relationTypes.find(rt => rt.id === relation.relationTypeId)
                      return (
                        <React.Fragment key={relation.id}>
                          <li className="flex items-center justify-between py-3 px-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge>{getItemName(relation.sourceType, relation.sourceId)}</Badge>
                                <span className="text-sm text-muted-foreground">
                                  {relationType?.name || 'unknown'}
                                </span>
                                <ArrowRight className="size-4 text-muted-foreground" />
                                <Badge variant="secondary">{getItemName(relation.targetType, relation.targetId)}</Badge>
                              </div>
                              <div className="flex gap-1 mt-1">
                                <Badge variant="outline">{relation.sourceType}</Badge>
                                <Badge variant="outline">{relation.targetType}</Badge>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDeleteRelation(relation.id)}
                              aria-label={`Delete relation from ${getItemName(relation.sourceType, relation.sourceId)} to ${getItemName(relation.targetType, relation.targetId)}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </li>
                          <Separator />
                        </React.Fragment>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
