# Overlay `crossReads` Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow structural overlays (`multi-service-overlay.yml`) to append per-step `crossReads` entries via a new `cross-reads-overrides` section, completing the Wave 3c seam from v3.17.0.

**Architecture:** Mirrors the existing `knowledge-overrides` append-only pattern. A new `CrossReadsOverride` type plus `crossReadsOverrides` on `PipelineOverlay`. Parser in `overlay-loader.ts` with item-level warnings. `loadOverlay` (project-type) strips the section with a new warning; `loadStructuralOverlay` accepts it. A new `applyCrossReadsOverrides` helper in `overlay-resolver.ts` extends `applyOverlay`'s signature/return with a fifth map. `resolveOverlayState` threads the map through both overlay passes. `OverlayState.crossReads` becomes required. `resolveTransitiveCrossReads` gains an optional `overlayCrossReads?` param (last position) so transitive recursion reads overlay-first. All 13 tasks use TDD.

**Tech Stack:** TypeScript, vitest, js-yaml, Node.js `fs`.

**Spec:** `docs/superpowers/specs/2026-04-19-overlay-cross-reads-overrides-design.md`

**Pre-flight:** Already on a dedicated feature branch (`feat/overlay-cross-reads-overrides`). Each task ends with a commit.

---

## Task Map

| # | Title | Files | Risk |
|---|-------|-------|------|
| 1 | Warning factories | 2 | — |
| 2 | `CrossReadsOverride` type + `PipelineOverlay.crossReadsOverrides` | 2 | — |
| 3 | `parseCrossReadsOverrides()` | 2 | parser edge cases |
| 4 | Wire parser into `loadStructuralOverlay` | 2 | — |
| 5 | Strip `cross-reads-overrides` from `loadOverlay` (project-type) | 2 | — |
| 6 | Defense-in-depth strip in `loadSubOverlay` | 2 | unreachable branch — test strip logic directly |
| 7 | `applyCrossReadsOverrides` + extend `applyOverlay` signature | 3 | cross-task type ripple |
| 8 | Make `OverlayState.crossReads` required + fix hoisted mocks | 5 | ripple through next/status/run test mocks |
| 9 | `resolveOverlayState` threads `crossReadsMap` through both passes | 2 | five-map reassignment |
| 10 | `resolver.ts` fallback branch builds frontmatter `crossReads` | 2 | config=null regression |
| 11 | `resolveTransitiveCrossReads` gets `overlayCrossReads?` param | 2 | preserve `foreignMeta` guard |
| 12 | `run.ts` passes `pipeline.overlay.crossReads` to transitive resolver | 2 | mock signature update |
| 13 | E2E: overlay-only cross-read surfaces through `buildGraph` | 1 | — |

---

## Task 1: Warning factories (`overlayMalformedAppendItem` + `overlayCrossReadsNotAllowed`)

**Files:**
- Modify: `src/utils/errors.ts` (add factories after `overlayMalformedSection`, line ~326)
- Test: `src/utils/errors.test.ts`

**Goal:** Two new warning factories for the parser and the project-type overlay gate.

- [ ] **Step 1: Write failing tests**

Append to the existing `describe('error factories — shape', ...)` block in `src/utils/errors.test.ts`. Find the block at line 38 and add new `it(...)` cases inside it (do not add a new describe). Also add both factories to the top-level import list:

```typescript
// Add to the imports at the top of src/utils/errors.test.ts
// (append to the existing multi-line import from '../utils/errors.ts')
  overlayMalformedAppendItem,
  overlayCrossReadsNotAllowed,
```

Then append these two tests inside the existing `describe('error factories — shape', ...)`:

```typescript
it('overlayMalformedAppendItem produces a ScaffoldWarning with code, message, and context', () => {
  const w = overlayMalformedAppendItem('system-architecture', 3, '/path/overlay.yml')
  expect(w.code).toBe('OVERLAY_MALFORMED_APPEND_ITEM')
  expect(w.message).toContain('system-architecture')
  expect(w.message).toContain('append[3]')
  expect(w.context).toEqual({
    step: 'system-architecture',
    index: 3,
    file: '/path/overlay.yml',
  })
})

it('overlayCrossReadsNotAllowed produces a ScaffoldWarning using basename of file', () => {
  const w = overlayCrossReadsNotAllowed('/some/absolute/path/backend-overlay.yml')
  expect(w.code).toBe('OVERLAY_CROSS_READS_NOT_ALLOWED')
  expect(w.message).toContain('structural overlays')
  expect(w.message).toContain('backend-overlay.yml')
  expect(w.message).not.toContain('/some/absolute/path')
  expect(w.context).toEqual({ file: '/some/absolute/path/backend-overlay.yml' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/errors.test.ts -t "overlayMalformed\|overlayCrossReads"`
Expected: FAIL — both factories not exported.

- [ ] **Step 3: Add `path` import + factories in `src/utils/errors.ts`**

At the top of `src/utils/errors.ts`, add the `path` import if not already present:

```typescript
import path from 'node:path'
```

Then append after `overlayMalformedSection` (around line 326):

```typescript
export function overlayMalformedAppendItem(
  step: string,
  index: number,
  file: string,
): ScaffoldWarning {
  return {
    code: 'OVERLAY_MALFORMED_APPEND_ITEM',
    message: `Overlay entry "${step}" append[${index}] is malformed — ignoring that item`,
    context: { step, index, file },
  }
}

export function overlayCrossReadsNotAllowed(file: string): ScaffoldWarning {
  return {
    code: 'OVERLAY_CROSS_READS_NOT_ALLOWED',
    message:
      'cross-reads-overrides is only valid in structural overlays — '
      + `stripping from ${path.basename(file)}`,
    context: { file },
  }
}
```

- [ ] **Step 4: Run tests to verify pass + tsc**

Run: `npx vitest run src/utils/errors.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/errors.ts src/utils/errors.test.ts
git commit -m "feat(overlay): add overlayMalformedAppendItem + overlayCrossReadsNotAllowed warning factories"
```

---

## Task 2: `CrossReadsOverride` type + `PipelineOverlay.crossReadsOverrides`

**Files:**
- Modify: `src/types/config.ts` (add type + field around line 80–110)
- Test: `src/types/config.test.ts`

**Goal:** Define the append-only override shape and thread it through `PipelineOverlay`.

- [ ] **Step 1: Write failing test**

Append to `src/types/config.test.ts`:

```typescript
describe('CrossReadsOverride + PipelineOverlay.crossReadsOverrides (cross-reads overrides feature)', () => {
  it('PipelineOverlay literal with crossReadsOverrides compiles and round-trips', () => {
    const overlay: PipelineOverlay = {
      name: 'test',
      description: 'desc',
      stepOverrides: {},
      knowledgeOverrides: {},
      readsOverrides: {},
      dependencyOverrides: {},
      crossReadsOverrides: {
        'system-architecture': {
          append: [{ service: 'billing', step: 'api-contracts' }],
        },
      },
    }
    expect(overlay.crossReadsOverrides['system-architecture'].append).toHaveLength(1)
    expect(overlay.crossReadsOverrides['system-architecture'].append[0]).toEqual({
      service: 'billing',
      step: 'api-contracts',
    })
  })

  it('PipelineOverlay requires crossReadsOverrides (empty object allowed)', () => {
    const overlay: PipelineOverlay = {
      name: 'test',
      description: 'desc',
      stepOverrides: {},
      knowledgeOverrides: {},
      readsOverrides: {},
      dependencyOverrides: {},
      crossReadsOverrides: {},
    }
    expect(overlay.crossReadsOverrides).toEqual({})
  })
})
```

Ensure `PipelineOverlay` is imported at the top of the test file.

- [ ] **Step 2: Run tests to verify they fail (tsc failure expected)**

Run: `npx tsc --noEmit`
Expected: FAIL — `crossReadsOverrides` not assignable / property missing.

- [ ] **Step 3: Add `CrossReadsOverride` interface in `src/types/config.ts`**

Insert after the existing `DependencyOverride` interface (around line 96, before `PipelineOverlay`):

```typescript
/** Override entry for cross-reads (append-only; Wave 3c+1). */
export interface CrossReadsOverride {
  append: Array<{ service: string; step: string }>
}
```

- [ ] **Step 4: Add `crossReadsOverrides` to `PipelineOverlay` in `src/types/config.ts`**

Modify the `PipelineOverlay` interface. Find the existing block (it currently has `stepOverrides`, `knowledgeOverrides`, `readsOverrides`, `dependencyOverrides`) and add `crossReadsOverrides`:

```typescript
/** Pipeline overlay definition (project-type or structural). */
export interface PipelineOverlay {
  name: string
  description: string
  projectType?: ProjectType
  stepOverrides: Record<string, StepEnablementEntry>
  knowledgeOverrides: Record<string, KnowledgeOverride>
  readsOverrides: Record<string, ReadsOverride>
  dependencyOverrides: Record<string, DependencyOverride>
  crossReadsOverrides: Record<string, CrossReadsOverride>
}
```

- [ ] **Step 5: Run tests to verify pass + tsc**

