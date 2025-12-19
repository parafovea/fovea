# University of Rochester INFACT Report (Nov. 2025\)

We implemented claims extraction and synthesis capabilities planned in October and established production deployment infrastructure through S3 storage integration, API standardization, and architectural refactoring. The main foci were: (i) developing the claims extraction and synthesis system with BullMQ job queueing; (ii) implementing S3/hybrid video storage with thumbnail generation; (iii) standardizing API error handling with typed error hierarchies; (iv) refactoring backend architecture with repository patterns and caching; (v) implementing annotation auto-save with persistence verification; and (vi) modernizing frontend component architecture. Development work completed the claims infrastructure enabling FOVEA to extract and organize factual assertions from video summaries for SCALE2026 intelligence analysis workflows.

**Claims and Evidence Extraction**

We implemented a comprehensive claims system supporting hierarchical claim structures, LLM-based extraction, typed relations, and asynchronous job processing through BullMQ queues.

*Hierarchical Claims System*

The Prisma schema defines Claim and ClaimRelation models supporting hierarchical claim structures. The Claim model implements parent-child relationships through parentClaimId with support for multiple nesting levels, text span mapping with charStart and charEnd fields for discontiguous evidence references, and denormalized claimsJson storage in VideoSummary for efficient querying. The ClaimRelation model supports typed relationships between claims with sourceClaimId and targetClaimId references, relationTypeId validated against persona ontology definitions, sourceSpans and targetSpans for granular evidence linking, and confidence scores with notes and creation metadata.

The backend implements ten API endpoints for claims management: GET/POST/PUT/DELETE operations for claims CRUD, relation endpoints for typed claim connections, and auto-creation of VideoSummary records when claims are added to videos without existing summaries.

*LLM-Based Claim Extraction*

The claim extraction module implements three configurable extraction strategies: sentence-based extraction parsing individual sentences as atomic claims, semantic-units extraction grouping related assertions, and hierarchical decomposition with configurable depth limits. The extraction system integrates ontology context through persona type definitions and glosses, annotation context from existing video annotations, configurable parameters for maximum claims per summary, confidence threshold filtering, and automatic deduplication. JSON parsing handles recursive subclaim structures with validation ensuring structural integrity.

*Claim Synthesis*

The claim synthesis module supports four synthesis strategies: hierarchical synthesis preserving claim structure relationships, chronological synthesis ordering events temporally, narrative synthesis generating story-like prose, and analytical synthesis emphasizing evidence and conflict identification. Multi-source synthesis aggregates claims from multiple videos with conflict detection and integration. Citation support maintains claim ID references throughout synthesized output enabling evidence tracing.

*BullMQ Job Queueing*

The backend implements three BullMQ queues for asynchronous processing: videoSummarizationQueue for video analysis jobs, claimExtractionQueue for LLM-based claim extraction, and claimSynthesisQueue for summary synthesis operations. Queue configuration includes exponential backoff with configurable base delay and maximum retry attempts, concurrency limits per queue, and rate limiting to prevent API overload. QueueEvents listeners log completion and failure events with metrics recording job duration and status counts. The Bull Board admin dashboard at /admin/queues provides job monitoring and management capabilities.

**S3 Storage and Video Management**

We implemented S3/hybrid video storage with thumbnail generation and standardized storage configuration across deployment environments.

*S3/Hybrid Storage Architecture*

The storage system supports three VIDEO\_STORAGE\_TYPE configurations: local for filesystem storage, s3 for cloud-only storage, and hybrid for combined local and S3 access. S3 integration includes configurable bucket, region, and credentials through environment variables, S3\_ENDPOINT support for S3-compatible storage providers, and anonymous access configuration for public buckets. Thumbnail storage configuration mirrors video storage with THUMBNAIL\_STORAGE\_TYPE and THUMBNAIL\_S3\_PREFIX settings. CDN integration supports CDN\_ENABLED, CDN\_BASE\_URL, and CDN\_SIGNED\_URLS configuration for content delivery optimization.

