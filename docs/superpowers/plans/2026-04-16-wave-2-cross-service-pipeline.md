# Wave 2: Cross-Service Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structural overlay infrastructure and cross-service pipeline steps activated by `services[]` in config.

**Architecture:** Extends the overlay system with a new `loadStructuralOverlay()` loader and a 4th pass in `resolveOverlayState()` gated on `services[].length > 0`. Five new pipeline steps, eight knowledge documents, and one overlay YAML compose the cross-service content layer. Existing `assertSingleServiceOrExit` guard stays — users reach this code in Wave 3b.

**Tech Stack:** TypeScript, Zod, vitest, bats, YAML content files

**Spec:** `docs/superpowers/specs/2026-04-16-wave-2-cross-service-pipeline-design.md`

**Task ordering rationale:** Infrastructure tasks (1-3) have no content dependencies. Content tasks are ordered: knowledge docs (4-7) → pipeline steps (8-9) → presets + overlay + exemptions (10) so that each task's references resolve. Knowledge docs must exist before steps reference them in `knowledge-base` frontmatter, and steps must exist before presets register them.

**Knowledge doc requirements:** Each `content/knowledge/core/` file must be at least 200 lines with at least 1 code block (enforced by `tests/evals/knowledge-quality.bats`).

**Pipeline step requirements:** Each step must include `## Purpose`, `## Inputs`, `## Expected Outputs`, `## Quality Criteria`, `## Methodology Scaling`, `## Mode Detection`, and `## Update Mode Specifics` sections (enforced by `tests/evals/pipeline-completeness.bats`).

---

### Task 1: Rename `ProjectTypeOverlay` to `PipelineOverlay` and make `projectType` optional

**Files:**
- Modify: `src/types/config.ts:102-110`
- Modify: `src/types/config.test.ts:3-68`
- Modify: `src/core/assembly/overlay-loader.ts:2-3,143,222,225,244`
- Modify: `src/core/assembly/overlay-resolver.ts:2,21`
- Modify: `src/core/assembly/overlay-resolver.test.ts:3,5`

- [ ] **Step 1: Update the interface definition**

In `src/types/config.ts`, rename the interface and make `projectType` optional:

```typescript
// src/types/config.ts — replace lines 101-110
/** Pipeline overlay definition (project-type or structural). */
export interface PipelineOverlay {
  name: string
  description: string
  projectType?: ProjectType
  stepOverrides: Record<string, StepEnablementEntry>
  knowledgeOverrides: Record<string, KnowledgeOverride>
  readsOverrides: Record<string, ReadsOverride>
  dependencyOverrides: Record<string, DependencyOverride>
}
```

- [ ] **Step 2: Update overlay-loader.ts imports and types**

In `src/core/assembly/overlay-loader.ts`:

Replace the import (lines 2-4):
```typescript
import type {
  PipelineOverlay, KnowledgeOverride, ReadsOverride, DependencyOverride,
} from '../../types/index.js'
```

Replace line 143 return type:
```typescript
): { overlay: PipelineOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
```

Replace line 222:
```typescript
  const overlay: PipelineOverlay = {
```

Replace line 225:
```typescript
    projectType: (obj['project-type'] as string).trim() as PipelineOverlay['projectType'],
```

Replace line 244 return type:
```typescript
): { overlay: PipelineOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
```

- [ ] **Step 3: Update overlay-resolver.ts imports and parameter type**

In `src/core/assembly/overlay-resolver.ts`:

Replace the import (lines 1-6):
```typescript
import type {
  PipelineOverlay,
  KnowledgeOverride,
  ReadsOverride,
  DependencyOverride,
  StepEnablementEntry,
} from '../../types/index.js'
```

Replace the `overlay` parameter type (line 21):
```typescript
  overlay: PipelineOverlay,
```

- [ ] **Step 4: Update overlay-resolver.test.ts**

In `src/core/assembly/overlay-resolver.test.ts`:

Replace line 3:
```typescript
import type { PipelineOverlay, StepEnablementEntry } from '../../types/index.js'
```

Replace line 5:
```typescript
function makeOverlay(overrides: Partial<PipelineOverlay> = {}): PipelineOverlay {
```

- [ ] **Step 5: Update config.test.ts**

In `src/types/config.test.ts`:

Replace lines 3-6:
```typescript
import type {
  ProjectConfig, GameConfig, PipelineOverlay, KnowledgeOverride,
  ReadsOverride, DependencyOverride, StepEnablementEntry,
} from './config.js'
```

Replace line 45:
```typescript
describe('PipelineOverlay type', () => {
```