Run: `npx vitest run src/types/config.test.ts && npx tsc --noEmit`
Expected: PASS.

The tsc pass means existing `PipelineOverlay` constructors (in overlay-loader, test fixtures) are breaking. That's intentional — we'll fix them in Task 4 (loader) and Task 8 (test fixtures). For now, the minimum fix keeping tsc green is to add `crossReadsOverrides: {}` to every compile-site that fails. Run `npx tsc --noEmit 2>&1 | head -40` to see which files need it, then add the field as `crossReadsOverrides: {}` wherever the error says "missing property":

Run: `npx tsc --noEmit 2>&1 | grep "crossReadsOverrides" | head -20`

Expected locations based on the spec's §6 file list:
- `src/core/assembly/overlay-loader.ts` — two `PipelineOverlay` literals (in `loadOverlay`, `loadStructuralOverlay`). Add `crossReadsOverrides: {}` to each. The full parser wiring comes in Task 4.
- `src/core/assembly/overlay-loader-structural.test.ts` — any `PipelineOverlay` test literal.
- `src/types/config.test.ts` — same, but the new tests you just added already include `crossReadsOverrides`.

Apply minimum patches (just `crossReadsOverrides: {}` to each failing site) so `npx tsc --noEmit` is clean.

- [ ] **Step 6: Run full type check + regression**

Run: `npx tsc --noEmit && npx vitest run src/types/config.test.ts src/core/assembly/overlay-loader-structural.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/config.ts src/types/config.test.ts src/core/assembly/overlay-loader.ts src/core/assembly/overlay-loader-structural.test.ts
git commit -m "feat(overlay): add CrossReadsOverride + crossReadsOverrides on PipelineOverlay"
```

---

## Task 3: `parseCrossReadsOverrides()` implementation

**Files:**
- Modify: `src/core/assembly/overlay-loader.ts` (add parser near line 134, after `parseDependencyOverrides`)
- Test: `src/core/assembly/overlay-loader.test.ts` (create if missing)

**Goal:** Implement the parser with full item-level warning coverage.

- [ ] **Step 1: Check if `overlay-loader.test.ts` exists**

Run: `ls src/core/assembly/overlay-loader.test.ts 2>/dev/null || echo "NOT FOUND"`

If NOT FOUND, create a stub file at `src/core/assembly/overlay-loader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseCrossReadsOverrides } from './overlay-loader.js'
import type { ScaffoldWarning } from '../../types/index.js'
```

If it already exists, just add the import line for `parseCrossReadsOverrides` to the existing import block at the top.

- [ ] **Step 2: Write failing parser tests**

Append to `src/core/assembly/overlay-loader.test.ts`:

```typescript
describe('parseCrossReadsOverrides', () => {
  it('parses valid entries', () => {
    const warnings: ScaffoldWarning[] = []
    const result = parseCrossReadsOverrides(
      {
        'system-architecture': {
          append: [
            { service: 'billing', step: 'api-contracts' },
            { service: 'inventory', step: 'domain-modeling' },
          ],
        },
      },
      warnings,
      '/path/to.yml',
    )
    expect(result['system-architecture'].append).toEqual([
      { service: 'billing', step: 'api-contracts' },
      { service: 'inventory', step: 'domain-modeling' },
    ])
    expect(warnings).toHaveLength(0)
  })

  it('warns when entry value is not an object (OVERLAY_MALFORMED_ENTRY)', () => {
    const warnings: ScaffoldWarning[] = []
    const result = parseCrossReadsOverrides(
      { 'system-architecture': 'not-an-object' as unknown as Record<string, unknown> },
      warnings,
      '/path/to.yml',
    )
    expect(result['system-architecture']).toBeUndefined()
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('OVERLAY_MALFORMED_ENTRY')
  })

  it('warns when append is present but not an array', () => {
    const warnings: ScaffoldWarning[] = []
    const result = parseCrossReadsOverrides(
      { 'system-architecture': { append: 'not-an-array' } as unknown as Record<string, unknown> },
      warnings,
      '/path/to.yml',
    )
    expect(result['system-architecture'].append).toEqual([])
    expect(warnings.some(w => w.code === 'OVERLAY_MALFORMED_ENTRY')).toBe(true)
  })

  it('warns when append item is not an object, preserving valid siblings', () => {
    const warnings: ScaffoldWarning[] = []
    const result = parseCrossReadsOverrides(
      {
        'system-architecture': {
          append: [
            { service: 'billing', step: 'api-contracts' },
            'not-an-object' as unknown,
            { service: 'inventory', step: 'domain-modeling' },
          ],
        } as unknown as Record<string, unknown>,
      },
      warnings,
      '/path/to.yml',
    )
    expect(result['system-architecture'].append).toHaveLength(2)
    expect(warnings.some(w => w.code === 'OVERLAY_MALFORMED_APPEND_ITEM')).toBe(true)
  })

  it('warns when append item is missing service or step', () => {
    const warnings: ScaffoldWarning[] = []
    const result = parseCrossReadsOverrides(
      {
        'system-architecture': {
          append: [
            { service: 'billing' },            // missing step
            { step: 'api-contracts' },         // missing service
          ],
        } as unknown as Record<string, unknown>,
      },
      warnings,
      '/path/to.yml',
    )
    expect(result['system-architecture'].append).toHaveLength(0)
    const itemWarnings = warnings.filter(w => w.code === 'OVERLAY_MALFORMED_APPEND_ITEM')
    expect(itemWarnings).toHaveLength(2)
  })

  it('warns when append item has non-kebab-case slug', () => {
    const warnings: ScaffoldWarning[] = []
    const result = parseCrossReadsOverrides(
      {
        'system-architecture': {
          append: [
            { service: 'Bad_Service', step: 'api-contracts' },
            { service: 'billing', step: 'UpperCase' },
          ],
        } as unknown as Record<string, unknown>,
      },
      warnings,
      '/path/to.yml',
    )
    expect(result['system-architecture'].append).toHaveLength(0)
    expect(warnings.filter(w => w.code === 'OVERLAY_MALFORMED_APPEND_ITEM')).toHaveLength(2)
  })

  it('returns empty append array for entry with no append field', () => {
    const warnings: ScaffoldWarning[] = []
    const result = parseCrossReadsOverrides(
      { 'system-architecture': {} },
      warnings,
      '/path/to.yml',
    )
    expect(result['system-architecture']).toEqual({ append: [] })
    expect(warnings).toHaveLength(0)
  })

  it('includes correct index in OVERLAY_MALFORMED_APPEND_ITEM warning context', () => {
    const warnings: ScaffoldWarning[] = []
    parseCrossReadsOverrides(
      {
        'system-architecture': {
          append: [
            { service: 'billing', step: 'api-contracts' },   // 0 — valid
            'bad' as unknown,                                   // 1 — malformed
          ],
        } as unknown as Record<string, unknown>,
      },
      warnings,
      '/path/to.yml',
    )
    const itemWarning = warnings.find(w => w.code === 'OVERLAY_MALFORMED_APPEND_ITEM')
    expect(itemWarning?.context?.index).toBe(1)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts -t "parseCrossReadsOverrides"`
Expected: FAIL — `parseCrossReadsOverrides` is not exported.

- [ ] **Step 4: Implement `parseCrossReadsOverrides` in `src/core/assembly/overlay-loader.ts`**

Add the import for the new types + warning factory at the top of the file (near the existing imports at lines 1–10):

```typescript
// Extend the existing type import
import type {
  PipelineOverlay, KnowledgeOverride, ReadsOverride, DependencyOverride,
  CrossReadsOverride,
} from '../../types/index.js'

// Extend the existing errors import
import {
  overlayMissing, overlayParseError, overlayMalformedSection, overlayMalformedEntry,
  overlayMalformedAppendItem, overlayCrossReadsNotAllowed,
} from '../../utils/errors.js'
```

Insert the parser function after `parseDependencyOverrides` (around line 134, before `loadOverlay`):

