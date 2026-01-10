---
title: Frontend Development
---

# Frontend Development

The frontend provides the annotation interface for video analysis and ontology management. Built with React 18, TypeScript 5.3+, and Vite 5, it uses TanStack Query for server state, Zustand for UI state, and Material-UI v5 for components.

## Development Modes

FOVEA supports two development workflows. Choose the one that best fits your needs:

### Host-Based Development

Run services directly on your machine. Best for rapid iteration and debugging individual services.

**When to use:**
- Debugging frontend code with browser DevTools
- Making frequent code changes with instant feedback
- Running individual services in isolation

**Setup:**
1. Start backend: `cd server && npm run dev`
2. Start frontend: `cd annotation-tool && npm run dev`
3. Frontend available at `http://localhost:5173`

### Docker-Based Development

Run all services in containers with hot-reload. Best for testing the full stack.

**When to use:**
- Testing service integration
- Reproducing production-like environments
- Working with all services simultaneously

**Setup:**
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Frontend available at `http://localhost:3000` with:
- Hot-reload for source code changes
- Jaeger tracing at `http://localhost:16686`
- Maildev for email testing at `http://localhost:1080`

See [Docker Commands Reference](../reference/docker-commands.md) for more details.

## Development Environment (Host-Based)

This section describes host-based development where services run directly on your machine.

### Prerequisites

- Node.js 22 LTS
- Backend API running at `http://localhost:3001`

### Initial Setup

```bash
cd annotation-tool
npm install
```

### Start Development Server

```bash
npm run dev
```

Frontend starts at `http://localhost:5173` with hot module replacement.

## Project Structure

```
annotation-tool/
├── src/
│   ├── main.tsx            # Entry point
│   ├── App.tsx             # Root component
│   ├── components/         # React components
│   │   ├── workspaces/     # Ontology and Object workspaces
│   │   ├── annotation/     # Annotation tools
│   │   ├── world/          # World object editors
│   │   └── shared/         # Reusable components
│   ├── store/              # State management
│   │   ├── queries/        # TanStack Query hooks (server state)
│   │   │   ├── index.ts
│   │   │   ├── useVideos.ts
│   │   │   ├── useAnnotations.ts
│   │   │   ├── usePersonas.ts
│   │   │   ├── useWorld.ts
│   │   │   └── useClaims.ts
│   │   └── zustand/        # Zustand stores (UI state)
│   │       ├── annotationUiStore.ts
│   │       ├── dialogStore.ts
│   │       ├── videoUiStore.ts
│   │       └── authStore.ts
│   ├── hooks/              # Custom hooks
│   │   ├── useCommands.ts
│   │   └── useDetection.ts
│   ├── services/           # API client
│   │   └── api.ts
│   └── models/             # TypeScript types
├── test/                   # Test files
│   ├── components/
│   ├── hooks/
│   └── integration/
└── vite.config.ts          # Vite configuration
```

## Running the Frontend

### Development Mode

```bash
npm run dev
```

### Production Build

```bash
npm run build       # Build to dist/
npm run preview     # Preview production build
```

### Testing

```bash
npm run test                # Unit tests
npm run test:ui             # Test UI
npm run test:coverage       # Coverage report
npm run test:e2e            # E2E tests
npm run test:e2e:ui         # E2E UI mode
```

### Type Checking

```bash
npm run type-check          # TypeScript checks without emit
```

### Linting

```bash
npm run lint                # ESLint check
```

## Adding New Components

### Step 1: Create Component

Create `src/components/MyComponent.tsx`:

```typescript
import { FC } from 'react';
import { Box, Typography } from '@mui/material';

interface MyComponentProps {
  title: string;
  onAction?: () => void;
}

/**
 * @component MyComponent
 * @description Displays title and triggers action
 */
export const MyComponent: FC<MyComponentProps> = ({ title, onAction }) => {
  return (
    <Box>
      <Typography variant="h5">{title}</Typography>
      <button onClick={onAction}>Click Me</button>
    </Box>
  );
};
```

### Step 2: Add Tests

Create `test/unit/MyComponent.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MyComponent } from '../../src/components/MyComponent';

describe('MyComponent', () => {
  it('renders title', () => {
    render(<MyComponent title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('calls onAction when button clicked', () => {
    const handleAction = vi.fn();
    render(<MyComponent title="Test" onAction={handleAction} />);

    fireEvent.click(screen.getByText('Click Me'));
    expect(handleAction).toHaveBeenCalledOnce();
  });
});
```

## State Management

FOVEA uses a two-layer state management strategy:

| State Type | Solution | Use Case |
|------------|----------|----------|
| **Server State** | TanStack Query | Data from API (caching, refetching) |
| **UI State** | Zustand | Ephemeral, local UI interactions |

### Server State with TanStack Query

For data from the API (videos, annotations, personas, etc.), use TanStack Query hooks in `src/store/queries/`.

**Using existing hooks:**

```typescript
import { useVideos, useAnnotations, usePersonas } from '../store/queries';

export const MyComponent = () => {
  const { data: videos, isLoading } = useVideos();
  const { data: annotations } = useAnnotations(videoId);
  const { data: personas } = usePersonas();

  if (isLoading) return <Loading />;
  return <VideoList videos={videos} />;
};
```

