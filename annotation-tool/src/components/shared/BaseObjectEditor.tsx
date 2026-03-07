import { ReactNode } from 'react'
import { Globe } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { GlossItem } from '@models/types'
import GlossEditor from '@components/ontology/GlossEditor'
import WikidataSearch, { WikidataImportCallbackData } from './WikidataSearch'
import { ModeSelector } from './ModeSelector'
import { WikidataChip } from './WikidataChip'
import { TypeObjectBadge } from './TypeObjectToggle'

/** Metadata structure for world objects (entities, events, locations, times). */
export interface ObjectMetadata {
  alternateNames?: string[]
  externalIds?: Record<string, string>
  certainty?: number
  [key: string]: unknown
}

export interface BaseObjectEditorProps {
  // Required props
  open: boolean
  onClose: () => void
  objectType: 'entity' | 'event' | 'location' | 'time'
  personaId: string | null

  // Form state
  name: string
  setName: (name: string) => void
  description: GlossItem[]
  setDescription: (desc: GlossItem[]) => void
  mode: 'manual' | 'copy' | 'wikidata'
  setMode: (mode: 'manual' | 'copy' | 'wikidata') => void

  // Metadata
  metadata?: ObjectMetadata
  setMetadata?: (metadata: ObjectMetadata) => void

  // Wikidata state
  wikidataId?: string
  wikidataUrl?: string
  wikibaseId?: string
  importedFrom?: 'wikidata' | 'persona'
  importedAt?: string
  onWikidataSelect?: (item: WikidataImportCallbackData) => void

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
  showPersonaSpecific?: boolean
  personaSpecificContent?: ReactNode
}

export default function BaseObjectEditor({
  open,
  onClose,
  objectType,
  personaId,
  name,
  setName,
  description,
  setDescription,
  mode,
  setMode,
  metadata,
  setMetadata: _setMetadata,
  wikidataId,
  wikidataUrl,
  wikibaseId,
  importedFrom,
  importedAt,
  onWikidataSelect,
  onSave,
  onDelete,
  title,
  icon = <Globe className="h-5 w-5" />,
  additionalFields,
  sourceSelector,
  validationErrors = [],
  isEditing = false,
  showPersonaSpecific = false,
  personaSpecificContent,
}: BaseObjectEditorProps) {
  const isValid = name.trim() && description.some(d => d.content.trim())

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
      <DialogContent className="sm:max-w-2xl min-h-[60vh]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              {icon}
              <span>{title || `${isEditing ? 'Edit' : 'Create'} ${objectType}`}</span>
              <TypeObjectBadge isType={false} />
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {/* Mode Selection */}
          {!isEditing && (
            <div>
              <Label className="mb-2">Creation Mode</Label>
              <ModeSelector
                mode={mode}
                onChange={setMode}
                showCopy={true}
              />
            </div>
          )}

          {/* Wikidata Chip */}
          {wikidataId && wikidataUrl && (
            <div>
              <WikidataChip
                wikidataId={wikidataId}
                wikidataUrl={wikidataUrl}
                wikibaseId={wikibaseId}
                importedAt={importedAt}
              />
              {importedFrom === 'wikidata' && (
                <Alert className="mt-2">
                  <AlertDescription>
                    This {objectType} was imported from Wikidata. You can edit the fields below while preserving the Wikidata reference.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Copy Mode Source Selection */}
          {mode === 'copy' && sourceSelector}

          {/* Manual/Edit Mode Fields */}
          {(mode === 'manual' || isEditing) && (
            <>
              <div>
                <Label htmlFor="object-name" className="mb-2">Name</Label>
                <Input
                  id="object-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <Label className="mb-2">Description</Label>
                <GlossEditor
                  gloss={description}
                  onChange={setDescription}
                  personaId={personaId}
                />
              </div>

              {/* Additional type-specific fields */}
              {additionalFields}

              {/* Metadata section */}
              {metadata && (
                <>
                  <Separator />
                  <div>
                    <Label className="mb-2">Metadata</Label>

                    {/* Alternative Names */}
                    {metadata.alternateNames && (
                      <div className="mb-4">
                        <p className="text-xs text-muted-foreground mb-1">
                          Alternative Names
                        </p>
                        <div className="flex gap-1 flex-wrap">
                          {metadata.alternateNames.map((altName: string, idx: number) => (
                            <Badge key={idx} variant="outline">{altName}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* External IDs */}
                    {metadata.externalIds && Object.keys(metadata.externalIds).length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-muted-foreground mb-1">
                          External IDs
                        </p>
                        <div className="flex gap-1 flex-wrap">
                          {Object.entries(metadata.externalIds).map(([key, value]) => (
                            <Badge key={key} variant="outline">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Certainty */}
                    {metadata.certainty !== undefined && (
                      <div className="mb-4">
                        <p className="text-xs text-muted-foreground">
                          Certainty: {(metadata.certainty * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Persona-specific content (for entities and events) */}
              {showPersonaSpecific && personaSpecificContent && (
                <>
                  <Separator />
                  <div>
                    <Label className="mb-2">
                      Persona-Specific Interpretations
                    </Label>
                    {personaSpecificContent}
                  </div>
                </>
              )}
            </>
          )}

          {/* Wikidata Import Mode */}
          {mode === 'wikidata' && (
            <div>
              <Label className="mb-2">
                Search Wikidata for {objectType}
              </Label>
              <WikidataSearch
                onImport={onWikidataSelect || (() => {})}
                entityType="object"
              />
              <Alert className="mt-4">
                <AlertDescription>
                  Importing from Wikidata will populate the {objectType}'s name and description automatically.
                  The Wikidata reference will be preserved for data provenance.
                </AlertDescription>
              </Alert>
            </div>
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
