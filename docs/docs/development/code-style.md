---
title: Code Style Guide
---

# Code Style Guide

The FOVEA project follows consistent code style across all services to maintain readability and prevent merge conflicts. Automated tools enforce formatting and catch common errors. This guide covers TypeScript style for frontend and backend, Python style for the model service, and documentation standards that apply to all code.

## General Principles

Code should be readable and self-documenting. Choose descriptive names over clever abbreviations. Keep functions small and focused on a single responsibility. Avoid deep nesting by using early returns. Write code that expresses intent clearly without requiring extensive comments. When comments are necessary, explain why rather than what.

Prefer composition over inheritance. Use pure functions where possible to avoid hidden side effects. Handle errors explicitly rather than silently ignoring them. Follow the principle of least surprise by using common patterns consistently throughout the codebase.

## TypeScript Style

### Formatting

The frontend and backend use ESLint for linting and Prettier for code formatting. Configuration lives in `.eslintrc.json` and `.prettierrc` in each service directory. Run formatting and linting before committing code.

```bash
# Frontend
cd annotation-tool
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix issues

# Backend
cd server
npm run lint
npm run lint:fix
```

Prettier enforces consistent formatting including 2-space indentation, single quotes for strings, trailing commas in multi-line structures, and 100-character line length. ESLint catches potential bugs like unused variables, missing await keywords, and incorrect TypeScript types.

### Type Annotations

Always provide explicit return types for functions. TypeScript can infer types in many cases, but explicit annotations serve as documentation and catch type errors earlier.

```typescript
// Good: Explicit return type
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Avoid: Implicit return type
function calculateTotal(items: Item[]) {
  return items.reduce((sum, item) => sum + item.price, 0);
}
```

Use `unknown` instead of `any` for truly unknown types. The `unknown` type forces type checking before use, preventing runtime errors.

```typescript
// Good: Safe type checking
function processData(data: unknown): string {
  if (typeof data === 'string') {
    return data.toUpperCase();
  }
  throw new Error('Invalid data type');
}

// Avoid: Bypasses type safety
function processData(data: any): string {
  return data.toUpperCase();  // Runtime error if data is not a string
}
```

### Interface vs Type

Use `interface` for object shapes that might be extended or implemented. Use `type` for unions, intersections, and mapped types.

```typescript
// Use interface for extensible object shapes
interface Entity {
  id: string;
  name: string;
}

interface Person extends Entity {
  age: number;
}

// Use type for unions and complex types
type EntityType = 'person' | 'organization' | 'location';
type Result<T> = { success: true; data: T } | { success: false; error: string };
```

### Naming Conventions

Use PascalCase for types, interfaces, classes, and React components. Use camelCase for variables, functions, and methods. Use UPPER_SNAKE_CASE for constants. Prefix private class members with underscore.

```typescript
// Types and interfaces
interface VideoMetadata { }
type AnnotationType = 'entity' | 'event';

// Components
const EntityEditor: FC<EntityEditorProps> = () => { };

// Functions and variables
function createAnnotation(data: AnnotationData): Annotation { }
const currentFrame = 0;

// Constants
const MAX_UPLOAD_SIZE = 1024 * 1024 * 100;
const API_BASE_URL = 'http://localhost:3001';

// Private members
class VideoPlayer {
  private _currentTime: number;
}
```

### Import Organization

Organize imports in three groups: external libraries, internal absolute imports, and relative imports. Sort alphabetically within each group. Separate groups with blank lines.

```typescript
// External libraries
import { FC, useState, useEffect } from 'react';
import { Box, Button, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

// Internal absolute imports
import { useAppDispatch, useAppSelector } from '../store';
import { addEntity } from '../store/worldSlice';

// Relative imports
import { EntityForm } from './EntityForm';
import type { Entity } from '../types';
```

### Async/Await

Always use async/await for asynchronous code. Avoid mixing promises and async/await patterns. Handle errors with try/catch blocks rather than promise catch chains.

```typescript
// Good: Clean async/await with error handling
async function fetchVideo(id: string): Promise<Video> {
  try {
    const response = await fetch(`/api/videos/${id}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error('Video fetch failed', { id, error });
    throw error;
  }
}

