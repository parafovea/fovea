---
title: Contributing Guide
---

# Contributing Guide

Thank you for contributing to FOVEA. This guide explains the development workflow, code review process, and quality standards. Following these guidelines helps maintain code quality and makes collaboration smoother for everyone.

## Getting Started

Before contributing, familiarize yourself with the project architecture and development environment. Read the documentation in the Getting Started section and set up your local development environment following the manual setup guide. Run the test suite to verify your environment works correctly.

Fork the repository on GitHub and clone your fork locally. Add the upstream repository as a remote to keep your fork synchronized with the main repository.

```bash
git clone https://github.com/your-username/fovea.git
cd fovea
git remote add upstream https://github.com/original-owner/fovea.git
```

## Development Workflow

Create a new branch for each feature or bug fix. Branch names should be descriptive and follow the pattern `feature/description` or `fix/description`. Keep branches focused on a single change to simplify code review.

```bash
git checkout -b feature/add-tracking-decimation
```

Make changes in small, logical commits. Each commit should represent a single logical change and include a clear commit message. Write commit messages in imperative mood describing what the commit does, not what you did.

```bash
# Good commit messages
git commit -m "Add decimation parameter to tracking API"
git commit -m "Fix bounding box interpolation for negative coordinates"
git commit -m "Update documentation for keyframe workflow"

# Avoid
git commit -m "Updated files"
git commit -m "WIP"
git commit -m "Fixed bug"
```

Run tests and linting before committing to catch issues early. The CI system runs these checks automatically, but running them locally saves time in the review process.

```bash
# Frontend
cd annotation-tool
npm run lint
npm run type-check
npm run test

# Backend
cd server
npm run lint
npm run test

# Model service
cd model-service
ruff check .
mypy src/
pytest
```

## Pull Request Process

Push your branch to your fork and open a pull request against the main repository. Provide a clear description of the changes, the motivation for the changes, and any relevant context. Reference related issues using GitHub's issue linking syntax.

Pull request template:

```markdown
## Description
Brief description of what this PR does and why.

## Changes
- Specific change 1
- Specific change 2
- Specific change 3

## Testing
How the changes were tested. Include commands or steps to reproduce.

## Related Issues
Fixes #123
Related to #456
```

The continuous integration system runs automated checks on every pull request. All checks must pass before the PR can be merged. These checks include linting, type checking, unit tests, and end-to-end tests for the frontend.

Address review feedback by pushing additional commits to the same branch. Once feedback is addressed, respond to comments to let reviewers know the changes are ready for another look. When all feedback is resolved and checks pass, a maintainer will merge the pull request.

## Code Review Guidelines

Code reviews help maintain code quality and share knowledge across the team. When reviewing code, focus on correctness, readability, and maintainability. Ask questions when you don't understand something rather than assuming the code is wrong.

Check that the code follows the style guide and project conventions. Verify that tests cover the new functionality or bug fix. Look for potential edge cases or error conditions that might not be handled. Consider whether the code is documented sufficiently for future maintainers.

When receiving code review feedback, treat it as a learning opportunity. Reviewers are trying to help improve the code, not criticize you personally. Ask for clarification if feedback is unclear. If you disagree with feedback, discuss it respectfully and be open to different perspectives.

## Testing Requirements

All new features require tests. Bug fixes should include a test that fails without the fix and passes with it. Maintain or improve code coverage with each change. The project targets minimum 80% coverage across all services.

Write tests that verify behavior, not implementation details. Test the public API rather than internal functions when possible. Include both happy path tests and error cases. Use descriptive test names that explain what behavior is being verified.

End-to-end tests should cover complete user workflows from the frontend. Add E2E tests for any user-visible features or changes to existing workflows. Run E2E tests locally before opening a pull request to catch issues early.

## Documentation Requirements

Update documentation when adding or changing features. This includes API documentation, user guides, and code comments. Documentation should be clear, accurate, and follow the documentation standards defined in DOCUMENTATION_STANDARDS.md.

Use TSDoc comments for TypeScript code and Google-style docstrings for Python code. Include examples in documentation when they help clarify usage. Keep documentation close to the code it describes to make updates easier.

Update the changelog with a brief description of user-visible changes. The changelog helps users understand what changed between versions and whether they need to take any action when upgrading.

## Issue Reporting

Report bugs using the GitHub issue tracker. Provide enough information for others to reproduce the problem. Include the version you're using, steps to reproduce, expected behavior, actual behavior, and any error messages or logs.

Bug report template:

```markdown
## Description
Clear description of the bug

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- FOVEA version:
- Browser (if applicable):
- Operating system:
- Docker version (if applicable):

## Additional Context
Any other relevant information, logs, screenshots, etc.
```

For feature requests, describe the problem you're trying to solve rather than jumping to a specific solution. Explain the use case and why existing functionality doesn't meet your needs. This helps maintainers understand the motivation and potentially suggest alternative solutions.

## Commit Message Guidelines

Good commit messages help others understand the history of the project. The first line should be a concise summary of the change in 50 characters or less. Use imperative mood as if completing the sentence "This commit will...".

If more explanation is needed, add a blank line after the summary and provide details in the body. Explain why the change was made, not just what changed. The diff shows what changed, but only you know why.

```
Add support for tracking decimation

Decimation reduces the number of keyframes generated by tracking by
keeping only every Nth frame. This significantly reduces annotation
file size for long videos while preserving tracking accuracy.

The decimation parameter is optional and defaults to 1 (no decimation).
```

## Branch Management

Keep your branches synchronized with the upstream repository to minimize merge conflicts. Pull updates from upstream regularly and rebase your branch on top of the latest changes.

```bash
git fetch upstream
git rebase upstream/main
```

Delete branches after they're merged to keep the repository tidy. GitHub provides a button to delete branches automatically after merge.

## Code Style and Linting

Follow the code style guide for TypeScript and Python. Use the automated formatting tools to ensure consistent style. Configure your editor to run formatters on save for immediate feedback.

ESLint and Prettier handle formatting for TypeScript code. Ruff handles formatting and linting for Python code. These tools are configured in the repository and run automatically in CI.

Fix linting errors before committing. If you believe a linting rule should be changed, discuss it in an issue first rather than disabling the rule in your code. Linting rules exist for a reason, and changing them affects the entire codebase.

## Communication

Discussion about specific changes happens in pull requests and issues. For broader discussions or questions, use GitHub Discussions. Keep discussions focused and respectful.

When asking questions, provide context and show what you've tried. This helps others understand your situation and provide better answers. If you find a solution, share it so others can benefit.

## License

By contributing to FOVEA, you agree that your contributions will be licensed under the same license as the project. Make sure you have the right to contribute the code and that it doesn't violate any third-party licenses or copyrights.

## Recognition

Contributors are recognized in the project documentation and commit history. Significant contributions may be acknowledged in release notes. We appreciate all contributions, whether they're code, documentation, bug reports, or helping other users.

## Getting Help

If you're stuck or have questions, ask for help. Open an issue with your question or use GitHub Discussions for broader topics. The community is here to help, and asking questions helps improve the documentation for future contributors.

Review the existing documentation, code, and issues before asking questions. Often someone has asked a similar question before. If you find the answer elsewhere, consider improving the documentation so the next person finds it more easily.

## Next Steps

- [Frontend Development](./frontend-dev.md)
- [Backend Development](./backend-dev.md)
- [Python Development](./python-dev.md)
- [Testing Guide](./testing.md)
- [Code Style Guide](./code-style.md)
