/**
 * Annotation UI Store (Zustand)
 *
 * Manages UI state for the annotation workspace.
 * This store contains ONLY UI state (drawing mode, selections, visibility toggles).
 *
 * **Architectural Decision:**
 * - UI State (ephemeral, local) → Zustand (this store)
 * - Server State (persistent, backend) → TanStack Query
 * - Global App State (authentication, routing) → Redux (minimal)
 *
 * **What belongs in this store:**
 * - Drawing interactions (isDrawing, temporaryBox, drawingMode)
 * - UI selections (selectedAnnotation, selectedTypeId, selectedKeyframes)
 * - Visibility toggles (showDetectionCandidates, showMotionPath)
 * - UI settings (timelineZoom, currentFrame)
 * - Link/reference state (linkTargetId, linkTargetType)
 * - Detection/tracking UI state (not the actual data)
 *
 * **What does NOT belong here:**
 * - Annotation data from backend (use TanStack Query)
 * - Detection results from API (use TanStack Query)
 * - Tracking results from API (use TanStack Query)
 * - Persona/ontology data (use TanStack Query or keep in Redux temporarily)
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { Annotation, Time, InterpolationType } from '../models/types.js'

/**
 * Annotation mode determines how annotations are created
 */
type AnnotationMode =
  | 'type'    // Assign types from persona ontology (requires persona)
  | 'object'  // Link to world objects (entities, events, locations, collections)

/**
 * Drawing mode determines what kind of annotation is being created
 */
type DrawingMode = 'entity' | 'role' | 'event' | null

/**
 * Link target type for object mode
 */
type LinkTargetType =
  | 'entity'
  | 'event'
  | 'location'
  | 'entity-collection'
  | 'event-collection'
  | 'time-collection'
  | null

/**
 * Temporary bounding box being drawn
 */
interface TemporaryBox {
  x: number
  y: number
  width: number
  height: number
}

interface AnnotationUiState {
  // ========== Drawing State ==========
  /** Whether user is currently drawing a bounding box */
  isDrawing: boolean
  /** Current drawing mode (entity, role, event) */
  drawingMode: DrawingMode
  /** Temporary bounding box being drawn (cleared on completion) */
  temporaryBox: TemporaryBox | null
  /** Temporary time selection being made */
  temporaryTime: Time | null

  // ========== Selection State ==========
  /** Currently selected annotation in the workspace */
  selectedAnnotation: Annotation | null
  /** Selected type ID for type mode annotation creation */
  selectedTypeId: string | null
  /** Currently selected persona for annotation */
  selectedPersonaId: string | null
  /** Selected keyframe frame numbers for sequence annotations */
  selectedKeyframes: number[]

  // ========== Mode State ==========
  /** Current annotation mode (type or object) */
  annotationMode: AnnotationMode
  /** Interpolation mode for sequence annotations */
  interpolationMode: InterpolationType

  // ========== Link State ==========
  /** ID of entity/event/collection to link in object mode */
  linkTargetId: string | null
  /** Type of the link target */
  linkTargetType: LinkTargetType

  // ========== Detection UI State ==========
  /** Whether to show detection candidate boxes */
  showDetectionCandidates: boolean
  /** Detection query string (form state) */
  detectionQuery: string
  /** Detection confidence threshold slider value */
  detectionConfidenceThreshold: number

  // ========== Tracking UI State ==========
  /** Whether to show tracking results overlay */
  showTrackingResults: boolean
  /** ID of track being previewed (hover state) */
  previewedTrackId: string | number | null

  // ========== Timeline UI State ==========
  /** Motion path visibility for sequence annotations */
  showMotionPath: boolean
  /** Timeline zoom level (1-10x) */
  timelineZoom: number
  /** Current video frame number */
  currentFrame: number

  // ========== Actions ==========
  // Drawing actions
  setIsDrawing: (isDrawing: boolean) => void
  setDrawingMode: (mode: DrawingMode) => void
  setTemporaryBox: (box: TemporaryBox | null) => void
  setTemporaryTime: (time: Time | null) => void

  // Selection actions
  setSelectedAnnotation: (annotation: Annotation | null) => void
  setSelectedTypeId: (typeId: string | null) => void
  setSelectedPersonaId: (personaId: string | null) => void
  setSelectedKeyframes: (frames: number[]) => void
  addKeyframe: (frame: number) => void
  removeKeyframe: (frame: number) => void
  clearKeyframes: () => void

  // Mode actions
  setAnnotationMode: (mode: AnnotationMode) => void
  setInterpolationMode: (mode: InterpolationType) => void

  // Link actions
  setLinkTarget: (targetId: string | null, targetType: LinkTargetType) => void
  clearLinkTarget: () => void

  // Detection UI actions
  setShowDetectionCandidates: (show: boolean) => void
  setDetectionQuery: (query: string) => void
  setDetectionConfidenceThreshold: (threshold: number) => void

  // Tracking UI actions
  setShowTrackingResults: (show: boolean) => void
  setPreviewedTrackId: (trackId: string | number | null) => void

  // Timeline UI actions
  setShowMotionPath: (show: boolean) => void
  setTimelineZoom: (zoom: number) => void
  setCurrentFrame: (frame: number) => void

  // Utility actions
  resetDrawingState: () => void
  resetSelectionState: () => void
  resetAllState: () => void
}

/**
 * Initial state values
 */
