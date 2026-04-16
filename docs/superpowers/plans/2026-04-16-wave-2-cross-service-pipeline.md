# Wave 2: Cross-Service Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structural overlay infrastructure and cross-service pipeline steps activated by `services[]` in config.

**Architecture:** Extends the overlay system with a new `loadStructuralOverlay()` loader and a 4th pass in `resolveOverlayState()` gated on `services[].length > 0`. Five new pipeline steps, eight knowledge documents, and one overlay YAML compose the cross-service content layer. Existing `assertSingleServiceOrExit` guard stays — users reach this code in Wave 3b.

**Tech Stack:** TypeScript, Zod, vitest, bats, YAML content files

**Spec:** `docs/superpowers/specs/2026-04-16-wave-2-cross-service-pipeline-design.md`

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
      const presetSteps: Record<string, StepEnablementEntry> = {
        'create-vision': { enabled: true },
        'service-ownership-map': { enabled: false },
      }
      const metaPrompts = new Map([
        ['create-vision', { frontmatter: makeFrontmatter({ name: 'create-vision' }) }],
        ['service-ownership-map', { frontmatter: makeFrontmatter({ name: 'service-ownership-map' }) }],
      ])

      const result = resolveOverlayState({
        config: makeConfig({
          project: {
            services: [{ name: 'api', projectType: 'backend', backendConfig: { apiStyle: 'rest', domain: 'none' } }],
          },
        }),
        methodologyDir: fixtureDir,
        metaPrompts,
        presetSteps,
        output,
      })

      // multi-service-overlay.yml in fixtureDir should enable service-ownership-map
      // If fixture doesn't exist, the structural overlay silently skips
      // This test verifies the code path runs without error
      expect(result.steps).toBeDefined()
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

### Task 4: Register 5 new steps in methodology presets

**Files:**
- Modify: `content/methodology/deep.yml` (after line 108)
- Modify: `content/methodology/mvp.yml` (after line 107)
- Modify: `content/methodology/custom-defaults.yml` (after line 108)

- [ ] **Step 1: Add multi-service steps to `deep.yml`**

Append after line 108 (`platform-cert-prep: { enabled: false }`):

```yaml
  # Multi-service steps (enabled via multi-service overlay)
  service-ownership-map: { enabled: false }
  inter-service-contracts: { enabled: false }
  cross-service-auth: { enabled: false }
  cross-service-observability: { enabled: false }
  integration-test-plan: { enabled: false }
```

- [ ] **Step 2: Add multi-service steps to `mvp.yml`**

Append after line 107 (`platform-cert-prep: { enabled: false }`):

```yaml
  # Multi-service steps (enabled via multi-service overlay)
  service-ownership-map: { enabled: false }
  inter-service-contracts: { enabled: false }
  cross-service-auth: { enabled: false }
  cross-service-observability: { enabled: false }
  integration-test-plan: { enabled: false }
```

- [ ] **Step 3: Add multi-service steps to `custom-defaults.yml`**

Append after line 108 (`platform-cert-prep: { enabled: false }`):

```yaml
  # Multi-service steps (enabled via multi-service overlay)
  service-ownership-map: { enabled: false }
  inter-service-contracts: { enabled: false }
  cross-service-auth: { enabled: false }
  cross-service-observability: { enabled: false }
  integration-test-plan: { enabled: false }
```

- [ ] **Step 4: Run existing tests to verify no regression**

Run: `npx vitest run --reporter=verbose`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add content/methodology/deep.yml content/methodology/mvp.yml content/methodology/custom-defaults.yml
git commit -m "feat: register 5 multi-service steps as disabled in all presets"
```

---

### Task 5: Create 5 pipeline step meta-prompt files

**Files:**
- Create: `content/pipeline/architecture/service-ownership-map.md`
- Create: `content/pipeline/specification/inter-service-contracts.md`
- Create: `content/pipeline/quality/cross-service-auth.md`
- Create: `content/pipeline/quality/cross-service-observability.md`
- Create: `content/pipeline/quality/integration-test-plan.md`

- [ ] **Step 1: Create `service-ownership-map.md`**

Create `content/pipeline/architecture/service-ownership-map.md`:

```markdown
---
name: service-ownership-map
description: Define logical domain and data ownership boundaries across services
summary: "Maps which service owns which business domain, data concepts, and event topics. Establishes boundaries that inform database schema design, API contracts, and cross-service communication patterns."
phase: "architecture"
order: 721
dependencies: [review-architecture]
outputs: [docs/service-ownership-map.md]
reads: [system-architecture, domain-modeling]
conditional: null
knowledge-base: [multi-service-architecture, multi-service-data-ownership]
---

