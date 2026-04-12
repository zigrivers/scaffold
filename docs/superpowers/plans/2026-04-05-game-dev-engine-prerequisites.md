# Game Dev Engine Prerequisites — Implementation Plan (Plan 1 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the TypeScript engine infrastructure needed to support project-type overlays, enabling game development (and future project types) in scaffold.

**Architecture:** Extend scaffold's config schema with `projectType` and `gameConfig`, create an overlay loading/resolution system, wire `reads` into assembly context, centralize pipeline resolution across all commands, and add wizard UI primitives for multi-select inputs.

**Tech Stack:** TypeScript, Zod, Vitest, js-yaml

**Spec:** `docs/superpowers/specs/2026-04-05-game-dev-pipeline-design.md`

**MMR Review:** Plan reviewed by Codex CLI + Gemini CLI. All P0/P1 findings integrated.

**Plan series:**
- **Plan 1 (this):** Engine prerequisites (TypeScript changes)
- **Plan 2:** Game overlay + knowledge entries (content)
- **Plan 3:** Game pipeline steps (content)
- **Plan 4:** Init wizard game page (TypeScript + UX)

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/config.ts` | Modify | Add `GameConfig`, `ProjectType`, `ProjectTypeOverlay` types |
| `src/config/schema.ts` | Modify | Add Zod validation for gameConfig with defaults |
| `src/core/assembly/preset-loader.ts` | Modify | Add `loadOverlay()` function |
| `src/core/assembly/overlay-loader.test.ts` | Create | Tests for overlay loading |
| `src/core/assembly/overlay-resolver.ts` | Create | `applyOverlay()` — merges overlay into resolved pipeline |
| `src/core/assembly/overlay-resolver.test.ts` | Create | Tests for overlay resolution |
| `src/core/assembly/resolved-pipeline.ts` | Create | Centralized `ResolvePipeline` — single source of truth |
| `src/core/assembly/resolved-pipeline.test.ts` | Create | Tests for centralized resolution |
| `src/cli/commands/run.ts` | Modify | Use resolved pipeline, include reads in artifact gathering |
| `src/cli/output/context.ts` | Modify | Add `select`, `multiSelect`, `multiInput` methods |
| `tests/fixtures/methodology/game-overlay.yml` | Create | Test fixture |
| `tests/fixtures/methodology/minimal-overlay.yml` | Create | Test fixture |

---

### Task 1: Add GameConfig type and projectType to ProjectConfig

**Files:**
- Modify: `src/types/config.ts`
- Test: `src/types/config.test.ts` (create)

- [ ] **Step 1: Write test file for config types**

```typescript
// src/types/config.test.ts
import { describe, it, expect } from 'vitest'
import type { ProjectConfig, GameConfig, ProjectType } from './config.js'

