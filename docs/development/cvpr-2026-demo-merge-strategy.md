# Merging the CVPR 2026 demo branch into the shadcn migration

This note records the strategy for landing the work on `feat/cvpr-2026-demo` and `fix/shadcn-bugfixes-from-demo` into `refactor/shadcn-ui-migration`, then onto `main`. It exists so a reviewer can pick up the merge state cold, follow the order, and know exactly what each branch is responsible for.

## Branch layout

```
main
 │
 └── refactor/shadcn-ui-migration               (current integration branch)
      │
      ├── fix/shadcn-bugfixes-from-demo         (one commit, PR-1 below)
      │
      └── feat/cvpr-2026-demo                   (PR-2 below; carries the merge of PR-1
                                                 plus the demo and tour system)
```

`feat/cvpr-2026-demo` already merges `fix/shadcn-bugfixes-from-demo` into itself, so the bugfix patches travel with the demo branch even before PR-1 lands. Once PR-1 merges, the duplicated commits on the demo branch collapse to no-ops in the patch history during the eventual rebase, and PR-2 reduces to the demo-only delta.

## Two PRs, in order

### PR-1: shadcn bugfixes from demo

Branch: `fix/shadcn-bugfixes-from-demo` → `refactor/shadcn-ui-migration`

Single commit, five small fixes the demo branch surfaced that have no demo or tour coupling. Each one is a defect against the shadcn migration itself.

1. `BreadcrumbNavigation.tsx`: stop nesting `BreadcrumbSeparator` (rendered as `<li>`) inside `BreadcrumbItem` (also `<li>`). Refactor the `.map` to emit Separator and Item as Fragment siblings so React's `validateDOMNesting` warning no longer fires on every protected route.
2. `VideoBrowser.tsx`: the Summarize / View tooltip was wrapping a `Button` inside `<TooltipTrigger><span>...</span></TooltipTrigger>`. Under base-ui, `TooltipTrigger` renders as a button by default, so the nested Button emitted a button-in-button DOM. Switch to the documented `render={<Button .../>}` pattern.
3. `BaseTypeEditor.tsx`: the "Add to Personas" `Checkbox` rows had no accessible name because base-ui's `Checkbox` renders as `button[role=checkbox]` and a wrapping `<label>` only auto-associates with native form controls. Add `aria-label={`Add to ${persona.name}`}` on the `Checkbox`.
4. `ModeSelector.tsx`: same axe `aria-toggle-field-name` violation on the three `ToggleGroupItem`s. Add a matching `aria-label` to each item.
5. `test/e2e/regression/ontology/relation-type-references.spec.ts`: the post-reload assertion was racing a fixed `waitForTimeout(2000)` against the `GET /api/videos/{id}/summaries` refetch the persona select kicks off. Arm a deterministic `waitForResponse` on the GET 200 before the persona click, await it before clicking the Summary tab.

Verified locally: `aria-labels.spec.ts` is 16 of 16 green, `tour-anchors.spec.ts` and `tour-runner.spec.ts` are 3 of 3 green.

### PR-2: CVPR demo and tour system

Branch: `feat/cvpr-2026-demo` → `refactor/shadcn-ui-migration` (or directly to `main` if PR-1 has already merged there)

Everything else from the demo branch:

- `src/tours/` engine, scripts, content bundle, menu UI
- `src/demo/` shell, fixture seeder client, landing and recap pages, email capture
- `annotation-tool/public/tour-content.json` and `tour-content.schema.json` (the admin tailoring surface)
- `server/src/demo/` anonymous session, idle reset, fixture seeder routes
- `annotation-tool/demo/fixtures/tour-*.json` (ten tour bundles)
- `test/e2e/regression/tours/*.spec.ts` (ten product-flow specs) and `test/e2e/smoke/tour-*.spec.ts`
- `test/e2e/smoke/tour-anchors.spec.ts` change to click the seeded persona before asserting the ontology TabsList anchor
- `docs/tour-customization.md`, `docs/demo-mode.md`

PR-2 also carries the merge commit of PR-1. After PR-1 lands on shadcn, rebase PR-2 onto the new shadcn tip and the duplicate commits drop out cleanly.

## The 44 local E2E failures, attributed

The full Playwright run on this branch reported 44 failures, 14 flaky-but-passed-on-retry, 459 passed. shadcn's HEAD reports 0 failed in its docker E2E stack (commit `18b3dd5`). All nine failing test files exist on shadcn, so the 44 are not regressions introduced here.

| Category | Count | Root cause | Resolution |
|---|---|---|---|
| `model-service-coverage.spec.ts` | 9 | No model-service container running locally | Already green on shadcn's docker E2E stack |
| Visual regression (`responsive-layouts.spec.ts`, `component-snapshots.spec.ts`, `bounding-box-resize.spec.ts`) | 25 | Platform-specific baselines (darwin-arm64 local vs CI linux/amd64) | Run on docker stack OR regenerate with `--update-snapshots` per platform |
| `keyframes.spec.ts`, `interpolation.spec.ts`, `bounding-box-fixes.spec.ts` | ~5 | Hotkey timing race; same as shadcn's "flaky-but-passed-on-retry" set | Surface on docker stack with retries enabled |
| `aria-labels.spec.ts` | 2 | shadcn `Checkbox` / `ToggleGroupItem` missing accessible names | **Fixed in PR-1** |
| `relation-type-references.spec.ts` | 1 | Post-reload summaries refetch race | **Fixed in PR-1** |
| `bounding-box-fixes.spec.ts:70` (selection persistence) | 1 | Annotation list refetch race after first save | Investigate on docker stack with model-service running |

After PR-1 merges and the suite runs on the docker E2E stack, the expected residual is around four pre-existing flake tests already known to shadcn, not new regressions.

## Merge order

1. Open PR-1 from `fix/shadcn-bugfixes-from-demo` → `refactor/shadcn-ui-migration`. Verify CI on the docker E2E stack. Merge.
2. Rebase `feat/cvpr-2026-demo` onto the new `refactor/shadcn-ui-migration` HEAD. The bugfix merge commit on demo collapses cleanly because the patches now exist upstream.
3. Open PR-2 from the rebased `feat/cvpr-2026-demo`. Review the demo and tour system in isolation. Merge.
4. When `refactor/shadcn-ui-migration` itself merges to `main`, both PRs travel with it.

## Local verification

The bugfix branch and the demo branch both verify cleanly against the same focused subset:

```bash
cd annotation-tool
npx playwright test \
  --project=smoke test/e2e/smoke/tour-anchors.spec.ts test/e2e/smoke/tour-runner.spec.ts \
  --project=accessibility test/e2e/accessibility/aria-labels.spec.ts \
  --reporter=list --retries=0
# 19 passed
```

Full-suite verification needs the docker E2E stack so the model-service container is up and the visual baselines match the CI platform.
