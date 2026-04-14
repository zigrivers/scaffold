# Multi-Service Evolution — Wave 0 (Security Hardening) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a pre-existing path traversal vulnerability by introducing a single `resolveContainedArtifactPath()` helper and using it at all 5 artifact resolution sites.

**Architecture:** Extract a pure function that resolves a relative path against the project root, canonicalizes with `fs.realpathSync()` (including a walk-up-to-existing-ancestor pass for not-yet-existing paths) to defeat symlink bypass, and verifies the result stays within `projectRoot` via a `path.relative`-based containment check that naturally handles prefix collisions and filesystem-root edge cases. Replace direct `path.resolve(projectRoot, relPath)` calls at 5 sites so every artifact read goes through the same containment check.

**Tech Stack:** TypeScript, vitest (test framework), Node.js `fs.realpathSync` / `path.resolve`. No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md` — Wave 0 section

---

## File Structure

### Created

- `src/utils/artifact-path.ts` — Single pure helper function that returns `null` when containment fails. Each call site decides how to react (warn-and-skip, treat-as-missing, or silent-skip) based on its own UX contract. Tests co-located at `src/utils/artifact-path.test.ts`.

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

  it('returns null when a symlink escapes the project root (existing leaf)', () => {
    const root = tmpRoot()
    const outside = tmpRoot()
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'nope')
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'docs', 'escape'))

    const resolved = resolveContainedArtifactPath(root, 'docs/escape/secret.txt')

    expect(resolved).toBeNull()
  })

  it('returns null when a symlinked ancestor escapes and the leaf does NOT exist', () => {
    // Critical case: the leaf is missing, but an ancestor in the chain is a
    // symlink that points outside the project root. A naive ENOENT fallback
    // that only does string-prefix checks would accept this. The helper must
    // canonicalize the deepest existing ancestor and reject.
    const root = tmpRoot()
    const outside = tmpRoot()
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'docs', 'escape'))
    // `docs/escape/missing.txt` does not exist — but resolving it follows the
    // symlink and lands outside the project root.

    const resolved = resolveContainedArtifactPath(root, 'docs/escape/missing.txt')

    expect(resolved).toBeNull()
  })

  it('returns null on prefix collision (project vs project-malicious)', () => {
    const parent = tmpRoot()
    const project = path.join(parent, 'project')
    const malicious = path.join(parent, 'project-malicious')
    fs.mkdirSync(project, { recursive: true })
    fs.mkdirSync(malicious, { recursive: true })
    fs.writeFileSync(path.join(malicious, 'secret.txt'), 'nope')

    const resolved = resolveContainedArtifactPath(project, '../project-malicious/secret.txt')

    expect(resolved).toBeNull()
  })

  it('returns the canonical path for a file that does not yet exist', () => {
    // Pre-completion checks pass a path whose file does not exist yet. The
    // helper must NOT reject these — it must return a canonical would-be path
    // after verifying the deepest existing ancestor stays within the root.
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    const canonicalRoot = fs.realpathSync(root)

    const resolved = resolveContainedArtifactPath(root, 'docs/not-yet.md')

    expect(resolved).toBe(path.join(canonicalRoot, 'docs', 'not-yet.md'))
  })

  it('returns a canonical path when the project root itself is a symlink', () => {
    // macOS tmpdir is /var/folders/... which is a symlink to /private/var/... —
    // this test makes the behavior explicit regardless of platform.
    const realParent = tmpRoot()
    const realRoot = path.join(realParent, 'real-proj')
    fs.mkdirSync(realRoot, { recursive: true })
    const symlinkedRoot = path.join(tmpRoot(), 'via-symlink')
    fs.symlinkSync(realRoot, symlinkedRoot)

    const resolved = resolveContainedArtifactPath(symlinkedRoot, 'docs/not-yet.md')

    expect(resolved).toBe(path.join(fs.realpathSync(symlinkedRoot), 'docs', 'not-yet.md'))
  })

  it('returns null when the file does not exist AND the path would escape', () => {
    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, '../../does-not-exist')

    expect(resolved).toBeNull()
  })

  it('returns null when relPath is absolute and points outside the root', () => {
    // path.resolve(root, '/etc/passwd') === '/etc/passwd' — the root arg is
    // ignored when the second arg is absolute. This is the single most
    // important attack vector for a poisoned state.json with an absolute
    // `produces` entry.
    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, '/etc/passwd')

    expect(resolved).toBeNull()
  })

  it('returns null for relPath containing a null byte', () => {
    // fs APIs throw on null bytes; reject them at the boundary rather than
    // leaking undefined behavior to callers.
    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, 'docs/foo\0.md')

    expect(resolved).toBeNull()
  })

  it('returns null when the project root itself does not exist', () => {
    const nonexistent = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}`)

    const resolved = resolveContainedArtifactPath(nonexistent, 'docs/plan.md')

    expect(resolved).toBeNull()
  })

  it('rejects any relPath that resolves to the project root itself', () => {
    // The project root directory is not a legitimate artifact. Empty
    // string, '.', './', and an absolute path to the root all resolve
    // to projectRoot and must all fail — otherwise existence-only
    // callers (detectCompletion, checkCompletion, analyzeCrash) would
    // count the project root directory as a present artifact.
    const root = tmpRoot()

    expect(resolveContainedArtifactPath(root, '')).toBeNull()
    expect(resolveContainedArtifactPath(root, '.')).toBeNull()
    expect(resolveContainedArtifactPath(root, './')).toBeNull()
    expect(resolveContainedArtifactPath(root, root)).toBeNull()
    expect(resolveContainedArtifactPath(root, fs.realpathSync(root))).toBeNull()
  })

  it('rejects non-string relPath (state boundary is untrusted)', () => {
    // State is JSON-loaded via a trust-cast; a poisoned state.json could
    // put a non-string in produces[]. Fail closed.
    const root = tmpRoot()

    const resolved = resolveContainedArtifactPath(root, 42 as unknown as string)

    expect(resolved).toBeNull()
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
 * stays inside `projectRoot`. Returns `null` if:
 *   - `relPath` is not a non-empty string, or contains a null byte
 *   - the project root does not exist
 *   - the resolved target escapes the project root
 *   - a symlink anywhere in the path chain (including above a missing leaf)
 *     points outside the project root
 *   - any fs error other than ENOENT/ENOTDIR surfaces during canonicalization
 *     (EACCES, ELOOP, EINVAL, …) — we fail closed rather than guess
 *
 * TOCTOU note: callers MUST use the returned absolute path for all
 * subsequent fs operations. Re-resolving `relPath` after this function
 * returns reintroduces the race window between canonicalization and use.
 */
export function resolveContainedArtifactPath(
  projectRoot: string,
  relPath: string,
): string | null {
  // State is JSON-loaded with a trust-cast, so `relPath` may be any type at
  // runtime. Reject non-strings, empty strings (would resolve to the project
  // root itself — never a legitimate artifact), and null-byte injections.
  if (typeof relPath !== 'string' || relPath === '' || relPath.includes('\0')) {
    return null
  }

  const resolved = path.resolve(projectRoot, relPath)

  let canonicalRoot: string
  try {
    canonicalRoot = fs.realpathSync(projectRoot)
  } catch {
    return null
  }

  const canonicalPath = canonicalizeWithMissingTail(resolved)
  if (canonicalPath === null) return null

  if (!isContained(canonicalPath, canonicalRoot)) return null
  // Reject root-equivalent inputs ('.', './', an absolute path equal to the
  // root, etc.). Callers never legitimately ask for the project root itself
  // as an artifact, and accepting it would let existence-only call sites
  // count the project root directory as a present artifact.
  if (canonicalPath === canonicalRoot) return null
  return canonicalPath
}

/**
 * Canonicalize a path whose leaf may not exist. Walk up until an ancestor
 * exists, `realpathSync` it, then re-append the missing tail. This defeats
 * symlink escape through intermediate directories even when the leaf is
 * absent — a plain string-prefix check on the unresolved `path.resolve`
 * output would miss this.
 *
 * Only climbs past ENOENT/ENOTDIR (genuine "does not exist" conditions).
 * Any other errno (EACCES, ELOOP, EINVAL, Windows UNC/drive failures, …)
 * returns null — we must not silently walk past a permission-denied
 * ancestor and reach a canonical root that trivially passes containment.
 */
function canonicalizeWithMissingTail(target: string): string | null {
  let head = target
  const tail: string[] = []
  while (true) {
    try {
      const canonicalHead = fs.realpathSync(head)
      return tail.length === 0 ? canonicalHead : path.join(canonicalHead, ...tail)
    } catch (err) {
      const code = err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return null
      const parent = path.dirname(head)
      if (parent === head) return null
      tail.unshift(path.basename(head))
      head = parent
    }
  }
}

function isContained(candidate: string, root: string): boolean {
  // `path.relative` normalizes the comparison across platforms (POSIX `/`,
  // Windows drive roots, UNC shares) and naturally defeats both prefix
  // collision (`/project` vs `/project-malicious` → `../project-malicious/…`)
  // and root-slash edge cases (`/` + `path.sep` = `//`, which a manual
  // `startsWith` check would mishandle).
  const rel = path.relative(root, candidate)
  if (rel === '') return true // candidate === root
  if (rel === '..' || rel.startsWith('..' + path.sep)) return false
  if (path.isAbsolute(rel)) return false // different Windows drive
  return true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/artifact-path.test.ts`
Expected: PASS — all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/artifact-path.ts src/utils/artifact-path.test.ts
git commit -m "feat(security): add resolveContainedArtifactPath helper

Pure function that resolves an artifact path and verifies it stays
within the project root using realpathSync (with a walk-up-to-existing
pass for not-yet-created paths) plus a path.relative containment check.
Rejects null-byte, non-string, and root-equivalent inputs."
```

---

## Task 2: Replace call sites in `run.ts`

**Files:**
- Modify: `src/cli/commands/run.ts` (lines ~337, ~371)
- Test: existing `tests/` run.ts coverage; no new test file needed for this task (covered by Task 1's helper tests). Manual smoke test via `make check-all` at the end of Task 7.

- [ ] **Step 1: Update `run.test.ts` to tolerate real `realpathSync` on `projectRoot`**

`src/cli/commands/run.test.ts` uses a synthetic `PROJECT_ROOT = '/test/project'` and mocks only `existsSync`/`readFileSync`. After this task, the artifact-gathering path calls real `fs.realpathSync(projectRoot)`, which will throw ENOENT and make every artifact lookup return `null`. Pick one remediation and apply it before editing `run.ts`:

**Option A (recommended) — Mock the helper in `run.test.ts`:**

Add to the top-level `vi.mock` block:

```typescript
import path from 'node:path'

vi.mock('../../utils/artifact-path.js', () => ({
  resolveContainedArtifactPath: vi.fn((projectRoot: string, relPath: string) =>
    path.join(projectRoot, relPath)),
}))
```

Then import `resolveContainedArtifactPath` in the same style as existing mocks and reset it in `beforeEach` if needed. This preserves the existing unit-test boundary: `run.test.ts` does not exercise the helper's real logic — the helper's own test file does.

**Option B — Use a real tmp dir:** replace `PROJECT_ROOT = '/test/project'` with `fs.mkdtempSync(...)`. Higher-cost change; only choose this if Option A conflicts with other parts of the test file.

Run `npx vitest run src/cli/commands/run.test.ts` after the mock is in place and before step 2. Expected: all existing run tests still pass.

After step 4 (the second run.ts edit), add one targeted regression test so the new `ARTIFACT_PATH_REJECTED` branch does not silently disappear in a future refactor. Add to the existing "artifact loading from completed dependencies" describe block:

```typescript
it('emits ARTIFACT_PATH_REJECTED when helper returns null for an out-of-root artifact', async () => {
  vi.mocked(resolveContainedArtifactPath).mockImplementation(
    (root: string, relPath: string) =>
      relPath === 'docs/plan.md' ? null : path.join(root, relPath),
  )
  // Wire up a pipeline where create-prd depends on setup-project, and
  // setup-project has produces: ['docs/plan.md']. Use existing test fixtures.
  // ... (reuse the setup in the neighboring "loads artifacts from completed
  // dependency steps" test)

  await invokeHandler({ step: 'create-prd', _: ['run'] })

  expect(mockOutput.warn).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'ARTIFACT_PATH_REJECTED' }),
  )
})
```

This proves (1) `run.ts` actually calls the helper and (2) the null branch fires the documented warning.

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
// Find the first file artifact that exists on disk (skip directories).
// Both relPath and its containment-checked fullPath are tracked together
// so the downstream read site does not need a non-null assertion.
let firstExisting: { relPath: string; fullPath: string } | undefined
for (const relativePath of produces) {
  const fullPath = resolveContainedArtifactPath(projectRoot, relativePath)
  if (fullPath === null) continue // path escapes project root — skip
  try {
    const stat = fs.statSync(fullPath)
    if (stat.isFile()) {
      firstExisting = { relPath: relativePath, fullPath }
      break
    }
  } catch {
    // Path does not exist — skip
  }
}
```

Update any downstream references to `firstExistingRelPath` in this function to `firstExisting?.relPath` (or destructure once the early-return has narrowed the type).

- [ ] **Step 3: Replace the second call site (line 65) — content read**

Current code:

```typescript
// Update mode triggered — read first artifact content
const fullPath = path.resolve(projectRoot, firstExistingRelPath)
const content = fs.readFileSync(fullPath, 'utf8')
```

Replace with:

```typescript
// Update mode triggered — read first artifact content.
// TypeScript has narrowed `firstExisting` to non-undefined by this point
// (the early-return for the not-found case runs above this line).
const content = fs.readFileSync(firstExisting.fullPath, 'utf8')
```

Adjust the early-return guard above this point to check `if (firstExisting === undefined)` instead of `if (firstExistingRelPath === undefined)`, so TypeScript narrows `firstExisting` correctly for the read.

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

Note: leave the earlier `fileExists(path.join(projectRoot, candidate))` at line ~130 inside `resolvePrdPath()` unchanged — that function scans a hardcoded candidate list from frontmatter, not state, and changing it is outside Wave 0's scope. The spec's Affected Sites table explicitly lists only lines 143 and 149 in `resolveArtifactPath`.

- [ ] **Step 3: Verify the remaining `path.join` usages are out of Wave 0's scope**

Run: `grep -n "path\.join(projectRoot" src/state/state-migration.ts`

Expected output: at most one remaining match (inside `resolvePrdPath` around line 130). That call is explicitly out of scope for Wave 0.

- [ ] **Step 4: Add regression coverage for `resolveArtifactPath`**

`src/state/state-migration.test.ts` currently exercises `migrateState` only — there are no existing tests for `resolveArtifactPath`. Add a small coverage block so this hardening does not silently drift.

First, ensure these imports exist at the top of the test file (add any that are missing):

```typescript
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { resolveArtifactPath } from './state-migration.js'
```

Then add the block (place it alongside the existing `migrateState` describe):

```typescript
describe('resolveArtifactPath (containment-hardened)', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const d of tmpDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    tmpDirs.length = 0
    vi.restoreAllMocks()
  })

  function tmpRoot() {
    const p = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-'))
    tmpDirs.push(p)
    return p
  }

  it('returns the alias when canonical path does not exist but alias does', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(root, 'docs', 'prd.md'), 'x')

    // ARTIFACT_ALIASES maps 'docs/prd.md' → 'docs/plan.md'. Asking for the
    // canonical name when only the legacy name is on disk round-trips
    // to the legacy name — proving the function still walks aliases after
    // the containment refactor.
    expect(resolveArtifactPath(root, 'docs/plan.md')).toBe('docs/prd.md')
  })

  it('does not probe the filesystem at all for traversal inputs', () => {
    // Before this hardening, resolveArtifactPath('../../etc/passwd') called
    // fileExists(path.join(root, '../../etc/passwd')) — a real existsSync
    // probe on '/etc/passwd'. After the refactor, resolveContainedArtifactPath
    // returns null for that input, fileExists is skipped, and no alias key
    // in ARTIFACT_ALIASES matches '../../etc/passwd', so the alias loop also
    // never probes. The observable difference between old and new code is
    // that `fs.existsSync` is now called zero times for a traversal input.
    const root = tmpRoot()
    const existsSpy = vi.spyOn(fs, 'existsSync')

    const result = resolveArtifactPath(root, '../../etc/passwd')

    expect(existsSpy).not.toHaveBeenCalled()
    expect(result).toBe('../../etc/passwd') // function still returns the input
  })
})
```

Verify the alias direction at `src/state/state-migration.ts` (`ARTIFACT_ALIASES` declaration around line 50) and flip the first test if it has reversed since this plan was written.

- [ ] **Step 5: Run the test suite**

Run: `npx vitest run`
Expected: all tests pass, including the two new cases above.

- [ ] **Step 6: Commit**

```bash
git add src/state/state-migration.ts src/state/state-migration.test.ts
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