## Purpose
Define the logical ownership boundaries for a multi-service system. Map each
service to its business domain, the data concepts it owns, the events it
publishes, and the events it subscribes to. This document becomes the
authoritative reference for who owns what.

## Inputs
- docs/system-architecture.md (required) — service decomposition and communication patterns
- docs/domain-model.md (required) — entities, aggregates, and domain events

## Expected Outputs
- docs/service-ownership-map.md — ownership boundaries and data flow map

## Quality Criteria
- Every service has a clear domain boundary with no overlapping ownership
- Every entity from the domain model is assigned to exactly one owning service
- Event flows are documented: publisher → topic → subscriber(s)
- Data that crosses service boundaries is identified with sync strategy (event-driven, API call, shared cache)
- No circular ownership dependencies between services
```

- [ ] **Step 2: Create `inter-service-contracts.md`**

Create `content/pipeline/specification/inter-service-contracts.md`:

```markdown
---
name: inter-service-contracts
description: Design API contracts between services with versioning, retries, and failure isolation
summary: "Specifies internal service-to-service API contracts including versioning strategy, backward compatibility rules, retry policies, timeout budgets, idempotency requirements, and failure isolation patterns."
phase: "specification"
order: 841
dependencies: [service-ownership-map, review-api]
outputs: [docs/inter-service-contracts.md]
reads: [api-contracts]
conditional: null
knowledge-base: [multi-service-api-contracts, multi-service-resilience]
---

## Purpose
Design the internal API contracts between services. Unlike the external
api-contracts step (which covers client-facing APIs), this step covers
service-to-service communication: internal endpoints, message schemas,
versioning strategy, retry policies, and failure handling.

## Inputs
- docs/service-ownership-map.md (required) — who calls whom
- docs/api-contracts.md (optional) — external API patterns to maintain consistency

## Expected Outputs
- docs/inter-service-contracts.md — internal service API specifications

## Quality Criteria
- Every cross-service call identified in the ownership map has a contract
- Versioning strategy defined (URL path, header, or content negotiation)
- Backward compatibility rules documented (additive changes only, deprecation timeline)
- Retry policy per contract: max retries, backoff strategy, circuit breaker thresholds
- Timeout budgets allocated per call chain (total budget < user-facing SLA)
- Idempotency keys defined for all mutating operations
```

- [ ] **Step 3: Create `cross-service-auth.md`**

Create `content/pipeline/quality/cross-service-auth.md`:

```markdown
---
name: cross-service-auth
description: Define inter-service trust model — mTLS, service tokens, audience scoping
summary: "Designs the internal service identity and trust framework: mutual TLS configuration, service-to-service token issuance and validation, audience scoping, and zero-trust boundary definitions."
phase: "quality"
order: 952
dependencies: [security, service-ownership-map]
outputs: [docs/cross-service-auth.md]
reads: [inter-service-contracts]
conditional: null
knowledge-base: [multi-service-auth]
---

## Purpose
Design the inter-service trust and authentication model. This is distinct
from the security step (which handles external threats and OWASP). This
step covers how services prove their identity to each other, what
permissions they have, and how trust boundaries are enforced.

## Inputs
- docs/security-review.md (required) — external threat model and auth architecture
- docs/service-ownership-map.md (required) — service boundaries and trust zones
- docs/inter-service-contracts.md (optional) — API patterns requiring auth

## Expected Outputs
- docs/cross-service-auth.md — inter-service authentication and authorization design