Replace line 47:
```typescript
    const overlay: PipelineOverlay = {
```

Add a new test after the existing overlay test (after line 68):
```typescript
  it('accepts a structural overlay without projectType', () => {
    const overlay: PipelineOverlay = {
      name: 'multi-service',
      description: 'Cross-service overlay',
      stepOverrides: { 'service-ownership-map': { enabled: true } },
      knowledgeOverrides: {},
      readsOverrides: {},
      dependencyOverrides: {},
    }
    expect(overlay.name).toBe('multi-service')
    expect(overlay.projectType).toBeUndefined()
  })
```

- [ ] **Step 6: Run tests to verify rename is clean**

Run: `npx vitest run src/types/config.test.ts src/core/assembly/overlay-resolver.test.ts --reporter=verbose`
Expected: All tests pass

- [ ] **Step 7: Run full TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/types/config.ts src/types/config.test.ts src/core/assembly/overlay-loader.ts src/core/assembly/overlay-resolver.ts src/core/assembly/overlay-resolver.test.ts
git commit -m "refactor: rename ProjectTypeOverlay to PipelineOverlay, make projectType optional"
```

---

### Task 2: Add `loadStructuralOverlay()` function

**Files:**
- Modify: `src/core/assembly/overlay-loader.ts` (append new function after line 269)
- Create: `src/core/assembly/overlay-loader-structural.test.ts`

- [ ] **Step 1: Write failing tests for `loadStructuralOverlay()`**

Create `src/core/assembly/overlay-loader-structural.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { loadStructuralOverlay } from './overlay-loader.js'

