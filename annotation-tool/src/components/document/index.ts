/**
 * Public surface of the document span-annotation module.
 *
 * Re-exports the orchestrator, its subcomponents, the store provider, the
 * interaction hooks, and the layers adapters so hosts (the document workspace
 * and the video-text panel) can compose the annotator without reaching into
 * individual files.
 *
 * @module
 */

export { SpanAnnotator } from './SpanAnnotator'
export type {
  SpanAnnotatorProps,
  SpanAnnotatorConfig,
  SpanDraft,
  RelationDraftCommit,
} from './SpanAnnotator'

export { TokenizedTextView } from './TokenizedTextView'
export type { TokenizedTextViewProps } from './TokenizedTextView'
export { RelationArcOverlay } from './RelationArcOverlay'
export type { RelationArcOverlayProps } from './RelationArcOverlay'
export { SpanLabelPicker } from './SpanLabelPicker'
export type { SpanLabelPickerProps, SpanLabelMode, SpanLabelOption } from './SpanLabelPicker'
export { RelationTypePicker } from './RelationTypePicker'
export type { RelationTypePickerProps } from './RelationTypePicker'
export { SpanSidePanel } from './SpanSidePanel'
export type { SpanSidePanelProps } from './SpanSidePanel'
export { RelationSidePanel } from './RelationSidePanel'
export type { RelationSidePanelProps } from './RelationSidePanel'

export { SpanAnnotatorStoreProvider } from './SpanAnnotatorStoreProvider'
export {
  useSpanAnnotatorStore,
  useSpanAnnotatorStoreApi,
} from './spanAnnotatorStoreContext'

export { useTokenSelection } from './hooks/useTokenSelection'
export { useSpanRelationMachine } from './hooks/useSpanRelationMachine'
export { useSpanPositions } from './hooks/useSpanPositions'
export { useSpanAnnotatorHotkeys } from './hooks/useSpanAnnotatorHotkeys'

export {
  asWireTokenization,
  pickPrimaryTokenization,
  toTokenizedElement,
  rowsToSpans,
  rowsToRelations,
} from './tokenization'
export type { WireTokenization, SpanLabelResolvers } from './tokenization'

export { DocumentEditor } from './DocumentEditor'
export type { DocumentEditorProps } from './DocumentEditor'
export { VideoTextPanel } from './VideoTextPanel'
export type { VideoTextPanelProps } from './VideoTextPanel'
export { DocumentWorkspace } from './DocumentWorkspace'
export { DocumentBrowser } from './DocumentBrowser'
export { DocumentCard } from './DocumentCard'
export type { DocumentCardProps } from './DocumentCard'
export { documentTitle } from './documentTitle'
export { useLayersSpanAnnotator } from './hooks/useLayersSpanAnnotator'
export type { LayersSpanAnnotatorController } from './hooks/useLayersSpanAnnotator'
