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
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(initialPersonaId)
  const { data: personas = [] } = usePersonas()
  const editorRef = useRef<VideoSummaryEditorRef>(null)

  // Force save before closing to ensure no data is lost
  const handleDone = async () => {
    if (editorRef.current) {
      await editorRef.current.forceSave()
    }
    onClose()
  }

  // Update selected persona when initial persona changes (e.g., when dialog opens)
  useEffect(() => {
    if (open) {
      setSelectedPersonaId(initialPersonaId)
    }
  }, [open, initialPersonaId])

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
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
              <SelectValue placeholder="Select a persona to create a summary" />
            </SelectTrigger>
            <SelectContent>
              {personas.length === 0 && (
                <SelectItem value="__disabled__" disabled>
                  No personas available
                </SelectItem>
              )}
              {personas.map((persona) => (
                <SelectItem key={persona.id} value={persona.id}>
                  {persona.name} - {persona.role}
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
