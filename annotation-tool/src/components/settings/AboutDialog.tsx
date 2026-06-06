/**
 * About dialog component.
 * Displays information about the FOVEA application.
 */

import { X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

/**
 * Props for AboutDialog component.
 */
interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * About dialog.
 * Displays application information, features, and technology stack.
 *
 * @param open - Whether dialog is open
 * @param onClose - Callback when dialog closes
 * @returns About dialog
 */
export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DialogTitle>About FOVEA</DialogTitle>
              <Badge variant="secondary">v0.1.0</Badge>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="close"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          FOVEA (Flexible Ontology Visual Event Analyzer) is a web-based video annotation tool for tactically-oriented analysts. It uses a persona-based approach where multiple analysts can assign different semantic types to the same real-world objects, enabling collaborative ontology development with multiple perspectives.
        </p>

        <Separator />

        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium mb-2">Core Features</h4>
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              <li>Persona-based ontologies</li>
              <li>Shared world model (entities, events, locations)</li>
              <li>Rich temporal modeling</li>
              <li>Spatial bounding boxes with keyframe interpolation</li>
              <li>Wikidata integration</li>
              <li>Interactive map-based location selection</li>
              <li>Import/export with conflict resolution</li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">AI-Powered Analysis</h4>
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              <li>Video summarization with audio transcription</li>
              <li>Speaker diarization</li>
              <li>Object detection (YOLO, GroundingDINO)</li>
              <li>Multi-object tracking (ByteTrack, BoT-SORT)</li>
              <li>Ontology augmentation</li>
              <li>GPU-accelerated inference</li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Annotation Tools</h4>
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              <li>Keyframe-based bounding boxes</li>
              <li>Multiple interpolation modes</li>
              <li>Visibility toggling</li>
              <li>Ghost box visualization</li>
              <li>Timeline-based editing</li>
              <li>Keyboard shortcuts</li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Technology Stack</h4>
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              <li>React 18 + TypeScript + Vite</li>
              <li>Material-UI v5 + Redux Toolkit</li>
              <li>Node.js + Fastify + PostgreSQL</li>
              <li>Python + FastAPI + PyTorch</li>
              <li>video.js v8 + Leaflet</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