function writeTmpOverlay(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structural-overlay-'))
  const file = path.join(dir, 'test-overlay.yml')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

describe('loadStructuralOverlay', () => {
  it('loads a valid structural overlay without project-type', () => {
    const file = writeTmpOverlay(`
name: multi-service
description: Cross-service pipeline steps

step-overrides:
  service-ownership-map: { enabled: true }

knowledge-overrides:
  system-architecture:
    append: [multi-service-architecture]
`)
    const { overlay, errors, warnings } = loadStructuralOverlay(file)

    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.name).toBe('multi-service')
    expect(overlay!.projectType).toBeUndefined()
    expect(overlay!.stepOverrides['service-ownership-map']).toEqual({ enabled: true })
    expect(overlay!.knowledgeOverrides['system-architecture']).toEqual({
      append: ['multi-service-architecture'],
    })
  })

  it('errors on missing name field', () => {
    const file = writeTmpOverlay(`
description: No name here

step-overrides:
  foo: { enabled: true }
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(overlay).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toMatch(/name/)
  })

  it('errors on missing description field', () => {
    const file = writeTmpOverlay(`
name: test-overlay

step-overrides:
  foo: { enabled: true }
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(overlay).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toMatch(/description/)
  })

  it('errors on non-existent file', () => {
    const { overlay, errors } = loadStructuralOverlay('/nonexistent/overlay.yml')

    expect(overlay).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
  })

  it('parses reads-overrides and dependency-overrides', () => {
    const file = writeTmpOverlay(`
name: test
description: Test overlay

reads-overrides:
  implementation-plan:
    append: [service-ownership-map]

dependency-overrides:
  review-security:
    append: [cross-service-auth]
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.readsOverrides['implementation-plan']).toEqual({
      replace: {}, append: ['service-ownership-map'],
    })
    expect(overlay!.dependencyOverrides['review-security']).toEqual({
      replace: {}, append: ['cross-service-auth'],
    })
  })

  it('warns on malformed step-overrides entries', () => {
    const file = writeTmpOverlay(`
name: test
description: Test overlay

step-overrides:
  bad-step: "not-an-object"
`)
    const { overlay, warnings } = loadStructuralOverlay(file)

    expect(overlay).not.toBeNull()
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('ignores project-type field if accidentally present', () => {
    const file = writeTmpOverlay(`
name: test
description: Test overlay
project-type: backend

step-overrides:
  foo: { enabled: true }
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    // project-type is ignored (not validated), projectType remains undefined
    expect(overlay!.projectType).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/overlay-loader-structural.test.ts --reporter=verbose`
Expected: FAIL — `loadStructuralOverlay` is not exported

- [ ] **Step 3: Implement `loadStructuralOverlay()`**

Append to `src/core/assembly/overlay-loader.ts` (after the closing `}` of `loadSubOverlay` at line 269):

```typescript

/**
 * Load a structural overlay YAML file (e.g., multi-service-overlay.yml).
 * Structural overlays have no project-type — they apply across project types
 * based on config properties (e.g., services[] presence).
 *
 * Validates name + description. Ignores project-type field if present.
 * @param overlayPath - Absolute path to structural overlay file
 * @returns { overlay, errors, warnings }
 */
export function loadStructuralOverlay(
  overlayPath: string,
): { overlay: PipelineOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
  const errors: ScaffoldError[] = []
  const warnings: ScaffoldWarning[] = []

  // 1. Check file exists
  if (!fileExists(overlayPath)) {
    const overlayName = path.basename(overlayPath, '.yml')
    errors.push(overlayMissing(overlayName, overlayPath))
    return { overlay: null, errors, warnings }
  }

  // 2. Read file
  const raw = fs.readFileSync(overlayPath, 'utf8')

  // 3. Parse YAML
  let parsed: unknown
  try {
    parsed = yaml.load(raw)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    errors.push(overlayParseError(overlayPath, detail))
    return { overlay: null, errors, warnings }
  }

  // 4. Validate top-level structure
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    errors.push(overlayParseError(overlayPath, 'overlay must be a YAML object'))
    return { overlay: null, errors, warnings }
  }

  const obj = parsed as Record<string, unknown>

  // Validate required fields (name + description only — no project-type)
  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') {
    errors.push(overlayParseError(overlayPath, 'required field "name" must be a non-empty string'))
  }

  if (typeof obj['description'] !== 'string' || obj['description'].trim() === '') {
    errors.push(overlayParseError(overlayPath, 'required field "description" must be a non-empty string'))
  }

  if (errors.length > 0) {
    return { overlay: null, errors, warnings }
  }

  // 5. Parse override sections (gracefully handle missing/malformed)
  const overrideSections = ['step-overrides', 'knowledge-overrides', 'reads-overrides', 'dependency-overrides'] as const

  for (const section of overrideSections) {
    const value = obj[section]
    if (value !== undefined && value !== null) {
      if (typeof value !== 'object' || Array.isArray(value)) {
        warnings.push(overlayMalformedSection(section, overlayPath))
      }
    }
  }

  const stepOverridesRaw = isPlainObject(obj['step-overrides'])
    ? obj['step-overrides'] as Record<string, unknown> : {}
  const knowledgeOverridesRaw = isPlainObject(obj['knowledge-overrides'])
    ? obj['knowledge-overrides'] as Record<string, unknown> : {}
  const readsOverridesRaw = isPlainObject(obj['reads-overrides'])
    ? obj['reads-overrides'] as Record<string, unknown> : {}
  const dependencyOverridesRaw = isPlainObject(obj['dependency-overrides'])
    ? obj['dependency-overrides'] as Record<string, unknown> : {}

  const overlay: PipelineOverlay = {
    name: (obj['name'] as string).trim(),
    description: (obj['description'] as string).trim(),
    // No projectType for structural overlays
    stepOverrides: parseStepOverrides(stepOverridesRaw, warnings, overlayPath),
    knowledgeOverrides: parseKnowledgeOverrides(knowledgeOverridesRaw, warnings, overlayPath),
    readsOverrides: parseReadsOverrides(readsOverridesRaw, warnings, overlayPath),
    dependencyOverrides: parseDependencyOverrides(dependencyOverridesRaw, warnings, overlayPath),
  }

  return { overlay, errors, warnings }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/assembly/overlay-loader-structural.test.ts --reporter=verbose`
Expected: All 7 tests pass

- [ ] **Step 5: Run existing overlay-loader tests to verify no regression**

Run: `npx vitest run src/core/assembly/ --reporter=verbose`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/core/assembly/overlay-loader.ts src/core/assembly/overlay-loader-structural.test.ts
git commit -m "feat: add loadStructuralOverlay() for overlays without project-type"
```

---

### Task 3: Add structural overlay pass to `resolveOverlayState()`

**Files:**
- Modify: `src/core/assembly/overlay-state-resolver.ts:1-7,111-119`
- Modify: `src/core/assembly/overlay-state-resolver.test.ts` (append new tests)

- [ ] **Step 1: Write failing tests for the structural overlay pass**

Append to `src/core/assembly/overlay-state-resolver.test.ts`:

```typescript

  describe('structural overlay (multi-service)', () => {
    it('activates structural overlay when services[] present', () => {
      const output = makeOutput()
      // Use a temp dir with a multi-service-overlay.yml fixture
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-structural-'))
      fs.writeFileSync(path.join(tmpDir, 'multi-service-overlay.yml'), `
name: multi-service
description: Test structural overlay

step-overrides:
  service-ownership-map: { enabled: true }

knowledge-overrides:
  system-architecture:
    append: [multi-service-architecture]
`, 'utf8')

      const presetSteps: Record<string, StepEnablementEntry> = {
        'create-vision': { enabled: true },
        'service-ownership-map': { enabled: false },
        'system-architecture': { enabled: true },
      }
      const metaPrompts = new Map([
        ['create-vision', { frontmatter: makeFrontmatter({ name: 'create-vision' }) }],
        ['service-ownership-map', { frontmatter: makeFrontmatter({ name: 'service-ownership-map' }) }],
        ['system-architecture', { frontmatter: makeFrontmatter({ name: 'system-architecture', knowledgeBase: ['system-architecture'] }) }],
      ])

      const result = resolveOverlayState({
        config: makeConfig({
          project: {
            services: [{ name: 'api', projectType: 'backend', backendConfig: { apiStyle: 'rest', domain: 'none' } }],
          },
        }),
        methodologyDir: tmpDir,
        metaPrompts,
        presetSteps,
        output,
      })

      // Structural overlay should enable service-ownership-map
      expect(result.steps['service-ownership-map']?.enabled).toBe(true)
      // Knowledge injection should work
      expect(result.knowledge['system-architecture']).toContain('multi-service-architecture')
    })

    it('emits warning when structural overlay conflicts with project-type overlay', () => {
      const output = makeOutput()
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-conflict-'))
      fs.writeFileSync(path.join(tmpDir, 'multi-service-overlay.yml'), `
name: multi-service
description: Test conflict

step-overrides:
  design-system: { enabled: true }
`, 'utf8')

      const presetSteps: Record<string, StepEnablementEntry> = {
        'design-system': { enabled: false },
      }
      const metaPrompts = new Map([
        ['design-system', { frontmatter: makeFrontmatter({ name: 'design-system' }) }],
      ])

      resolveOverlayState({
        config: makeConfig({
          project: {
            services: [{ name: 'api', projectType: 'backend', backendConfig: { apiStyle: 'rest', domain: 'none' } }],
          },
        }),
        methodologyDir: tmpDir,
        metaPrompts,
        presetSteps,
        output,
      })

      // Should warn about overriding design-system from disabled → enabled
      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('design-system'),
      )
    })

    it('does NOT activate structural overlay when services[] absent', () => {
      const output = makeOutput()
      const presetSteps: Record<string, StepEnablementEntry> = {
        'service-ownership-map': { enabled: false },
      }
      const metaPrompts = new Map([
        ['service-ownership-map', { frontmatter: makeFrontmatter({ name: 'service-ownership-map' }) }],
      ])

      const result = resolveOverlayState({
        config: makeConfig(),
        methodologyDir: fixtureDir,
        metaPrompts,
        presetSteps,
        output,
      })

      expect(result.steps['service-ownership-map']?.enabled).toBe(false)
    })

    it('does NOT activate when services[] is empty array', () => {
      const output = makeOutput()
      const presetSteps: Record<string, StepEnablementEntry> = {
        'service-ownership-map': { enabled: false },
      }
      const metaPrompts = new Map([
        ['service-ownership-map', { frontmatter: makeFrontmatter({ name: 'service-ownership-map' }) }],
      ])

      const result = resolveOverlayState({
        config: makeConfig({ project: { services: [] } }),
        methodologyDir: fixtureDir,
        metaPrompts,
        presetSteps,
        output,
      })

      expect(result.steps['service-ownership-map']?.enabled).toBe(false)
    })

    it('warns when structural overlay targets unknown step', () => {
      const output = makeOutput()
      // Use a temp dir with a custom overlay that targets a non-existent step
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-test-'))
      fs.writeFileSync(path.join(tmpDir, 'multi-service-overlay.yml'), `
name: multi-service
description: Test overlay

step-overrides:
  nonexistent-step: { enabled: true }
`, 'utf8')

      const presetSteps: Record<string, StepEnablementEntry> = {}
      const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>()

      resolveOverlayState({
        config: makeConfig({
          project: {
            services: [{ name: 'api', projectType: 'backend', backendConfig: { apiStyle: 'rest', domain: 'none' } }],
          },
        }),
        methodologyDir: tmpDir,
        metaPrompts,
        presetSteps,
        output,
      })

      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('nonexistent-step'),
      )
    })
  })
```

- [ ] **Step 2: Add required imports to the test file**

At the top of `src/core/assembly/overlay-state-resolver.test.ts`, add `fs` and `os` imports after the existing imports (line 7):

```typescript
import fs from 'node:fs'
import os from 'node:os'
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts --reporter=verbose`
Expected: New tests fail (structural overlay pass doesn't exist yet)

- [ ] **Step 4: Implement the structural overlay pass**

In `src/core/assembly/overlay-state-resolver.ts`:

Add import for `loadStructuralOverlay` (update line 6):
```typescript
import { loadOverlay, loadSubOverlay, loadStructuralOverlay } from './overlay-loader.js'
```

Insert the structural overlay block after line 111 (after the closing `}` of the `if (projectType)` block), before the `return` statement:

```typescript

  // Structural overlay pass (gated on services[])
  if (config.project?.services?.length) {
    const msOverlayPath = path.join(methodologyDir, 'multi-service-overlay.yml')
    if (fs.existsSync(msOverlayPath)) {
      const {
        overlay: msOverlay,
        errors: msErrors,
        warnings: msWarnings,
      } = loadStructuralOverlay(msOverlayPath)
      for (const w of msWarnings) {
        output.warn(w)
      }
      if (msErrors.length > 0) {
        for (const err of msErrors) {
          output.warn(`[${err.code}] ${err.message}${err.recovery ? ` — ${err.recovery}` : ''}`)
        }
      }
      if (msOverlay) {
        // Step-override conflict detection
        for (const [step, override] of Object.entries(msOverlay.stepOverrides)) {
          if (step in overlaySteps && overlaySteps[step].enabled !== override.enabled) {
            output.warn(`Structural overlay overrides "${step}" enablement`)
          }
        }
        // Validate step targets exist in metaPrompts
        for (const step of Object.keys(msOverlay.stepOverrides)) {
          if (!metaPrompts.has(step)) {
            output.warn(`Structural overlay targets unknown step "${step}"`)
          }
        }
        const merged = applyOverlay(
          overlaySteps,
          overlayKnowledge,
          overlayReads,
          overlayDependencies,
          msOverlay,
        )
        overlaySteps = merged.steps
        overlayKnowledge = merged.knowledge
        overlayReads = merged.reads
        overlayDependencies = merged.dependencies
      }
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts --reporter=verbose`
Expected: All tests pass (including new structural overlay tests)

- [ ] **Step 6: Run full assembly test suite**

Run: `npx vitest run src/core/assembly/ --reporter=verbose`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add src/core/assembly/overlay-state-resolver.ts src/core/assembly/overlay-state-resolver.test.ts
git commit -m "feat: add structural overlay pass gated on services[] in resolveOverlayState"
```

---

### Task 4: Knowledge documents batch 1 — architecture + data ownership

**Files:**
- Create: `content/knowledge/core/multi-service-architecture.md`
- Create: `content/knowledge/core/multi-service-data-ownership.md`

**Requirements:** Each file must be 200+ lines with at least 1 code block. Follow the pattern in `content/knowledge/core/system-architecture.md`: frontmatter with `name`, `description`, `topics`, then substantial content sections with `##` headers.

- [ ] **Step 1: Create `multi-service-architecture.md`**

Frontmatter:
```yaml
---
name: multi-service-architecture
description: Service boundary design, communication patterns, service discovery, and networking topology
topics: [service-boundaries, communication-patterns, service-discovery, networking-topology, data-ownership, sync-vs-async]
---
```

Content must cover: service decomposition strategies (domain-driven, team-aligned), sync vs async communication patterns (REST, gRPC, message queues, event streaming), service discovery patterns (DNS, service mesh, sidecar proxy), networking topology (API gateway, mesh, direct), data ownership at the architecture level. Include at least one code block (e.g., a service discovery config example or API gateway routing example).

- [ ] **Step 2: Create `multi-service-data-ownership.md`**

Frontmatter:
```yaml
---
name: multi-service-data-ownership
description: Table ownership, shared-nothing data patterns, and event-driven synchronization
topics: [table-ownership, shared-nothing, event-driven-sync, data-partitioning, eventual-consistency]
---
```

Content must cover: shared-nothing data patterns, table/collection ownership rules, event-driven data sync strategies, cross-service query patterns (API composition, CQRS), eventual consistency handling, data migration between services. Include at least one code block (e.g., event schema example or data ownership mapping).

- [ ] **Step 3: Verify line count and code blocks**

Run: `for f in content/knowledge/core/multi-service-architecture.md content/knowledge/core/multi-service-data-ownership.md; do echo "$f: $(wc -l < "$f") lines, $(grep -c '^\`\`\`' "$f") code fences"; done`
Expected: Both 200+ lines, both have 2+ code fences (opening + closing = 1 block)

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/core/multi-service-architecture.md content/knowledge/core/multi-service-data-ownership.md
git commit -m "feat: add multi-service architecture and data ownership knowledge docs"
```

---

### Task 5: Knowledge documents batch 2 — API contracts + auth

**Files:**
- Create: `content/knowledge/core/multi-service-api-contracts.md`
- Create: `content/knowledge/core/multi-service-auth.md`

Same requirements as Task 4: 200+ lines, 1+ code block.

- [ ] **Step 1: Create `multi-service-api-contracts.md`**

Topics: `[internal-api-versioning, backward-compatibility, retries, idempotency, contract-evolution]`. Cover: internal API versioning strategies, backward compatibility rules, retry policies with exponential backoff, idempotency key design, contract evolution and deprecation.

- [ ] **Step 2: Create `multi-service-auth.md`**

Topics: `[mtls, service-tokens, zero-trust, audience-scoping, token-rotation]`. Cover: mTLS setup and certificate management, service-to-service JWT patterns, zero-trust architecture, audience scoping and token validation, secret rotation strategies.

- [ ] **Step 3: Verify and commit**

```bash
for f in content/knowledge/core/multi-service-api-contracts.md content/knowledge/core/multi-service-auth.md; do echo "$f: $(wc -l < "$f") lines"; done
git add content/knowledge/core/multi-service-api-contracts.md content/knowledge/core/multi-service-auth.md
git commit -m "feat: add multi-service API contracts and auth knowledge docs"
```

---

### Task 6: Knowledge documents batch 3 — observability + testing

**Files:**
- Create: `content/knowledge/core/multi-service-observability.md`
- Create: `content/knowledge/core/multi-service-testing.md`

Same requirements: 200+ lines, 1+ code block.

- [ ] **Step 1: Create `multi-service-observability.md`**

Topics: `[distributed-tracing, correlation-ids, cross-service-slos, failure-attribution]`. Cover: distributed tracing with W3C Trace Context, correlation ID propagation, cross-service SLO definition, failure attribution and root cause analysis.

- [ ] **Step 2: Create `multi-service-testing.md`**

Topics: `[contract-tests, pact, schema-registry, cross-service-e2e, test-doubles]`. Cover: consumer-driven contract testing (Pact, schema registry), cross-service E2E test design, service test doubles and mocking strategies, CI integration for contract tests.

- [ ] **Step 3: Verify and commit**

```bash
for f in content/knowledge/core/multi-service-observability.md content/knowledge/core/multi-service-testing.md; do echo "$f: $(wc -l < "$f") lines"; done
git add content/knowledge/core/multi-service-observability.md content/knowledge/core/multi-service-testing.md
git commit -m "feat: add multi-service observability and testing knowledge docs"
```

---

### Task 7: Knowledge documents batch 4 — resilience + task decomposition

**Files:**
- Create: `content/knowledge/core/multi-service-resilience.md`
- Create: `content/knowledge/core/multi-service-task-decomposition.md`

Same requirements: 200+ lines, 1+ code block.

- [ ] **Step 1: Create `multi-service-resilience.md`**

Topics: `[circuit-breakers, bulkheads, timeout-budgets, failure-isolation, retry-storms]`. Cover: circuit breaker patterns (states, thresholds, recovery), bulkhead isolation, timeout budget allocation across call chains, failure isolation strategies, retry storm prevention.

- [ ] **Step 2: Create `multi-service-task-decomposition.md`**

Topics: `[per-service-waves, dependency-ordering, parallel-implementation, shared-infrastructure-first]`. Cover: breaking multi-service work into per-service implementation waves, dependency ordering for parallel development, shared infrastructure first pattern, integration milestones.

- [ ] **Step 3: Verify and commit**

```bash
for f in content/knowledge/core/multi-service-resilience.md content/knowledge/core/multi-service-task-decomposition.md; do echo "$f: $(wc -l < "$f") lines"; done
git add content/knowledge/core/multi-service-resilience.md content/knowledge/core/multi-service-task-decomposition.md
git commit -m "feat: add multi-service resilience and task decomposition knowledge docs"
```

---

### Task 8: Pipeline steps batch 1 — service-ownership-map + inter-service-contracts

**Files:**
- Create: `content/pipeline/architecture/service-ownership-map.md`
- Create: `content/pipeline/specification/inter-service-contracts.md`

**Requirements:** Each file must include all required sections: `## Purpose`, `## Inputs`, `## Expected Outputs`, `## Quality Criteria`, `## Methodology Scaling`, `## Mode Detection`, `## Update Mode Specifics`. Follow the pattern in `content/pipeline/quality/operations.md` exactly.

- [ ] **Step 1: Create `service-ownership-map.md`**

Use the frontmatter from the spec (architecture phase, order 721, deps [review-architecture], reads [system-architecture, domain-modeling], knowledge [multi-service-architecture, multi-service-data-ownership], outputs [docs/service-ownership-map.md]).

Include ALL required sections. For Mode Detection: check for `docs/service-ownership-map.md` — if exists, operate in update mode. For Methodology Scaling: depth 1-2 = list services and their domains; depth 3+ = add data ownership, event topics, sync strategies.

- [ ] **Step 2: Create `inter-service-contracts.md`**

Frontmatter from spec (specification phase, order 841, deps [service-ownership-map, review-api], reads [api-contracts], knowledge [multi-service-api-contracts, multi-service-resilience], outputs [docs/inter-service-contracts.md]).

Include ALL required sections. Mode Detection: check for `docs/inter-service-contracts.md`. Methodology Scaling: depth 1-2 = list contracts; depth 3+ = add versioning, retries, idempotency.

- [ ] **Step 3: Validate frontmatter**

Run: `scripts/validate-frontmatter.sh content/pipeline/architecture/service-ownership-map.md content/pipeline/specification/inter-service-contracts.md`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add content/pipeline/architecture/service-ownership-map.md content/pipeline/specification/inter-service-contracts.md
git commit -m "feat: add service-ownership-map and inter-service-contracts pipeline steps"
```

---

### Task 9: Pipeline steps batch 2 — cross-service-auth + observability + integration-test-plan

**Files:**
- Create: `content/pipeline/quality/cross-service-auth.md`
- Create: `content/pipeline/quality/cross-service-observability.md`
- Create: `content/pipeline/quality/integration-test-plan.md`

Same requirements: all 7 required sections per file.

- [ ] **Step 1: Create `cross-service-auth.md`**

Frontmatter from spec (quality phase, order 952, deps [security, service-ownership-map], reads [inter-service-contracts], knowledge [multi-service-auth], outputs [docs/cross-service-auth.md]). Include all required sections.

- [ ] **Step 2: Create `cross-service-observability.md`**

Frontmatter from spec (quality phase, order 941, deps [review-operations, service-ownership-map], reads [operations], knowledge [multi-service-observability], outputs [docs/cross-service-observability.md]). Include all required sections.

- [ ] **Step 3: Create `integration-test-plan.md`**

Frontmatter from spec (quality phase, order 942, deps [review-testing, inter-service-contracts], reads [service-ownership-map, cross-service-auth], knowledge [multi-service-testing], outputs [docs/integration-test-plan.md]). Include all required sections.

- [ ] **Step 4: Validate frontmatter**

Run: `scripts/validate-frontmatter.sh content/pipeline/quality/cross-service-auth.md content/pipeline/quality/cross-service-observability.md content/pipeline/quality/integration-test-plan.md`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add content/pipeline/quality/cross-service-auth.md content/pipeline/quality/cross-service-observability.md content/pipeline/quality/integration-test-plan.md
git commit -m "feat: add cross-service-auth, observability, and integration-test-plan pipeline steps"
```

---

### Task 10: Preset registration + multi-service overlay + output exemptions

**Files:**
- Modify: `content/methodology/deep.yml` (append after last line)
- Modify: `content/methodology/mvp.yml` (append after last line)
- Modify: `content/methodology/custom-defaults.yml` (append after last line)
- Create: `content/methodology/multi-service-overlay.yml`
- Modify: `tests/evals/exemptions.bash` (add 2 terminal output exemptions)

- [ ] **Step 1: Add multi-service steps to all 3 presets**

Append to `deep.yml`, `mvp.yml`, and `custom-defaults.yml` (after the last `platform-cert-prep` line in each):

```yaml
  # Multi-service steps (enabled via multi-service overlay)
  service-ownership-map: { enabled: false }
  inter-service-contracts: { enabled: false }
  cross-service-auth: { enabled: false }
  cross-service-observability: { enabled: false }
  integration-test-plan: { enabled: false }
```

- [ ] **Step 2: Create `multi-service-overlay.yml`**

Create `content/methodology/multi-service-overlay.yml` with the full overlay YAML from the spec (Section 4). This includes step-overrides, knowledge-overrides, reads-overrides, and dependency-overrides sections. Copy the exact YAML from the spec document at `docs/superpowers/specs/2026-04-16-wave-2-cross-service-pipeline-design.md` Section 4.

- [ ] **Step 3: Add output consumption exemptions**

In `tests/evals/exemptions.bash`, add to the `TERMINAL_OUTPUT_EXEMPT` array (after the game development entries):

```bash
  # Multi-service steps — terminal artifacts consumed by developers, not pipeline.
  "cross-service-observability"
  "integration-test-plan"
```

These two steps produce terminal docs (`docs/cross-service-observability.md`, `docs/integration-test-plan.md`) consumed during implementation. Their cross-service wiring happens via overlay dependency-overrides into `cross-phase-consistency`, which the output-consumption eval doesn't check (it only checks pipeline frontmatter).

- [ ] **Step 4: Verify YAML validity**

Run: `node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('content/methodology/multi-service-overlay.yml', 'utf8')); console.log('Valid YAML')"`
Expected: "Valid YAML"

- [ ] **Step 5: Run tests**

Run: `npx vitest run --reporter=verbose`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add content/methodology/deep.yml content/methodology/mvp.yml content/methodology/custom-defaults.yml content/methodology/multi-service-overlay.yml tests/evals/exemptions.bash
git commit -m "feat: register multi-service steps in presets, add overlay YAML and output exemptions"
```

---

### Task 11: E2E integration test

**Files:**
- Create: `src/e2e/multi-service-pipeline.test.ts`

Write `src/e2e/multi-service-pipeline.test.ts` following the pattern in `src/e2e/game-pipeline.test.ts`. Key differences from the game E2E test:


- [ ] **Step 1: Create E2E test following game-pipeline.test.ts pattern**

Create `src/e2e/multi-service-pipeline.test.ts`. Follow the EXACT pattern from `src/e2e/game-pipeline.test.ts` — use the same mock structure, same `discoverRealMetaPrompts()` helper (note: `discoverAllMetaPrompts` is in `src/core/assembly/meta-prompt-loader.ts` and is synchronous, taking `(pipelineDir, toolsDir)` — NOT `(projectRoot)`), same `makeOutput()` helper, and same preset loading approach (using ESM `import` for `js-yaml` and `fs`, NOT `require()`).

The test should verify:
1. When config has `services[]`, all 5 cross-service steps are enabled in the resolved overlay state
2. When config has no `services[]`, cross-service steps remain disabled
3. Knowledge injection works (e.g., `result.knowledge['system-architecture']` contains `'multi-service-architecture'`)
4. Reads injection works (e.g., `result.reads['implementation-plan']` contains `'service-ownership-map'`)
5. Dependency injection works (e.g., `result.dependencies['review-security']` contains `'cross-service-auth'`)

- [ ] **Step 2: Run the E2E test**

Run: `npx vitest run src/e2e/multi-service-pipeline.test.ts --reporter=verbose`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/e2e/multi-service-pipeline.test.ts
git commit -m "test: add multi-service pipeline E2E tests"
```

---

### Task 12: Final validation + CHANGELOG

**Files:** Modify `CHANGELOG.md`, verify everything

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run make check-all**

Run: `make check-all`
Expected: All quality gates pass (including pipeline-completeness, knowledge-quality, output-consumption evals)

- [ ] **Step 4: Verify step count in presets matches**

Run: `grep -c 'enabled:' content/methodology/deep.yml content/methodology/mvp.yml content/methodology/custom-defaults.yml`
Expected: All three files have the same count (original count + 5)

- [ ] **Step 5: Update CHANGELOG.md**

Add under the `[Unreleased]` section in `CHANGELOG.md`:

```markdown
### Added
- **Cross-service pipeline overlay** — structural overlay activated by `services[]` in config
  - 5 new pipeline steps: `service-ownership-map`, `inter-service-contracts`, `cross-service-auth`, `cross-service-observability`, `integration-test-plan`
  - 8 multi-service knowledge documents injected into 15 existing steps
  - `multi-service-overlay.yml` with step, knowledge, reads, and dependency overrides
- **`loadStructuralOverlay()`** — separate overlay loader that doesn't require `project-type` field

### Changed
- **`ProjectTypeOverlay` renamed to `PipelineOverlay`** — `projectType` is now optional (`ProjectType | undefined`) for structural overlays
- **`resolveOverlayState()`** — 4th overlay pass for structural overlays, independent of project-type block
```

- [ ] **Step 6: Commit changelog**

```bash
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG with Wave 2 cross-service pipeline additions"
```
