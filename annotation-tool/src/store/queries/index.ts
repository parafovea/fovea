/**
 * TanStack Query Hooks Barrel Export
 *
 * Re-exports all TanStack Query hooks for convenient importing.
 */

// API Keys
export {
  useApiKeys,
  useAdminApiKeys,
  useAllApiKeys,
  useCreateApiKey,
  useUpdateApiKey,
  useDeleteApiKey,
  type ApiKey,
} from './useApiKeys'

// Videos
export {
  useVideos,
  useVideo,
  useDeleteVideo,
  usePrefetchVideo,
  videoKeys,
} from './useVideos'

// Video Summaries
export {
  useVideoSummaries,
  useVideoSummary,
  useGenerateSummary,
  useSaveSummary,
  useDeleteSummary,
  summaryKeys,
} from './useSummaries'

// Claims
export {
  useClaims,
  useClaimRelations,
  useExtractionJobStatus,
  useCreateClaim,
  useUpdateClaim,
  useDeleteClaim,
  useExtractClaims,
  useCreateClaimRelation,
  useDeleteClaimRelation,
  claimsQueryKeys,
} from './useClaims'

// Job Status
export { useJobStatus } from './useJobStatus'

// Model Config
export {
  useModelConfig,
  useSelectModel,
  useMemoryValidation,
  useModelStatus,
} from './useModelConfig'

// Detection
export { useDetectObjects } from './useDetection'

// Annotations
export {
  useAnnotations,
  useAddAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
  useSaveAnnotations,
  useInvalidateAnnotations,
  useSetAnnotations,
  useAddKeyframe,
  useRemoveKeyframe,
  useUpdateKeyframe,
  useMoveKeyframe,
  useUpdateInterpolationSegment,
  annotationKeys,
} from './useAnnotations'

// World
export {
  useWorld,
  useEntities,
  useEvents,
  useTimes,
  useEntityCollections,
  useEventCollections,
  useTimeCollections,
  useRelations,
  useSaveWorld,
  useAddEntity,
  useUpdateEntity,
  useDeleteEntity,
  useAddEvent,
  useUpdateEvent,
  useDeleteEvent,
  useAddTime,
  useUpdateTime,
  useDeleteTime,
  useAddEntityCollection,
  useUpdateEntityCollection,
  useDeleteEntityCollection,
  useAddEventCollection,
  useUpdateEventCollection,
  useDeleteEventCollection,
  useAddTimeCollection,
  useUpdateTimeCollection,
  useDeleteTimeCollection,
  useAddRelation,
  useDeleteRelation,
  useAddEntityTypeAssignment,
  useAddEventInterpretation,
  useSetWorldData,
  worldKeys,
  type WorldState,
} from './useWorld'

// Personas
export {
  usePersonas,
  usePersonaOntology,
  useAllPersonaOntologies,
  useCreatePersona,
  useUpdatePersona,
  useDeletePersona,
  useSavePersonaOntology,
  useAddEntityToPersona,
  useUpdateEntityInPersona,
  useDeleteEntityFromPersona,
  useAddRoleToPersona,
  useUpdateRoleInPersona,
  useDeleteRoleFromPersona,
  useAddEventToPersona,
  useUpdateEventInPersona,
  useDeleteEventFromPersona,
  useAddRelationTypeToPersona,
  useUpdateRelationTypeInPersona,
  useDeleteRelationTypeFromPersona,
  useAddRelationToPersona,
  useUpdateRelationInPersona,
  useDeleteRelationFromPersona,
  useImportFromPersona,
  useCopyPersona,
  useInvalidatePersonas,
  useSetPersonas,
  useSetPersonaOntology,
  personaKeys,
} from './usePersonas'

// Admin
export { useUsers, useUser, useCreateUser, useUpdateUser, useDeleteUser } from './admin/useUsers'
export { useSessions, useRevokeSession } from './admin/useSessions'
