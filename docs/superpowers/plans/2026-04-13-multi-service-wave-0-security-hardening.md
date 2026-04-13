# Multi-Service Evolution — Wave 0 (Security Hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a pre-existing path traversal vulnerability by introducing a single `resolveContainedArtifactPath()` helper and using it at all 5 artifact resolution sites.

**Architecture:** Extract a pure function that resolves a relative path against the project root, canonicalizes with `fs.realpathSync()` to defeat symlink bypass, and verifies the result stays within `projectRoot` using `path.sep`-suffixed prefix comparison to defeat prefix collision. Replace direct `path.resolve(projectRoot, relPath)` calls at 5 sites so every artifact read goes through the same containment check.

**Tech Stack:** TypeScript, vitest (test framework), Node.js `fs.realpathSync` / `path.resolve`. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md` — Wave 0 section

---

## File Structure

### Created

- `src/utils/artifact-path.ts` — Single pure helper function + a small wrapper that emits a standard warning when containment fails. Tests co-located at `src/utils/artifact-path.test.ts`.

### Modified

Each site below currently calls `path.resolve(projectRoot, relPath)` directly. After this plan, each calls the helper and short-circuits when the helper returns `null`.

- `src/cli/commands/run.ts` — 2 call sites (lines 337, 371) in artifact gathering blocks
- `src/state/completion.ts` — 3 call sites (lines 28, 61, 97) in `detectCompletion`, `checkCompletion`, `analyzeCrash`
- `src/core/assembly/update-mode.ts` — 2 call sites (lines 47, 65) in `detectUpdateMode`
- `src/core/assembly/context-gatherer.ts` — 1 call site (line 34) in `gatherContext`
- `src/state/state-migration.ts` — 2 call sites (lines 143, 149) in `resolveArtifactPath` (lower risk — paths come from frontmatter, not state — but included for defense-in-depth)

**Naming note:** The design spec says `src/util/artifact-path.ts`. The existing codebase convention is `src/utils/` (plural) — see `src/utils/fs.ts`, `src/utils/levenshtein.ts`. This plan uses `src/utils/artifact-path.ts` to match the codebase.

---

## Task 1: Create the helper with failing tests

**Files:**
- Create: `src/utils/artifact-path.ts`
- Create: `src/utils/artifact-path.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/utils/artifact-path.test.ts` with the full test suite:

```typescript
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { resolveContainedArtifactPath } from './artifact-path.js'

const tmpDirs: string[] = []

