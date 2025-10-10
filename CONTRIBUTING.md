# Contributing to FOVEA

Thank you for your interest in contributing to FOVEA (Flexible Ontology Visual Event Analyzer). We welcome contributions of all kinds: bug reports, documentation improvements, feature requests, code contributions, and more.

This guide will help you understand our development process and how to make effective contributions.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to Contribute](#ways-to-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project adheres to a code of professional conduct. By participating, you are expected to:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

## Ways to Contribute

### Bug Reports

Found a bug? Help us fix it by:

1. Checking if the bug has already been reported in [GitHub Issues](https://github.com/parafovea/fovea/issues)
2. If not, [create a new issue](https://github.com/parafovea/fovea/issues/new/choose) using the bug report template
3. Provide detailed information to help us reproduce and fix the issue

**Good bug reports include:**
- Clear, descriptive title
- Detailed steps to reproduce
- Expected vs. actual behavior
- Screenshots or videos (especially for UI issues)
- Environment details (OS, browser, Docker version, etc.)
- Relevant logs or error messages

### Feature Requests

Have an idea for a new feature? We'd love to hear it:

1. Check [existing feature requests](https://github.com/parafovea/fovea/labels/enhancement) to avoid duplicates
2. Create a new issue using the feature request template
3. Describe the problem you're trying to solve, not just the solution
4. Explain your use case and why existing features don't meet your needs

### Documentation Improvements

Documentation is crucial for helping users and contributors. You can help by:

- Fixing typos or clarifying confusing sections
- Adding examples or tutorials
- Improving API documentation
- Translating documentation
- Creating videos or blog posts

Documentation changes follow the same pull request process as code changes.

### Code Contributions

Ready to write code? Great! See the sections below for our development workflow and coding standards.

## Getting Started

### Prerequisites

Before contributing, ensure you have:

- **Node.js 22 LTS** or later
- **Python 3.12** or later
- **Docker** and **Docker Compose** (for full stack development)
- **PostgreSQL 16** (if running locally without Docker)
- **Redis 7** (if running locally without Docker)
- **Git** for version control

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/fovea.git
   cd fovea
   ```

3. **Add the upstream remote** to sync with the main repository:
   ```bash
   git remote add upstream https://github.com/parafovea/fovea.git
   ```

4. **Install dependencies** for each component:

   ```bash
   # Frontend
   cd annotation-tool
   npm install

   # Backend
   cd ../server
   npm install
   npx prisma generate

   # Model service
   cd ../model-service
   pip install -e ".[dev]"
   ```

5. **Set up environment variables**:
   - Copy `.env.example` files to `.env` in each service directory
   - Adjust values as needed for your local setup

6. **Start services**:
   ```bash
   # Option 1: Docker Compose (recommended for full stack)
   docker compose up

   # Option 2: Run services individually
   # Terminal 1: Infrastructure
   docker compose up postgres redis

   # Terminal 2: Backend
   cd server
   npm run dev

   # Terminal 3: Frontend
   cd annotation-tool
   npm run dev

   # Terminal 4: Model service (optional)
   cd model-service
   uvicorn src.main:app --reload --port 8000
   ```

7. **Verify your setup** by running tests:
   ```bash
   # Frontend tests
   cd annotation-tool
   npm run test

   # Backend tests
   cd server
   npm run test

   # Model service tests
   cd model-service
   pytest
   ```

For detailed setup instructions, see the [Manual Setup Guide](docs/docs/getting-started/manual-setup.md).

## Development Workflow

### Creating a Branch

Create a new branch for each feature or bug fix:

```bash
git checkout -b feature/description-of-feature
# or
git checkout -b fix/description-of-bug
```

**Branch naming conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding or improving tests
- `chore/` - Maintenance tasks

### Making Changes

1. **Keep changes focused**: Each branch should address a single issue or feature
2. **Write clear commit messages**: Follow the [Commit Message Guidelines](#commit-message-guidelines)
3. **Test your changes**: Run relevant tests before committing
4. **Lint your code**: Fix any linting errors

### Commit Message Guidelines

Good commit messages help maintain a clear project history. Follow these conventions:

**Format:**
```
<type>: <subject>

<body>

<footer>
```

**Type:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, missing semicolons, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements

**Subject:**
- Use imperative mood ("Add feature" not "Added feature")
- Keep under 50 characters
- Don't end with a period
- Capitalize first letter

**Body (optional):**
- Explain what and why, not how
- Wrap at 72 characters
- Separate from subject with a blank line

**Footer (optional):**
- Reference issues: `Fixes #123` or `Relates to #456`
- Note breaking changes: `BREAKING CHANGE: description`

**Examples:**
```
feat: Add keyframe interpolation for bounding box sequences

Implements linear and bezier interpolation modes for smooth animation
of bounding boxes between manually defined keyframes. This reduces
annotation time for object tracking workflows.

Fixes #234
```

```
fix: Correct bounding box rendering for negative coordinates

Bounding boxes with negative x or y values were not rendering correctly
in the canvas overlay. This fix ensures proper rendering and editing
for boxes that extend beyond the video frame.

Fixes #456
```

### Keeping Your Branch Updated

Regularly sync your branch with the upstream main branch:

```bash
git fetch upstream
git rebase upstream/main
```

If conflicts arise, resolve them locally and continue the rebase:

```bash
# After resolving conflicts
git add <resolved-files>
git rebase --continue
```

## Pull Request Process

### Before Opening a PR

1. **Ensure all tests pass**:
   ```bash
   # Run all test suites
   cd annotation-tool && npm run test && npm run test:e2e
   cd server && npm run test
   cd model-service && pytest
   ```

2. **Check code quality**:
   ```bash
   # Frontend
   cd annotation-tool
   npm run lint
   npm run type-check

   # Backend
   cd server
   npm run lint

   # Model service
   cd model-service
   ruff check .
   mypy src/
   ```

3. **Update documentation** if you've changed APIs or added features

4. **Add tests** for new features or bug fixes

### Opening a PR

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Go to the [main repository](https://github.com/parafovea/fovea) and click "New Pull Request"

3. Fill out the PR template completely:
   - Provide a clear description of changes
   - Explain the motivation and context
   - List any breaking changes
   - Include screenshots for UI changes
   - Reference related issues

4. Submit the PR and wait for CI checks to complete

### PR Review Process

1. **Automated checks** run on every PR:
   - Linting and type checking
   - Unit tests
   - E2E tests (frontend)
   - Code coverage reports

2. **Code review** by maintainers:
   - Reviews typically happen within 2-3 business days
   - Reviewers may request changes or ask questions
   - Address feedback by pushing new commits to your branch

3. **Approval and merge**:
   - All checks must pass
   - At least one maintainer approval required
   - Maintainers will merge when ready

### After Your PR is Merged

1. Pull the latest changes from upstream:
   ```bash
   git checkout main
   git pull upstream main
   ```

2. Delete your feature branch:
   ```bash
   git branch -d feature/your-feature-name
   git push origin --delete feature/your-feature-name
   ```

3. Celebrate! You've successfully contributed to FOVEA.

## Coding Standards

### TypeScript (Frontend & Backend)

- **Style**: Follow the project's ESLint and Prettier configuration
- **Types**: Use strict TypeScript, avoid `any` when possible
- **Imports**: Use `.js` extensions in import paths (ESM requirement)
- **Components**: Use functional components with hooks
- **State**: Use Redux Toolkit for global state, local state for component-specific data
- **Documentation**: Use TSDoc comments for exported functions and components

**Example:**
```typescript
/**
 * Interpolates a bounding box position between two keyframes.
 *
 * @param startBox - The starting keyframe bounding box
 * @param endBox - The ending keyframe bounding box
 * @param progress - Interpolation progress (0 to 1)
 * @param mode - Interpolation mode (linear, bezier, etc.)
 * @returns The interpolated bounding box
 */
export function interpolateBoundingBox(
  startBox: BoundingBox,
  endBox: BoundingBox,
  progress: number,
  mode: InterpolationMode = 'linear'
): BoundingBox {
  // Implementation
}
```

### Python (Model Service)

- **Style**: Follow PEP 8, enforced by Ruff
- **Type hints**: Use type hints for all function signatures
- **Docstrings**: Use Google-style docstrings
- **Imports**: Organize imports (standard library, third-party, local)
- **Error handling**: Use specific exception types, avoid bare `except`

**Example:**
```python
def interpolate_boxes(
    start_box: BoundingBox,
    end_box: BoundingBox,
    progress: float,
    mode: InterpolationMode = InterpolationMode.LINEAR
) -> BoundingBox:
    """Interpolates a bounding box position between two keyframes.

    Args:
        start_box: The starting keyframe bounding box.
        end_box: The ending keyframe bounding box.
        progress: Interpolation progress (0 to 1).
        mode: Interpolation mode. Defaults to LINEAR.

    Returns:
        The interpolated bounding box.

    Raises:
        ValueError: If progress is not between 0 and 1.
    """
    # Implementation
```

### Documentation Standards

Follow the [Documentation Standards](DOCUMENTATION_STANDARDS.md) when writing or updating documentation:

- Use factual language (avoid marketing terms like "robust", "comprehensive")
- No em-dashes in documentation or code comments
- Never reference previous versions or refactorings
- Include examples where helpful
- Keep documentation close to the code it describes

## Testing Requirements

### Frontend Tests

**Unit Tests (Vitest + Testing Library):**
- Test component behavior, not implementation
- Mock external dependencies (API calls, Redux store)
- Aim for 80%+ code coverage

**E2E Tests (Playwright):**
- Test complete user workflows
- Focus on critical paths
- Run locally before opening PR

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineComponent } from './TimelineComponent';

describe('TimelineComponent', () => {
  it('displays keyframes at correct positions', () => {
    const keyframes = [
      { frame: 0, box: { x: 0, y: 0, width: 100, height: 100 } },
      { frame: 10, box: { x: 50, y: 50, width: 100, height: 100 } }
    ];

    render(<TimelineComponent keyframes={keyframes} />);

    // Assertions
  });
});
```

### Backend Tests

**Unit Tests (Vitest):**
- Test service logic and API routes
- Use in-memory database for tests
- Mock external services

**Example:**
```typescript
import { describe, it, expect } from 'vitest';
import { exportAnnotations } from '../services/export-handler';

describe('exportAnnotations', () => {
  it('exports annotations in JSON Lines format', async () => {
    const annotations = [/* test data */];
    const result = await exportAnnotations(annotations, { format: 'jsonl' });

    expect(result.format).toBe('jsonl');
    expect(result.lines).toHaveLength(annotations.length);
  });
});
```

### Model Service Tests

**Unit Tests (pytest):**
- Test inference pipelines
- Mock model loading for faster tests
- Test error handling and edge cases

**Example:**
```python
import pytest
from src.tracking_loader import load_tracking_model

def test_load_tracking_model():
    """Test that tracking model loads successfully."""
    model = load_tracking_model('bytetrack', device='cpu')
    assert model is not None
    assert hasattr(model, 'track')

@pytest.mark.asyncio
async def test_track_objects_invalid_video():
    """Test tracking with invalid video path."""
    with pytest.raises(ValueError):
        await track_objects('/nonexistent/video.mp4', model='bytetrack')
```

### Coverage Requirements

- Minimum 80% code coverage for all services
- 100% coverage for critical paths (authentication, data persistence, etc.)
- Coverage reports generated automatically in CI

## Documentation

### What to Document

- **Public APIs**: All exported functions, classes, and types
- **Components**: Props, behavior, and usage examples
- **Complex logic**: Explain the "why" behind non-obvious code
- **Configuration**: Document all environment variables and config options
- **User guides**: Step-by-step instructions for common tasks

### Where to Document

- **Code**: TSDoc/docstrings for inline documentation
- **User guides**: `docs/docs/user-guides/`
- **API reference**: `docs/docs/api-reference/`
- **Development**: `docs/docs/development/`
- **README**: High-level project overview only

### Generating API Documentation

API documentation is auto-generated from code comments:

```bash
# Generate all API docs
cd docs
./scripts/generate-api-docs.sh

# Generate frontend docs only
cd annotation-tool
npm run docs

# Generate backend docs only
cd server
npm run docs

# Generate model service docs only
cd model-service
make html -C docs
```

## Community

### Getting Help

- **Documentation**: Check the [docs](https://fovea.video/docs) first
- **GitHub Discussions**: For questions and general discussion
- **GitHub Issues**: For bug reports and feature requests
- **Code Review**: Ask questions in pull requests

### Communication Guidelines

- Be respectful and constructive
- Provide context when asking questions
- Show what you've tried before asking
- Share solutions when you find them
- Help others when you can

### Recognition

All contributors are recognized in:
- Git commit history
- Release notes (for significant contributions)
- Project documentation

We deeply appreciate every contribution, no matter how small.

## License

By contributing to FOVEA, you agree that your contributions will be licensed under the [MIT License](LICENSE). Ensure you have the right to contribute the code and that it doesn't violate any third-party licenses or copyrights.

## Questions?

If you have questions not covered in this guide:

1. Check the [documentation](docs/)
2. Search [existing issues](https://github.com/parafovea/fovea/issues)
3. Ask in [GitHub Discussions](https://github.com/parafovea/fovea/discussions)
4. Open a new issue with your question

Thank you for contributing to FOVEA!