// Avoid: Promise chains
function fetchVideo(id: string): Promise<Video> {
  return fetch(`/api/videos/${id}`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch video: ${response.status}`);
      }
      return response.json();
    })
    .catch(error => {
      logger.error('Video fetch failed', { id, error });
      throw error;
    });
}
```

### React Component Structure

Organize React components with a consistent structure: imports, types, component definition, styles (if using styled components). Export components at the bottom for better code organization.

```typescript
import { FC, useState } from 'react';
import { Box, Button } from '@mui/material';

interface MyComponentProps {
  title: string;
  onSave: (data: FormData) => void;
}

const MyComponent: FC<MyComponentProps> = ({ title, onSave }) => {
  const [data, setData] = useState<FormData | null>(null);

  const handleSubmit = () => {
    if (data) {
      onSave(data);
    }
  };

  return (
    <Box>
      <h2>{title}</h2>
      <Button onClick={handleSubmit}>Save</Button>
    </Box>
  );
};

export default MyComponent;
```

## Python Style

### Formatting

The model service uses ruff for linting and formatting. Ruff is a fast Python linter that replaces flake8, isort, and black. Configuration lives in `pyproject.toml`. Run formatting before committing code.

```bash
cd model-service
ruff check .              # Check for issues
ruff check --fix .        # Auto-fix issues
ruff format .             # Format code
```

Ruff enforces PEP 8 style including 4-space indentation, 88-character line length (matching black), and proper import organization. It also catches common errors like unused imports, undefined variables, and mutable default arguments.

### Type Hints

Use type hints for all function signatures. Python 3.12 supports modern type hint syntax without importing from `typing` for common types like `list`, `dict`, and `tuple`.

```python
# Good: Modern type hints
def process_frames(frames: list[np.ndarray], sample_rate: int = 30) -> list[int]:
    """Process video frames and return frame indices."""
    indices = []
    for i in range(0, len(frames), sample_rate):
        indices.append(i)
    return indices

# Avoid: Missing type hints
def process_frames(frames, sample_rate=30):
    indices = []
    for i in range(0, len(frames), sample_rate):
        indices.append(i)
    return indices
```

Use `Optional[T]` or `T | None` for nullable types. Prefer the pipe syntax for unions in Python 3.12+.

```python
from typing import Optional

# Modern syntax (Python 3.12+)
def get_model(model_id: str) -> Model | None:
    """Get model by ID or None if not found."""
    return models.get(model_id)

# Traditional syntax (also acceptable)
def get_model(model_id: str) -> Optional[Model]:
    """Get model by ID or None if not found."""
    return models.get(model_id)
```

### Docstrings

Use Google-style docstrings for all public functions, classes, and modules. Docstrings should describe what the code does, document all parameters and return values, and include examples where helpful.

```python
def extract_frames(video_path: str, sample_rate: int = 30) -> list[np.ndarray]:
    """Extract frames from video at specified sample rate.

    Args:
        video_path: Path to video file
        sample_rate: Extract every Nth frame (default: 30)

    Returns:
        List of frame arrays in RGB format

    Raises:
        FileNotFoundError: If video file does not exist
        ValueError: If sample_rate is less than 1

    Example:
        >>> frames = extract_frames("/data/video.mp4", sample_rate=30)
        >>> print(f"Extracted {len(frames)} frames")
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")

    if sample_rate < 1:
        raise ValueError("sample_rate must be at least 1")

    # Implementation...
    return frames
```

### Import Organization

Organize imports in four groups: standard library, third-party libraries, local application imports, and relative imports. Ruff automatically sorts imports within each group.

```python
# Standard library
import os
import logging
from pathlib import Path

# Third-party
import numpy as np
import torch
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# Local application
from src.model_manager import ModelManager
from src.video_utils import extract_frames

# Relative
from .detection_loader import DetectionLoader
```

### Error Handling

Raise specific exceptions rather than generic Exception. Catch specific exceptions and handle them appropriately. Always include error messages that help diagnose the problem.

```python
# Good: Specific exceptions
class ModelLoadError(Exception):
    """Raised when model loading fails."""
    pass

def load_model(model_id: str) -> Model:
    """Load model by ID."""
    try:
        model = AutoModel.from_pretrained(model_id)
        return model
    except OSError as e:
        raise ModelLoadError(f"Failed to load model {model_id}: {e}") from e

# Avoid: Generic exceptions
def load_model(model_id: str) -> Model:
    try:
        model = AutoModel.from_pretrained(model_id)
        return model
    except Exception as e:
        raise Exception("Model load failed") from e
```

## Documentation Standards

### TSDoc for TypeScript

Use TSDoc comments for all exported functions, classes, interfaces, and React components. Include description, parameters, return value, and examples.

```typescript
/**
 * Creates a new annotation linked to an entity.
 *
 * @param videoId - ID of the video being annotated
 * @param entityId - ID of the entity to link
 * @param bounds - Bounding box coordinates
 * @returns The created annotation
 *
 * @example
 * ```typescript
 * const annotation = createAnnotation('video-1', 'entity-2', {
 *   x: 100, y: 100, width: 200, height: 200
 * });
 * ```
 */
export function createAnnotation(
  videoId: string,
  entityId: string,
  bounds: BoundingBox
): Annotation {
  // Implementation
}
```

### Comment Style

Write comments that explain why, not what. Code should be self-documenting for the what. Use comments to explain non-obvious decisions, workarounds, or business logic.

```typescript
// Good: Explains why
// Use exponential backoff to avoid overwhelming the API during retries
const retryDelay = Math.pow(2, attemptCount) * 1000;

// Avoid: States the obvious
// Multiply 2 to the power of attemptCount and multiply by 1000
const retryDelay = Math.pow(2, attemptCount) * 1000;
```

## File Organization

Keep related code together. Group files by feature rather than by type. Each module should have a clear, single responsibility. Avoid circular dependencies by organizing code in layers with clear dependency direction.

Frontend component organization:

```
src/components/
├── annotation/          # Annotation-specific components
│   ├── BoundingBox.tsx
│   ├── Timeline.tsx
│   └── index.ts        # Re-exports
├── world/              # World object components
│   ├── EntityEditor.tsx
│   ├── EventEditor.tsx
│   └── index.ts
└── shared/             # Shared components
    ├── Button.tsx
    ├── Dialog.tsx
    └── index.ts
```

Backend route organization:

```
src/routes/
├── videos.ts           # Video CRUD routes
├── annotations.ts      # Annotation routes
├── ontology.ts         # Ontology routes
└── export.ts           # Export/import routes
```

## Linting and Formatting Tools

Run linting and formatting before committing code. Configure your editor to run formatters on save for immediate feedback.

VS Code settings for auto-formatting:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

## Next Steps

- [Frontend Development](./frontend-dev.md)
- [Backend Development](./backend-dev.md)
- [Python Development](./python-dev.md)
- [Testing Guide](./testing.md)
- [Contributing Guide](./contributing.md)