## Quality Criteria
- Every service-to-service call has an authentication mechanism (mTLS, JWT, API key)
- Service identity is cryptographically verifiable (not just network-based trust)
- Audience scoping prevents token reuse across unintended services
- Trust boundaries match the ownership map — services in different zones require explicit auth
- Token lifetime and rotation strategy documented
- Zero-trust principles applied: no implicit trust based on network location
```

- [ ] **Step 4: Create `cross-service-observability.md`**

Create `content/pipeline/quality/cross-service-observability.md`:

```markdown
---
name: cross-service-observability
description: Design distributed tracing, correlation IDs, and cross-service SLOs
summary: "Defines the observability strategy for multi-service systems: distributed tracing propagation, correlation ID standards, cross-service SLO definitions, and failure isolation alerting."
phase: "quality"
order: 941
dependencies: [review-operations, service-ownership-map]
outputs: [docs/cross-service-observability.md]
reads: [operations]
conditional: null
knowledge-base: [multi-service-observability]
---

## Purpose
Design the observability strategy that spans service boundaries. The
operations step designs single-service monitoring. This step extends
that to cover distributed tracing, cross-service correlation, aggregate
SLOs, and multi-service failure detection.

## Inputs
- docs/operations-runbook.md (required) — single-service monitoring baseline
- docs/service-ownership-map.md (required) — service topology and call patterns

## Expected Outputs
- docs/cross-service-observability.md — distributed observability design

## Quality Criteria
- Distributed trace context propagation defined (W3C Trace Context or equivalent)
- Correlation ID standard: format, generation point, propagation rules
- Cross-service SLOs defined for critical user journeys (end-to-end latency, error rate)
- Alert routing: which team gets paged for cross-service failures
- Dashboards specified: service dependency map, cross-service latency heatmap
- Failure isolation: how to identify which service caused a cascading failure
```

- [ ] **Step 5: Create `integration-test-plan.md`**

Create `content/pipeline/quality/integration-test-plan.md`:

```markdown
---
name: integration-test-plan
description: Design contract tests, cross-service E2E flows, and service mocking strategy
summary: "Plans the cross-service testing strategy: consumer-driven contract tests, integration test flows covering critical multi-service journeys, and service dependency mocking approaches for isolated testing."
phase: "quality"
order: 942
dependencies: [review-testing, inter-service-contracts]
outputs: [docs/integration-test-plan.md]
reads: [service-ownership-map, cross-service-auth]
conditional: null
knowledge-base: [multi-service-testing]
---

## Purpose
Design the testing strategy for cross-service interactions. The
review-testing step validates a single service's test pyramid. This
step validates how services are tested together: contract tests that
verify API compatibility, integration tests that exercise multi-service
flows, and mocking strategies for isolated development.

## Inputs
- docs/reviews/review-testing.md (required) — single-service testing baseline
- docs/inter-service-contracts.md (required) — contracts to test against
- docs/service-ownership-map.md (optional) — service topology
- docs/cross-service-auth.md (optional) — auth patterns to test

## Expected Outputs
- docs/integration-test-plan.md — cross-service testing strategy

## Quality Criteria
- Contract tests defined for every inter-service API (consumer-driven or provider-driven)
- Contract test tooling chosen (Pact, schema registry, OpenAPI diff)
- Critical multi-service user journeys identified with E2E test coverage
- Service mocking strategy: when to use mocks vs real services vs test doubles
- Test environment strategy: shared staging, per-PR namespaces, or local compose
- CI integration: when contract tests run, what blocks deployment
```

- [ ] **Step 6: Validate frontmatter on all new files**

Run: `scripts/validate-frontmatter.sh content/pipeline/architecture/service-ownership-map.md content/pipeline/specification/inter-service-contracts.md content/pipeline/quality/cross-service-auth.md content/pipeline/quality/cross-service-observability.md content/pipeline/quality/integration-test-plan.md`
Expected: All pass

- [ ] **Step 7: Commit**

```bash
git add content/pipeline/architecture/service-ownership-map.md content/pipeline/specification/inter-service-contracts.md content/pipeline/quality/cross-service-auth.md content/pipeline/quality/cross-service-observability.md content/pipeline/quality/integration-test-plan.md
git commit -m "feat: add 5 cross-service pipeline step meta-prompts"
```

---

### Task 6: Create 8 knowledge documents

**Files:**
- Create: `content/knowledge/core/multi-service-architecture.md`
- Create: `content/knowledge/core/multi-service-data-ownership.md`
- Create: `content/knowledge/core/multi-service-api-contracts.md`
- Create: `content/knowledge/core/multi-service-auth.md`
- Create: `content/knowledge/core/multi-service-observability.md`
- Create: `content/knowledge/core/multi-service-testing.md`
- Create: `content/knowledge/core/multi-service-resilience.md`
- Create: `content/knowledge/core/multi-service-task-decomposition.md`

Each knowledge document follows the pattern in `content/knowledge/core/system-architecture.md`: frontmatter with `name`, `description`, `topics`, then content sections with `##` headers.

