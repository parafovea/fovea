/**
 * The standalone document workspace.
 *
 * At `documents` it shows the document browser; at `documents/:documentId` it
 * shows the span annotator for that document, with a control to return to the
 * browser. The annotator is scoped to the workspace's active persona.
 *
 * @module
 */

import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useAnnotationUiStore } from '@store/zustand'

import { DocumentBrowser } from './DocumentBrowser'
import { DocumentEditor } from './DocumentEditor'

/**
 * Renders the document browser or the single-document annotator by route.
 *
 * @returns the workspace element
 */
export function DocumentWorkspace(): JSX.Element {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()
  const personaId = useAnnotationUiStore((state) => state.selectedPersonaId)

  if (!documentId) {
    return <DocumentBrowser />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => navigate('/documents')}
          aria-label="Back to documents"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-xl font-semibold">Document</h2>
      </div>
      <DocumentEditor expressionUri={documentId} personaId={personaId} />
    </div>
  )
}
