import { ReactNode } from 'react'
import { Tag } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { GlossItem } from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import WikidataImportFlow from './WikidataImportFlow'
import { ModeSelector } from './ModeSelector'
import { WikidataChip } from './WikidataChip'
import { TypeObjectBadge } from './TypeObjectToggle'
import { ImportType } from '@hooks/wikidata'

export interface BaseTypeEditorProps {
  // Required props
  open: boolean
  onClose: () => void
  typeCategory: 'entity' | 'role' | 'event' | 'relation'
  personaId: string | null

  // Form state
  name: string
  setName: (name: string) => void
  gloss: GlossItem[]
  setGloss: (gloss: GlossItem[]) => void
  mode: 'manual' | 'copy' | 'wikidata'
  setMode: (mode: 'manual' | 'copy' | 'wikidata') => void

  // Import state
  sourcePersonaId: string
  setSourcePersonaId?: (id: string) => void
  targetPersonaIds: string[]
  setTargetPersonaIds: (ids: string[]) => void

  // Wikidata state
  wikidataId?: string
  wikidataUrl?: string
  wikibaseId?: string
  importedAt?: string
  /** @deprecated No longer used - WikidataImportFlow handles import directly */
  _onWikidataSelect?: (item: unknown) => void

  // Actions
  onSave: () => void
  onDelete?: () => void

  // Customization
  title?: string
  icon?: ReactNode
  additionalFields?: ReactNode
  sourceSelector?: ReactNode
  validationErrors?: string[]
  isEditing?: boolean
  availablePersonas?: Array<{ id: string; name: string }>
}

export default function BaseTypeEditor({
  open,
  onClose,
  typeCategory,
  personaId,
  name,
  setName,
  gloss,
  setGloss,
  mode,
  setMode,
  sourcePersonaId,
  targetPersonaIds,
  setTargetPersonaIds,
  wikidataId,
  wikidataUrl,
  wikibaseId,
  importedAt,
  onSave,
  onDelete,
  title,
  icon = <Tag className="h-5 w-5" />,
  additionalFields,
  sourceSelector,
  validationErrors = [],
  isEditing = false,
  availablePersonas = [],
}: BaseTypeEditorProps) {
  const handlePersonaToggle = (personaId: string) => {
    setTargetPersonaIds(
      targetPersonaIds.includes(personaId)
        ? targetPersonaIds.filter(id => id !== personaId)
        : [...targetPersonaIds, personaId]
    )
  }

  const isValid = name.trim() && gloss.some(g => g.content.trim()) &&
    (mode !== 'copy' || sourcePersonaId) &&
    targetPersonaIds.length > 0

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
      <DialogContent className="sm:max-w-2xl min-h-[60vh]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              {icon}
              <span className="text-lg font-medium">{title || `${isEditing ? 'Edit' : 'Create'} ${typeCategory} Type`}</span>
              <TypeObjectBadge isType={true} />
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {/* Mode Selection */}
          <div>
            <Label className="mb-2">Creation Mode</Label>
            <ModeSelector
              mode={mode}
              onChange={setMode}
              showCopy={!isEditing}
              disabled={isEditing}
            />
          </div>

          {/* Wikidata Chip */}
          {wikidataId && wikidataUrl && (
            <div>
              <WikidataChip
                wikidataId={wikidataId}
                wikidataUrl={wikidataUrl}
                wikibaseId={wikibaseId}
                importedAt={importedAt}
              />
            </div>
          )}

          {/* Copy Mode Source Selection */}
          {mode === 'copy' && sourceSelector}

          {/* Manual/Edit Mode Fields */}
          {(mode === 'manual' || isEditing) && (
            <>
              <div>
                <Label htmlFor="type-name" className="mb-2">Name</Label>
                <Input
                  id="type-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <Label className="mb-2">Description</Label>
                <GlossEditor
                  gloss={gloss}
                  onChange={setGloss}
                  personaId={personaId}
                />
              </div>

              {additionalFields}
            </>
          )}

          {/* Wikidata Import Mode */}
          {mode === 'wikidata' && (
            <div>
              <WikidataImportFlow
                type={`${typeCategory}-type` as ImportType}
                personaId={personaId || undefined}
                entityType="type"
                onSuccess={() => onClose()}
                onCancel={onClose}
              />
            </div>
          )}

          {/* Target Persona Selection */}
          {!isEditing && availablePersonas.length > 1 && (
            <>
              <Separator />
              <div>
                <Label className="mb-2">
                  Add to Personas
                </Label>
                <div className="flex flex-col gap-2">
                  {availablePersonas.map(persona => (
                    <label
                      key={persona.id}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Checkbox
                        checked={targetPersonaIds.includes(persona.id)}
                        onCheckedChange={() => handlePersonaToggle(persona.id)}
                        aria-label={`Add to ${persona.name}`}
                      />
                      <span className="text-sm">{persona.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {validationErrors.map((error, index) => (
                  <div key={index}>{error}</div>
                ))}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          {isEditing && onDelete && (
            <Button variant="destructive" onClick={onDelete} className="mr-auto">
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={!isValid}
          >
            {isEditing ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