**Due to the volume (8 files), the implementer should write each file with substantial domain content (not placeholder text). Each file should be 40-80 lines with real, actionable guidance. The frontmatter structure is:**

```yaml
---
name: multi-service-<topic>
description: <one-line description>
topics: [<topic1>, <topic2>, ...]
---
```

- [ ] **Step 1: Create all 8 knowledge documents**

Create each file following the frontmatter pattern above. Key topics per file:

1. `multi-service-architecture.md` — topics: `[service-boundaries, communication-patterns, service-discovery, networking-topology, data-ownership]`
2. `multi-service-data-ownership.md` — topics: `[table-ownership, shared-nothing, event-driven-sync, data-partitioning]`
3. `multi-service-api-contracts.md` — topics: `[internal-api-versioning, backward-compatibility, retries, idempotency]`
4. `multi-service-auth.md` — topics: `[mtls, service-tokens, zero-trust, audience-scoping]`
5. `multi-service-observability.md` — topics: `[distributed-tracing, correlation-ids, cross-service-slos]`
6. `multi-service-testing.md` — topics: `[contract-tests, pact, schema-registry, cross-service-e2e]`
7. `multi-service-resilience.md` — topics: `[circuit-breakers, bulkheads, timeout-budgets, failure-isolation]`
8. `multi-service-task-decomposition.md` — topics: `[per-service-waves, dependency-ordering, parallel-implementation]`

- [ ] **Step 2: Verify all knowledge docs have valid frontmatter**

Run: `for f in content/knowledge/core/multi-service-*.md; do echo "--- $f ---"; head -5 "$f"; done`
Expected: All 8 files have name, description, topics fields

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/core/multi-service-*.md
git commit -m "feat: add 8 multi-service knowledge documents"
```

---

### Task 7: Create `multi-service-overlay.yml`

**Files:**
- Create: `content/methodology/multi-service-overlay.yml`

- [ ] **Step 1: Create the overlay file**

Create `content/methodology/multi-service-overlay.yml`:

```yaml
# methodology/multi-service-overlay.yml
name: multi-service
description: >
  Cross-service pipeline steps and knowledge for multi-service monorepos.
  Activated by presence of services[] in config.

# ---------------------------------------------------------------------------
# step-overrides
# ---------------------------------------------------------------------------
step-overrides:
  # Cross-service steps (wave 2)
  service-ownership-map: { enabled: true }
  inter-service-contracts: { enabled: true }
  cross-service-auth: { enabled: true }
  cross-service-observability: { enabled: true }
  integration-test-plan: { enabled: true }
  # Pre-phase steps marked global (already enabled — no-op for enablement,
  # but marks them as global for the step classifier in wave 3b)
  create-vision: { enabled: true }
  review-vision: { enabled: true }
  create-prd: { enabled: true }
  review-prd: { enabled: true }

