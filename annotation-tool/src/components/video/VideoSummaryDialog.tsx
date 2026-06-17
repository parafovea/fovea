/**
 * Dialog for editing video summaries with persona selection.
 */

import { useState, useEffect, useRef } from 'react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import VideoSummaryEditor, { VideoSummaryEditorRef } from './VideoSummaryEditor'
import { usePersonas } from '@store/queries'
import { useClaimsUiStore } from '@store/zustand/claimsUiStore'

interface VideoSummaryDialogProps {
  open: boolean
  onClose: () => void
  videoId: string
  initialPersonaId: string | null
}

export default function VideoSummaryDialog({
  open,
  onClose,
  videoId,
  initialPersonaId,
}: VideoSummaryDialogProps) {
  // When the dialog is being re-opened to resume a scrub timestamp capture, a
  // pending draft for this video exists; restore the persona it was authored
  // under so the in-progress claim re-opens under the right persona (the dialog
  // remounts during capture, which would otherwise reset to the workspace
  // default and lose a persona that was picked here).
  const draftPersonaIdForVideo = (): string | null => {
    const draft = useClaimsUiStore.getState().draftClaim
    return draft && draft.videoId === videoId ? draft.personaId : null
  }
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(
    draftPersonaIdForVideo() ?? initialPersonaId
  )
  // While a scrub timestamp capture is active, force this dialog closed so its
  // modal overlay does not intercept clicks on the capture banner and so the
  // user can scrub the player underneath. It re-opens automatically when the
  // capture finishes (timestampCapture returns to null) because `open` stays
  // true throughout.
  const timestampCapture = useClaimsUiStore((state) => state.timestampCapture)
  const { data: personas = [] } = usePersonas()
  const editorRef = useRef<VideoSummaryEditorRef>(null)

  // Force save before closing to ensure no data is lost
  const handleDone = async () => {
    if (editorRef.current) {
      await editorRef.current.forceSave()
    }
    onClose()
  }

  // Update selected persona when initial persona changes (e.g., when dialog
  // opens). On a scrub-capture resume, prefer the draft's persona so the
  // in-progress claim re-opens under the persona it was authored with.
  useEffect(() => {
    if (open && !timestampCapture) {
      setSelectedPersonaId(draftPersonaIdForVideo() ?? initialPersonaId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPersonaId, videoId, timestampCapture])

  return (
    <Dialog open={open && !timestampCapture} onOpenChange={(isOpen) => { if (!isOpen && !timestampCapture) onClose() }}>
      <DialogContent className="sm:max-w-2xl min-h-[60vh] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Edit Video Summary</DialogTitle>
        </DialogHeader>

        <div className="mb-6 mt-6">
          <Label htmlFor="summary-persona-select" className="mb-2 block">Select Persona</Label>
          <Select
            value={selectedPersonaId || ''}
            onValueChange={(value) => setSelectedPersonaId(value || null)}
          >
            <SelectTrigger className="w-full" id="summary-persona-select">
              {/* Explicit child override: the base-ui Select reads its
                  trigger label from a matching SelectItem ref AFTER the
                  Content portal mounts. On first paint the dialog opens
                  with `selectedPersonaId` already set but
                  `<SelectContent>` is closed, so no SelectItem has
                  reported its label yet — base-ui falls back to rendering
                  the raw `value` (a UUID) until the menu is opened once.
                  Resolving the label here from the personas list and
                  passing it as the SelectValue child overrides that fall-
                  back so the dropdown shows the persona's name on first
                  paint, not its UUID. */}
              <SelectValue placeholder="Select a persona to create a summary">
                {(() => {
                  const p = personas.find((x) => x.id === selectedPersonaId)
                  return p ? `${p.name} (${p.role})` : null
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {personas.length === 0 && (
                <SelectItem value="__disabled__" disabled>
                  No personas available
                </SelectItem>
              )}
              {personas.map((persona) => (
                <SelectItem key={persona.id} value={persona.id}>
                  {persona.name} ({persona.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedPersonaId && (
            <p className="text-xs text-muted-foreground mt-2">
              Creating summary from {personas.find(p => p.id === selectedPersonaId)?.name}'s perspective
            </p>
          )}
        </div>

        {selectedPersonaId && videoId && (
          <VideoSummaryEditor
            ref={editorRef}
            videoId={videoId}
            personaId={selectedPersonaId}
            disabled={!selectedPersonaId}
          />
        )}

        {!selectedPersonaId && (
          <div className="p-8 text-center bg-muted/50 rounded-md border border-dashed border-border">
            <p className="text-sm text-muted-foreground">
              Please select a persona above to create or edit a video summary
            </p>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleDone}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
