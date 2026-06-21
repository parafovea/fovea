import { useState, useEffect } from 'react'
import { Trash2, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCreatePersona, useUpdatePersona } from '@store/queries'
import { useMyProjects } from '@store/queries/useProjects'
import { useMyGroups } from '@store/queries/useGroups'
import { useUsers } from '@store/queries/admin/useUsers'
import { PersonaPreferencesSection } from './PersonaPreferencesSection'
import { useProjectContextStore } from '@store/zustand/projectContextStore'
import { Persona, User } from '@models/types'

interface ShareEntry {
  type: 'user' | 'group'
  id: string
  label: string
  permission: 'read_only' | 'forkable'
}

interface PersonaEditorProps {
  open: boolean
  onClose: () => void
  persona: Persona | null
}

export default function PersonaEditor({ open, onClose, persona }: PersonaEditorProps) {
  const { mutateAsync: createPersonaMutation, isPending: isCreating } = useCreatePersona()
  const { mutateAsync: updatePersonaMutation, isPending: isUpdating } = useUpdatePersona()

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [informationNeed, setInformationNeed] = useState('')
  const [details, setDetails] = useState('')

  // Project assignment
  const { data: myProjects = [] } = useMyProjects()
  const activeProjectId = useProjectContextStore(state => state.activeProjectId)
  const [projectId, setProjectId] = useState<string>('')

  // Sharing
  const { data: allUsers = [] } = useUsers()
  const { data: myGroups = [] } = useMyGroups()
  const [shareWith, setShareWith] = useState<ShareEntry[]>([])
  const [sharingExpanded, setSharingExpanded] = useState(false)
  const [userComboboxOpen, setUserComboboxOpen] = useState(false)

  const isCreateMode = !persona
  const isSaving = isCreating || isUpdating

  // All required fields must be filled
  const isFormValid =
    name.trim().length > 0 &&
    role.trim().length > 0 &&
    informationNeed.trim().length > 0

  // Reset state when dialog opens/closes or persona changes
  useEffect(() => {
    if (open) {
      if (persona) {
        setName(persona.name)
        setRole(persona.role)
        setInformationNeed(persona.informationNeed)
        setDetails(persona.details || '')
        setProjectId('')
      } else {
        setName('')
        setRole('')
        setInformationNeed('')
        setDetails('')
        setProjectId(activeProjectId ?? '')
      }
      setShareWith([])
      setSharingExpanded(false)
    }
  }, [persona, open, activeProjectId])

  const handleCancel = () => {
    onClose()
  }

  const addUserShare = (user: User) => {
    if (shareWith.some(s => s.type === 'user' && s.id === user.id)) return
    setShareWith(prev => [...prev, {
      type: 'user',
      id: user.id,
      label: `${user.username} (${user.displayName})`,
      permission: 'read_only',
    }])
    setUserComboboxOpen(false)
  }

  const addGroupShare = (groupId: string) => {
    if (!groupId || shareWith.some(s => s.type === 'group' && s.id === groupId)) return
    const group = myGroups.find(g => g.id === groupId)
    if (!group) return
    setShareWith(prev => [...prev, {
      type: 'group',
      id: groupId,
      label: group.name,
      permission: 'read_only',
    }])
  }

  const updateSharePermission = (index: number, permission: 'read_only' | 'forkable') => {
    setShareWith(prev => prev.map((s, i) => i === index ? { ...s, permission } : s))
  }

  const removeShare = (index: number) => {
    setShareWith(prev => prev.filter((_, i) => i !== index))
  }

  const handleDone = async () => {
    if (!isFormValid) return

    const personaData = {
      name: name.trim(),
      role: role.trim(),
      informationNeed: informationNeed.trim(),
      details: details.trim(),
    }

    try {
      if (isCreateMode) {
        await createPersonaMutation({
          persona: personaData,
          ontology: {
            entities: [],
            roles: [],
            events: [],
            relationTypes: [],
            relations: [],
          },
          projectId: projectId || undefined,
          shareWith: shareWith.length > 0
            ? shareWith.map(s => ({ type: s.type, id: s.id, permission: s.permission }))
            : undefined,
        })
      } else if (persona) {
        await updatePersonaMutation({
          id: persona.id,
          ...personaData,
          details: personaData.details || '',
          createdAt: persona.createdAt,
          updatedAt: new Date().toISOString(),
        })
      }
      onClose()
    } catch (error) {
      console.error('Failed to save persona:', error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{persona ? 'Edit Persona' : 'Create New Persona'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="persona-name">Persona Name *</Label>
            <Input
              id="persona-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={name.length > 0 && name.trim().length === 0}
            />
            <p className="text-xs text-muted-foreground">A descriptive name for this persona</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="persona-role">Role *</Label>
            <Input
              id="persona-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-invalid={role.length > 0 && role.trim().length === 0}
            />
            <p className="text-xs text-muted-foreground">The persona's professional role or title</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="persona-info-need">Information Need *</Label>
            <Textarea
              id="persona-info-need"
              value={informationNeed}
              onChange={(e) => setInformationNeed(e.target.value)}
              rows={3}
              aria-invalid={informationNeed.length > 0 && informationNeed.trim().length === 0}
            />
            <p className="text-xs text-muted-foreground">What information is this persona looking for?</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="persona-details">Additional Details</Label>
            <Textarea
              id="persona-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">Optional: Any additional context or details</p>
          </div>

          {/* Project Assignment - only in create mode */}
          {isCreateMode && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Project Assignment</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Personal Workspace">
                      {projectId
                        ? myProjects.find((project) => project.id === projectId)?.name ?? null
                        : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Personal Workspace</SelectItem>
                    {myProjects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Inference overrides - only when editing an existing persona */}
          {!isCreateMode && persona && (
            <>
              <Separator className="my-2" />
              <PersonaPreferencesSection personaId={persona.id} />
            </>
          )}

          {/* Sharing - only in create mode */}
          {isCreateMode && (
            <>
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium select-none"
                onClick={() => setSharingExpanded(prev => !prev)}
              >
                Share After Creation {sharingExpanded ? '\u25BE' : '\u25B8'}
                {shareWith.length > 0 && (
                  <Badge className="ml-2">{shareWith.length}</Badge>
                )}
              </button>

              {sharingExpanded && (
                <div className="flex flex-col gap-3 pl-2">
                  {/* Add user share */}
                  <Popover open={userComboboxOpen} onOpenChange={setUserComboboxOpen}>
                    <PopoverTrigger
                      className="flex h-8 w-full items-center justify-between rounded-lg border border-input bg-transparent px-2.5 text-sm text-muted-foreground"
                    >
                      Share with user...
                      <ChevronsUpDown className="ml-2 size-4 opacity-50" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0">
                      <Command>
                        <CommandInput placeholder="Search users..." />
                        <CommandList>
                          <CommandEmpty>No users found.</CommandEmpty>
                          {allUsers.map((user) => (
                            <CommandItem
                              key={user.id}
                              value={`${user.username} ${user.displayName}`}
                              onSelect={() => addUserShare(user)}
                            >
                              {user.username} ({user.displayName})
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* Add group share */}
                  {myGroups.length > 0 && (
                    <Select value="" onValueChange={(v) => { if (v) addGroupShare(v) }}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Share with group..." />
                      </SelectTrigger>
                      <SelectContent>
                        {myGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Pending shares list */}
                  {shareWith.map((entry, index) => (
                    <div
                      key={`${entry.type}-${entry.id}`}
                      className="flex items-center gap-2 rounded-md bg-muted/50 p-2"
                    >
                      <Badge variant="outline">
                        {entry.type === 'user' ? 'User' : 'Group'}
                      </Badge>
                      <span className="flex-1 text-sm">{entry.label}</span>
                      <ToggleGroup
                        size="sm"
                        value={[entry.permission]}
                        onValueChange={(value) => {
                          const selected = value[value.length - 1]
                          if (selected === 'read_only' || selected === 'forkable') {
                            updateSharePermission(index, selected)
                          }
                        }}
                      >
                        <ToggleGroupItem value="read_only" className="px-2 py-0.5 text-xs">
                          Read
                        </ToggleGroupItem>
                        <ToggleGroupItem value="forkable" className="px-2 py-0.5 text-xs">
                          Fork
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <Button variant="ghost" size="icon-sm" onClick={() => removeShare(index)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>Cancel</Button>
          <Button
            onClick={handleDone}
            disabled={!isFormValid || isSaving}
          >
            {isSaving && <Spinner className="size-4" />}
            {isSaving ? 'Saving...' : 'Done'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