const initialState = {
  // Drawing state
  isDrawing: false,
  drawingMode: null as DrawingMode,
  temporaryBox: null,
  temporaryTime: null,

  // Selection state
  selectedAnnotation: null,
  selectedTypeId: null,
  selectedPersonaId: null,
  selectedKeyframes: [],

  // Mode state
  annotationMode: 'type' as AnnotationMode,
  interpolationMode: 'linear' as InterpolationType,

  // Link state
  linkTargetId: null,
  linkTargetType: null as LinkTargetType,

  // Detection UI state
  showDetectionCandidates: false,
  detectionQuery: '',
  detectionConfidenceThreshold: 0.5,

  // Tracking UI state
  showTrackingResults: false,
  previewedTrackId: null,

  // Timeline UI state
  showMotionPath: false,
  timelineZoom: 1,
  currentFrame: 0,
}

/**
 * Annotation UI Store
 *
 * Use this store for all ephemeral UI state in the annotation workspace.
 * This store is lightweight and doesn't persist to backend.
 *
 * @example
 * ```typescript
 * import { useAnnotationUiStore } from '@/stores/annotationUiStore'
 *
 * function DrawingCanvas() {
 *   const isDrawing = useAnnotationUiStore(state => state.isDrawing)
 *   const setIsDrawing = useAnnotationUiStore(state => state.setIsDrawing)
 *
 *   const handleMouseDown = () => setIsDrawing(true)
 *   // ...
 * }
 * ```
 */
export const useAnnotationUiStore = create<AnnotationUiState>()(
  devtools(
    (set) => ({
      ...initialState,

      // Drawing actions
      setIsDrawing: (isDrawing) => set({ isDrawing }, false, 'setIsDrawing'),
      setDrawingMode: (drawingMode) => set({ drawingMode }, false, 'setDrawingMode'),
      setTemporaryBox: (temporaryBox) => set({ temporaryBox }, false, 'setTemporaryBox'),
      setTemporaryTime: (temporaryTime) => set({ temporaryTime }, false, 'setTemporaryTime'),

      // Selection actions
      setSelectedAnnotation: (selectedAnnotation) =>
        set({ selectedAnnotation }, false, 'setSelectedAnnotation'),
      setSelectedTypeId: (selectedTypeId) =>
        set({ selectedTypeId }, false, 'setSelectedTypeId'),
      setSelectedPersonaId: (selectedPersonaId) =>
        set({ selectedPersonaId }, false, 'setSelectedPersonaId'),
      setSelectedKeyframes: (selectedKeyframes) =>
        set({ selectedKeyframes }, false, 'setSelectedKeyframes'),
      addKeyframe: (frame) =>
        set((state) => ({
          selectedKeyframes: [...state.selectedKeyframes, frame].sort((a, b) => a - b)
        }), false, 'addKeyframe'),
      removeKeyframe: (frame) =>
        set((state) => ({
          selectedKeyframes: state.selectedKeyframes.filter(f => f !== frame)
        }), false, 'removeKeyframe'),
      clearKeyframes: () =>
        set({ selectedKeyframes: [] }, false, 'clearKeyframes'),

      // Mode actions
      setAnnotationMode: (annotationMode) =>
        set({ annotationMode }, false, 'setAnnotationMode'),
      setInterpolationMode: (interpolationMode) =>
        set({ interpolationMode }, false, 'setInterpolationMode'),

      // Link actions
      setLinkTarget: (linkTargetId, linkTargetType) =>
        set({ linkTargetId, linkTargetType }, false, 'setLinkTarget'),
      clearLinkTarget: () =>
        set({ linkTargetId: null, linkTargetType: null }, false, 'clearLinkTarget'),

      // Detection UI actions
      setShowDetectionCandidates: (showDetectionCandidates) =>
        set({ showDetectionCandidates }, false, 'setShowDetectionCandidates'),
      setDetectionQuery: (detectionQuery) =>
        set({ detectionQuery }, false, 'setDetectionQuery'),
      setDetectionConfidenceThreshold: (detectionConfidenceThreshold) =>
        set({ detectionConfidenceThreshold }, false, 'setDetectionConfidenceThreshold'),

      // Tracking UI actions
      setShowTrackingResults: (showTrackingResults) =>
        set({ showTrackingResults }, false, 'setShowTrackingResults'),
      setPreviewedTrackId: (previewedTrackId) =>
        set({ previewedTrackId }, false, 'setPreviewedTrackId'),

      // Timeline UI actions
      setShowMotionPath: (showMotionPath) =>
        set({ showMotionPath }, false, 'setShowMotionPath'),
      setTimelineZoom: (timelineZoom) =>
        set({ timelineZoom: Math.max(1, Math.min(10, timelineZoom)) }, false, 'setTimelineZoom'),
      setCurrentFrame: (currentFrame) =>
        set({ currentFrame: Math.max(0, currentFrame) }, false, 'setCurrentFrame'),

      // Utility actions
      resetDrawingState: () =>
        set({
          isDrawing: false,
          drawingMode: null,
          temporaryBox: null,
          temporaryTime: null,
        }, false, 'resetDrawingState'),

      resetSelectionState: () =>
        set({
          selectedAnnotation: null,
          selectedTypeId: null,
          selectedKeyframes: [],
        }, false, 'resetSelectionState'),

      resetAllState: () =>
        set(initialState, false, 'resetAllState'),
    }),
    { name: 'AnnotationUiStore' }
  )
)
