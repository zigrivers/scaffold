# Game Dev Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the game development pipeline feature by centralizing overlay resolution across all commands, adding E2E tests, CLI flags for non-interactive init, `scaffold adopt` game detection, and updating CHANGELOG/README for release.

**Architecture:** Extract overlay resolution from `run.ts` into a shared helper (`overlay-state-resolver.ts`), wire it into `status`, `next`, `rework`, and the shared eligibility helper used by `complete`/`skip`/`reset`, then layer on CLI flags, adopt detection, E2E tests, and release prep.

**Tech Stack:** TypeScript, Vitest, Zod, js-yaml, yargs

**MMR Review:** Plan reviewed by Codex CLI + Gemini CLI. All P0/P1/P2 findings integrated.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/assembly/overlay-state-resolver.ts` | Create | Centralized overlay resolution helper |
| `src/core/assembly/overlay-state-resolver.test.ts` | Create | Tests for centralized resolver |
| `src/cli/commands/run.ts` | Modify | Refactor to use centralized helper |
| `src/cli/commands/status.ts` | Modify | Add overlay awareness + fix `?? true` fallback |
| `src/cli/commands/next.ts` | Modify | Add overlay awareness + fix `?? true` fallback |
| `src/cli/commands/rework.ts` | Modify | Add overlay awareness |
| `src/cli/commands/complete.ts` | Modify | Pass overlay-aware eligibility |
| `src/cli/commands/skip.ts` | Modify | Pass overlay-aware eligibility |
| `src/cli/commands/reset.ts` | Modify | Pass overlay-aware eligibility |
| `src/cli/commands/init.ts` | Modify | Add `--project-type` flag |
| `src/wizard/wizard.ts` | Modify | Accept projectType from CLI flag |
| `src/wizard/questions.ts` | Modify | Skip projectType question when pre-set via flag |
| `src/project/adopt.ts` | Modify | Add game engine detection, extend AdoptionResult |
| `src/cli/commands/adopt.ts` | Modify | Write detected projectType/gameConfig to config.yml |
| `src/e2e/game-pipeline.test.ts` | Create | E2E integration test |
| `CHANGELOG.md` | Modify | Document game dev feature |
| `README.md` | Modify | Add game dev section |

**Import path notes:** From `src/cli/commands/*.ts`, the overlay resolver import is `../../core/assembly/overlay-state-resolver.js`. The graph builder is at `src/core/dependency/graph.ts` (NOT `src/cli/commands/graph.ts`).

---

### Task 1: Create centralized overlay-state-resolver

**Files:**
- Create: `src/core/assembly/overlay-state-resolver.ts`
- Create: `src/core/assembly/overlay-state-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
1. Returns preset steps unchanged when no projectType in config
2. Returns overlay-merged steps when projectType is 'game' and overlay file exists
3. Returns overlay-merged knowledge, reads, and dependencies maps
4. Handles missing overlay file gracefully (warns, returns preset defaults)
5. Handles missing config.project gracefully (returns preset defaults)

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `resolveOverlayState`**

Extract the overlay resolution logic from `run.ts` (the section that builds maps from meta-prompts, loads overlay, calls applyOverlay) into a reusable function. The function takes config, methodologyDir, metaPrompts, presetSteps (as `Record<string, StepEnablementEntry>` — NOT a Map), and output context. Returns `OverlayState` with steps, knowledge, reads, dependencies.

**Important:** Commands currently wrap preset steps in a `Map<string, ...>` but this function works with `Record<string, ...>`. Callers must pass `preset?.steps ?? {}` (the raw object), then convert the returned `overlaySteps` to a Map for `buildGraph()` if needed: `new Map(Object.entries(overlayState.steps))`.

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**

---

### Task 2: Refactor run.ts to use centralized resolver

**Files:**
- Modify: `src/cli/commands/run.ts`
- Modify: `src/cli/commands/run.test.ts` (update existing overlay tests)

- [ ] **Step 1: Replace inline overlay resolution** with single `resolveOverlayState()` call

Find the section that builds maps, loads overlay, calls applyOverlay. Replace with:
```typescript
import { resolveOverlayState } from '../../core/assembly/overlay-state-resolver.js'
const overlayState = resolveOverlayState({ config, methodologyDir, metaPrompts, presetSteps: resolvedPreset?.steps ?? {}, output })
```

- [ ] **Step 2: Update existing overlay tests** in run.test.ts that tested the inline overlay logic — they should still pass since behavior is identical.

- [ ] **Step 3: Run full test suite — expect PASS**
- [ ] **Step 4: Commit**

---

### Task 3: Wire overlay into status command

**Files:**
- Modify: `src/cli/commands/status.ts`
- Modify: `src/cli/commands/status.test.ts`

- [ ] **Step 1: Read `status.ts`** to find preset loading and graph building

- [ ] **Step 2: Add overlay resolution** after preset loading

Import `resolveOverlayState` from `../../core/assembly/overlay-state-resolver.js`.
Call it with `presetSteps: resolvedPreset?.steps ?? {}` (raw object, NOT Map).
Convert returned `overlayState.steps` to Map for graph building.

- [ ] **Step 3: Fix inline `?? true` fallback**

Find where `status.ts` does `presetSteps.get(name)?.enabled ?? true`. Change to `?? false`. Steps not in the enablement map should be disabled, not enabled. Use the overlay-aware steps map for this check.

- [ ] **Step 4: Write test** — when config has `projectType: 'game'`, status shows game steps enabled

- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Commit**

---

### Task 4: Wire overlay into next command

**Files:**
- Modify: `src/cli/commands/next.ts`
- Modify: `src/cli/commands/next.test.ts`

Same pattern as Task 3. Also fix `?? true` fallback to `?? false`.

- [ ] **Step 1: Add overlay resolution** (same import + call pattern)
- [ ] **Step 2: Fix `?? true` fallback to `?? false`**
- [ ] **Step 3: Write test** — game project returns game step as next eligible
- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit**

---

### Task 5: Wire overlay into rework and eligibility commands

**Files:**
- Modify: `src/cli/commands/rework.ts`
- Modify: `src/cli/commands/complete.ts`
- Modify: `src/cli/commands/skip.ts`
- Modify: `src/cli/commands/reset.ts`

- [ ] **Step 1: Read each file** to find where they build eligibility / resolve presets

`complete.ts`, `skip.ts`, and `reset.ts` use a shared eligibility helper. Read `src/cli/commands/complete.ts` to understand the pattern, then check if there's a shared `buildComputeEligibleFn` used by all three.

- [ ] **Step 2: Wire overlay into rework.ts** — same pattern as status/next

- [ ] **Step 3: Wire overlay into the shared eligibility path** used by complete/skip/reset

If these commands build their own eligible step set, they need overlay-aware steps. Add `resolveOverlayState()` call before the eligibility computation. If they share a utility function, modify that function to accept overlay-aware steps.

- [ ] **Step 4: Run full test suite — expect PASS**
- [ ] **Step 5: Commit**

---

### Task 6: Add `--project-type` flag to `scaffold init`

**Files:**
- Modify: `src/cli/commands/init.ts`
- Modify: `src/wizard/questions.ts`
- Modify: `src/wizard/wizard.ts`
- Modify: `src/wizard/questions.test.ts`
- Modify: `src/wizard/wizard.test.ts`

- [ ] **Step 1: Add `--project-type` option to init command builder**

```typescript
.option('project-type', {
  type: 'string',
  describe: 'Project type (web-app/mobile-app/backend/cli/library/game)',
  choices: ['web-app', 'mobile-app', 'backend', 'cli', 'library', 'game'],
})
```

Pass to `runWizard()` as `projectType` option.

- [ ] **Step 2: Accept projectType in wizard.ts** — add to WizardOptions, pass to askWizardQuestions

- [ ] **Step 3: In questions.ts** — when `options.projectType` is provided, skip the select question and use the provided value. When `projectType === 'game'` and `options.auto`, construct gameConfig with Zod defaults (via `GameConfigSchema.parse({ engine: 'custom' })`).

- [ ] **Step 4: Update existing auto-mode tests** — the test "auto mode creates standard project (game requires interactive wizard)" needs updating. Add new test: `--project-type game --auto` produces valid gameConfig with defaults.

- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Commit**

---

### Task 7: Add game engine detection to `scaffold adopt`

**Files:**
- Modify: `src/project/adopt.ts`
- Modify: `src/cli/commands/adopt.ts`
- Modify: `src/project/adopt.test.ts`

- [ ] **Step 1: Extend `AdoptionResult` interface** in `adopt.ts`

Add optional fields:
```typescript
projectType?: ProjectType
gameConfig?: Partial<GameConfig>
```

Import types from `../types/index.js`.

- [ ] **Step 2: Add game engine detection** in `runAdoption()`

Use `fs.existsSync` with specific paths (NOT glob — adopt.ts uses existsSync patterns):
```typescript
// Game engine detection
const unityDetected = fs.existsSync(path.join(projectRoot, 'Assets')) &&
  fs.readdirSync(path.join(projectRoot, 'Assets')).some(f => f.endsWith('.meta'))
const unrealDetected = fs.readdirSync(projectRoot).some(f => f.endsWith('.uproject'))
const godotDetected = fs.existsSync(path.join(projectRoot, 'project.godot'))
```

If detected, set `result.projectType = 'game'` and `result.gameConfig = { engine: detected }`.

- [ ] **Step 3: Modify `src/cli/commands/adopt.ts`** to write detected projectType/gameConfig to config.yml

After `runAdoption()` returns, if `result.projectType` is set, merge it into the config being written to `.scaffold/config.yml`. This is the critical integration — without it, detection is thrown away.

- [ ] **Step 4: Write tests** for engine detection (Unity .meta, Unreal .uproject, Godot project.godot)

- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Commit**

---

### Task 8: E2E integration test for game pipeline

**Files:**
- Create: `src/e2e/game-pipeline.test.ts`

- [ ] **Step 1: Write E2E test**

Test the full flow using existing E2E patterns from `src/e2e/init.test.ts`:
1. Create temp directory with scaffold content
2. Run init programmatically with `projectType: 'game'`, `methodology: 'deep'`, `auto: true`
3. Verify config.yml contains `projectType: 'game'` and `gameConfig` with defaults
4. Load state and verify overlay was applied (game steps enabled, design-system disabled)
5. Verify next eligible step includes game pipeline steps

- [ ] **Step 2: Run test — expect PASS**
- [ ] **Step 3: Commit**

---

### Task 9: Update CHANGELOG and README

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`

- [ ] **Step 1: Add to CHANGELOG.md** under `## [Unreleased]` or new version section:

```markdown
### Added
- **Game development pipeline support** — new `game` project type with 24 pipeline steps, 29 knowledge entries, and project-type overlay system
  - `scaffold init --project-type game` for non-interactive game project setup
  - Game Design Document, performance budgets, art bible, audio design, netcode spec, accessibility, economy design, and 17 more steps
  - Progressive-disclosure wizard for game configuration (engine, multiplayer, platforms, economy, etc.)
  - `scaffold adopt` detects Unity, Unreal, and Godot game projects
  - Project-type overlay architecture extensible to future project types
- **Overlay system** — `game-overlay.yml` layers step enablement, knowledge injection, reads remapping, and dependency adjustments on any methodology
- **Wizard UI primitives** — `select()`, `multiSelect()`, `multiInput()` on OutputContext
- **Reads assembly** — `reads` frontmatter field now loads artifacts into prompt context
```

- [ ] **Step 2: Add game dev section to README.md** — brief "Game Development" subsection with usage example (`scaffold init --project-type game`)

- [ ] **Step 3: Commit**

---

### Task 10: Run full quality gates

**Files:** None (verification only)

- [ ] **Step 1: `npx tsc --noEmit`** — no type errors
- [ ] **Step 2: `npx vitest run`** — all tests pass
- [ ] **Step 3: `make check-all`** — all gates pass