function tmpRoot() {
  const p = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}`)
  fs.mkdirSync(p, { recursive: true })
  tmpDirs.push(p)
  return p
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

describe('resolveContainedArtifactPath', () => {
  it('resolves a normal relative path inside the project root', () => {
    const root = tmpRoot()
    const docs = path.join(root, 'docs')
    fs.mkdirSync(docs, { recursive: true })
    fs.writeFileSync(path.join(docs, 'plan.md'), 'x')

    const resolved = resolveContainedArtifactPath(root, 'docs/plan.md')

    expect(resolved).not.toBeNull()
    expect(resolved).toBe(fs.realpathSync(path.join(docs, 'plan.md')))
  })

  it('returns null for a traversal attempt via ..', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })

    const resolved = resolveContainedArtifactPath(root, '../../etc/passwd')

    expect(resolved).toBeNull()
  })

  it('returns null when a symlink escapes the project root', () => {
    const root = tmpRoot()
    const outside = tmpRoot() // a second tmp dir outside `root`
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope')
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'docs', 'escape'))

    const resolved = resolveContainedArtifactPath(root, 'docs/escape/secret.txt')

    expect(resolved).toBeNull()
  })

  it('returns null on prefix collision (project vs project-malicious)', () => {
    // Two sibling dirs that share a prefix without a separator
    const parent = tmpRoot()
    const project = path.join(parent, 'project')
    const malicious = path.join(parent, 'project-malicious')
    fs.mkdirSync(project, { recursive: true })
    fs.mkdirSync(malicious, { recursive: true })
    fs.writeFileSync(path.join(malicious, 'secret.txt'), 'nope')

    const resolved = resolveContainedArtifactPath(project, '../project-malicious/secret.txt')

    expect(resolved).toBeNull()
  })

  it('returns the resolved path for a file that does not yet exist', () => {
    // Defense: pre-completion checks pass a path whose file does not exist yet.
    // The helper must NOT reject these — it must return the would-be resolved path
    // after verifying it would land inside the project root.
    const root = tmpRoot()
    const expected = path.resolve(root, 'docs/not-yet.md')

    const resolved = resolveContainedArtifactPath(root, 'docs/not-yet.md')

    expect(resolved).toBe(expected)
  })

  it('returns null when the file does not exist AND the path would escape', () => {
    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, '../../does-not-exist')

    expect(resolved).toBeNull()
  })

  it('returns null when the project root itself does not exist', () => {
    const nonexistent = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}`)

    const resolved = resolveContainedArtifactPath(nonexistent, 'docs/plan.md')

    expect(resolved).toBeNull()
  })

  it('accepts the project root itself (empty relative path)', () => {
    // path.resolve(root, '') === root. Must be allowed (containment equal-case).
    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, '')

    expect(resolved).toBe(fs.realpathSync(root))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/artifact-path.test.ts`
Expected: FAIL — module not found (`src/utils/artifact-path.ts` does not exist yet).

- [ ] **Step 3: Write the helper implementation**

Create `src/utils/artifact-path.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'

/**
 * Resolve an artifact path and verify it stays within the project root.
 *
 * Returns the canonicalized (symlink-resolved) absolute path if the target
 * is inside `projectRoot`. Returns `null` if:
 *   - the project root does not exist
 *   - the resolved target escapes the project root
 *   - a symlink in the path chain points outside the project root
 *
 * For paths whose target file does not yet exist, falls back to a string-prefix
 * check against the canonicalized project root. This preserves the ability to
 * reference expected-output paths before the step runs.
 */
export function resolveContainedArtifactPath(
  projectRoot: string,
  relPath: string,
): string | null {
  const resolved = path.resolve(projectRoot, relPath)

  let canonicalRoot: string
  try {
    canonicalRoot = fs.realpathSync(projectRoot)
  } catch {
    return null
  }

  let canonicalPath: string
  try {
    canonicalPath = fs.realpathSync(resolved)
  } catch {
    // File does not exist yet. Fall back to the non-symlink-resolved path —
    // safe because any `..` components were already collapsed by path.resolve
    // and no symlinks can be traversed through a path that does not exist.
    if (!isContained(resolved, canonicalRoot)) return null
    return resolved
  }

  if (!isContained(canonicalPath, canonicalRoot)) return null
  return canonicalPath
}

function isContained(candidate: string, root: string): boolean {
  // Equal path is allowed (artifact at the project root itself).
  if (candidate === root) return true
  // Prefix match MUST include the path separator to defeat prefix collision
  // (e.g., /project vs /project-malicious).
  return candidate.startsWith(root + path.sep)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/artifact-path.test.ts`
Expected: PASS — all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/artifact-path.ts src/utils/artifact-path.test.ts
git commit -m "feat(security): add resolveContainedArtifactPath helper

Pure function that resolves an artifact path and verifies it stays
within the project root using realpathSync + path.sep-suffixed prefix
comparison. Handles ENOENT gracefully for not-yet-existing paths."
```

---

## Task 2: Replace call sites in `run.ts`

**Files:**
- Modify: `src/cli/commands/run.ts` (lines ~337, ~371)
- Test: existing `tests/` run.ts coverage; no new test file needed for this task (covered by Task 1's helper tests). Manual smoke test via `make check-all` at the end of Task 7.

- [ ] **Step 1: Write a failing integration test proving the traversal-blocking behavior at the call site**

There is no existing test for traversal at the `run.ts` call sites. Add one to the helper test file (`src/utils/artifact-path.test.ts`) that proves the function returns the expected null — which we already did in Task 1. Move on; the unit tests are sufficient guarantee for Tasks 2-6.

- [ ] **Step 2: Add the import to `run.ts`**

Find the existing imports at the top of `src/cli/commands/run.ts`. Add:

```typescript
import { resolveContainedArtifactPath } from '../../utils/artifact-path.js'
```

- [ ] **Step 3: Replace the first call site (around line 337)**

Current code (inside the `for (const relPath of depEntry.produces)` loop):

```typescript
for (const relPath of depEntry.produces) {
  const fullPath = path.resolve(projectRoot, relPath)
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      artifacts.push({ stepName: dep, filePath: relPath, content })
      gatheredPaths.add(relPath)
    } catch (err) {
      output.warn({
        code: 'ARTIFACT_READ_ERROR',
        message: `Could not read artifact '${relPath}' from step '${dep}': ${(err as Error).message}`,
      })
    }
  }
}
```

Replace with:

```typescript
for (const relPath of depEntry.produces) {
  const fullPath = resolveContainedArtifactPath(projectRoot, relPath)
  if (fullPath === null) {
    output.warn({
      code: 'ARTIFACT_PATH_REJECTED',
      message: `Artifact '${relPath}' from step '${dep}' resolves outside project root — skipping`,
    })
    continue
  }
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      artifacts.push({ stepName: dep, filePath: relPath, content })
      gatheredPaths.add(relPath)
    } catch (err) {
      output.warn({
        code: 'ARTIFACT_READ_ERROR',
        message: `Could not read artifact '${relPath}' from step '${dep}': ${(err as Error).message}`,
      })
    }
  }
}
```

- [ ] **Step 4: Replace the second call site (around line 371)**

Current code (inside the `for (const relPath of readEntry.produces)` loop):

```typescript
for (const relPath of readEntry.produces) {
  // Deduplicate: skip paths already gathered from deps
  if (gatheredPaths.has(relPath)) continue

  const fullPath = path.resolve(projectRoot, relPath)
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      artifacts.push({ stepName: readStep, filePath: relPath, content })
      gatheredPaths.add(relPath)
    } catch (err) {
      output.warn({
        code: 'ARTIFACT_READ_ERROR',
        message: `Could not read artifact '${relPath}' from step` +
            ` '${readStep}': ${(err as Error).message}`,
      })
    }
  }
}
```

Replace with:

```typescript
for (const relPath of readEntry.produces) {
  // Deduplicate: skip paths already gathered from deps
  if (gatheredPaths.has(relPath)) continue

  const fullPath = resolveContainedArtifactPath(projectRoot, relPath)
  if (fullPath === null) {
    output.warn({
      code: 'ARTIFACT_PATH_REJECTED',
      message: `Artifact '${relPath}' from step '${readStep}' resolves outside project root — skipping`,
    })
    continue
  }
  if (fs.existsSync(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      artifacts.push({ stepName: readStep, filePath: relPath, content })
      gatheredPaths.add(relPath)
    } catch (err) {
      output.warn({
        code: 'ARTIFACT_READ_ERROR',
        message: `Could not read artifact '${relPath}' from step` +
            ` '${readStep}': ${(err as Error).message}`,
      })
    }
  }
}
```

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (no existing tests should regress).

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/run.ts
git commit -m "fix(security): contain artifact paths in run command

Route both dep-artifact and reads-artifact gathering through
resolveContainedArtifactPath(), emitting a warning and skipping
artifacts whose paths escape the project root."
```

---

## Task 3: Replace call sites in `completion.ts`

**Files:**
- Modify: `src/state/completion.ts` (lines ~28, ~61, ~97)

The three functions (`detectCompletion`, `checkCompletion`, `analyzeCrash`) all use artifact paths only to test for *existence*, not to read content. A `null` return from the helper means "treat as missing" — we push the original relative path into `artifactsMissing` (or `missingArtifacts`) instead of skipping silently, because the caller needs to know a path was rejected.

- [ ] **Step 1: Add the import**

At the top of `src/state/completion.ts`, add:

```typescript
import { resolveContainedArtifactPath } from '../utils/artifact-path.js'
```

- [ ] **Step 2: Replace the call site in `detectCompletion` (line 28)**

Current code:

```typescript
for (const output of expectedOutputs) {
  const fullPath = path.resolve(projectRoot, output)
  if (fileExists(fullPath)) {
    artifactsPresent.push(output)
  } else {
    artifactsMissing.push(output)
  }
}
```

Replace with:

```typescript
for (const output of expectedOutputs) {
  const fullPath = resolveContainedArtifactPath(projectRoot, output)
  if (fullPath !== null && fileExists(fullPath)) {
    artifactsPresent.push(output)
  } else {
    artifactsMissing.push(output)
  }
}
```

- [ ] **Step 3: Replace the call site in `checkCompletion` (line 61)**

Current code:

```typescript
for (const output of expectedOutputs) {
  const fullPath = path.resolve(projectRoot, output)
  if (fileExists(fullPath)) {
    presentArtifacts.push(output)
  } else {
    missingArtifacts.push(output)
  }
}
```

Replace with:

```typescript
for (const output of expectedOutputs) {
  const fullPath = resolveContainedArtifactPath(projectRoot, output)
  if (fullPath !== null && fileExists(fullPath)) {
    presentArtifacts.push(output)
  } else {
    missingArtifacts.push(output)
  }
}
```

- [ ] **Step 4: Replace the call site in `analyzeCrash` (line 97)**

Current code:

```typescript
for (const output of expectedOutputs) {
  const fullPath = path.resolve(projectRoot, output)
  if (fileExists(fullPath)) {
    presentArtifacts.push(output)
  } else {
    missingArtifacts.push(output)
  }
}
```

Replace with:

```typescript
for (const output of expectedOutputs) {
  const fullPath = resolveContainedArtifactPath(projectRoot, output)
  if (fullPath !== null && fileExists(fullPath)) {
    presentArtifacts.push(output)
  } else {
    missingArtifacts.push(output)
  }
}
```

- [ ] **Step 5: Check for unused `path` import**

`completion.ts` originally imported `path` only for these three `path.resolve` calls. After replacement, `path` is no longer used. Remove the import line `import path from 'node:path'` at the top of the file if it is no longer referenced.

Verify by searching the file for `path.` — there should be no remaining references. If there are, leave the import in place.

- [ ] **Step 6: Run the test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/state/completion.ts
git commit -m "fix(security): contain artifact paths in completion checks

Route detectCompletion, checkCompletion, and analyzeCrash through
resolveContainedArtifactPath(). Paths that escape the project root
are treated as missing artifacts (not silently ignored)."
```

---

## Task 4: Replace call sites in `update-mode.ts`

**Files:**
- Modify: `src/core/assembly/update-mode.ts` (lines ~47, ~65)

`detectUpdateMode` has two distinct call sites: the loop searching for the first existing artifact, and the subsequent `readFileSync` on that artifact. Both must be contained.

- [ ] **Step 1: Add the import**

At the top of `src/core/assembly/update-mode.ts`, add:

```typescript
import { resolveContainedArtifactPath } from '../../utils/artifact-path.js'
```

- [ ] **Step 2: Replace the first call site (line 47) — existence probe**

Current code:

```typescript
// Find the first file artifact that exists on disk (skip directories)
let firstExistingRelPath: string | undefined
for (const relativePath of produces) {
  const fullPath = path.resolve(projectRoot, relativePath)
  try {
    const stat = fs.statSync(fullPath)
    if (stat.isFile()) {
      firstExistingRelPath = relativePath
      break
    }
  } catch {
    // Path does not exist — skip
  }
}
```

Replace with:

```typescript
// Find the first file artifact that exists on disk (skip directories)
let firstExistingRelPath: string | undefined
let firstExistingFullPath: string | undefined
for (const relativePath of produces) {
  const fullPath = resolveContainedArtifactPath(projectRoot, relativePath)
  if (fullPath === null) continue // path escapes project root — skip
  try {
    const stat = fs.statSync(fullPath)
    if (stat.isFile()) {
      firstExistingRelPath = relativePath
      firstExistingFullPath = fullPath
      break
    }
  } catch {
    // Path does not exist — skip
  }
}
```

- [ ] **Step 3: Replace the second call site (line 65) — content read**

Current code:

```typescript
// Update mode triggered — read first artifact content
const fullPath = path.resolve(projectRoot, firstExistingRelPath)
const content = fs.readFileSync(fullPath, 'utf8')
```

Replace with:

```typescript
// Update mode triggered — read first artifact content
// firstExistingFullPath is guaranteed non-null here because we only set
// firstExistingRelPath when its containment-checked fullPath existed.
const content = fs.readFileSync(firstExistingFullPath!, 'utf8')
```

- [ ] **Step 4: Check for unused `path` import**

Search `update-mode.ts` for remaining `path.` references. If none, remove `import path from 'node:path'`. If any remain, leave the import.

- [ ] **Step 5: Run the test suite**

Run: `npx vitest run`
Expected: all tests pass. Note: if `update-mode.test.ts` exists, it will exercise the refactored code.

- [ ] **Step 6: Commit**

```bash
git add src/core/assembly/update-mode.ts
git commit -m "fix(security): contain artifact paths in update-mode detection

Both the existence probe and the subsequent content read go through
resolveContainedArtifactPath(). Out-of-root paths are skipped during
the probe and cannot reach the readFileSync call."
```

---

## Task 5: Replace the call site in `context-gatherer.ts`

**Files:**
- Modify: `src/core/assembly/context-gatherer.ts` (line ~34)

`gatherContext` reads artifact content and injects it into the assembled prompt — a content-read site. Null-return from the helper means skip this artifact.

- [ ] **Step 1: Add the import**

At the top of `src/core/assembly/context-gatherer.ts`, add:

```typescript
import { resolveContainedArtifactPath } from '../../utils/artifact-path.js'
```

- [ ] **Step 2: Replace the call site**

Current code (inside the `for (const outputPath of produces)` loop):

```typescript
for (const outputPath of produces) {
  // Resolve aliased paths (e.g., docs/prd.md ↔ docs/plan.md)
  const resolvedPath = resolveArtifactPath(projectRoot, outputPath)
  const fullPath = path.resolve(projectRoot, resolvedPath)
  if (fileExists(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      artifacts.push({ stepName: depStep, filePath: resolvedPath, content })
    } catch {
      // warn but continue — missing artifact gracefully handled
    }
  }
}
```

Replace with:

```typescript
for (const outputPath of produces) {
  // Resolve aliased paths (e.g., docs/prd.md ↔ docs/plan.md)
  const resolvedPath = resolveArtifactPath(projectRoot, outputPath)
  const fullPath = resolveContainedArtifactPath(projectRoot, resolvedPath)
  if (fullPath === null) continue // path escapes project root — skip silently
  if (fileExists(fullPath)) {
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      artifacts.push({ stepName: depStep, filePath: resolvedPath, content })
    } catch {
      // warn but continue — missing artifact gracefully handled
    }
  }
}
```

- [ ] **Step 3: Check for unused `path` import**

Search `context-gatherer.ts` for remaining `path.` references. If none, remove `import path from 'node:path'`. If any remain (the file may use `path` elsewhere), leave it.

- [ ] **Step 4: Run the test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/context-gatherer.ts
git commit -m "fix(security): contain artifact paths in context gatherer

Route dependency-chain artifact reads through
resolveContainedArtifactPath() before injecting content into the
assembled prompt."
```

---

## Task 6: Replace call sites in `state-migration.ts`

**Files:**
- Modify: `src/state/state-migration.ts` (lines ~143, ~149)

`resolveArtifactPath` only checks *existence* via `fileExists(path.join(...))`. Paths here come from frontmatter (not untrusted state), so the risk is lower — but we include it for defense-in-depth per the spec. A `null` return means "treat as non-existent" — the lookup proceeds to the next alias.

- [ ] **Step 1: Add the import**

At the top of `src/state/state-migration.ts`, add:

```typescript
import { resolveContainedArtifactPath } from '../utils/artifact-path.js'
```

- [ ] **Step 2: Replace the three uses of `fileExists(path.join(projectRoot, …))` inside `resolveArtifactPath`**

Current code:

```typescript
export function resolveArtifactPath(projectRoot: string, artifactPath: string): string {
  // Check if the path itself exists
  if (fileExists(path.join(projectRoot, artifactPath))) {
    return artifactPath
  }

  // Check reverse aliases (canonical → old)
  for (const [oldPath, canonicalPath] of Object.entries(ARTIFACT_ALIASES)) {
    if (artifactPath === canonicalPath && fileExists(path.join(projectRoot, oldPath))) {
      return oldPath
    }
    if (artifactPath === oldPath && fileExists(path.join(projectRoot, canonicalPath))) {
      return canonicalPath
    }
  }

  return artifactPath // return as-is if nothing found
}
```

Replace with:

```typescript
export function resolveArtifactPath(projectRoot: string, artifactPath: string): string {
  const selfPath = resolveContainedArtifactPath(projectRoot, artifactPath)
  if (selfPath !== null && fileExists(selfPath)) {
    return artifactPath
  }

  // Check reverse aliases (canonical → old)
  for (const [oldPath, canonicalPath] of Object.entries(ARTIFACT_ALIASES)) {
    if (artifactPath === canonicalPath) {
      const aliased = resolveContainedArtifactPath(projectRoot, oldPath)
      if (aliased !== null && fileExists(aliased)) return oldPath
    }
    if (artifactPath === oldPath) {
      const aliased = resolveContainedArtifactPath(projectRoot, canonicalPath)
      if (aliased !== null && fileExists(aliased)) return canonicalPath
    }
  }

  return artifactPath // return as-is if nothing found
}
```

Note: leave the earlier `fileExists(path.join(projectRoot, candidate))` at line ~130 inside `detectPrdCanonicalPath()` unchanged — that function scans a hardcoded candidate list from frontmatter, not state, and changing it is outside Wave 0's scope.

Wait — re-check. The spec explicitly lists lines 143 and 149 in `resolveArtifactPath`. The `detectPrdCanonicalPath` reference at line 130 is NOT in the spec's Affected Sites table. Leave it alone.

- [ ] **Step 3: Verify the remaining `path.join` usages are out of Wave 0's scope**

Run: `grep -n "path\.join(projectRoot" src/state/state-migration.ts`

Expected output: at most one remaining match (inside `detectPrdCanonicalPath` around line 130). That call is explicitly out of scope for Wave 0.

- [ ] **Step 4: Run the test suite**

Run: `npx vitest run`
Expected: all tests pass. `state-migration.test.ts` (if present) covers `resolveArtifactPath`.

- [ ] **Step 5: Commit**

```bash
git add src/state/state-migration.ts
git commit -m "fix(security): contain artifact paths in state-migration alias resolution

Route resolveArtifactPath existence checks through
resolveContainedArtifactPath() for defense-in-depth. Lower risk than
state-driven sites since inputs come from frontmatter, but keeps the
containment model consistent across all artifact resolution."
```

---

## Task 7: Final verification

**Files:** no changes — verification only.

- [ ] **Step 1: Confirm every `path.resolve(projectRoot` at an artifact site is gone**

Run: `grep -rn "path\.resolve(projectRoot" src/`

Expected output lines — only these, which are NOT artifact sites:
- `src/state/state-manager.ts` — state path construction (not artifact)
- `src/state/lock-manager.ts` — lock path construction (not artifact)
- `src/state/decision-logger.ts` — decisions log path (not artifact)
- `src/state/rework-manager.ts` — rework path (not artifact)
- `src/util/…` (if present elsewhere) — other unrelated uses

Zero results should appear in:
- `src/cli/commands/run.ts`
- `src/state/completion.ts`
- `src/core/assembly/update-mode.ts`
- `src/core/assembly/context-gatherer.ts`

If any of those 4 files still contain `path.resolve(projectRoot`, return to the relevant Task and finish the replacement.

- [ ] **Step 2: Run all quality gates**

Run: `make check-all`
Expected: all gates pass — lint, validate, test (bats), eval, and TypeScript checks all green.

- [ ] **Step 3: Manual smoke test against a real scaffold project**

Run, from a throwaway test project directory that has a valid `.scaffold/` state:

```bash
# From the scaffold repo root — build first
npm run build

# From a separate tmp project dir that already has .scaffold/state.json
cd /tmp/some-scaffold-project
node /path/to/scaffold/dist/cli.js status
```

Expected: command runs as before; no new warnings for legitimate artifact paths. (Skip this step if no throwaway project is available — the unit tests in Task 1 are the authoritative proof of correctness.)

- [ ] **Step 4: Create the final commit for the review-history entry**

No code changes expected here, but update the spec's review-history section to record Wave 0 as implemented:

Modify `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md`, in the "Review History" section, add after the last entry:

```markdown
- **Implementation — Wave 0** (2026-MM-DD): `resolveContainedArtifactPath()` helper added to `src/utils/artifact-path.ts`. All 5 artifact resolution sites (run.ts, completion.ts, update-mode.ts, context-gatherer.ts, state-migration.ts) routed through the helper. All tests green.
```

Replace `2026-MM-DD` with today's date.

```bash
git add docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md
git commit -m "docs(spec): mark Wave 0 as implemented"
```

- [ ] **Step 5: Done**

Wave 0 is complete. Wave 1 depends on Wave 0 shipping — once this branch merges, Wave 1's plan can be written.

---

## Out of Scope for This Plan

- **Wave 1 onward** — fintech knowledge docs, service manifest, cross-service pipeline, per-service execution. Each wave gets its own plan.
- **`detectPrdCanonicalPath` inside `state-migration.ts`** — uses `path.join` on hardcoded candidates from frontmatter. Not in the spec's Affected Sites table for Wave 0.
- **Other `path.resolve(projectRoot, …)` calls in state managers (lock, rework, decisions, state)** — those resolve state paths, not artifact paths, and are addressed by Wave 3b's `StatePathResolver` abstraction.