```typescript
const CROSS_READS_SLUG = /^[a-z][a-z0-9-]*$/

/** Parse cross-reads-overrides section from YAML object. */
export function parseCrossReadsOverrides(
  raw: Record<string, unknown>,
  warnings: ScaffoldWarning[],
  filePath: string,
): Record<string, CrossReadsOverride> {
  const result: Record<string, CrossReadsOverride> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isPlainObject(value)) {
      warnings.push(overlayMalformedEntry(key, 'value', filePath))
      continue
    }
    const obj = value as Record<string, unknown>
    if (obj['append'] !== undefined && !Array.isArray(obj['append'])) {
      warnings.push(overlayMalformedEntry(key, 'append', filePath))
    }
    const append: Array<{ service: string; step: string }> = []
    if (Array.isArray(obj['append'])) {
      for (let index = 0; index < obj['append'].length; index++) {
        const item = obj['append'][index]
        if (!isPlainObject(item)) {
          warnings.push(overlayMalformedAppendItem(key, index, filePath))
          continue
        }
        const entry = item as Record<string, unknown>
        if (
          typeof entry['service'] === 'string' && CROSS_READS_SLUG.test(entry['service']) &&
          typeof entry['step'] === 'string' && CROSS_READS_SLUG.test(entry['step'])
        ) {
          append.push({ service: entry['service'], step: entry['step'] })
        } else {
          warnings.push(overlayMalformedAppendItem(key, index, filePath))
        }
      }
    }
    result[key] = { append }
  }
  return result
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts -t "parseCrossReadsOverrides" && npx tsc --noEmit`
Expected: PASS — 8 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/core/assembly/overlay-loader.ts src/core/assembly/overlay-loader.test.ts
git commit -m "feat(overlay): parseCrossReadsOverrides with item-level warning coverage"
```

---

## Task 4: Wire parser into `loadStructuralOverlay`

**Files:**
- Modify: `src/core/assembly/overlay-loader.ts` (update `loadStructuralOverlay` around lines 280–359)
- Test: `src/core/assembly/overlay-loader-structural.test.ts`

**Goal:** `loadStructuralOverlay` accepts `cross-reads-overrides` and populates `PipelineOverlay.crossReadsOverrides`.

- [ ] **Step 1: Write failing tests in `src/core/assembly/overlay-loader-structural.test.ts`**

Append:

```typescript
describe('loadStructuralOverlay cross-reads-overrides (Wave 3c follow-on)', () => {
  it('parses cross-reads-overrides into crossReadsOverrides', () => {
    const tmpPath = path.join(os.tmpdir(), `struct-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: multi-service
description: test
cross-reads-overrides:
  system-architecture:
    append:
      - service: billing
        step: api-contracts
      - service: inventory
        step: domain-modeling
`)
    try {
      const { overlay, errors, warnings } = loadStructuralOverlay(tmpPath)
      expect(errors).toEqual([])
      expect(overlay).not.toBeNull()
      expect(overlay!.crossReadsOverrides['system-architecture'].append).toEqual([
        { service: 'billing', step: 'api-contracts' },
        { service: 'inventory', step: 'domain-modeling' },
      ])
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })

  it('returns empty crossReadsOverrides when section absent', () => {
    const tmpPath = path.join(os.tmpdir(), `struct-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: multi-service
description: test
`)
    try {
      const { overlay } = loadStructuralOverlay(tmpPath)
      expect(overlay!.crossReadsOverrides).toEqual({})
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })

  it('emits OVERLAY_MALFORMED_SECTION when cross-reads-overrides is wrong shape (array)', () => {
    const tmpPath = path.join(os.tmpdir(), `struct-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: multi-service
description: test
cross-reads-overrides: []
`)
    try {
      const { overlay, warnings } = loadStructuralOverlay(tmpPath)
      expect(overlay!.crossReadsOverrides).toEqual({})
      expect(warnings.some(w =>
        w.code === 'OVERLAY_MALFORMED_SECTION' &&
        String(w.context?.section) === 'cross-reads-overrides'
      )).toBe(true)
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })
})
```

If `fs`, `path`, `os` aren't already imported at the top of the test file, add them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/overlay-loader-structural.test.ts -t "cross-reads-overrides"`
Expected: FAIL — `crossReadsOverrides` is `{}` always (minimal placeholder from Task 2).

- [ ] **Step 3: Update `loadStructuralOverlay` in `src/core/assembly/overlay-loader.ts`**

Two edits in `loadStructuralOverlay` (around lines 280–359):

**3a.** Update the `overrideSections` tuple (line ~328):

```typescript
const overrideSections = [
  'step-overrides', 'knowledge-overrides', 'reads-overrides',
  'dependency-overrides', 'cross-reads-overrides',
] as const
```

**3b.** Add raw extraction + call to `parseCrossReadsOverrides` in the final `overlay` construction (around line 339):

```typescript
const stepOverridesRaw = isPlainObject(obj['step-overrides'])
  ? obj['step-overrides'] as Record<string, unknown> : {}
const knowledgeOverridesRaw = isPlainObject(obj['knowledge-overrides'])
  ? obj['knowledge-overrides'] as Record<string, unknown> : {}
const readsOverridesRaw = isPlainObject(obj['reads-overrides'])
  ? obj['reads-overrides'] as Record<string, unknown> : {}
const dependencyOverridesRaw = isPlainObject(obj['dependency-overrides'])
  ? obj['dependency-overrides'] as Record<string, unknown> : {}
const crossReadsOverridesRaw = isPlainObject(obj['cross-reads-overrides'])
  ? obj['cross-reads-overrides'] as Record<string, unknown> : {}

const overlay: PipelineOverlay = {
  name: (obj['name'] as string).trim(),
  description: (obj['description'] as string).trim(),
  stepOverrides: parseStepOverrides(stepOverridesRaw, warnings, overlayPath),
  knowledgeOverrides: parseKnowledgeOverrides(knowledgeOverridesRaw, warnings, overlayPath),
  readsOverrides: parseReadsOverrides(readsOverridesRaw, warnings, overlayPath),
  dependencyOverrides: parseDependencyOverrides(dependencyOverridesRaw, warnings, overlayPath),
  crossReadsOverrides: parseCrossReadsOverrides(crossReadsOverridesRaw, warnings, overlayPath),
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/overlay-loader-structural.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/overlay-loader.ts src/core/assembly/overlay-loader-structural.test.ts
git commit -m "feat(overlay): wire parseCrossReadsOverrides into loadStructuralOverlay"
```

---

## Task 5: Strip `cross-reads-overrides` from `loadOverlay` (project-type path)

**Files:**
- Modify: `src/core/assembly/overlay-loader.ts` (update `loadOverlay` around lines 141–233)
- Test: `src/core/assembly/overlay-loader.test.ts`

**Goal:** Project-type overlays that declare `cross-reads-overrides` get stripped with an `OVERLAY_CROSS_READS_NOT_ALLOWED` warning.

- [ ] **Step 1: Write failing tests**

Append to `src/core/assembly/overlay-loader.test.ts`. Add `loadOverlay`, `os`, `path`, `fs` to the imports if missing:

```typescript
describe('loadOverlay forbids cross-reads-overrides (structural-only constraint)', () => {
  it('emits OVERLAY_CROSS_READS_NOT_ALLOWED and returns empty crossReadsOverrides for project-type overlay', () => {
    const tmpPath = path.join(os.tmpdir(), `proj-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: backend
description: test
project-type: backend
cross-reads-overrides:
  system-architecture:
    append:
      - service: billing
        step: api-contracts
`)
    try {
      const { overlay, warnings } = loadOverlay(tmpPath)
      expect(overlay).not.toBeNull()
      expect(overlay!.crossReadsOverrides).toEqual({})
      expect(warnings.some(w => w.code === 'OVERLAY_CROSS_READS_NOT_ALLOWED')).toBe(true)
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })

  it('emits OVERLAY_CROSS_READS_NOT_ALLOWED for explicit null (cross-reads-overrides: ~)', () => {
    const tmpPath = path.join(os.tmpdir(), `proj-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: backend
description: test
project-type: backend
cross-reads-overrides: ~
`)
    try {
      const { overlay, warnings } = loadOverlay(tmpPath)
      expect(overlay).not.toBeNull()
      expect(overlay!.crossReadsOverrides).toEqual({})
      expect(warnings.some(w => w.code === 'OVERLAY_CROSS_READS_NOT_ALLOWED')).toBe(true)
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })

  it('does not emit warning when cross-reads-overrides is absent', () => {
    const tmpPath = path.join(os.tmpdir(), `proj-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: backend
description: test
project-type: backend
`)
    try {
      const { overlay, warnings } = loadOverlay(tmpPath)
      expect(overlay!.crossReadsOverrides).toEqual({})
      expect(warnings.every(w => w.code !== 'OVERLAY_CROSS_READS_NOT_ALLOWED')).toBe(true)
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts -t "forbids cross-reads"`
Expected: FAIL — no warning emitted; `crossReadsOverrides` might not even exist on the return value.

- [ ] **Step 3: Update `loadOverlay` in `src/core/assembly/overlay-loader.ts`**

Two edits in `loadOverlay` (around lines 141–233):

**3a.** Update the `overrideSections` tuple for `loadOverlay` (line ~202):

```typescript
const overrideSections = [
  'step-overrides', 'knowledge-overrides', 'reads-overrides',
  'dependency-overrides', 'cross-reads-overrides',
] as const
```

**3b.** Between the existing raw extractions and the `overlay` construction (around lines 213–229), detect + strip + warn for `cross-reads-overrides`:

```typescript
// Project-type overlays are forbidden from declaring cross-reads-overrides.
// Detect with !== undefined so explicit null ("cross-reads-overrides: ~" in YAML) is caught.
if (obj['cross-reads-overrides'] !== undefined) {
  warnings.push(overlayCrossReadsNotAllowed(overlayPath))
}

// Do NOT parse cross-reads-overrides — set to {} in the overlay literal below.

const stepOverridesRaw = isPlainObject(obj['step-overrides'])
  ? obj['step-overrides'] as Record<string, unknown> : {}
// ... (existing raw extractions) ...

const overlay: PipelineOverlay = {
  name: (obj['name'] as string).trim(),
  description: (obj['description'] as string).trim(),
  projectType: (obj['project-type'] as string).trim() as PipelineOverlay['projectType'],
  stepOverrides: parseStepOverrides(stepOverridesRaw, warnings, overlayPath),
  knowledgeOverrides: parseKnowledgeOverrides(knowledgeOverridesRaw, warnings, overlayPath),
  readsOverrides: parseReadsOverrides(readsOverridesRaw, warnings, overlayPath),
  dependencyOverrides: parseDependencyOverrides(dependencyOverridesRaw, warnings, overlayPath),
  crossReadsOverrides: {},    // structural-only — not parsed here (see above warning)
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/overlay-loader.ts src/core/assembly/overlay-loader.test.ts
git commit -m "feat(overlay): strip cross-reads-overrides from project-type overlays with warning"
```

---

## Task 6: Defense-in-depth strip in `loadSubOverlay`

**Files:**
- Modify: `src/core/assembly/overlay-loader.ts` (update `loadSubOverlay` around lines 242–269)

**Goal:** `loadSubOverlay` also strips `crossReadsOverrides` (defense-in-depth) and updates its `SUB_OVERLAY_NON_KNOWLEDGE` warning message to mention cross-reads.

Note: `loadSubOverlay` wraps `loadOverlay`, which already strips `cross-reads-overrides` (Task 5). By the time `loadSubOverlay` runs its checks, `overlay.crossReadsOverrides` is already `{}`. This task is defense-in-depth against a future path that bypasses `loadOverlay`. No direct test is claimed for the unreachable branch — we just make the code correct.

- [ ] **Step 1: Update `loadSubOverlay` in `src/core/assembly/overlay-loader.ts`**

Current code (lines ~248–266):

```typescript
const warnings = [...result.warnings]
const overlay = { ...result.overlay }

// Enforce knowledge-only constraint for domain sub-overlays
const hasStep = Object.keys(overlay.stepOverrides ?? {}).length > 0
const hasReads = Object.keys(overlay.readsOverrides ?? {}).length > 0
const hasDeps = Object.keys(overlay.dependencyOverrides ?? {}).length > 0

if (hasStep || hasReads || hasDeps) {
  warnings.push({
    code: 'SUB_OVERLAY_NON_KNOWLEDGE',
    message: `Sub-overlay ${overlayPath} contains non-knowledge sections`
      + ' (step/reads/dependency overrides). These are stripped for domain sub-overlays.',
    context: { file: overlayPath },
  })
  overlay.stepOverrides = {}
  overlay.readsOverrides = {}
  overlay.dependencyOverrides = {}
}
```

Replace with:

```typescript
const warnings = [...result.warnings]
const overlay = { ...result.overlay }

// Enforce knowledge-only constraint for domain sub-overlays
const hasStep = Object.keys(overlay.stepOverrides ?? {}).length > 0
const hasReads = Object.keys(overlay.readsOverrides ?? {}).length > 0
const hasDeps = Object.keys(overlay.dependencyOverrides ?? {}).length > 0
// Defense-in-depth: loadOverlay already strips cross-reads-overrides, so this
// branch is unreachable via the public API. It guards against a future path
// that bypasses the parent loader.
const hasCrossReads = Object.keys(overlay.crossReadsOverrides ?? {}).length > 0

if (hasStep || hasReads || hasDeps || hasCrossReads) {
  warnings.push({
    code: 'SUB_OVERLAY_NON_KNOWLEDGE',
    message: `Sub-overlay ${overlayPath} contains non-knowledge sections`
      + ' (step/reads/dependency/cross-reads overrides). These are stripped for domain sub-overlays.',
    context: { file: overlayPath },
  })
  overlay.stepOverrides = {}
  overlay.readsOverrides = {}
  overlay.dependencyOverrides = {}
  overlay.crossReadsOverrides = {}
}
```

- [ ] **Step 2: Run full overlay-loader tests to verify no regression**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts src/core/assembly/overlay-loader-structural.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/core/assembly/overlay-loader.ts
git commit -m "feat(overlay): defense-in-depth cross-reads strip in loadSubOverlay"
```

---

## Task 7: `applyCrossReadsOverrides` + extend `applyOverlay` signature

**Files:**
- Modify: `src/core/assembly/overlay-resolver.ts` (add helper + extend `applyOverlay`)
- Test: `src/core/assembly/overlay-resolver.test.ts`

**Goal:** `applyOverlay` gains a `crossReadsMap` input (before the `overlay` arg) and a `crossReads` output. New helper `applyCrossReadsOverrides` does append + dedup by `service:step` pair.

- [ ] **Step 1: Write failing tests**

Append to `src/core/assembly/overlay-resolver.test.ts`:

```typescript
describe('applyOverlay crossReads (Wave 3c+1)', () => {
  function baseOverlay(): PipelineOverlay {
    return {
      name: 'test',
      description: 'desc',
      stepOverrides: {},
      knowledgeOverrides: {},
      readsOverrides: {},
      dependencyOverrides: {},
      crossReadsOverrides: {},
    }
  }

  it('appends to empty crossReadsMap[step]', () => {
    const result = applyOverlay(
      {}, {}, {}, {},
      {},  // empty crossReadsMap
      {
        ...baseOverlay(),
        crossReadsOverrides: {
          'system-architecture': {
            append: [{ service: 'billing', step: 'api-contracts' }],
          },
        },
      },
    )
    expect(result.crossReads['system-architecture']).toEqual([
      { service: 'billing', step: 'api-contracts' },
    ])
  })

  it('appends to existing frontmatter crossReads (preserves originals + adds new)', () => {
    const result = applyOverlay(
      {}, {}, {}, {},
      {
        'system-architecture': [{ service: 'shared-lib', step: 'api-contracts' }],
      },
      {
        ...baseOverlay(),
        crossReadsOverrides: {
          'system-architecture': {
            append: [{ service: 'billing', step: 'api-contracts' }],
          },
        },
      },
    )
    expect(result.crossReads['system-architecture']).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },
      { service: 'billing', step: 'api-contracts' },
    ])
  })

  it('dedupes by service:step pair (preserving first occurrence)', () => {
    const result = applyOverlay(
      {}, {}, {}, {},
      {
        'system-architecture': [{ service: 'shared-lib', step: 'api-contracts' }],
      },
      {
        ...baseOverlay(),
        crossReadsOverrides: {
          'system-architecture': {
            append: [
              { service: 'shared-lib', step: 'api-contracts' },  // duplicate of frontmatter
              { service: 'billing', step: 'api-contracts' },      // new
            ],
          },
        },
      },
    )
    expect(result.crossReads['system-architecture']).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },  // first occurrence
      { service: 'billing', step: 'api-contracts' },
    ])
  })

  it('applies overrides across multiple steps without cross-contamination', () => {
    const result = applyOverlay(
      {}, {}, {}, {},
      {},
      {
        ...baseOverlay(),
        crossReadsOverrides: {
          'system-architecture': { append: [{ service: 'a', step: 'x' }] },
          'api-contracts': { append: [{ service: 'b', step: 'y' }] },
        },
      },
    )
    expect(result.crossReads['system-architecture']).toEqual([{ service: 'a', step: 'x' }])
    expect(result.crossReads['api-contracts']).toEqual([{ service: 'b', step: 'y' }])
  })
})
```

Make sure `PipelineOverlay` is in the file's imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/overlay-resolver.test.ts -t "applyOverlay crossReads"`
Expected: FAIL — `applyOverlay` signature mismatch (one arg too many) or `result.crossReads` undefined.

