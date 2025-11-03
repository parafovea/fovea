# Smoke Tests

Smoke tests are the **critical path tests** that verify core functionality.

## Criteria for Smoke Tests

- ✅ Tests critical user journeys only
- ✅ Fast execution (< 3 minutes total)
- ✅ 100% reliable (retries: 2)
- ✅ Run on every commit
- ✅ Fail fast (stop on first failure)
- ✅ Independent (can run in any order)

## When to Add a Smoke Test

Only add a test if:
1. It tests a critical path (e.g., login, create annotation, save)
2. If it fails, the application is fundamentally broken
3. It can run in < 20 seconds
4. It has zero dependencies on other tests

## Current Smoke Tests (10)

1. Application loads and shows video browser
2. Navigate to video and load annotation workspace
3. Create simple bounding box annotation
4. Add keyframe with K shortcut
5. Save annotation successfully
6. Toggle timeline with T shortcut
7. Play and pause video with Space
8. Seek frames with arrow keys
9. Export annotations
10. Import annotations

**Note:** Comprehensive keyboard shortcut testing (35 tests) is in the `functional` test project. Smoke tests only verify critical shortcuts work in happy path scenarios.

## Running Smoke Tests

```bash
# Run all smoke tests
npm run test:e2e:smoke

# Run with UI mode
npm run test:e2e:smoke -- --ui

# Run in debug mode
npm run test:e2e:smoke -- --debug

# Run specific test
npm run test:e2e:smoke -- -g "loads application"
```

## Adding New Smoke Tests

Before adding a new smoke test, ask yourself:

1. **Is this truly critical?** Would the entire application be unusable if this fails?
2. **Is it fast enough?** Can it complete in < 20 seconds?
3. **Is it reliable?** Does it pass 100% of the time without flakiness?
4. **Is it independent?** Does it work without depending on other tests?

If you answered "yes" to all four questions, then add it to `critical-path.spec.ts`.

## Smoke Test Maintenance

- Review smoke tests monthly
- Remove tests that become flaky
- Keep total runtime under 3 minutes
- Aim for 10-15 tests maximum
- Update this README when tests change