Expected output lines — only these non-artifact sites may remain:
- `src/state/state-manager.ts` — state path construction (not artifact)
- `src/state/lock-manager.ts` — lock path construction (not artifact)
- `src/state/decision-logger.ts` — decisions log path (not artifact)
- `src/state/rework-manager.ts` — rework path (not artifact)

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

- [ ] **Step 4: Update the spec to match reality and record Wave 0 as implemented**

Two changes to `docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md`:

1. Correct the helper filename — the spec currently says `src/util/artifact-path.ts` but the codebase convention (and this plan) uses `src/utils/` plural. Search the spec for `src/util/artifact-path` and replace with `src/utils/artifact-path`.

2. Append to the "Review History" section:

```markdown
- **Implementation — Wave 0** (2026-MM-DD): `resolveContainedArtifactPath()` helper added to `src/utils/artifact-path.ts`. All 5 artifact resolution sites (run.ts, completion.ts, update-mode.ts, context-gatherer.ts, state-migration.ts) routed through the helper. All tests green.
```

Replace `2026-MM-DD` with today's date.

```bash
git add docs/superpowers/specs/2026-04-13-multi-service-evolution-design.md
git commit -m "docs(spec): mark Wave 0 as implemented + correct src/utils path"
```

- [ ] **Step 5: Done**

Wave 0 is complete. Wave 1 depends on Wave 0 shipping — once this branch merges, Wave 1's plan can be written.

---

## Out of Scope for This Plan

- **Wave 1 onward** — fintech knowledge docs, service manifest, cross-service pipeline, per-service execution. Each wave gets its own plan.
- **`resolvePrdPath` inside `state-migration.ts`** — uses `path.join` on hardcoded candidates from frontmatter. Not in the spec's Affected Sites table for Wave 0.
- **Other `path.resolve(projectRoot, …)` calls in state managers (lock, rework, decisions, state)** — those resolve state paths, not artifact paths, and are addressed by Wave 3b's `StatePathResolver` abstraction.
