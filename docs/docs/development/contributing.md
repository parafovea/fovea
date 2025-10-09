---
title: Contributing Guide
---

# Contributing Guide

This page provides an overview of contributing to FOVEA. For the complete contributing guide with detailed instructions, see [CONTRIBUTING.md](https://github.com/aaronstevenwhite/fovea/blob/main/CONTRIBUTING.md) in the repository root.

## Quick Links

- **[Full Contributing Guide](https://github.com/aaronstevenwhite/fovea/blob/main/CONTRIBUTING.md)** - Complete guide to contributing
- **[Frontend Development](./frontend-dev.md)** - Frontend-specific development guide
- **[Backend Development](./backend-dev.md)** - Backend-specific development guide
- **[Python Development](./python-dev.md)** - Model service development guide
- **[Testing Guide](./testing.md)** - Testing standards and practices
- **[Code Style Guide](./code-style.md)** - Code formatting and style conventions

## Ways to Contribute

- **Bug Reports** - Help us identify and fix issues
- **Feature Requests** - Suggest new functionality
- **Code Contributions** - Submit bug fixes and new features
- **Documentation** - Improve guides, examples, and API docs
- **Testing** - Add test coverage and improve test quality
- **Community Support** - Help other users in discussions

## Getting Started

1. **Fork the repository** on GitHub
2. **Set up your development environment** following the [Manual Setup Guide](../getting-started/manual-setup.md)
3. **Create a branch** for your changes (e.g., `feature/my-feature` or `fix/my-bug`)
4. **Make your changes** following our coding standards
5. **Test your changes** locally
6. **Submit a pull request** using the PR template

## Development Workflow

```bash
# Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/fovea.git
cd fovea

# Add upstream remote
git remote add upstream https://github.com/aaronstevenwhite/fovea.git

# Create a branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "feat: Add my feature"

# Push to your fork
git push origin feature/my-feature

# Open a pull request on GitHub
```

## Coding Standards

### TypeScript (Frontend & Backend)

- Follow ESLint and Prettier configuration
- Use strict TypeScript (avoid `any`)
- Include `.js` extensions in import paths
- Document exports with TSDoc comments
- Write unit tests for new code

### Python (Model Service)

- Follow PEP 8 (enforced by Ruff)
- Use type hints for all functions
- Use Google-style docstrings
- Include unit tests with pytest
- Maintain 80%+ code coverage

### Documentation

- Use factual language (avoid marketing terms)
- Include examples where helpful
- Update API docs when changing interfaces
- Keep documentation close to code

## Testing Requirements

All contributions must include appropriate tests:

- **Unit tests** for new features and bug fixes
- **E2E tests** for user-facing changes (frontend)
- **Coverage** maintained at 80%+ for all services
- **All tests passing** before submitting PR

Run tests locally:

```bash
# Frontend
cd annotation-tool
npm run test
npm run test:e2e

# Backend
cd server
npm run test

# Model service
cd model-service
pytest --cov=src
```

## Pull Request Process

1. **Fill out the PR template** completely
2. **Link related issues** (e.g., "Fixes #123")
3. **Ensure CI checks pass** (linting, tests, coverage)
4. **Address review feedback** promptly
5. **Keep PR focused** on a single change

## Code Review

- Reviews typically happen within 2-3 business days
- At least one maintainer approval required
- All CI checks must pass
- Be respectful and constructive in discussions

## Community Guidelines

- Be respectful and inclusive
- Focus on the issue, not the person
- Provide constructive feedback
- Help others when you can
- Follow the code of conduct

## Questions?

- **Documentation** - Check [docs](https://fovea.video/docs) first
- **GitHub Discussions** - For questions and ideas
- **GitHub Issues** - For bug reports and feature requests

For complete details, see the [full Contributing Guide](https://github.com/aaronstevenwhite/fovea/blob/main/CONTRIBUTING.md).