- [ ] **Step 3: Update `applyOverlay` in `src/core/assembly/overlay-resolver.ts`**

Current signature (lines 16–27):

```typescript
export function applyOverlay(
  steps: Record<string, StepEnablementEntry>,
  knowledgeMap: Record<string, string[]>,
  readsMap: Record<string, string[]>,
  dependencyMap: Record<string, string[]>,
  overlay: PipelineOverlay,
): {
  steps: Record<string, StepEnablementEntry>
  knowledge: Record<string, string[]>
  reads: Record<string, string[]>
  dependencies: Record<string, string[]>
}
```

Replace with the extended signature (insert `crossReadsMap` BEFORE `overlay`; add `crossReads` to return):

```typescript
export function applyOverlay(
  steps: Record<string, StepEnablementEntry>,
  knowledgeMap: Record<string, string[]>,
  readsMap: Record<string, string[]>,
  dependencyMap: Record<string, string[]>,
  crossReadsMap: Record<string, Array<{ service: string; step: string }>>,
  overlay: PipelineOverlay,
): {
  steps: Record<string, StepEnablementEntry>
  knowledge: Record<string, string[]>
  reads: Record<string, string[]>
  dependencies: Record<string, string[]>
  crossReads: Record<string, Array<{ service: string; step: string }>>
}
```

Also update the import to include `CrossReadsOverride` at the top of the file:

```typescript
import type {
  PipelineOverlay,
  KnowledgeOverride,
  ReadsOverride,
  DependencyOverride,
  CrossReadsOverride,
  StepEnablementEntry,
} from '../../types/index.js'
```

