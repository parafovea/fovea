import { useState, useEffect } from 'react'
import { Trash2, Plus, ArrowRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import {
  usePersonas,
  usePersonaOntology,
  useAddRelationTypeToPersona,
  useUpdateRelationTypeInPersona,
  useAddRelationToPersona,
  useDeleteRelationFromPersona,
} from '@store/queries'
import { RelationType, GlossItem, OntologyRelation } from '@models/types'
import GlossEditor from './GlossEditor'

interface RelationTypeEditorProps {
  open: boolean
  onClose: () => void
  relationType: RelationType | null
  personaId: string | null
}

export default function RelationTypeEditor({
  open,
  onClose,
  relationType,
  personaId,
}: RelationTypeEditorProps) {
  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const { data: ontology } = usePersonaOntology(personaId)
  const { mutateAsync: addRelationTypeMutation } = useAddRelationTypeToPersona()
  const { mutateAsync: updateRelationTypeMutation } = useUpdateRelationTypeInPersona()
  const { mutate: addRelationMutation } = useAddRelationToPersona()
  const { mutate: deleteRelationMutation } = useDeleteRelationFromPersona()

  const [tabValue, setTabValue] = useState('definition')
  const [targetPersonaIds, setTargetPersonaIds] = useState<string[]>([personaId || ''])
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([])
  const [sourceTypes, setSourceTypes] = useState<('entity' | 'role' | 'event' | 'time' | 'claim')[]>([])
  const [targetTypes, setTargetTypes] = useState<('entity' | 'role' | 'event' | 'time' | 'claim')[]>([])
  const [symmetric, setSymmetric] = useState(false)
  const [transitive, setTransitive] = useState(false)
  const [examples, setExamples] = useState<string[]>([])
  const [exampleInput, setExampleInput] = useState('')

  // For creating relation instances
  const [sourceType, setSourceType] = useState<'entity' | 'role' | 'event' | 'claim'>('entity')
  const [sourceId, setSourceId] = useState<string>('')
  const [targetType, setTargetType] = useState<'entity' | 'role' | 'event' | 'claim'>('entity')
  const [targetId, setTargetId] = useState<string>('')

  useEffect(() => {
    if (relationType) {
      setName(relationType.name)
      setGloss(relationType.gloss)
      setSourceTypes(relationType.sourceTypes)
      setTargetTypes(relationType.targetTypes)
      setSymmetric(relationType.symmetric || false)
      setTransitive(relationType.transitive || false)
      setExamples(relationType.examples || [])
      setTabValue('definition') // Start on definition tab when editing
      // When editing, always use the current persona only
      setTargetPersonaIds([personaId || ''])
    } else {
      setName('')
      setGloss([])
      setSourceTypes(['entity'])
      setTargetTypes(['entity'])
      setSymmetric(false)
      setTransitive(false)
      setExamples([])
      setTabValue('definition')
      setTargetPersonaIds([personaId || ''])
    }
    setExampleInput('')
    setSourceId('')
    setTargetId('')
    // targetPersonaIds is intentionally NOT a dependency: re-running this
    // effect when the user toggles a target-persona checkbox wipes their
    // in-progress name / gloss / source / target / examples.
  }, [relationType, personaId])

  const handleSave = async () => {
    if (!personaId) return

    // Validate required fields
    if (!name.trim() || !gloss.some(g => g.content.trim())) return
    if (sourceTypes.length === 0 || targetTypes.length === 0) return

    const now = new Date().toISOString()

    if (relationType) {
      // Editing existing relation type
      const relationTypeData: RelationType = {
        ...relationType,
        name,
        gloss,
        sourceTypes,
        targetTypes,
        symmetric,
        transitive,
        examples,
        updatedAt: now,
      }
      await updateRelationTypeMutation({ personaId, relationType: relationTypeData })
    } else {
      // Creating new relation types for selected personas
      // Generate a shared ID if creating for multiple personas
      const sharedTypeId = targetPersonaIds.length > 1 ? generateId() : undefined

      await Promise.all(targetPersonaIds.map(async (targetId) => {
        const relationTypeData: RelationType = {
          id: generateId(),
          sharedTypeId,
          name,
          gloss,
          sourceTypes,
          targetTypes,
          symmetric,
          transitive,
          examples,
          createdAt: now,
          updatedAt: now,
        }
        await addRelationTypeMutation({ personaId: targetId, relationType: relationTypeData })
      }))
    }

    onClose()
  }

  const getSourceOptions = () => {
    if (!ontology) return []
    switch (sourceType) {
      case 'entity':
        return ontology.entities
      case 'role':
        return ontology.roles
      case 'event':
        return ontology.events
      default:
        return []
    }
  }

  const getTargetOptions = () => {
    if (!ontology) return []
    switch (targetType) {
      case 'entity':
        return ontology.entities
      case 'role':
        return ontology.roles
      case 'event':
        return ontology.events
      default:
        return []
    }
  }

  const handleAddRelationInstance = () => {
    if (!personaId || !relationType || !sourceId || !targetId) return

    const newRelation: OntologyRelation = {
      id: generateId(),
      relationTypeId: relationType.id,
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

  const handleDeleteRelationInstance = (relationId: string) => {
    if (!personaId) return
    deleteRelationMutation({ personaId, relationId })
  }

  const getItemName = (type: 'entity' | 'role' | 'event' | 'time' | 'claim', id: string) => {
    if (!ontology) return 'Unknown'
    switch (type) {
      case 'entity':
        return ontology.entities.find(e => e.id === id)?.name || 'Unknown'
      case 'role':
        return ontology.roles.find(r => r.id === id)?.name || 'Unknown'
      case 'event':
        return ontology.events.find(e => e.id === id)?.name || 'Unknown'
      case 'time':
        // Time relations not yet implemented in UI
        return 'Time (ID: ' + id + ')'
      case 'claim':
        // Claims are not in ontology, they're in summaries
        // For now just show ID; in practice, relation instances for claims
        // would be created in the ClaimsViewer, not here
        return 'Claim (ID: ' + id.substring(0, 8) + '...)'
      default:
        return 'Unknown'
    }
  }

  // Get existing relation instances for this type
  const relationInstances = relationType
    ? (ontology?.relations.filter(r => r.relationTypeId === relationType.id) || [])
    : []

  const toggleSourceType = (type: 'entity' | 'role' | 'event' | 'claim') => {
    if (sourceTypes.includes(type)) {
      setSourceTypes(sourceTypes.filter(t => t !== type))
    } else {
      setSourceTypes([...sourceTypes, type])
    }
  }

  const toggleTargetType = (type: 'entity' | 'role' | 'event' | 'claim') => {
    if (targetTypes.includes(type)) {
      setTargetTypes(targetTypes.filter(t => t !== type))
    } else {
      setTargetTypes([...targetTypes, type])
    }
  }

  const addExample = () => {
    if (exampleInput.trim()) {
      setExamples([...examples, exampleInput.trim()])
      setExampleInput('')
    }
  }

  const removeExample = (index: number) => {
    setExamples(examples.filter((_, i) => i !== index))
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent data-tour-id="relation-type-editor" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {relationType ? 'Edit Relation Type' : 'Create Relation Type'}
          </DialogTitle>
        </DialogHeader>

        {relationType ? (
          <Tabs value={tabValue} onValueChange={setTabValue}>
            <TabsList>
              <TabsTrigger value="definition">Definition</TabsTrigger>
              <TabsTrigger value="instances">Instances ({relationInstances.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="definition">
              <div className="flex flex-col gap-4 mt-4">
                {renderDefinitionFields()}
              </div>
            </TabsContent>

            <TabsContent value="instances">
              {renderInstancesTab()}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex flex-col gap-4 mt-4">
            {renderDefinitionFields()}
          </div>
        )}

        {/* Persona selection for new relation types */}
        {!relationType && personas.length > 1 && (
          <div className="mt-4">
            <Separator className="mb-4" />
            <p className="text-sm font-medium mb-2">
              Add to Personas
            </p>
            <div className="space-y-2">
              {personas.map(persona => {
                const cbId = `relation-target-persona-${persona.id}`
                return (
                  <div key={persona.id} className="flex items-center gap-2">
                    <Checkbox
                      id={cbId}
                      checked={targetPersonaIds.includes(persona.id)}
                      onCheckedChange={() => {
                        setTargetPersonaIds(
                          targetPersonaIds.includes(persona.id)
                            ? targetPersonaIds.filter(id => id !== persona.id)
                            : [...targetPersonaIds, persona.id]
                        )
                      }}
                    />
                    <Label htmlFor={cbId}>{persona.name}</Label>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !gloss.some(g => g.content.trim()) || sourceTypes.length === 0 || targetTypes.length === 0}
          >
            {relationType ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  function renderDefinitionFields() {
    return (
      <>
        <div>
          <Label className="mb-2" htmlFor="relation-type-name">Relation Type Name</Label>
          <Input
            id="relation-type-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g., 'subtype-of', 'part-of', 'causes', 'located-at'"
          />
          <p className="text-xs text-muted-foreground mt-1">
            e.g., 'subtype-of', 'part-of', 'causes', 'located-at'
          </p>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">
            Source Types (can be)
          </p>
          <div className="flex gap-2">
            {(['entity', 'role', 'event', 'claim'] as const).map(type => (
              <Badge
                key={type}
                variant={sourceTypes.includes(type) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleSourceType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">
            Target Types (can be)
          </p>
          <div className="flex gap-2">
            {(['entity', 'role', 'event', 'claim'] as const).map(type => (
              <Badge
                key={type}
                variant={targetTypes.includes(type) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => toggleTargetType(type)}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Badge>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={symmetric}
              onCheckedChange={(checked) => setSymmetric(checked === true)}
            />
            <Label>Symmetric (if A relates to B, then B relates to A)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={transitive}
              onCheckedChange={(checked) => setTransitive(checked === true)}
            />
            <Label>Transitive (if A-&gt;B and B-&gt;C, then A-&gt;C)</Label>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">
            Gloss (Definition)
          </p>
          <GlossEditor
            gloss={gloss}
            onChange={setGloss}
            availableTypes={['entity', 'role', 'event', 'relation']}
            personaId={personaId}
          />
        </div>

        <div>
          <p className="text-sm font-medium mb-2">
            Examples
          </p>
          <div className="flex gap-2 mb-2">
            <Input
              value={exampleInput}
              onChange={(e) => setExampleInput(e.target.value)}
              placeholder="Enter an example usage"
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addExample()
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={addExample}>
              Add
            </Button>
          </div>
          <div className="flex gap-1 flex-wrap">
            {examples.map((example, index) => (
              <Badge key={index} variant="secondary" className="gap-1">
                {example}
                <button onClick={() => removeExample(index)} className="ml-1 hover:text-destructive">
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </>
    )
  }

  function renderInstancesTab() {
    if (!relationType) return null

    return (
      <div className="mt-4">
        <Alert className="mb-4">
          <AlertDescription>
            Create instances of the "{relationType.name}" relation between specific items in your ontology.
          </AlertDescription>
        </Alert>

        <div className="flex gap-2 mb-4 items-end flex-wrap">
          <div className="min-w-28">
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
                {relationType.sourceTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <ArrowRight className="size-5 text-muted-foreground mb-2" />

          <div className="min-w-28">
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
                {relationType.targetTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <Button
            variant="ghost"
            size="icon"
            onClick={handleAddRelationInstance}
            disabled={!sourceId || !targetId}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <Separator className="my-4" />

        <p className="text-sm font-medium mb-2">
          Existing Instances
        </p>

        {relationInstances.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No instances of this relation type yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {relationInstances.map(relation => (
              <li key={relation.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{relation.sourceType}</Badge>
                  <span className="text-sm">
                    {getItemName(relation.sourceType, relation.sourceId)}
                  </span>
                  <ArrowRight className="size-4" />
                  <span className="text-sm">
                    {getItemName(relation.targetType, relation.targetId)}
                  </span>
                  <Badge variant="outline">{relation.targetType}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDeleteRelationInstance(relation.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
}
