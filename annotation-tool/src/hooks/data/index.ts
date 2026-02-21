/**
 * Data persistence hooks for auto-saving and synchronization.
 * @module hooks/data
 */

export { useAutoSave } from './useAutoSave'
export type {
  SaveStatus,
  AutoSaveEntityType,
  UseAutoSaveOptions,
  UseAutoSaveReturn,
} from './useAutoSave'
export { useAutoSaveAnnotations } from './useAutoSaveAnnotations'
export { SaveStatusIndicator } from '@components/shared/SaveStatusIndicator'
export type { SaveStatusIndicatorProps } from '@components/shared/SaveStatusIndicator'