### UI State with Zustand

For UI-only state (drawing mode, selections, dialog state), use Zustand stores in `src/store/zustand/`.

**Using existing stores:**

```typescript
import { useAnnotationUiStore } from '../store/zustand/annotationUiStore';
import { useDialog } from '../store/zustand/dialogStore';

export const MyComponent = () => {
  // Select only the state you need (prevents unnecessary re-renders)
  const isDrawing = useAnnotationUiStore(state => state.isDrawing);
  const setIsDrawing = useAnnotationUiStore(state => state.setIsDrawing);

  // Dialog management
  const exportDialog = useDialog('export');

  return (
    <>
      <button onClick={() => setIsDrawing(true)}>Start Drawing</button>
      <button onClick={exportDialog.openDialog}>Export</button>
    </>
  );
};
```

See `src/store/zustand/README.md` for detailed documentation.

## API Integration with TanStack Query

### Define API Hook

Create `src/hooks/useMyData.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function useMyData() {
  return useQuery({
    queryKey: ['my-data'],
    queryFn: async () => {
      const response = await api.get('/api/my-data');
      return response.data;
    }
  });
}

export function useCreateMyItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await api.post('/api/my-data', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-data'] });
    }
  });
}
```

### Use in Component

```typescript
import { useMyData, useCreateMyItem } from '../hooks/useMyData';

export const MyDataComponent = () => {
  const { data, isLoading, error } = useMyData();
  const createMutation = useCreateMyItem();

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <ul>
        {data.map(item => <li key={item.id}>{item.name}</li>)}
      </ul>
      <button onClick={() => createMutation.mutate({ name: 'New Item' })}>
        Add Item
      </button>
    </div>
  );
};
```

## Material-UI Styling

### Using Emotion

```typescript
import { styled } from '@mui/material/styles';
import { Box } from '@mui/material';

const StyledBox = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: theme.palette.action.hover
  }
}));

export const MyStyledComponent = () => {
  return (
    <StyledBox>
      <p>Styled content</p>
    </StyledBox>
  );
};
```

### Using sx Prop

```typescript
import { Box, Typography } from '@mui/material';

export const MySxComponent = () => {
  return (
    <Box
      sx={{
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 1,
        '&:hover': {
          bgcolor: 'action.hover'
        }
      }}
    >
      <Typography variant="h6">Content</Typography>
    </Box>
  );
};
```

## Custom Hooks

### Example: useVideoAnnotations

```typescript
import { useAnnotations, useCreateAnnotation, useUpdateAnnotation } from '../store/queries';

export function useVideoAnnotations(videoId: string) {
  const { data: annotations = [] } = useAnnotations(videoId);
  const createMutation = useCreateAnnotation();
  const updateMutation = useUpdateAnnotation();

  const createAnnotation = (data) => {
    createMutation.mutate({ ...data, videoId });
  };

  const updateExisting = (id, updates) => {
    updateMutation.mutate({ id, ...updates });
  };

  return {
    annotations,
    createAnnotation,
    updateExisting,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}
```

## E2E Testing with Playwright

### Example E2E Test

Create `test/e2e/annotation.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Annotation Workflow', () => {
  test('create new annotation', async ({ page }) => {
    await page.goto('http://localhost:5173');

    // Select video
    await page.click('[data-testid="video-selector"]');
    await page.click('text=example.mp4');

    // Draw bounding box
    await page.click('[data-testid="draw-mode-btn"]');
    const canvas = page.locator('canvas');
    await canvas.click({ position: { x: 100, y: 100 } });
    await canvas.click({ position: { x: 200, y: 200 } });

    // Save annotation
    await page.click('[data-testid="save-btn"]');

    // Verify
    await expect(page.locator('[data-testid="annotation-list"]'))
      .toContainText('Annotation 1');
  });
});
```

## Debugging

### React DevTools

Install React DevTools browser extension for component inspection.

### TanStack Query DevTools

TanStack Query DevTools are built into the app. Click the floating icon in the bottom-right corner to inspect query state, cache, and mutations.

### Zustand DevTools

Install Redux DevTools browser extension. Zustand stores appear as "AnnotationUiStore", "DialogStore", etc. You can inspect state and see action history.

### VS Code Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Debug Frontend",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/annotation-tool/src"
    }
  ]
}
```

## Common Development Tasks

### Add New Route

```typescript
import { createBrowserRouter } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { path: 'my-new-page', element: <MyNewPage /> }
    ]
  }
]);
```

### Add Keyboard Shortcut

```typescript
import { useEffect } from 'react';

export function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === key) {
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback]);
}
```

## Troubleshooting

### Hot Reload Not Working

Restart dev server:

```bash
npm run dev
```

### Type Errors

Run type check:

```bash
npm run type-check
```

### Build Failures

Clear cache and rebuild:

```bash
rm -rf node_modules dist .vite
npm install
npm run build
```

## Next Steps

- [Backend Development](./backend-dev.md)
- [Python Development](./python-dev.md)
- [Testing Guide](./testing.md)
- [Code Style Guide](./code-style.md)
- [Contributing Guide](./contributing.md)