The VideoStorageProvider abstraction implements a unified interface with listVideos and readTextFile methods, enabling consistent access patterns across storage backends. Video sync operations use the storage provider abstraction with path resolution and metadata extraction.

*Storage Standardization*

Storage configuration standardization introduced the STORAGE\_PATH environment variable replacing hardcoded paths across configurations. The data/ directory was renamed to videos/ establishing consistent naming conventions. Environment configuration files (.env.demo, .env.example, .env.hybrid, .env.s3) implement standardized storage settings. Docker Compose configurations mount volumes consistently using STORAGE\_PATH for both backend and model service containers.

**API and Error Handling Standardization**

We implemented typed error handling infrastructure and completed API case convention transformations at service boundaries.

*Typed Error Hierarchy*

The error handling system implements a class hierarchy with AppError as the base class containing statusCode, code, message, and details properties. Specific error classes include NotFoundError for missing resources, ValidationError for input validation failures, UnauthorizedError for authentication failures, ForbiddenError for authorization failures, ConflictError for resource conflicts, and InternalError for unexpected server errors. The toJSON method provides safe serialization excluding stack traces from client responses.

The global Fastify error handler catches all thrown errors, converts AppError instances to structured HTTP responses, handles Fastify validation errors with consistent formatting, logs unexpected errors safely without exposing internal details, and returns generic messages for unhandled exceptions preventing information leakage. Route migrations converted sixteen route files to use typed error classes: auth, users, sessions, api-keys, personas, ontology, world, summaries, claims, models, and all videos submodules (detect, list, stream, sync, url, thumbnail).

*API Case Convention Transformation*

API boundary transformation uses camelcase-keys and snakecase-keys libraries for deep conversion between TypeScript and Python conventions. The backend converts Python model service responses to camelCase before returning to frontend clients. Request bodies sent to the model service undergo snake\_case transformation. Transformation applies recursively to nested objects and arrays ensuring consistent conventions throughout the API layer.

**Model Service Integration**

We refined model service integration addressing video file access, endpoint naming, and persona context propagation.

Video file path mapping converts backend /data/ paths to model service /videos/ paths enabling unified volume mounts across Docker containers. The model service mounts video storage at /videos matching the backend's expectation for model inference operations.

Standardized model service endpoints include /api/summarize for video summarization, /api/extract-claims for claim extraction, and /api/synthesize-summary for summary synthesis. Request and response handling applies automatic case convention transformation with type-safe objects and error propagation with status codes.

Persona context passing integrates persona attributes (role, informationNeed, ontology) into claim extraction and synthesis prompts. The summarization queue passes persona prompts for context-aware video analysis. Claim synthesis queries incorporate persona context for relevant output generation.

**Annotation Auto-Save System**

We implemented automatic annotation persistence replacing manual save operations with debounced auto-save and comprehensive persistence testing.

*Auto-Save Implementation*

The auto-save hook implements Redux async thunk pattern for annotation persistence with one-second debounce preventing excessive API calls during rapid editing. Separate auto-save handlers manage ontology types and persona edits with independent debounce timers. Bi-directional transformation converts between frontend annotation format (annotationType field) and backend schema (type field with label property). Saved annotation ID tracking distinguishes create operations from updates preventing duplicate annotations.

The auto-save system addresses several edge cases: initial load detection prevents saving unchanged data on page load, circular dependency prevention avoids infinite save loops, filtered annotation handling ensures all annotations persist regardless of current filter state, and proper timing of previousAnnotationsRef updates maintains consistency.

*Persistence Testing*

End-to-end persistence tests verify annotation, ontology, and world object persistence across page reloads. Tests create annotations, reload the page, and verify data integrity. Keyframe save verification tests confirm auto-save timing rather than manual save button interaction. The test infrastructure includes proper fixtures and data setup with explicit save verification and robust page load waits.

**Backend Architecture Refactoring**

We modularized backend route handlers and implemented repository patterns with caching infrastructure.

*Video Routes Modularization*