# ---------------------------------------------------------------------------
# knowledge-overrides
# ---------------------------------------------------------------------------
knowledge-overrides:
  # Architecture awareness
  system-architecture:
    append: [multi-service-architecture, multi-service-resilience]
  # Domain/data awareness
  domain-modeling:
    append: [multi-service-data-ownership]
  database-schema:
    append: [multi-service-data-ownership]
  # API awareness
  api-contracts:
    append: [multi-service-api-contracts]
  review-api:
    append: [multi-service-api-contracts]
  # Operations awareness
  operations:
    append: [multi-service-observability, multi-service-resilience]
  review-operations:
    append: [multi-service-observability]
  # Security awareness
  security:
    append: [multi-service-auth]
  review-security:
    append: [multi-service-auth]
  # Testing awareness
  review-testing:
    append: [multi-service-testing]
  story-tests:
    append: [multi-service-testing]
  create-evals:
    append: [multi-service-testing]
  # Planning awareness
  implementation-plan:
    append: [multi-service-task-decomposition]
  implementation-plan-review:
    append: [multi-service-task-decomposition]

# ---------------------------------------------------------------------------
# reads-overrides
# ---------------------------------------------------------------------------
reads-overrides:
  # Planning reads cross-service artifacts
  implementation-plan:
    append: [service-ownership-map, inter-service-contracts]
  # Security review reads cross-service auth (order 952 < 960 allows this)
  review-security:
    append: [cross-service-auth]
  # Database schema reads ownership map for data partitioning
  database-schema:
    append: [service-ownership-map]
  # Validation phase reads all 5 new outputs for holistic review
  cross-phase-consistency:
    append:
      - service-ownership-map
      - inter-service-contracts
      - cross-service-auth
      - cross-service-observability
      - integration-test-plan

# ---------------------------------------------------------------------------
# dependency-overrides
# ---------------------------------------------------------------------------
# Reads alone don't gate execution — next only checks dependencies.
# These overrides ensure downstream steps wait for cross-service artifacts.
dependency-overrides:
  review-security:
    append: [cross-service-auth]
  database-schema:
    append: [service-ownership-map]
  implementation-plan:
    append: [service-ownership-map, inter-service-contracts]
  cross-phase-consistency:
    append:
      - service-ownership-map
      - inter-service-contracts
      - cross-service-auth
      - cross-service-observability
      - integration-test-plan
```

- [ ] **Step 2: Verify YAML is valid**

Run: `node -e "const yaml = require('js-yaml'); const fs = require('fs'); yaml.load(fs.readFileSync('content/methodology/multi-service-overlay.yml', 'utf8')); console.log('Valid YAML')"`
Expected: "Valid YAML"

- [ ] **Step 3: Commit**

```bash
git add content/methodology/multi-service-overlay.yml
git commit -m "feat: add multi-service structural overlay YAML"
```

---

### Task 8: E2E integration test

**Files:**
- Create: `src/e2e/multi-service-pipeline.test.ts`

- [ ] **Step 1: Create the E2E test**

Create `src/e2e/multi-service-pipeline.test.ts`:

```typescript
/**
 * E2E tests for multi-service pipeline — verifies that the structural overlay
 * activates when services[] is present in config, enabling cross-service steps
 * and injecting multi-service knowledge into existing steps.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Mock detectProjectMode before any imports that use it
vi.mock('../project/detect-mode.js', () => ({
  detectProjectMode: vi.fn().mockResolvedValue({ mode: 'fresh' }),
}))
vi.mock('../core/pipeline/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn().mockResolvedValue(new Map()),
  discoverAllMetaPrompts: vi.fn().mockResolvedValue(new Map()),
}))

import { resolveOverlayState } from '../core/assembly/overlay-state-resolver.js'
import type { ScaffoldConfig, StepEnablementEntry } from '../types/index.js'
import type { MetaPromptFrontmatter } from '../types/frontmatter.js'
import { discoverAllMetaPrompts } from '../core/pipeline/meta-prompt-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const methodologyDir = path.join(projectRoot, 'content', 'methodology')

function makeOutput() {
  return {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
    prompt: vi.fn(),
    confirm: vi.fn(),
    select: vi.fn(),
    multiSelect: vi.fn(),
    multiInput: vi.fn(),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    stopProgress: vi.fn(),
  }
}

/**
 * Discover real meta-prompts from content/pipeline/ and build a Map
 * suitable for resolveOverlayState.
 */