- [ ] **Step 4: Add `applyCrossReadsOverrides` helper and call site**

In the function body, before the existing `return` statement, add:

```typescript
// 5. Cross-reads overrides: append + dedup by service:step pair
const mergedCrossReads = applyCrossReadsOverrides(
  crossReadsMap,
  overlay.crossReadsOverrides,
)
```

Update the return statement:

```typescript
return {
  steps: mergedSteps,
  knowledge: mergedKnowledge,
  reads: mergedReads,
  dependencies: mergedDependencies,
  crossReads: mergedCrossReads,
}
```

Append the new helper function after `applyReplaceAppendEntry` (end of file):

```typescript
/** Cross-reads overrides: append + dedup by `service:step` pair. */
function applyCrossReadsOverrides(
  inputMap: Record<string, Array<{ service: string; step: string }>>,
  overrides: Record<string, CrossReadsOverride>,
): Record<string, Array<{ service: string; step: string }>> {
  // Shallow-copy arrays so we never mutate the input
  const result: Record<string, Array<{ service: string; step: string }>> = {}
  for (const [key, arr] of Object.entries(inputMap)) {
    result[key] = [...arr]
  }
  for (const [step, override] of Object.entries(overrides)) {
    const existing = result[step] ?? []
    const merged = [...existing, ...override.append]
    // Dedup by service:step key, preserving first-occurrence order
    const seen = new Set<string>()
    result[step] = merged.filter(e => {
      const k = `${e.service}:${e.step}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  return result
}
```

- [ ] **Step 5: Fix compile errors at other `applyOverlay` call sites**

Run: `npx tsc --noEmit 2>&1 | grep "applyOverlay\|arguments" | head -20`

Expected: failures at `src/core/assembly/overlay-state-resolver.ts` (two `applyOverlay` calls) + potentially existing `overlay-resolver.test.ts` tests.

In `src/core/assembly/overlay-state-resolver.ts`, both existing `applyOverlay` calls currently pass 5 args — add a 6th argument before the `overlay` parameter so the `crossReadsMap` is passed. The minimal-compile patch for Task 7 is to pass an empty `{}` for the map at both sites (Task 9 will thread the real map):

Find the two `applyOverlay(...)` calls in `overlay-state-resolver.ts` and add `{},` before the final `overlay` argument (temporary placeholder — Task 9 replaces `{}` with the real map):

```typescript
const merged = applyOverlay(
  overlaySteps,
  knowledgeMap,
  readsMap,
  dependencyMap,
  {},              // NEW — crossReadsMap placeholder; Task 9 plumbs the real map
  overlay,
)
```

Apply the same to both `applyOverlay` calls in the file. If the merged result is destructured, it'll still be missing `crossReads` — either ignore it for now (spread operator preserves it) or add `crossReads` to the destructure. Minimum-change patch: just add `{}` and trust the spread `overlaySteps = merged.steps` etc. still works.

In `src/core/assembly/overlay-resolver.test.ts`, any existing `applyOverlay(...)` call that passes only 5 args must add `{}` as the new 5th arg (before the overlay arg). Run tsc to see which lines need updating:

Run: `npx tsc --noEmit 2>&1 | grep "overlay-resolver.test.ts" | head -10`

- [ ] **Step 6: Run tests + tsc**

Run: `npx vitest run src/core/assembly/overlay-resolver.test.ts src/core/assembly/overlay-state-resolver.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/assembly/overlay-resolver.ts src/core/assembly/overlay-resolver.test.ts src/core/assembly/overlay-state-resolver.ts
git commit -m "feat(overlay): applyCrossReadsOverrides helper + extend applyOverlay signature"
```

---

## Task 8: Make `OverlayState.crossReads` required + fix hoisted mocks

**Files:**
- Modify: `src/core/assembly/overlay-state-resolver.ts` (drop `?` from field)
- Modify: `src/cli/commands/run.test.ts`, `src/cli/commands/next.test.ts`, `src/cli/commands/status.test.ts` (add `crossReads: {}` to hoisted `resolveOverlayState` mocks)
- Test: `src/core/assembly/overlay-state-resolver.test.ts`

**Goal:** `OverlayState.crossReads` is required. Mocks across the three command test files gain `crossReads: {}` in their returned overlay.

- [ ] **Step 1: Update `OverlayState` interface**

In `src/core/assembly/overlay-state-resolver.ts` (line ~9), change:

```typescript
export interface OverlayState {
  steps: Record<string, StepEnablementEntry>
  knowledge: Record<string, string[]>
  reads: Record<string, string[]>
  dependencies: Record<string, string[]>
  /** Wave 3c — populated from frontmatter.crossReads; overlay-level overrides are post-release. */
  crossReads?: Record<string, Array<{ service: string; step: string }>>
}
```

to:

```typescript
export interface OverlayState {
  steps: Record<string, StepEnablementEntry>
  knowledge: Record<string, string[]>
  reads: Record<string, string[]>
  dependencies: Record<string, string[]>
  /** Populated via overlay-first merge: frontmatter + structural overlay's cross-reads-overrides. */
  crossReads: Record<string, Array<{ service: string; step: string }>>
}
```

- [ ] **Step 2: Run tsc to find all broken mocks**

Run: `npx tsc --noEmit 2>&1 | grep "crossReads" | head -20`
Expected: errors in `run.test.ts`, `next.test.ts`, `status.test.ts`, `resolver.ts` fallback branch, existing `overlay-state-resolver.test.ts`.

- [ ] **Step 3: Add `crossReads: {}` to hoisted mocks**

In each of `src/cli/commands/run.test.ts`, `src/cli/commands/next.test.ts`, `src/cli/commands/status.test.ts`, find the hoisted `vi.mock('../../core/assembly/overlay-state-resolver.js', ...)`:

```typescript
vi.mock('../../core/assembly/overlay-state-resolver.js', () => ({
  resolveOverlayState: vi.fn(({ presetSteps }: { presetSteps: Record<string, unknown> }) => ({
    steps: presetSteps,
    knowledge: {},
    reads: {},
    dependencies: {},
  })),
}))
```

Change the returned object to include `crossReads: {}`:

```typescript
vi.mock('../../core/assembly/overlay-state-resolver.js', () => ({
  resolveOverlayState: vi.fn(({ presetSteps }: { presetSteps: Record<string, unknown> }) => ({
    steps: presetSteps,
    knowledge: {},
    reads: {},
    dependencies: {},
    crossReads: {},
  })),
}))
```

Also check test bodies that call `mockOverlay.mockReturnValue({ steps, knowledge, reads, dependencies })` or similar ad-hoc returns — add `crossReads: {}` to each.

Run: `grep -n "knowledge: {}, reads: {}, dependencies: {}" src/cli/commands/*.test.ts` to find all ad-hoc returns that need the same update.

- [ ] **Step 4: Update stale Wave 3c assertion**

In `src/core/assembly/overlay-state-resolver.test.ts`, there is a test with the description *"returns crossReads as empty object even when frontmatter has crossReads"* (from Wave 3c round 5). That assertion becomes wrong: with this feature, when frontmatter has crossReads, `resolveOverlayState()` returns them populated (not `{}`). Find the test (search for `returns crossReads as empty object`) and update its expectation:

```typescript
it('returns crossReads populated from frontmatter when no overlay overrides configured', () => {
  const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
    ['system-architecture', {
      frontmatter: makeFrontmatter({
        name: 'system-architecture',
        phase: 'architecture',
        order: 700,
        outputs: ['docs/architecture.md'],
        crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
      }),
    }],
  ])
  const result = resolveOverlayState({
    config: makeConfig(),
    methodologyDir: '/nonexistent',
    metaPrompts,
    presetSteps: {},
    output: makeOutput(),
  })
  expect(result.crossReads['system-architecture']).toEqual([
    { service: 'shared-lib', step: 'api-contracts' },
  ])
})
```

Note: this test will still FAIL until Task 9 threads the frontmatter map through `resolveOverlayState`. That's expected — Task 9 completes the behavior.

Mark this test as `.skip` for now and let Task 9 un-skip it:

```typescript
it.skip('returns crossReads populated from frontmatter when no overlay overrides configured', () => {
  // ... same as above — un-skipped at end of Task 9
```

- [ ] **Step 5: Run tests + tsc**

Run: `npx tsc --noEmit && npx vitest run src/cli/commands/run.test.ts src/cli/commands/next.test.ts src/cli/commands/status.test.ts src/core/assembly/overlay-state-resolver.test.ts`
Expected: PASS (the skipped test is not counted as failure).

- [ ] **Step 6: Commit**

```bash
git add src/core/assembly/overlay-state-resolver.ts src/core/assembly/overlay-state-resolver.test.ts src/cli/commands/run.test.ts src/cli/commands/next.test.ts src/cli/commands/status.test.ts
git commit -m "feat(overlay): OverlayState.crossReads becomes required; update hoisted mocks"
```

---

## Task 9: `resolveOverlayState` threads `crossReadsMap` through both passes

**Files:**
- Modify: `src/core/assembly/overlay-state-resolver.ts` (update `resolveOverlayState`)
- Test: `src/core/assembly/overlay-state-resolver.test.ts`

**Goal:** `resolveOverlayState` builds a `crossReadsMap` from frontmatter, threads it through both overlay passes, and returns the merged map as `OverlayState.crossReads`.

- [ ] **Step 1: Write failing tests**

Append to `src/core/assembly/overlay-state-resolver.test.ts` (the new test for overlay append, plus un-skipping the Task 8 skipped test):

```typescript
it('applies structural overlay crossReadsOverrides on top of frontmatter crossReads', () => {
  const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/methodology')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-reads-'))
  try {
    fs.copyFileSync(
      path.join(fixtureDir, 'multi-service-overlay-empty.yml'),
      path.join(tmpDir, 'multi-service-overlay.yml'),
    )
    // Rewrite the fixture to include cross-reads-overrides
    fs.writeFileSync(path.join(tmpDir, 'multi-service-overlay.yml'), `
name: multi-service
description: test
step-overrides:
  system-architecture: { enabled: true }
cross-reads-overrides:
  system-architecture:
    append:
      - service: billing
        step: api-contracts
`)
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['system-architecture', {
        frontmatter: makeFrontmatter({
          name: 'system-architecture',
          phase: 'architecture', order: 700,
          outputs: ['docs/arch.md'],
          crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
        }),
      }],
    ])
    const result = resolveOverlayState({
      config: makeConfig({
        project: {
          services: [{
            name: 'api', projectType: 'backend',
            backendConfig: { apiStyle: 'rest' },
          }],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
      methodologyDir: tmpDir,
      metaPrompts,
      presetSteps: {},
      output: makeOutput(),
    })
    // Frontmatter crossRead + structural overlay append
    expect(result.crossReads['system-architecture']).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },
      { service: 'billing', step: 'api-contracts' },
    ])
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
```

If `tests/fixtures/methodology/multi-service-overlay-empty.yml` doesn't exist, write the file directly in the test (don't use copyFileSync) — just create a new tmp file with the desired contents.

Also un-skip the Task 8 skipped test:

```typescript
// Change `it.skip(` → `it(` for the "returns crossReads populated from frontmatter ..." test
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts -t "crossReads"`
Expected: FAIL — no frontmatter threading yet.

- [ ] **Step 3: Thread `crossReadsMap` through `resolveOverlayState`**

In `src/core/assembly/overlay-state-resolver.ts`, the `resolveOverlayState` function needs 4 updates:

**3a.** Build `crossReadsMap` from frontmatter alongside the existing maps (inside the loop that currently builds `knowledgeMap`/`readsMap`/`dependencyMap`). Find the block:

```typescript
// Build maps from meta-prompt frontmatter
const knowledgeMap: Record<string, string[]> = {}
const readsMap: Record<string, string[]> = {}
const dependencyMap: Record<string, string[]> = {}
// ... (possibly a no-op placeholder for crossReadsMap from Task 8) ...
for (const [name, mp] of metaPrompts) {
  knowledgeMap[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
  readsMap[name] = [...(mp.frontmatter.reads ?? [])]
  dependencyMap[name] = [...(mp.frontmatter.dependencies ?? [])]
}
```

Replace with:

```typescript
// Build maps from meta-prompt frontmatter
const knowledgeMap: Record<string, string[]> = {}
const readsMap: Record<string, string[]> = {}
const dependencyMap: Record<string, string[]> = {}
const crossReadsMap: Record<string, Array<{ service: string; step: string }>> = {}
for (const [name, mp] of metaPrompts) {
  knowledgeMap[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
  readsMap[name] = [...(mp.frontmatter.reads ?? [])]
  dependencyMap[name] = [...(mp.frontmatter.dependencies ?? [])]
  crossReadsMap[name] = [...(mp.frontmatter.crossReads ?? [])]
}
```

**3b.** Add the `overlayCrossReads` working variable next to the existing ones (around line 43):

```typescript
let overlaySteps = { ...presetSteps }
let overlayKnowledge = knowledgeMap
let overlayReads = readsMap
let overlayDependencies = dependencyMap
let overlayCrossReads = crossReadsMap
```

**3c.** Update both `applyOverlay(...)` calls in the function to pass `overlayCrossReads` (replace the `{}` placeholder from Task 7) AND capture `merged.crossReads`:

Find the first `applyOverlay` call (project-type overlay pass, around line 68):

```typescript
const merged = applyOverlay(
  overlaySteps,
  knowledgeMap,
  readsMap,
  dependencyMap,
  {},     // ← placeholder from Task 7
  overlay,
)
overlaySteps = merged.steps
overlayKnowledge = merged.knowledge
overlayReads = merged.reads
overlayDependencies = merged.dependencies
```

Replace with:

```typescript
const merged = applyOverlay(
  overlaySteps,
  knowledgeMap,
  readsMap,
  dependencyMap,
  overlayCrossReads,
  overlay,
)
overlaySteps = merged.steps
overlayKnowledge = merged.knowledge
overlayReads = merged.reads
overlayDependencies = merged.dependencies
overlayCrossReads = merged.crossReads
```

Find the second `applyOverlay` call (structural overlay pass, around line 143–149) — same fix: replace the `{}` placeholder with `overlayCrossReads` and capture `merged.crossReads`:

```typescript
const merged = applyOverlay(
  overlaySteps,
  overlayKnowledge,
  overlayReads,
  overlayDependencies,
  overlayCrossReads,
  msOverlay,
)
overlaySteps = merged.steps
overlayKnowledge = merged.knowledge
overlayReads = merged.reads
overlayDependencies = merged.dependencies
overlayCrossReads = merged.crossReads
```

**3d.** Update the final return statement (around line 158):

```typescript
return {
  steps: overlaySteps,
  knowledge: overlayKnowledge,
  reads: overlayReads,
  dependencies: overlayDependencies,
  crossReads: overlayCrossReads,
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/overlay-state-resolver.ts src/core/assembly/overlay-state-resolver.test.ts
git commit -m "feat(overlay): resolveOverlayState threads crossReadsMap through both passes"
```

---

## Task 10: `resolver.ts` fallback branch builds frontmatter `crossReads`

**Files:**
- Modify: `src/core/pipeline/resolver.ts` (update the `config === null` fallback branch around line 80–90)
- Test: `src/core/pipeline/resolver.test.ts` (or existing test file — discover with grep)

**Goal:** When `config` is null (no `.scaffold/config.yml`), `resolvePipeline` still returns a populated `overlay.crossReads` map from frontmatter.

- [ ] **Step 1: Locate an existing resolver test**

Run: `ls src/core/pipeline/resolver.test.ts 2>/dev/null || grep -rln "resolvePipeline" src/core/pipeline/ 2>/dev/null | head -3`

If no test file exists for `resolver.ts`, this task's test lives in the closest integration test. Grep for `config === null` or similar no-config assertions to find where to add:

Run: `grep -rln "config: null\|ctx.config = null\|ctx\.config = undefined" src/ 2>/dev/null | head`

If no suitable file exists, create `src/core/pipeline/resolver.test.ts` with minimal imports:

```typescript
import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePipeline } from './resolver.js'
import type { MetaPromptFile } from '../../types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/methodology')

function makeOutput() {
  return {
    success: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    result: vi.fn(),
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
    prompt: vi.fn(), confirm: vi.fn(), select: vi.fn(),
    multiSelect: vi.fn(), multiInput: vi.fn(),
    startSpinner: vi.fn(), stopSpinner: vi.fn(),
    startProgress: vi.fn(), updateProgress: vi.fn(), stopProgress: vi.fn(),
  }
}
```

- [ ] **Step 2: Write failing test**

Append to `src/core/pipeline/resolver.test.ts`:

```typescript
describe('resolvePipeline fallback (no config)', () => {
  it('builds overlay.crossReads from frontmatter even when ctx.config is null', () => {
    const metaPrompts = new Map<string, MetaPromptFile>([
      ['system-architecture', {
        stepName: 'system-architecture',
        filePath: '/fake/sa.md',
        frontmatter: {
          name: 'system-architecture',
          description: '', summary: null,
          phase: 'architecture', order: 700,
          dependencies: [], outputs: ['docs/arch.md'],
          conditional: null, knowledgeBase: [], reads: [],
          crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
          stateless: false, category: 'pipeline',
        },
        body: '', sections: {},
      }],
    ])
    const pipeline = resolvePipeline(
      {
        config: null,
        metaPrompts,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { output: makeOutput() as any },
    )
    expect(pipeline.overlay.crossReads['system-architecture']).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },
    ])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/core/pipeline/resolver.test.ts -t "builds overlay.crossReads from frontmatter"`
Expected: FAIL — `pipeline.overlay.crossReads` is `{}` (from Task 8's placeholder) or undefined.

- [ ] **Step 4: Update the fallback branch in `src/core/pipeline/resolver.ts`**

Find the fallback branch (around lines 80–90). Current code:

```typescript
} else {
  const knowledge: Record<string, string[]> = {}
  const reads: Record<string, string[]> = {}
  const dependencies: Record<string, string[]> = {}
  for (const [name, mp] of metaPrompts) {
    knowledge[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
    reads[name] = [...(mp.frontmatter.reads ?? [])]
    dependencies[name] = [...(mp.frontmatter.dependencies ?? [])]
  }
  overlay = { steps: mergedSteps, knowledge, reads, dependencies }
}
```

Update to include `crossReads`:

```typescript
} else {
  const knowledge: Record<string, string[]> = {}
  const reads: Record<string, string[]> = {}
  const dependencies: Record<string, string[]> = {}
  const crossReads: Record<string, Array<{ service: string; step: string }>> = {}
  for (const [name, mp] of metaPrompts) {
    knowledge[name] = [...(mp.frontmatter.knowledgeBase ?? [])]
    reads[name] = [...(mp.frontmatter.reads ?? [])]
    dependencies[name] = [...(mp.frontmatter.dependencies ?? [])]
    crossReads[name] = [...(mp.frontmatter.crossReads ?? [])]
  }
  overlay = { steps: mergedSteps, knowledge, reads, dependencies, crossReads }
}
```

- [ ] **Step 5: Run tests to verify pass + tsc**

Run: `npx vitest run src/core/pipeline/resolver.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline/resolver.ts src/core/pipeline/resolver.test.ts
git commit -m "feat(overlay): resolvePipeline fallback branch builds frontmatter crossReads map"
```

---

## Task 11: `resolveTransitiveCrossReads` gains `overlayCrossReads?` param

**Files:**
- Modify: `src/core/assembly/cross-reads.ts`
- Test: `src/core/assembly/cross-reads.test.ts`

**Goal:** Transitive recursion reads overlay-first via a new optional `overlayCrossReads?` parameter. `foreignMeta` existence guard is preserved.

- [ ] **Step 1: Write failing tests**

Append to `src/core/assembly/cross-reads.test.ts` (inside the existing `describe('resolveTransitiveCrossReads', ...)` block — the one from Wave 3c):

```typescript
it('uses overlayCrossReads for foreign step when provided (overlay-first)', () => {
  // b-step frontmatter has no crossReads; overlay adds one to c-step
  fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
  fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
  seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
  seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
  // b-step has NO frontmatter crossReads; overlay provides them for b-step
  const metas = new Map<string, MetaPromptFile>([
    ['b-step', mkMetaFile('b-step')],  // no frontmatter crossReads
    ['c-step', mkMetaFile('c-step')],
  ])
  const overlayCrossReads = {
    'b-step': [{ service: 'c', step: 'c-step' }],  // overlay-only
  }
  const { output } = mkOutput()
  const artifacts = resolveTransitiveCrossReads(
    [{ service: 'b', step: 'b-step' }],
    mkMultiConfig({ b: ['b-step'], c: ['c-step'] }),
    tmpRoot, metas, output,
    new Set(), new Map(), new Map(),
    undefined,  // globalSteps
    overlayCrossReads,
  )
  const paths = artifacts.map(a => a.filePath).sort()
  expect(paths).toEqual(['docs/b.md', 'docs/c.md'])
})

it('falls back to foreignMeta.frontmatter.crossReads when overlayCrossReads is omitted (backward compat)', () => {
  // This is essentially the original Wave 3c test, restated to lock the backcompat contract.
  fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
  fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
  seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
  seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
  const metas = new Map<string, MetaPromptFile>([
    ['b-step', mkMetaFile('b-step', [{ service: 'c', step: 'c-step' }])],  // frontmatter only
    ['c-step', mkMetaFile('c-step')],
  ])
  const { output } = mkOutput()
  const artifacts = resolveTransitiveCrossReads(
    [{ service: 'b', step: 'b-step' }],
    mkMultiConfig({ b: ['b-step'], c: ['c-step'] }),
    tmpRoot, metas, output,
    new Set(), new Map(), new Map(),
    // No globalSteps, no overlayCrossReads — omitted args
  )
  const paths = artifacts.map(a => a.filePath).sort()
  expect(paths).toEqual(['docs/b.md', 'docs/c.md'])
})

it('does NOT recurse when overlay references a step absent from metaPrompts (foreignMeta guard)', () => {
  // Overlay has cross-reads for 'ghost-step' but ghost-step is not in metaPrompts.
  // Recursion must not fire — the foreignMeta existence guard protects against this.
  fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
  seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
  const metas = new Map<string, MetaPromptFile>([
    ['b-step', mkMetaFile('b-step')],
    // ghost-step deliberately NOT added
  ])
  const overlayCrossReads = {
    'b-step': [{ service: 'ghost-service', step: 'ghost-step' }],
  }
  const { output } = mkOutput()
  // The TOP-LEVEL cross-read points at a real step (b-step). Its transitive edge
  // to ghost-service:ghost-step would recurse based on overlay lookup for ghost-step.
  // Since ghost-step isn't in metaPrompts, recursion must not fire.
  const artifacts = resolveTransitiveCrossReads(
    [{ service: 'b', step: 'b-step' }],
    mkMultiConfig({ b: ['b-step'] }),
    tmpRoot, metas, output,
    new Set(), new Map(), new Map(),
    undefined, overlayCrossReads,
  )
  // Only b's artifact surfaces; ghost recursion did not fire.
  expect(artifacts.map(a => a.filePath)).toEqual(['docs/b.md'])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts -t "overlayCrossReads"`
Expected: FAIL — signature doesn't accept the new arg; test one expectation fails (overlay-only recursion doesn't fire).

- [ ] **Step 3: Update `resolveTransitiveCrossReads` in `src/core/assembly/cross-reads.ts`**

Find the current function signature and update it. The new parameter goes LAST (after `globalSteps?`):

```typescript
export function resolveTransitiveCrossReads(
  crossReads: Array<{ service: string; step: string }>,
  config: ScaffoldConfig,
  projectRoot: string,
  metaPrompts: Map<string, MetaPromptFile>,
  output: OutputContext,
  visiting: Set<string>,
  resolved: Map<string, ArtifactEntry[]>,
  foreignStateCache: Map<string, PipelineState | null>,
  globalSteps?: Set<string>,
  overlayCrossReads?: Record<string, Array<{ service: string; step: string }>>,
): ArtifactEntry[]
```

Inside the function body, find the existing recursion block. Current code (Wave 3c):

```typescript
let transitive: ArtifactEntry[] = []
if (direct.completed) {
  const foreignMeta = metaPrompts.get(cr.step)
  const isTool = foreignMeta?.frontmatter.category === 'tool'
  if (!isTool && foreignMeta?.frontmatter.crossReads?.length) {
    transitive = resolveTransitiveCrossReads(
      foreignMeta.frontmatter.crossReads,
      config, projectRoot, metaPrompts, output,
      visiting, resolved, foreignStateCache, globalSteps,
    )
  }
}
```

Update to use overlay-first lookup while preserving the `foreignMeta` existence guard:

```typescript
let transitive: ArtifactEntry[] = []
if (direct.completed) {
  const foreignMeta = metaPrompts.get(cr.step)
  const isTool = foreignMeta?.frontmatter.category === 'tool'
  // Overlay-first: overlay map takes precedence over frontmatter.
  // Preserve the foreignMeta existence guard — overlay typos pointing at a step
  // absent from metaPrompts must NOT drive recursion (no tool-category check
  // possible, not part of the pipeline).
  const foreignCrossReads =
    overlayCrossReads?.[cr.step] ?? foreignMeta?.frontmatter.crossReads ?? []
  if (foreignMeta && !isTool && foreignCrossReads.length > 0) {
    transitive = resolveTransitiveCrossReads(
      foreignCrossReads,
      config, projectRoot, metaPrompts, output,
      visiting, resolved, foreignStateCache, globalSteps, overlayCrossReads,
    )
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/core/assembly/cross-reads.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/cross-reads.ts src/core/assembly/cross-reads.test.ts
git commit -m "feat(cross-reads): resolveTransitiveCrossReads accepts overlayCrossReads? for overlay-first recursion"
```

---

## Task 12: `run.ts` passes `pipeline.overlay.crossReads` to transitive resolver

**Files:**
- Modify: `src/cli/commands/run.ts`
- Test: `src/cli/commands/run.test.ts`

**Goal:** The `run.ts` call site to `resolveTransitiveCrossReads` forwards `pipeline.overlay.crossReads` so overlay-appended entries on foreign steps surface transitively.

- [ ] **Step 1: Write failing test**

Append to the existing `describe('cross-reads artifact gathering (Wave 3c)', ...)` block in `src/cli/commands/run.test.ts`:

```typescript
it('forwards pipeline.overlay.crossReads to resolveTransitiveCrossReads as the 9th arg', async () => {
  // Wire a consumer step with frontmatter crossReads; run.ts should invoke the
  // helper with overlay.crossReads passed positionally.
  const consumerMeta = makeMetaPrompt({
    stepName: 'system-architecture',
    frontmatter: makeFrontmatter({
      name: 'system-architecture',
      phase: 'architecture', order: 700,
      dependencies: [], outputs: ['docs/arch.md'],
      crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
    }),
  })
  const crMap = new Map([['system-architecture', consumerMeta]])
  vi.mocked(discoverMetaPrompts).mockReturnValue(crMap)
  vi.mocked(discoverAllMetaPrompts).mockReturnValue(crMap)
  vi.mocked(StateManager.prototype.loadState).mockReturnValue(makeState({
    'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
  }))
  vi.mocked(buildGraph).mockReturnValue({
    nodes: new Map([['system-architecture', {
      slug: 'system-architecture', phase: 'architecture', order: 700,
      dependencies: [], enabled: true,
    }]]),
    edges: new Map([['system-architecture', []]]),
  })
  // The mocked resolveOverlayState (in the hoisted mock) returns crossReads: {}
  // by default. Verify run.ts reads that (possibly empty) object and forwards it.
  vi.mocked(resolveTransitiveCrossReads).mockReturnValue([])
  vi.mocked(resolveOutputMode).mockReturnValue('auto')

  await invokeHandler({ step: 'system-architecture', _: ['run'], auto: true })

  // The 9th positional arg must be the overlayCrossReads map.
  expect(vi.mocked(resolveTransitiveCrossReads)).toHaveBeenCalledWith(
    [{ service: 'shared-lib', step: 'api-contracts' }],
    expect.anything(),           // config
    expect.any(String),          // projectRoot
    expect.any(Map),             // metaPrompts
    expect.anything(),           // output
    expect.any(Set),             // visiting
    expect.any(Map),             // resolved
    expect.any(Map),             // foreignStateCache
    expect.anything(),           // globalSteps
    expect.any(Object),          // overlayCrossReads (Wave 3c+1)
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cli/commands/run.test.ts -t "forwards pipeline.overlay.crossReads"`
Expected: FAIL — existing call site passes only 9 args (no `overlayCrossReads`).

- [ ] **Step 3: Update `run.ts` call site**

In `src/cli/commands/run.ts`, find the existing call to `resolveTransitiveCrossReads` (grep for `resolveTransitiveCrossReads(`) and add `pipeline.overlay.crossReads` as the final positional arg:

```typescript
const crossArtifacts = resolveTransitiveCrossReads(
  crossReadsList,
  config,
  projectRoot,
  context.metaPrompts,
  output,
  new Set(),
  new Map(),
  foreignStateCache,
  pipeline.globalSteps,
  pipeline.overlay.crossReads,   // NEW
)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/cli/commands/run.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/run.ts src/cli/commands/run.test.ts
git commit -m "feat(run): forward pipeline.overlay.crossReads to resolveTransitiveCrossReads"
```

---

## Task 13: E2E — overlay-only cross-read surfaces end-to-end

**Files:**
- Modify: `src/e2e/cross-service-references.test.ts`

**Goal:** A single E2E test that asserts overlay-only cross-reads (no frontmatter entry) surface through `resolveTransitiveCrossReads` end-to-end, closing the feature's acceptance criteria.

- [ ] **Step 1: Append test to `src/e2e/cross-service-references.test.ts`**

Append this test to the existing `describe('Cross-service references E2E (Wave 3c)', ...)` block:

```typescript
it('overlay-only crossRead (no frontmatter entry) surfaces through resolveTransitiveCrossReads (Wave 3c+1)', () => {
  // Step B's frontmatter has no crossReads; an overlay adds one pointing at C.
  // Passing the overlay map to the resolver must surface C's artifact.
  fs.mkdirSync(path.join(projectRoot, '.scaffold', 'services', 'consumer2'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, 'docs', 'extra.md'), 'EXTRA')
  writeState(
    path.join(projectRoot, '.scaffold', 'services', 'consumer2', 'state.json'),
    { 'extra-step': { status: 'completed', produces: ['docs/extra.md'] } },
  )

  const configWithExtraExport: ScaffoldConfig = {
    version: 2, methodology: 'deep', platforms: ['claude-code'],
    project: {
      services: [
        {
          name: 'producer', projectType: 'library',
          libraryConfig: { visibility: 'internal' },
          exports: [{ step: producerStep }],
        },
        {
          name: 'consumer2', projectType: 'library',
          libraryConfig: { visibility: 'internal' },
          exports: [{ step: 'extra-step' }],
        },
        {
          name: 'consumer', projectType: 'backend',
          backendConfig: { apiStyle: 'rest' },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }
  const metas = new Map<string, MetaPromptFile>([
    [producerStep, mkMetaFile(producerStep)],  // no frontmatter crossReads
  ])
  // Overlay adds a cross-read to producer's step
  const overlayCrossReads = {
    [producerStep]: [{ service: 'consumer2', step: 'extra-step' }],
  }
  const output = mkOutput()
  const artifacts = resolveTransitiveCrossReads(
    [{ service: 'producer', step: producerStep }],
    configWithExtraExport, projectRoot, metas, output,
    new Set(), new Map(), new Map<string, PipelineState | null>(),
    undefined,  // globalSteps
    overlayCrossReads,
  )
  const paths = artifacts.map(a => a.filePath).sort()
  // producer's own docs/contracts.md + consumer2's docs/extra.md (via overlay-added crossRead)
  expect(paths).toEqual(['docs/contracts.md', 'docs/extra.md'])
})
```

- [ ] **Step 2: Run E2E test to verify pass**

Run: `npx vitest run src/e2e/cross-service-references.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Run full test suite to catch any leftover regressions**

Run: `make check-all`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/e2e/cross-service-references.test.ts
git commit -m "test(cross-reads): E2E — overlay-only crossRead surfaces through transitive resolver"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `make check-all`
Expected: PASS.

- [ ] **Review `git diff main..HEAD` against the spec**

Verify: every file listed in spec §6 appears in the diff, and no task produced unexpected touches elsewhere. Especially check:
- `src/utils/errors.ts` has both new factories
- `src/types/config.ts` has `CrossReadsOverride` + `crossReadsOverrides`
- `src/core/assembly/overlay-loader.ts` has the new parser + both loaders wired
- `src/core/assembly/overlay-resolver.ts` has `applyCrossReadsOverrides`
- `src/core/assembly/overlay-state-resolver.ts` — required `crossReads`, threaded map
- `src/core/pipeline/resolver.ts` — fallback branch builds `crossReads`
- `src/core/assembly/cross-reads.ts` — new `overlayCrossReads?` param
- `src/cli/commands/run.ts` — call site forwards `pipeline.overlay.crossReads`
- Three command test files — hoisted mocks include `crossReads: {}`

- [ ] **Push + PR**

```bash
git push -u origin HEAD
gh pr create
```

- [ ] **Run mandatory 3-channel MMR review** per CLAUDE.md:

```bash
mmr review --pr "$PR_NUMBER" --sync --format json
```

- [ ] **Fix all P0/P1/P2 findings**, iterate up to 3 rounds, merge when verdict is `pass` or `degraded-pass`.

- [ ] **Release v3.18.0** per `docs/architecture/operations-runbook.md`. Minor version bump (new overlay feature, append-only additive to existing YAML schema — backward compatible).

---

## Self-Review Coverage Map

| Spec section | Task |
|--------------|------|
| §1.1 `CrossReadsOverride` type | Task 2 |
| §1.2 `PipelineOverlay.crossReadsOverrides` | Task 2 |
| §1.3 `OverlayState.crossReads` required | Task 8 |
| §2.1 `parseCrossReadsOverrides` + `overlayMalformedAppendItem` factory | Tasks 1, 3 |
| §2.1 `overlayCrossReadsNotAllowed` factory | Task 1 |
| §2.2 `loadStructuralOverlay` wiring | Task 4 |
| §2.2 `loadOverlay` strip + `!== undefined` | Task 5 |
| §2.3 `loadSubOverlay` defense-in-depth + updated message | Task 6 |
| §3.1 `applyOverlay` signature + `applyCrossReadsOverrides` helper | Task 7 |
| §3.2 `resolveOverlayState` two-pass threading | Tasks 8, 9 |
| §3.2.1 `resolvePipeline` fallback branch | Task 10 |
| §3.3 `buildGraph` (no changes — already accepts map from Wave 3c) | covered by existing Wave 3c code |
| §3.4 transitive resolver + `foreignMeta` guard + `overlayCrossReads?` | Task 11 |
| §3.4 `run.ts` call site | Task 12 |
| §4.1 structural-only constraint (project-type overlays forbidden) | Task 5 |
| §5 parser tests (8) | Task 3 |
| §5 apply tests (4) | Task 7 |
| §5 loader gate tests (4) | Tasks 4, 5 |
| §5 resolveOverlayState integration (1) | Task 9 |
| §5 sub-overlay (1) | Task 6 (warning message update; defense-in-depth branch is unreachable) |
| §5 resolvePipeline fallback (1) | Task 10 |
| §5 transitive (3) | Task 11 |
| §5 E2E (1) | Task 13 |
| §6 impact list on test fixtures | Tasks 2, 7, 8 |
| §6 `DependencyNode.crossDependencies` comment | *deferred*: Wave 3c comment is still technically correct after this feature (overlay-first with frontmatter fallback); update deferred to next cleanup |

No placeholders; all code blocks are concrete; all task sizes are small (13 tasks, mostly ≤6 steps each).