The monolithic videos.ts route file was split into modular components: list.ts for video listing endpoints, stream.ts for video streaming, thumbnail.ts for thumbnail generation, detect.ts for object detection integration, sync.ts for video synchronization, and url.ts for URL resolution. Shared schemas.ts defines common validation schemas across video routes. The index.ts file coordinates route registration with proper prefix handling. Route registration tests verify endpoint availability and response handling.

*Repository Pattern and Caching*

VideoRepository implements common query methods for video data access with methods for findById, findAll, and findByPersona operations. CacheService provides Redis integration with automatic TTL support, graceful fallback when Redis is unavailable, and pattern-based cache invalidation. Cache integration in VideoRepository wraps findById with caching reducing database load for frequently accessed videos. Cache metrics integrate with OpenTelemetry instrumentation tracking hit rates and latency.

Database performance indexes were added to VideoSummary and Annotation models on frequently queried field combinations. Prisma migration generated the corresponding database index creation.

**Frontend Component Architecture**

We modernized frontend state management and extracted reusable components with custom hooks.

*State Management*

Zustand stores manage UI-specific state separated from application data: annotationUIStore handles drawing mode, selection state, and canvas interactions; dialogStore manages modal visibility and dialog-specific state. Redux remains the primary store for complex application state including annotations, personas, ontologies, and world objects. The separation reduces Redux middleware complexity for simple UI state changes.

*Component Extraction*

VideoPlayer component extraction isolates Video.js player management with the useVideoPlayer hook encapsulating player initialization, event handling, and cleanup. DrawingCanvas component extraction separates canvas rendering from AnnotationOverlay with useAnnotationDrawing hook managing drawing state, coordinate transformation, and annotation creation. Both extractions include comprehensive unit tests verifying hook behavior and component rendering.

*Performance Optimization*

Vite configuration implements code splitting for main route components with lazy loading reducing initial bundle size. LoadingSpinner component provides consistent Suspense fallback during chunk loading. Bundle visualizer integration enables monitoring of bundle composition and identifying optimization opportunities.

**Security and Quality Improvements**

We hardened security configurations and resolved static analysis warnings.

Authentication security improvements removed hardcoded passwords from the seed script enforcing ADMIN\_PASSWORD environment variable validation in production deployments. The seed script was refactored for testability with exported seedDatabase function accepting optional Prisma client parameter enabling test isolation without subprocess spawning. Authentication documentation provides comprehensive setup guidance.

CodeQL security fixes addressed log injection vulnerabilities through input sanitization, remote property injection warnings through property key prefixing with safe identifiers, and code quality warnings through improved type handling. Health check endpoints at /api/health support load balancer integration returning structured status responses with timestamps.

**User Interface Refinements**

We implemented navigation improvements and display enhancements throughout the annotation interface.

Back button navigation in the annotation workspace provides quick return to video selection with keyboard shortcut support (Backspace). Integration with BreadcrumbNavigation maintains consistent navigation patterns. Annotation list improvements display human-readable entity and event names instead of UUID identifiers. Bounding box rendering uses actual video element dimensions for accurate overlay positioning accounting for video scaling and aspect ratio.

**Development Plans for December**

Development will continue in December addressing error handling completion, production deployment, testing stabilization, and SCALE2026 preparation.

1. *Error Handling Completion:* Finish migration of remaining route files to typed error handling ensuring consistent error responses across all API endpoints with comprehensive test coverage.
2. *Production Deployment:* Deploy to EC2 GPU instances with health check monitoring, automated rollback workflows, and production environment documentation.
3. *E2E Test Stabilization:* Address flaky end-to-end tests improving CI reliability through better wait conditions, fixture isolation, and test data management.
4. *Annotation Workflow Polish:* Refine keyframe editing workflows, interpolation controls, and timeline interactions based on SCALE2026 pilot feedback.
5. *SCALE2026 Pilot Preparation:* Prepare production infrastructure for SCALE2026 annotation activities including user onboarding documentation, performance monitoring, and support workflows.

We will continue SCALE2026 pilot annotation efforts with the claims extraction system enabling intelligence analysts to identify, organize, and trace factual assertions from video content.
