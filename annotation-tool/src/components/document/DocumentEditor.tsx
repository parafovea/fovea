/**
 * Hosts the span annotator for one document expression.
 *
 * Binds the annotator to the document's layers annotations through
 * `useLayersSpanAnnotator`, rendering load and empty states while the
 * expression resolves.
 *
 * @module
 */

import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { SpanAnnotator } from './SpanAnnotator'
import { useLayersSpanAnnotator } from './hooks/useLayersSpanAnnotator'

/**
 * Props for {@link DocumentEditor}.
 */
export interface DocumentEditorProps {
  /** The document expression id/uri to annotate. */
  expressionUri: string
  /** The active persona, scoping layers and backing type labels. */
  personaId?: string | null
}

/**
 * Renders the span annotator for a document.
 *
 * @param props - the document expression and active persona
 * @returns the editor element
 */
export function DocumentEditor({ expressionUri, personaId }: DocumentEditorProps): JSX.Element {
  const controller = useLayersSpanAnnotator(expressionUri, personaId)

  if (controller.status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  if (controller.status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load this document.</AlertDescription>
      </Alert>
    )
  }

  if (controller.status === 'empty' || !controller.element) {
    return (
      <Alert>
        <AlertDescription>This document has no tokenized text to annotate.</AlertDescription>
      </Alert>
    )
  }

  return (
    <SpanAnnotator
      tokenization={controller.element}
      text={controller.text}
      spans={controller.spans}
      relations={controller.relations}
      personaId={personaId}
      relationTypes={controller.relationTypes}
      quickLabels={controller.quickLabels}
      onCreateSpan={controller.onCreateSpan}
      onDeleteSpan={controller.onDeleteSpan}
      onCreateRelation={controller.onCreateRelation}
      onDeleteRelation={controller.onDeleteRelation}
    />
  )
}