describe('GameConfig type', () => {
  it('accepts a valid game config', () => {
    const config: GameConfig = {
      engine: 'unity',
      multiplayerMode: 'none',
      narrative: 'none',
      contentStructure: 'discrete',
      economy: 'none',
      onlineServices: [],
      persistence: 'progression',
      targetPlatforms: ['pc'],
      supportedLocales: ['en'],
      hasModding: false,
      npcAiComplexity: 'none',
    }
    expect(config.engine).toBe('unity')
  })

  it('accepts a project without projectType (backwards compatible)', () => {
    const project: ProjectConfig = { name: 'my-web-app' }
    expect(project.projectType).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL** (types not exported yet)

Run: `npx vitest run src/types/config.test.ts`

- [ ] **Step 3: Add types to config.ts**

Add `ProjectType`, `GameEngine`, `GameConfig` types and `ProjectTypeOverlay`-related interfaces. See spec Section 2a for the full `GameConfig` interface. Also add overlay types (`KnowledgeOverride`, `ReadsOverride`, `DependencyOverride`, `ProjectTypeOverlay`) — see spec Section 2b.

Key: `ProjectConfig` gets optional `projectType?: ProjectType` and `gameConfig?: GameConfig`. The `MethodologyPreset` type is unchanged.

- [ ] **Step 4: Export new types from `src/types/index.ts`**

Ensure barrel file exports all new types.

- [ ] **Step 5: Run test — expect PASS**

Run: `npx vitest run src/types/config.test.ts`

- [ ] **Step 6: Run full test suite — expect PASS**

Run: `npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add src/types/config.ts src/types/config.test.ts src/types/index.ts
git commit -m "feat: add GameConfig type and projectType to ProjectConfig"
```

---

### Task 2: Add Zod validation for gameConfig

**Files:**
- Modify: `src/config/schema.ts`
- Test: `src/config/schema.test.ts` (create)

- [ ] **Step 1: Write failing tests**

Test cases:
1. Config without projectType still passes (backwards compatible)
2. Config with `projectType: 'game'` and valid `gameConfig` passes
3. Config with `projectType: 'game'` and only `engine` set — defaults applied for all other fields (`multiplayerMode: 'none'`, `narrative: 'none'`, `economy: 'none'`, `onlineServices: []`, `persistence: 'progression'`, `targetPlatforms: ['pc']`, `supportedLocales: ['en']`, `hasModding: false`, `npcAiComplexity: 'none'`)
4. Invalid engine value rejected
5. `gameConfig` present when `projectType !== 'game'` rejected (cross-field rule via `.refine()`)
6. Invalid `targetPlatform` value rejected

**Important YAML casing note:** The config loader (`src/config/loader.ts`) passes raw YAML to Zod. Check whether existing YAML keys use camelCase or kebab-case. Match the pattern — if existing project fields use camelCase in YAML, use camelCase for game fields too. If kebab-case, add a `.transform()` in Zod or use kebab-case keys in the schema.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/config/schema.test.ts`

- [ ] **Step 3: Add GameConfigSchema and cross-field validation to schema.ts**

Add `GameConfigSchema` with `.default()` on all fields except `engine` (required). Add `ProjectTypeSchema` enum. Extend `ProjectSchema` with `.refine()` cross-field rule: `gameConfig` only valid when `projectType === 'game'`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/config/schema.test.ts`

- [ ] **Step 5: Run full test suite — expect PASS**

Run: `npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts src/config/schema.test.ts
git commit -m "feat: add Zod validation for gameConfig with defaults and cross-field rule"
```

---

### Task 3: Add loadOverlay function for parsing overlay YAML

**Files:**
- Modify: `src/core/assembly/preset-loader.ts`
- Create: `src/core/assembly/overlay-loader.test.ts`
- Create: `tests/fixtures/methodology/game-overlay.yml`
- Create: `tests/fixtures/methodology/minimal-overlay.yml`

- [ ] **Step 1: Create test fixtures**

`game-overlay.yml`: Full overlay with step-overrides, knowledge-overrides, reads-overrides, dependency-overrides. See spec Section 2b for structure.

`minimal-overlay.yml`: Only name, description, project-type — no override sections. Tests empty-section handling.

- [ ] **Step 2: Write failing tests**

Test cases:
1. Loads `game-overlay.yml` — returns overlay with correct name, projectType
2. Parses step-overrides correctly
3. Parses knowledge-overrides (append arrays)
4. Parses reads-overrides (replace maps and append arrays)
5. Parses dependency-overrides (replace maps and append arrays)
6. Returns error for missing file
7. Returns empty overrides for minimal overlay (no override sections)
8. **Warns on unknown step names in overrides** (when knownStepNames provided)
9. **Rejects malformed override structure** (e.g., knowledge-overrides as array instead of object)

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts`

- [ ] **Step 4: Implement `loadOverlay` in preset-loader.ts**

Parse overlay YAML with same patterns as `loadPreset()`: file existence check, YAML parse, structure validation, field validation. Return `{ overlay: ProjectTypeOverlay | null; errors; warnings }`.

Parse each override section with a dedicated helper function: `parseStepOverrides()`, `parseKnowledgeOverrides()`, `parseReadsOverrides()`, `parseDependencyOverrides()`. Handle missing/null sections by returning empty objects.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts`

- [ ] **Step 6: Run full test suite — expect PASS**

Run: `npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add src/core/assembly/preset-loader.ts src/core/assembly/overlay-loader.test.ts tests/fixtures/methodology/game-overlay.yml tests/fixtures/methodology/minimal-overlay.yml
git commit -m "feat: add loadOverlay for project-type overlay YAML parsing"
```

---

### Task 4: Create overlay resolver (applyOverlay)

**Files:**
- Create: `src/core/assembly/overlay-resolver.ts`
- Create: `src/core/assembly/overlay-resolver.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
1. Step overrides: enables new steps, disables replaced steps
2. Knowledge overrides: appends entries, deduplicates
3. Reads overrides: replaces targets, appends new reads, deduplicates
4. Dependency overrides: replaces deps, appends new deps, deduplicates
5. Empty overlay produces no changes
6. Override for unknown step name is silently ignored (overlay may reference steps not yet in pipeline)

The function signature:
```typescript
applyOverlay(
  steps: Record<string, { enabled: boolean; conditional?: 'if-needed' }>,
  knowledgeMap: Record<string, string[]>,
  readsMap: Record<string, string[]>,
  dependencyMap: Record<string, string[]>,
  overlay: ProjectTypeOverlay,
): { steps, knowledge, reads, dependencies }
```

Tests should create simple input maps and verify the output maps after overlay application.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/core/assembly/overlay-resolver.test.ts`

- [ ] **Step 3: Implement applyOverlay**

Create `src/core/assembly/overlay-resolver.ts` with:
1. Step overrides: merge overlay steps into resolved map (overlay wins)
2. Knowledge overrides: append + `[...new Set()]` for dedup
3. Reads overrides: replace-then-append + dedup
4. Dependency overrides: replace-then-append + dedup

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/core/assembly/overlay-resolver.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/overlay-resolver.ts src/core/assembly/overlay-resolver.test.ts
git commit -m "feat: add applyOverlay for project-type overlay resolution"
```

---

### Task 5: Wire reads into artifact gathering

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Locate the artifact gathering loop in run.ts**

Find the loop around line 334 that iterates over `deps` and gathers artifacts. After it, add a second loop for `reads`.

- [ ] **Step 2: Add reads artifact gathering**

After the dependency artifact loop, add:

```typescript
// Gather artifacts from reads (cross-cutting, non-blocking)
const reads = metaPrompt.frontmatter.reads ?? []
for (const readStep of reads) {
  // Check graph for enablement — StepStateEntry has no 'enabled' property
  const readNode = graph?.nodes.get(readStep)
  if (readNode && !readNode.enabled) continue  // overlay-disabled, skip silently

  const readEntry = state.steps[readStep]
  if (!readEntry || readEntry.status !== 'completed') continue  // silently skip pending/missing

  const produces = readEntry.produces ?? []
  for (const relPath of produces) {
    // ... same artifact reading logic as deps loop ...
    // Avoid duplicates: skip if artifact already gathered from deps
  }
}
```

**Critical:** Use `graph.nodes.get()` for enablement checks, NOT `state.steps[].enabled` or `state.steps[].status === 'disabled'` — those don't exist on `StepStateEntry`.

**Critical:** Silently skip pending reads (not a warning). Reads are optional — the step just runs without that context.

- [ ] **Step 3: Run full test suite — expect PASS**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "feat: wire reads artifacts into assembly context (non-blocking)"
```

---

### Task 6: Fix disabled-dep handling in run.ts

**Files:**
- Modify: `src/cli/commands/run.ts`

- [ ] **Step 1: Find the dependency status check that can hard-fail**

Around line 240 in `run.ts`, find where dependency status is checked and may produce `DEP_UNMET`.

- [ ] **Step 2: Add disabled-dep bypass**

Before the hard-fail check, add:

```typescript
// Overlay-disabled deps are treated as satisfied (consistent with eligibility.ts)
const depNode = graph?.nodes.get(dep)
if (depNode && !depNode.enabled) continue
```

**Critical:** Use `graph.nodes.get()` for enablement — `StepStateEntry` has no `enabled` property.

- [ ] **Step 3: Run full test suite — expect PASS**

Run: `npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "fix: treat overlay-disabled deps as satisfied in run.ts"
```

---

### Task 7: Add wizard UI primitives (select, multiSelect, multiInput)

**Files:**
- Modify: `src/cli/output/context.ts` (add methods to interface)
- Modify: All `OutputContext` implementations (interactive, json, auto)
- Modify: All test doubles that implement `OutputContext`

- [ ] **Step 1: Find all OutputContext implementations and test doubles**

Run: `grep -rn "OutputContext\|implements.*Output" src/ --include="*.ts" | grep -v "node_modules"`

This will find the interface, all implementations, and all test doubles/mocks.

- [ ] **Step 2: Add methods to OutputContext interface**

```typescript
select(message: string, options: string[], defaultValue?: string): Promise<string>
multiSelect(message: string, options: string[], defaults?: string[]): Promise<string[]>
multiInput(message: string, defaultValue?: string[]): Promise<string[]>
```

- [ ] **Step 3: Implement in interactive output**

For `select`: display numbered options, accept number or text input, validate against options list.
For `multiSelect`: display options, accept comma-separated input, validate each against options list.
For `multiInput`: accept comma-separated text, split and trim.

- [ ] **Step 4: Implement stubs in json and auto outputs**

Return defaults (no prompting).

- [ ] **Step 5: Update ALL test doubles**

Find every mock/stub that implements `OutputContext` and add the three new methods returning defaults. This includes mocks in `error-display.test.ts`, `questions.test.ts`, and any command test files.

- [ ] **Step 6: Run full test suite — expect PASS**

Run: `npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add src/cli/output/
git commit -m "feat: add select, multiSelect, multiInput wizard primitives"
```

---

### Task 8: Run full quality gates

**Files:** None (verification only)

- [ ] **Step 1: TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass, coverage meets thresholds

- [ ] **Step 3: make check-all**

Run: `make check-all`
Expected: All gates pass

---

## Notes for Plan 2-4

**Plan 2 (Game Overlay + Knowledge Entries):** Create `content/methodology/game-overlay.yml` with the full overlay definition from spec Section 2b. Create all 29 knowledge entry files in `content/knowledge/game/` and `content/knowledge/review/`. Pure content, no code.

**Plan 3 (Game Pipeline Steps):** Create all 24 pipeline step files in `content/pipeline/`. Each is a markdown meta-prompt following existing step patterns. Pure content, no code. Depends on Plan 2 (knowledge entries must exist for frontmatter `knowledge-base` references to validate).

**Plan 4 (Init Wizard Game Page):** Add game config questions to `src/wizard/questions.ts` and wire answers into config writing in `src/wizard/wizard.ts`. Depends on Plan 1 (Zod schema, wizard primitives).

**Centralized Pipeline Resolution:** The spec calls for centralizing preset resolution (currently duplicated across 6+ commands) into a single `ResolvedPipeline` layer. This is a significant refactor that should be scoped as its own task or mini-plan. For Plan 1, overlay resolution is implemented as a standalone module (`overlay-resolver.ts`). Wiring it into all 6 commands is deferred to a follow-up task after Plan 1 lands — initially, only `run.ts` will consume the overlay. Other commands (`status`, `next`, `list`, `build`, `rework`) will get overlay awareness in a subsequent PR.
