import { useState, useEffect } from 'react'
import { Users, Plus, X } from 'lucide-react'
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
  useAddRoleToPersona,
  useUpdateRoleInPersona,
  useDeleteRoleFromPersona,
} from '@store/queries'
import { RoleType, GlossItem } from '@models/types'
import BaseTypeEditor from '@components/shared/BaseTypeEditor'

interface RoleEditorProps {
  open: boolean
  onClose: () => void
  role: RoleType | null
  personaId: string | null
}

export default function RoleEditor({ open, onClose, role, personaId }: RoleEditorProps) {
  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const { mutateAsync: addRole } = useAddRoleToPersona()
  const { mutateAsync: updateRole } = useUpdateRoleInPersona()
  const { mutate: deleteRole } = useDeleteRoleFromPersona()

  // Form state
  const [name, setName] = useState('')
  const [gloss, setGloss] = useState<GlossItem[]>([{ type: 'text', content: '' }])
  const [allowedFillerTypes, setAllowedFillerTypes] = useState<('entity' | 'event')[]>(['entity'])
  const [examples, setExamples] = useState<string[]>([])
  const [mode, setMode] = useState<'manual' | 'copy' | 'wikidata'>('manual')
  const [sourcePersonaIdState, setSourcePersonaIdState] = useState('')

  // Fetch source persona's ontology when copying
  const { data: sourceOntology } = usePersonaOntology(sourcePersonaIdState || null)

  const setSourcePersonaId = (id: string) => {
    setSourcePersonaIdState(id)
  }
  const sourcePersonaId = sourcePersonaIdState
  const [sourceRoleId, setSourceRoleId] = useState('')
  const [targetPersonaIds, setTargetPersonaIds] = useState<string[]>([personaId || ''])
  const [wikidataId, setWikidataId] = useState<string>('')
  const [wikidataUrl, setWikidataUrl] = useState<string>('')
  const [importedAt, setImportedAt] = useState<string>('')
  const [exampleInput, setExampleInput] = useState('')

  useEffect(() => {
    if (role) {
      setName(role.name)
      setGloss(role.gloss)
      setAllowedFillerTypes(role.allowedFillerTypes)
      setExamples(role.examples || [])
      setWikidataId(role.wikidataId || '')
      setWikidataUrl(role.wikidataUrl || '')
      setImportedAt(role.importedAt || '')
    } else {
      setName('')
      setGloss([{ type: 'text', content: '' }])
      setAllowedFillerTypes(['entity'])
      setExamples([])
      setMode('manual')
      setSourcePersonaId('')
      setSourceRoleId('')
      setWikidataId('')
      setWikidataUrl('')
      setImportedAt('')
    }
  }, [role])

  useEffect(() => {
    // When copying from another persona, populate the fields
    if (mode === 'copy' && sourcePersonaId && sourceRoleId && sourceOntology) {
      const sourceRole = sourceOntology.roles.find(r => r.id === sourceRoleId)
      if (sourceRole) {
        setName(sourceRole.name)
        setGloss(sourceRole.gloss)
        setAllowedFillerTypes(sourceRole.allowedFillerTypes)
        setExamples(sourceRole.examples || [])
        setWikidataId(sourceRole.wikidataId || '')
        setWikidataUrl(sourceRole.wikidataUrl || '')
        setImportedAt(sourceRole.importedAt || '')
      }
    }
  }, [mode, sourcePersonaId, sourceRoleId, sourceOntology])

  const handleSave = async () => {
    if (!personaId) return

    const now = new Date().toISOString()

    if (role) {
      // Editing existing role type
      const roleData: RoleType = {
        ...role,
        name,
        gloss,
        allowedFillerTypes,
        examples,
        wikidataId: wikidataId || undefined,
        wikidataUrl: wikidataUrl || undefined,
        importedFrom: mode === 'wikidata' ? 'wikidata' : mode === 'copy' ? 'persona' : undefined,
        importedAt: wikidataId ? (importedAt || now) : undefined,
        updatedAt: now,
      }
      await updateRole({ personaId, role: roleData })
    } else {
      // Creating new role types for selected personas
      // Generate a shared ID if creating for multiple personas
      const sharedTypeId = targetPersonaIds.length > 1 ? generateId() : undefined

      await Promise.all(targetPersonaIds.map(async (targetId) => {
        const newRoleData: RoleType = {
          id: generateId(),
          sharedTypeId,
          name,
          gloss,
          allowedFillerTypes,
          examples,
          wikidataId: wikidataId || undefined,
          wikidataUrl: wikidataUrl || undefined,
          importedFrom: mode === 'wikidata' ? 'wikidata' : mode === 'copy' ? 'persona' : undefined,
          importedAt: wikidataId ? now : undefined,
          createdAt: now,
          updatedAt: now,
        }
        await addRole({ personaId: targetId, role: newRoleData })
      }))
    }

    onClose()
  }

  const handleDelete = () => {
    if (role && personaId) {
      deleteRole({ personaId, roleId: role.id })
      onClose()
    }
  }

  const handleToggleFillerType = (type: 'entity' | 'event') => {
    if (allowedFillerTypes.includes(type)) {
      setAllowedFillerTypes(allowedFillerTypes.filter(t => t !== type))
    } else {
      setAllowedFillerTypes([...allowedFillerTypes, type])
    }
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

  // Additional fields for role types
  const additionalFields = (
    <div>
      <p className="text-sm font-medium mb-2">Allowed Filler Types</p>
      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allowedFillerTypes.includes('entity')}
            onCheckedChange={() => handleToggleFillerType('entity')}
          />
          <Label>Entities</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allowedFillerTypes.includes('event')}
            onCheckedChange={() => handleToggleFillerType('event')}
          />
          <Label>Events</Label>
        </div>
      </div>

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
        <Button variant="ghost" size="icon" onClick={handleAddExample}>
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
            setSourceRoleId('')
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
          <Label className="mb-2">Source Role Type</Label>
          <Select
            value={sourceRoleId}
            onValueChange={(val) => val && setSourceRoleId(val)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select source role type">
                {sourceRoleId
                  ? sourceOntology.roles.find((role) => role.id === sourceRoleId)?.name ?? null
                  : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {sourceOntology.roles.map(role => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
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
      typeCategory="role"
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
      onDelete={role ? handleDelete : undefined}
      title={role ? 'Edit Role Type' : 'Create Role Type'}
      icon={<Users className="size-5" />}
      additionalFields={additionalFields}
      sourceSelector={sourceSelector}
      isEditing={!!role}
      availablePersonas={personas}
    />
  )
}