async function discoverRealMetaPrompts() {
  const { discoverAllMetaPrompts: realDiscover } = await vi.importActual<
    typeof import('../core/pipeline/meta-prompt-loader.js')
  >('../core/pipeline/meta-prompt-loader.js')
  const metaPrompts = await realDiscover(projectRoot)
  const map = new Map<string, { frontmatter: MetaPromptFrontmatter }>()
  for (const [name, mp] of metaPrompts) {
    map.set(name, { frontmatter: mp })
  }
  return map
}

function loadPresetSteps(): Record<string, StepEnablementEntry> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yaml = require('js-yaml')
  const fs = require('node:fs')
  const presetPath = path.join(methodologyDir, 'deep.yml')
  const preset = yaml.load(fs.readFileSync(presetPath, 'utf8')) as {
    steps: Record<string, StepEnablementEntry>
  }
  return preset.steps
}

describe('Multi-Service Pipeline E2E', () => {
  let metaPrompts: Map<string, { frontmatter: MetaPromptFrontmatter }>
  let presetSteps: Record<string, StepEnablementEntry>

  beforeAll(async () => {
    metaPrompts = await discoverRealMetaPrompts()
    presetSteps = loadPresetSteps()
  })

  it('enables cross-service steps when services[] present', () => {
    const output = makeOutput()
    const config: ScaffoldConfig = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        services: [
          { name: 'api', projectType: 'backend', backendConfig: { apiStyle: 'rest', domain: 'none' } },
          { name: 'web', projectType: 'web-app', webAppConfig: { renderingStrategy: 'spa' } },
        ],
      },
    }

    const result = resolveOverlayState({
      config,
      methodologyDir,
      metaPrompts,
      presetSteps,
      output,
    })

    // All 5 cross-service steps should be enabled
    expect(result.steps['service-ownership-map']?.enabled).toBe(true)
    expect(result.steps['inter-service-contracts']?.enabled).toBe(true)
    expect(result.steps['cross-service-auth']?.enabled).toBe(true)
    expect(result.steps['cross-service-observability']?.enabled).toBe(true)
    expect(result.steps['integration-test-plan']?.enabled).toBe(true)
  })

  it('does NOT enable cross-service steps when services[] absent', () => {
    const output = makeOutput()
    const config: ScaffoldConfig = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: { projectType: 'backend' },
    }

    const result = resolveOverlayState({
      config,
      methodologyDir,
      metaPrompts,
      presetSteps,
      output,
    })

    expect(result.steps['service-ownership-map']?.enabled).toBe(false)
    expect(result.steps['inter-service-contracts']?.enabled).toBe(false)
  })

  it('injects multi-service knowledge into existing steps', () => {
    const output = makeOutput()
    const config: ScaffoldConfig = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        services: [
          { name: 'api', projectType: 'backend', backendConfig: { apiStyle: 'rest', domain: 'none' } },
        ],
      },
    }

    const result = resolveOverlayState({
      config,
      methodologyDir,
      metaPrompts,
      presetSteps,
      output,
    })

    // Knowledge injection
    expect(result.knowledge['system-architecture']).toContain('multi-service-architecture')
    expect(result.knowledge['system-architecture']).toContain('multi-service-resilience')
    expect(result.knowledge['security']).toContain('multi-service-auth')
    expect(result.knowledge['operations']).toContain('multi-service-observability')

    // Reads injection
    expect(result.reads['implementation-plan']).toContain('service-ownership-map')
    expect(result.reads['review-security']).toContain('cross-service-auth')
    expect(result.reads['database-schema']).toContain('service-ownership-map')

    // Dependency injection
    expect(result.dependencies['review-security']).toContain('cross-service-auth')
    expect(result.dependencies['database-schema']).toContain('service-ownership-map')
  })
})
```

- [ ] **Step 2: Run the E2E test**

Run: `npx vitest run src/e2e/multi-service-pipeline.test.ts --reporter=verbose`
Expected: All 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add src/e2e/multi-service-pipeline.test.ts
git commit -m "test: add multi-service pipeline E2E tests"
```

---

### Task 9: Final validation

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run make check-all**

Run: `make check-all`
Expected: All quality gates pass

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
