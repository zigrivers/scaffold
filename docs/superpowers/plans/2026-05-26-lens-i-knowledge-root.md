# Lens I Existing-Entry Suppression — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Lens I to skip gap-finding buckets whose topic slug already has a knowledge entry, so adding `content/knowledge/<cat>/<topic>.md` immediately closes the gap finding instead of waiting up to 90 days for signals to age out.

**Architecture:** A new `src/observability/knowledge-index.ts` module owns three concerns — index-loading (frontmatter walker, no js-yaml), install auto-detect (parent-walk on `package.json#name === '@zigrivers/scaffold'`), and 3-tier resolution (CLI override → yaml → auto-detect). `runAudit` calls the resolver, threads the result through `LensContext.knowledgeIndex` / `LensContext.knowledgeRootAttempts` / `LensContext.warnedKeys`, and Lens I consumes it. `runFixFlow` forwards a `--knowledge-root` CLI override into verifier and postfix audits so suppression behavior is consistent across the whole `--fix` lifecycle. All four new `LensContext` fields are optional (existing test literals stay green).

**Tech Stack:** TypeScript, Node (`fs.readdirSync`, `node:path`, `node:url`'s `fileURLToPath`, `node:crypto`), js-yaml (only via the existing `loadObservabilityConfig`), vitest. No new runtime dependencies.

**Companion spec:** [`docs/superpowers/specs/2026-05-26-lens-i-knowledge-root-design.md`](../specs/2026-05-26-lens-i-knowledge-root-design.md) — 20 resolved decisions including the VERSION-marker validator (#15), the resolver-loads-index-once design (#16), the optional-field LensContext extension (#17), `formatForStderr` hygiene (#18), yaml-tier reuse via `loadObservabilityConfig` (#19), and `--fix` propagation (#20).

---

## File structure

**Create:**

| File | Responsibility |
|---|---|
| `src/observability/knowledge-index.ts` | All 6 exports: `loadKnowledgeIndex`, `findScaffoldKnowledgeRoot`, `validateKnowledgeRoot`, `resolveKnowledgeRoot`, `emitOnceForAudit`, `formatForStderr` |
| `src/observability/knowledge-index.test.ts` | Unit coverage for each export — fixtures live in `os.tmpdir()` (same pattern as existing tests) |

**Modify:**

| File | Why |
|---|---|
| `src/observability/engine/checks/observability-config.ts` | Add typed `'I-knowledge-gaps'?: { knowledge_root?: string }` slot to `ObservabilityConfig.lenses` and a matching empty default in `DEFAULT_CONFIG.lenses` (decision #19). |
| `src/observability/engine/checks/runner.ts` | Extend `LensContext` (4 optional fields) and `RunChecksInput` (3 optional fields). Default the new fields safely in the `runChecks` constructor. |
| `src/observability/engine/api.ts` | Add `knowledgeRootOverride?: string` to `RunAuditInput`. Call `resolveKnowledgeRoot` before `runChecks`. Thread the resolution + a fresh `warnedKeys` Set into `runChecks`. |
| `src/observability/engine/fix-flow.ts` | Add `knowledgeRootOverride?: string` to `RunFixFlowInput`. Thread it into `defaultVerifier` and the postfix `runAudit` call. Bump `defaultVerifier` signature to accept the override (decision #20). |
| `src/observability/checks/lens-i-knowledge-gaps.ts` | Read `context.knowledgeIndex` and suppress matching buckets at BOTH P1 and P2 severities. Emit single `lens-i:no-root` warning via `emitOnceForAudit(context.warnedKeys, ...)` when the lens runs but no root resolved; format the yaml-was-invalid note via `formatForStderr`. |
| `src/observability/checks/lens-i-knowledge-gaps.test.ts` | Add suppression + warning tests; existing tests stay unchanged (optional fields preserve compatibility). |
| `src/cli/commands/observe.ts` | Add `--knowledge-root <path>` yargs option to the `audit` subcommand. Pass it through `HandleAuditInput.knowledgeRootOverride` → `RunAuditInput.knowledgeRootOverride` → `RunFixFlowInput.knowledgeRootOverride`. Catch `KnowledgeRootCliInvalidError` and exit non-zero with a clean message. |
| `docs/knowledge-freshness/operations.md` | Add "Existing-entry suppression" subsection (3-tier resolution, soft-fail semantics, relationship to `scaffold observe ack`). |
| `CLAUDE.md` | Add the new `lenses.I-knowledge-gaps.knowledge_root` line (commented) to the `.scaffold/observability.yaml` example. |
| `docs/architecture/operations-runbook.md` | Release checklist note: removing `content/` from `package.json#files` silently breaks downstream auto-detection. |

**Snapshot of existing identifiers used (verify before each task):**

- `LensContext` and `RunChecksInput` are at `src/observability/engine/checks/runner.ts:4-27`. `runChecks` constructs context at line 77.
- `RunAuditInput` is at `src/observability/engine/api.ts:54-63`. `runAudit` calls `runChecks` at line 97.
- `RunFixFlowInput` is at `src/observability/engine/fix-flow.ts:20-28`. `defaultVerifier` is at line 67. Postfix `runAudit` call is around line 137.
- `loadObservabilityConfig` is at `src/observability/engine/checks/observability-config.ts:99`. `ObservabilityConfig` interface is at line 46. `DEFAULT_CONFIG` is at line 64.
- Lens I severity thresholds are at `src/observability/checks/lens-i-knowledge-gaps.ts:103-105`.
- `extractKBFrontmatter` (reference for parser style; do NOT import) is at `src/core/assembly/knowledge-loader.ts:102-104`.
- `handleAudit` is at `src/cli/commands/observe.ts:224`; the audit yargs subcommand starts at line 477.

---

## Task 1: `loadKnowledgeIndex` + `formatForStderr` (pure helpers, no deps)

**Files:**
- Create: `src/observability/knowledge-index.ts`
- Create: `src/observability/knowledge-index.test.ts`

These two helpers have no upstream dependencies; landing them first lets every subsequent task import them.

- [ ] **Step 1: Write failing tests**

Create `src/observability/knowledge-index.test.ts` with the following test scaffolding:

```typescript
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { loadKnowledgeIndex, formatForStderr } from './knowledge-index.js'

const tmpDirs: string[] = []

function makeKbDir(entries: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-idx-'))
  tmpDirs.push(dir)
  for (const [relPath, content] of Object.entries(entries)) {
    const full = path.join(dir, relPath)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf8')
  }
  return dir
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

describe('loadKnowledgeIndex', () => {
  it('returns empty Set for an empty directory', () => {
    const dir = makeKbDir({})
    expect(loadKnowledgeIndex(dir)).toEqual(new Set())
  })

  it('extracts name: slugs from frontmatter and excludes README.md', () => {
    const dir = makeKbDir({
      'README.md': '# readme\n',
      'core/alpha.md': '---\nname: alpha\n---\nbody\n',
      'core/beta.md': '---\nname: beta-one\n---\nbody\n',
      'web/README.md': '# nested readme\n',
      'web/gamma.md': '---\nname: gamma\n---\nbody\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set(['alpha', 'beta-one', 'gamma']))
  })

  it('skips files with no frontmatter or missing name:', () => {
    const dir = makeKbDir({
      'core/no-fm.md': 'body only\n',
      'core/no-name.md': '---\ndescription: x\n---\nbody\n',
      'core/ok.md': '---\nname: ok\n---\nbody\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set(['ok']))
  })

  it('accepts non-slug name: values (matches extractKBFrontmatter, not validator)', () => {
    const dir = makeKbDir({
      'core/wacky.md': '---\nname: Wacky_Name 1!\n---\nbody\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set(['Wacky_Name 1!']))
  })

  it('handles quoted, commented, and nested-after-name frontmatter (js-yaml semantics)', () => {
    const dir = makeKbDir({
      'core/quoted.md': '---\nname: "quoted-slug"\n---\nbody\n',
      'core/commented.md': '---\nname: with-comment  # trailing comment\ndescription: x\n---\n',
      'core/with-list.md': '---\nname: list-after\ntopics: [a, b]\nsources:\n  - url: https://x\n---\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(
      new Set(['quoted-slug', 'with-comment', 'list-after']),
    )
  })

  it('skips files where the frontmatter never closes', () => {
    const dir = makeKbDir({
      'core/unclosed.md': '---\nname: not-really-real\nlots of body\nbut no closing delimiter\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set())
  })

  it('dedupes duplicate name: across files', () => {
    const dir = makeKbDir({
      'core/dup1.md': '---\nname: dup\n---\nbody\n',
      'web/dup2.md': '---\nname: dup\n---\nbody\n',
    })
    expect(loadKnowledgeIndex(dir)).toEqual(new Set(['dup']))
  })

  it('throws when the path does not exist', () => {
    expect(() => loadKnowledgeIndex('/tmp/definitely-nope-xyz-12345'))
      .toThrow()
  })

  it('throws when the path is a file', () => {
    const dir = makeKbDir({ 'oops.md': '---\nname: x\n---\n' })
    expect(() => loadKnowledgeIndex(path.join(dir, 'oops.md'))).toThrow()
  })
})

describe('formatForStderr', () => {
  it('wraps a normal string in single quotes', () => {
    expect(formatForStderr('hello')).toBe("'hello'")
  })

  it('returns the sentinel for undefined or empty input', () => {
    expect(formatForStderr(undefined)).toBe("'<missing>'")
    expect(formatForStderr('')).toBe("'<missing>'")
  })

  it('escapes embedded single quotes', () => {
    expect(formatForStderr("it's fine")).toBe("'it\\'s fine'")
  })

  it('replaces control characters and newlines with ?', () => {
    expect(formatForStderr('line1\nline2\ttab\x07bell'))
      .toBe("'line1?line2?tab?bell'")
  })

  it('passes unicode through unchanged', () => {
    expect(formatForStderr('日本語 🐢')).toBe("'日本語 🐢'")
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/observability/knowledge-index.test.ts
```

Expected: FAIL — module `./knowledge-index.js` does not exist.

- [ ] **Step 3: Implement both helpers**

Create `src/observability/knowledge-index.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'

// ─── loadKnowledgeIndex ─────────────────────────────────────────────────────

const FRONTMATTER_DELIMITER = '---'

/**
 * Extract the `name:` field from a knowledge entry's YAML frontmatter.
 * Uses js-yaml (the same parser the assembly engine's extractKBFrontmatter
 * and the freshness validator both use) so we accept exactly the same
 * shapes — including comments, quoted values, and any YAML-valid form.
 *
 * Returns null if there is no frontmatter, no closing delimiter, the YAML
 * fails to parse, or there is no usable `name:` (matches
 * extractKBFrontmatter at src/core/assembly/knowledge-loader.ts:102-104:
 * any non-empty trimmed string is accepted; slug regex enforcement stays
 * in the freshness validator only).
 */
function extractName(content: string): string | null {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) return null
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FRONTMATTER_DELIMITER) { closeIdx = i; break }
  }
  if (closeIdx === -1) return null  // unclosed frontmatter
  let parsed: unknown
  try { parsed = yaml.load(lines.slice(1, closeIdx).join('\n'), { schema: yaml.JSON_SCHEMA }) }
  catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const raw = (parsed as Record<string, unknown>)['name']
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function walkMarkdown(dir: string, out: string[]): void {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkMarkdown(full, out)
    else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      out.push(full)
    }
  }
}

/**
 * Walk knowledgeDir recursively, parse each .md file's frontmatter, and
 * return the Set of `name:` slugs. Throws if knowledgeDir does not exist
 * or is not a directory. README.md files are excluded (matches the
 * assembly loader's behavior).
 *
 * Acceptance rule matches extractKBFrontmatter: any non-empty trimmed
 * `name:` value is accepted. The slug regex lives in the freshness
 * validator, not here — keeping the loader permissive prevents drift
 * between what the assembly engine sees and what suppression matches.
 *
 * Uses js-yaml (already a project dependency — see
 * src/core/assembly/knowledge-loader.ts, observability-config.ts, and
 * knowledge-frontmatter-validator.ts) rather than a regex so we accept
 * exactly the same shapes the assembly engine does (comments, quoted
 * values, nested structures). The "dependency-free" Cross-Cutting
 * principle applies only to the directory walk + file I/O — not to
 * the frontmatter parsing.
 */
export function loadKnowledgeIndex(knowledgeDir: string): Set<string> {
  const stat = fs.statSync(knowledgeDir)  // throws if missing
  if (!stat.isDirectory()) {
    throw new Error(`knowledge directory is not a directory: ${knowledgeDir}`)
  }
  const files: string[] = []
  walkMarkdown(knowledgeDir, files)
  const out = new Set<string>()
  for (const file of files) {
    let content: string
    try { content = fs.readFileSync(file, 'utf8') } catch { continue }
    const name = extractName(content)
    if (name) out.add(name)
  }
  return out
}

// ─── formatForStderr ────────────────────────────────────────────────────────

const STDERR_UNSAFE_RE = /[\r\n\t\x00-\x1f]/g

/**
 * Wrap a value for safe one-line stderr interpolation. Wraps in single
 * quotes, escapes embedded single quotes with backslash, replaces
 * newlines/control characters with `?`. Returns the literal `'<missing>'`
 * for undefined or empty input. Used by Lens I when composing
 * warn-once messages that include operator-supplied paths or
 * loader-supplied error reasons.
 */
export function formatForStderr(value: string | undefined): string {
  if (value === undefined || value === '') return "'<missing>'"
  return "'" + value.replace(/'/g, "\\'").replace(STDERR_UNSAFE_RE, '?') + "'"
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run src/observability/knowledge-index.test.ts
```

Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/observability/knowledge-index.ts src/observability/knowledge-index.test.ts
git commit -m "feat(lens-i): add loadKnowledgeIndex and formatForStderr (T1)

First pieces of the new knowledge-index module: a dependency-free
frontmatter walker that returns the Set of entry slugs, and a
stderr-hygiene helper used by Lens I when composing warn-once messages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `findScaffoldKnowledgeRoot` (auto-detect from CLI install)

**Important pre-read on the design.** The auto-detect tier must start
from the **CLI install's own module location**, NOT from the audited
project's `cwd`. A downstream user running `scaffold observe audit` in
`~/my-project/` is auditing their project — that's `cwd: ~/my-project/`
— but the scaffold install lives elsewhere (e.g.
`/opt/homebrew/lib/node_modules/@zigrivers/scaffold/`). The auto-detect
walk has to start from a directory inside the install or it will never
find the install's `package.json`.

The plan threads two distinct directories into the resolver: the audited
project's `cwd` (used for the yaml tier, to find
`<cwd>/.scaffold/observability.yaml`) and the CLI install's `selfLocation`
(used for auto-detect). `runAudit` and `runFixFlow` populate
`selfLocation` from `dirname(fileURLToPath(import.meta.url))` of their
own modules (which always live inside the install).



**Files:**
- Modify: `src/observability/knowledge-index.ts` (append)
- Modify: `src/observability/knowledge-index.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append to `src/observability/knowledge-index.test.ts`:

```typescript
import { findScaffoldKnowledgeRoot } from './knowledge-index.js'

describe('findScaffoldKnowledgeRoot', () => {
  it('returns null when no scaffold install lives above the start dir', () => {
    const dir = makeKbDir({})  // empty dir under os.tmpdir(); no package.json above it
    expect(findScaffoldKnowledgeRoot(dir)).toBeNull()
  })

  it('matches a parent whose package.json names @zigrivers/scaffold', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: '@zigrivers/scaffold', version: '0.0.0' }),
      'content/knowledge/README.md': '# readme\n',
      'content/knowledge/core/x.md': '---\nname: x\n---\n',
      'src/somewhere/cli.js': '// running module\n',
    })
    const start = path.join(root, 'src', 'somewhere')
    const result = findScaffoldKnowledgeRoot(start)
    expect(result).toBe(path.join(root, 'content', 'knowledge'))
  })

  it('does NOT match a parent whose package.json names something else', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: 'some-other-project', version: '1.0' }),
      'content/knowledge/core/x.md': '---\nname: x\n---\n',
      'src/cli.js': '',
    })
    const start = path.join(root, 'src')
    expect(findScaffoldKnowledgeRoot(start)).toBeNull()
  })

  it('does NOT match a parent that lacks content/knowledge/', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: '@zigrivers/scaffold' }),
      'src/cli.js': '',
    })
    const start = path.join(root, 'src')
    expect(findScaffoldKnowledgeRoot(start)).toBeNull()
  })

  it('walks up multiple parents (npm-global-style nesting)', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: '@zigrivers/scaffold' }),
      'content/knowledge/x.md': '---\nname: x\n---\n',
      'lib/node_modules/inner/dist/cli.js': '',
    })
    const start = path.join(root, 'lib', 'node_modules', 'inner', 'dist')
    expect(findScaffoldKnowledgeRoot(start)).toBe(path.join(root, 'content', 'knowledge'))
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/observability/knowledge-index.test.ts -t findScaffoldKnowledgeRoot
```

Expected: FAIL — `findScaffoldKnowledgeRoot` is not exported.

- [ ] **Step 3: Implement**

Append to `src/observability/knowledge-index.ts`:

```typescript
import { fileURLToPath } from 'node:url'

const SCAFFOLD_PACKAGE_NAME = '@zigrivers/scaffold'

function readPackageName(packageJsonPath: string): string | null {
  try {
    const raw = fs.readFileSync(packageJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as { name?: unknown }
    return typeof parsed.name === 'string' ? parsed.name : null
  } catch {
    return null
  }
}

/**
 * Walk parent directories of `startDir` and return the absolute path of
 * the first `<parent>/content/knowledge` where `<parent>/package.json`
 * declares `name: "@zigrivers/scaffold"`. Walks to the filesystem root
 * without any home-directory boundary (npm-global installs live in
 * /opt/homebrew/... or /usr/local/..., outside the user's home).
 *
 * Returns null when no matching parent is found.
 *
 * The argument is the starting directory; production callers pass
 * `path.dirname(fileURLToPath(import.meta.url))` from a module that
 * lives inside the install. Tests can pass any directory directly.
 */
export function findScaffoldKnowledgeRoot(startDir: string): string | null {
  let current = path.resolve(startDir)
  while (true) {
    const pkgPath = path.join(current, 'package.json')
    if (fs.existsSync(pkgPath) && readPackageName(pkgPath) === SCAFFOLD_PACKAGE_NAME) {
      const candidate = path.join(current, 'content', 'knowledge')
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        return candidate
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return null   // filesystem root
    current = parent
  }
}

/** Convenience for production callers — derives the start dir from a
 *  module's import.meta.url. `runAudit` and `runFixFlow` call this
 *  with their own `import.meta.url` to anchor the auto-detect walk to
 *  the install location. Tests should call `findScaffoldKnowledgeRoot`
 *  directly with a fixture path. */
export function findScaffoldKnowledgeRootFromImportMeta(metaUrl: string): string | null {
  return findScaffoldKnowledgeRoot(path.dirname(fileURLToPath(metaUrl)))
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run src/observability/knowledge-index.test.ts
```

Expected: all `loadKnowledgeIndex` + `formatForStderr` + `findScaffoldKnowledgeRoot` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/observability/knowledge-index.ts src/observability/knowledge-index.test.ts
git commit -m "feat(lens-i): add findScaffoldKnowledgeRoot (T2)

Walks parent dirs looking for a package.json that names
@zigrivers/scaffold AND a content/knowledge sibling. No homedir
boundary — npm-global installs live outside \$HOME. Production
callers use findScaffoldKnowledgeRootFromImportMeta(import.meta.url);
tests pass a directory directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `validateKnowledgeRoot` (VERSION marker + loader)

**Files:**
- Modify: `src/observability/knowledge-index.ts` (append)
- Modify: `src/observability/knowledge-index.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append:

```typescript
import { validateKnowledgeRoot } from './knowledge-index.js'

describe('validateKnowledgeRoot', () => {
  it('fails when the path does not exist', () => {
    const result = validateKnowledgeRoot('/tmp/definitely-nope-xyz-99999')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/does not exist/i)
  })

  it('fails when the path is a file', () => {
    const dir = makeKbDir({ 'VERSION': '0.1.0\n' })
    const result = validateKnowledgeRoot(path.join(dir, 'VERSION'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/not a directory/i)
  })

  it('fails when VERSION marker is missing', () => {
    const dir = makeKbDir({ 'core/x.md': '---\nname: x\n---\n' })
    const result = validateKnowledgeRoot(dir)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/VERSION marker/i)
  })

  it('passes with VERSION marker and entries', () => {
    const dir = makeKbDir({
      'VERSION': '0.1.0\n',
      'core/x.md': '---\nname: x\n---\n',
      'web/y.md': '---\nname: y\n---\n',
    })
    const result = validateKnowledgeRoot(dir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.index).toEqual(new Set(['x', 'y']))
  })

  it('passes with VERSION marker but EMPTY tree (freshly initialized KB)', () => {
    const dir = makeKbDir({ 'VERSION': '0.1.0\n' })
    const result = validateKnowledgeRoot(dir)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.index).toEqual(new Set())
  })

  it('fails for an enclosing dir of the KB (e.g. content/)', () => {
    // Simulates `--knowledge-root <repo>/content` — the recursive walk
    // would find <repo>/content/knowledge/core/*.md, but VERSION lives
    // ONLY at <repo>/content/knowledge/VERSION, not at <repo>/content/.
    const root = makeKbDir({
      'knowledge/VERSION': '0.1.0\n',
      'knowledge/core/x.md': '---\nname: x\n---\n',
      'tools/some-tool.md': '---\nname: some-tool\n---\n',
    })
    const result = validateKnowledgeRoot(root)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/VERSION marker/i)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/observability/knowledge-index.test.ts -t validateKnowledgeRoot
```

Expected: FAIL — `validateKnowledgeRoot` is not exported.

- [ ] **Step 3: Implement**

Append to `src/observability/knowledge-index.ts`:

```typescript
export type ValidateResult =
  | { ok: true; index: Set<string> }
  | { ok: false; reason: string }

/**
 * Validate that `candidatePath` is a real scaffold knowledge directory.
 * Two checks:
 *
 *   1. The directory exists, IS a directory, and contains a `VERSION`
 *      marker file. VERSION lives ONLY at content/knowledge/VERSION in
 *      the scaffold repo (added in Phase 1); requiring it forecloses
 *      "operator pointed at an ancestor" cases like
 *      `--knowledge-root <repo>/content` that would otherwise pass an
 *      empty-tree-loose validator (the recursive walk would find the
 *      nested KB entries).
 *   2. loadKnowledgeIndex(candidatePath) succeeds. An empty Set is
 *      valid (freshly-initialized KB).
 *
 * Returns { ok: true, index } on success so the resolver doesn't have
 * to walk a second time.
 */
export function validateKnowledgeRoot(candidatePath: string): ValidateResult {
  let stat: fs.Stats
  try { stat = fs.statSync(candidatePath) }
  catch { return { ok: false, reason: `path does not exist: ${candidatePath}` } }
  if (!stat.isDirectory()) {
    return { ok: false, reason: `path is not a directory: ${candidatePath}` }
  }
  const markerPath = path.join(candidatePath, 'VERSION')
  if (!fs.existsSync(markerPath)) {
    return {
      ok: false,
      reason: `missing knowledge-base VERSION marker — path does not appear to be a scaffold knowledge directory: ${candidatePath}`,
    }
  }
  let index: Set<string>
  try { index = loadKnowledgeIndex(candidatePath) }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: `index load failed: ${msg}` }
  }
  return { ok: true, index }
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run src/observability/knowledge-index.test.ts
```

Expected: all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/observability/knowledge-index.ts src/observability/knowledge-index.test.ts
git commit -m "feat(lens-i): add validateKnowledgeRoot (T3)

VERSION marker + loader-success validator. The marker check fires
before loadKnowledgeIndex runs so pointing at content/ or any other
ancestor of the actual knowledge dir fails fast with a precise
message. Empty KBs (VERSION-only) are valid (decision #15).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Typed `I-knowledge-gaps` slot in `ObservabilityConfig`

**Files:**
- Modify: `src/observability/engine/checks/observability-config.ts`

- [ ] **Step 1: Add the typed slot**

Edit `src/observability/engine/checks/observability-config.ts`. After the existing `GLensConfig` interface (around line 19), add:

```typescript
export interface ILensConfig {
  knowledge_root?: string
}
```

Then update the `ObservabilityConfig.lenses` interface (around line 47) by adding the new key alongside the existing ones:

```typescript
export interface ObservabilityConfig {
  lenses: {
    'A-tdd'?: Record<string, never>
    'B-ac-coverage'?: Record<string, never>
    'C-standards'?: CLensConfig
    'D-stack'?: DLensConfig
    'E-design'?: ELensConfig
    'F-scope'?: FLensConfig
    'G-decisions'?: GLensConfig
    'H-cross-doc'?: { skip_phase_subsets?: string[] }
    'I-knowledge-gaps'?: ILensConfig
  }
  // ... rest unchanged
}
```

Then update `DEFAULT_CONFIG.lenses` (around line 65) by adding the new key:

```typescript
export const DEFAULT_CONFIG: ObservabilityConfig = {
  lenses: {
    'C-standards': { enforce_via_linter: true, rule_overrides: {} },
    'E-design':    { ad_hoc_token_threshold: 3, ui_glob: 'src/components/**/*.tsx' },
    'F-scope':     { untouched_story_grace_hours: 168 },
    'G-decisions': {},
    'H-cross-doc': {},
    'I-knowledge-gaps': {},
  },
  // ... rest unchanged
}
```

- [ ] **Step 2: Verify the existing config tests still pass**

```bash
npx vitest run src/observability/engine/checks/observability-config.test.ts
```

Expected: PASS (the existing tests assert specific known keys; they don't enumerate the full shape).

- [ ] **Step 3: Type-check the whole tree**

```bash
npm run type-check
```

Expected: PASS (no other file references `ObservabilityConfig.lenses['I-knowledge-gaps']` yet, so no cascading errors).

- [ ] **Step 4: Commit**

```bash
git add src/observability/engine/checks/observability-config.ts
git commit -m "feat(lens-i): add typed I-knowledge-gaps slot to ObservabilityConfig (T4)

Closes the previously-deferred R3-P3 finding about untyped config
access. resolveKnowledgeRoot will read
config.lenses['I-knowledge-gaps']?.knowledge_root via the standard
loadObservabilityConfig.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `emitOnceForAudit` (caller-provided Set)

**Files:**
- Modify: `src/observability/knowledge-index.ts` (append)
- Modify: `src/observability/knowledge-index.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append:

```typescript
import { emitOnceForAudit } from './knowledge-index.js'

describe('emitOnceForAudit', () => {
  let stderrOutput: string
  let originalWrite: typeof process.stderr.write

  beforeEach(() => {
    stderrOutput = ''
    originalWrite = process.stderr.write.bind(process.stderr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr.write as any) = (chunk: string | Uint8Array): boolean => {
      stderrOutput += typeof chunk === 'string' ? chunk : chunk.toString()
      return true
    }
  })
  afterEach(() => {
    process.stderr.write = originalWrite
  })

  it('writes to stderr on first call for a key', () => {
    const set = new Set<string>()
    emitOnceForAudit(set, 'key-a', 'hello\n')
    expect(stderrOutput).toBe('hello\n')
    expect(set.has('key-a')).toBe(true)
  })

  it('does NOT write on second call with the same key + set', () => {
    const set = new Set<string>()
    emitOnceForAudit(set, 'key-a', 'first\n')
    emitOnceForAudit(set, 'key-a', 'second\n')
    expect(stderrOutput).toBe('first\n')
  })

  it('writes again for a different key on the same set', () => {
    const set = new Set<string>()
    emitOnceForAudit(set, 'key-a', 'first\n')
    emitOnceForAudit(set, 'key-b', 'second\n')
    expect(stderrOutput).toBe('first\nsecond\n')
  })

  it('writes again when a different (fresh) Set is passed', () => {
    const setA = new Set<string>()
    const setB = new Set<string>()
    emitOnceForAudit(setA, 'key-a', 'first\n')
    emitOnceForAudit(setB, 'key-a', 'second\n')
    expect(stderrOutput).toBe('first\nsecond\n')
  })
})
```

Make sure to add `beforeEach` to the vitest import at the top of the file if it isn't there:

```typescript
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/observability/knowledge-index.test.ts -t emitOnceForAudit
```

Expected: FAIL — `emitOnceForAudit` is not exported.

- [ ] **Step 3: Implement**

Append to `src/observability/knowledge-index.ts`:

```typescript
/**
 * Write `message` to process.stderr exactly once per (set, key) tuple.
 * The dedup state lives in the caller-provided `warnedKeys` Set, NOT
 * in module-level state — this is intentional so multiple runAudit
 * invocations in one process (e.g. the --fix flow's initial + verifier
 * + postfix audits, or vitest's shared-module-state tests) each get
 * their own dedup scope. runAudit creates a fresh Set for each
 * invocation; tests pass their own.
 *
 * Uses process.stderr.write directly rather than console.warn so the
 * output never collides with JSON renders of audit output on stdout.
 */
export function emitOnceForAudit(
  warnedKeys: Set<string>,
  key: string,
  message: string,
): void {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  process.stderr.write(message)
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run src/observability/knowledge-index.test.ts
```

Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/observability/knowledge-index.ts src/observability/knowledge-index.test.ts
git commit -m "feat(lens-i): add emitOnceForAudit (T5)

Caller-provided per-audit Set for warn-once dedup. Avoids the
module-global pitfalls the spec called out: --fix runs runAudit
three times in one process; vitest shares module state within a
file. Fresh-Set-per-invocation makes warn-once work for both.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `resolveKnowledgeRoot` (3-tier orchestration)

**Files:**
- Modify: `src/observability/knowledge-index.ts` (append)
- Modify: `src/observability/knowledge-index.test.ts` (append)

- [ ] **Step 1: Write failing tests**

Append:

```typescript
import {
  resolveKnowledgeRoot,
  KnowledgeRootCliInvalidError,
  type KnowledgeRootResolution,
} from './knowledge-index.js'

describe('resolveKnowledgeRoot', () => {
  function makeValidKb(): string {
    return makeKbDir({
      'VERSION': '0.1.0\n',
      'core/x.md': '---\nname: x\n---\n',
    })
  }

  it('returns null with attempts.auto-detect=not-found when no input matches', () => {
    const cwd = makeKbDir({})  // no yaml file, no scaffold install above
    const result = resolveKnowledgeRoot({ cwd })
    expect(result.root).toBeNull()
    expect(result.index).toBeNull()
    const autoAttempt = result.attempts.find(a => a.source === 'auto-detect')
    expect(autoAttempt?.outcome).toBe('not-found')
  })

  it('returns the CLI override path when valid', () => {
    const kb = makeValidKb()
    const cwd = makeKbDir({})
    const result = resolveKnowledgeRoot({ override: kb, cwd })
    expect(result.root).toBe(kb)
    expect(result.index?.has('x')).toBe(true)
    const cliAttempt = result.attempts.find(a => a.source === 'cli')
    expect(cliAttempt?.outcome).toBe('used')
  })

  it('throws KnowledgeRootCliInvalidError when override is invalid', () => {
    const cwd = makeKbDir({})
    expect(() =>
      resolveKnowledgeRoot({ override: '/tmp/definitely-nope-99999', cwd })
    ).toThrow(KnowledgeRootCliInvalidError)
  })

  it('reads yaml tier when no override and yaml is present and valid', () => {
    const kb = makeValidKb()
    const cwd = makeKbDir({
      '.scaffold/observability.yaml':
        `lenses:\n  I-knowledge-gaps:\n    knowledge_root: ${kb}\n`,
    })
    const result = resolveKnowledgeRoot({ cwd })
    expect(result.root).toBe(kb)
    const yamlAttempt = result.attempts.find(a => a.source === 'yaml')
    expect(yamlAttempt?.outcome).toBe('used')
  })

  it('falls through to auto-detect when yaml path is invalid', () => {
    const cwd = makeKbDir({
      '.scaffold/observability.yaml':
        `lenses:\n  I-knowledge-gaps:\n    knowledge_root: /tmp/bogus-99999\n`,
    })
    const result = resolveKnowledgeRoot({ cwd })
    expect(result.root).toBeNull()
    const yamlAttempt = result.attempts.find(a => a.source === 'yaml')
    expect(yamlAttempt?.outcome).toBe('invalid')
    expect(yamlAttempt?.reason).toMatch(/path does not exist/i)
    const autoAttempt = result.attempts.find(a => a.source === 'auto-detect')
    expect(autoAttempt?.outcome).toBe('not-found')
  })

  it('records yaml as not-provided when cwd is omitted', () => {
    const result = resolveKnowledgeRoot({})
    const yamlAttempt = result.attempts.find(a => a.source === 'yaml')
    expect(yamlAttempt?.outcome).toBe('not-provided')
  })

  it('auto-detects when scaffold install is above cwd', () => {
    const root = makeKbDir({
      'package.json': JSON.stringify({ name: '@zigrivers/scaffold' }),
      'content/knowledge/VERSION': '0.1.0\n',
      'content/knowledge/x.md': '---\nname: x\n---\n',
    })
    const cwd = path.join(root, 'src')
    fs.mkdirSync(cwd, { recursive: true })
    const result = resolveKnowledgeRoot({ cwd })
    expect(result.root).toBe(path.join(root, 'content', 'knowledge'))
    expect(result.index?.has('x')).toBe(true)
    const autoAttempt = result.attempts.find(a => a.source === 'auto-detect')
    expect(autoAttempt?.outcome).toBe('used')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/observability/knowledge-index.test.ts -t resolveKnowledgeRoot
```

Expected: FAIL — exports do not exist.

- [ ] **Step 3: Implement**

Append to `src/observability/knowledge-index.ts`:

```typescript
import { loadObservabilityConfig } from './engine/checks/observability-config.js'

/** Thrown by `resolveKnowledgeRoot` when an operator-supplied CLI
 *  override path fails validation. The CLI handler (handleAudit)
 *  catches it and exits non-zero. */
export class KnowledgeRootCliInvalidError extends Error {
  constructor(public readonly path: string, public readonly reason: string) {
    super(`--knowledge-root path '${path}' is invalid: ${reason}`)
    this.name = 'KnowledgeRootCliInvalidError'
  }
}

export interface KnowledgeRootAttempt {
  source: 'cli' | 'yaml' | 'auto-detect'
  path?: string
  outcome: 'used' | 'invalid' | 'not-provided' | 'not-found'
  reason?: string
}

export interface KnowledgeRootResolution {
  /** Validated absolute path to a knowledge directory, or null. */
  root: string | null
  /** Pre-loaded index Set, populated by the validator. Null when root
   *  is null. Lens I reads this directly — no re-walk. */
  index: Set<string> | null
  /** Audit trail of what was tried. Lens I uses this to compose a
   *  precise warn-once message when root is null. */
  attempts: KnowledgeRootAttempt[]
}

export interface ResolveInput {
  /** Optional caller-supplied CLI override (operator-typed
   *  --knowledge-root flag). Invalid paths throw
   *  KnowledgeRootCliInvalidError. */
  override?: string
  /** Working directory for reading .scaffold/observability.yaml. When
   *  undefined, the yaml tier is skipped (recorded as
   *  outcome: 'not-provided'). Typically the audited project's root. */
  cwd?: string
  /** Optional starting directory for the auto-detect parent-walk.
   *  Production callers (runAudit, runFixFlow) pass a directory
   *  INSIDE the CLI install — typically
   *  `dirname(fileURLToPath(import.meta.url))` of their own module —
   *  so the walk finds the install's `package.json` and
   *  `content/knowledge/`. When undefined, falls back to `cwd` (and
   *  then `process.cwd()`); this fallback is intended for tests, NOT
   *  production. Without selfLocation, auto-detect cannot succeed for
   *  downstream users running scaffold from outside the scaffold repo. */
  selfLocation?: string
}

/**
 * 3-tier knowledge-root resolution per the design spec (§2):
 *   1. CLI override (hard-errors on validation failure)
 *   2. .scaffold/observability.yaml lenses.I-knowledge-gaps.knowledge_root
 *      (soft-fails to auto-detect on validation failure)
 *   3. findScaffoldKnowledgeRoot starting from cwd (returns null if no
 *      scaffold install is above the start dir)
 *
 * Returns a record carrying the validated root, the pre-loaded index
 * (eliminating the need for a second walk in Lens I), and the
 * attempts trail (used by Lens I's warning composition).
 */
export function resolveKnowledgeRoot(input: ResolveInput): KnowledgeRootResolution {
  const attempts: KnowledgeRootAttempt[] = []

  // Tier 1: CLI override
  if (input.override !== undefined && input.override !== '') {
    const result = validateKnowledgeRoot(input.override)
    if (result.ok) {
      attempts.push({ source: 'cli', path: input.override, outcome: 'used' })
      return { root: input.override, index: result.index, attempts }
    }
    throw new KnowledgeRootCliInvalidError(input.override, result.reason)
  }
  attempts.push({ source: 'cli', outcome: 'not-provided' })

  // Tier 2: yaml config
  if (input.cwd === undefined) {
    attempts.push({ source: 'yaml', outcome: 'not-provided' })
  } else {
    const config = loadObservabilityConfig(input.cwd)
    const yamlPath = config.lenses['I-knowledge-gaps']?.knowledge_root
    if (yamlPath === undefined || yamlPath === '') {
      attempts.push({ source: 'yaml', outcome: 'not-provided' })
    } else {
      const result = validateKnowledgeRoot(yamlPath)
      if (result.ok) {
        attempts.push({ source: 'yaml', path: yamlPath, outcome: 'used' })
        return { root: yamlPath, index: result.index, attempts }
      }
      attempts.push({ source: 'yaml', path: yamlPath, outcome: 'invalid', reason: result.reason })
    }
  }

  // Tier 3: auto-detect (starts from the CLI install's module location
  // when production callers supply selfLocation; falls back to cwd /
  // process.cwd() for test convenience only).
  const startDir = input.selfLocation ?? input.cwd ?? process.cwd()
  const autoRoot = findScaffoldKnowledgeRoot(startDir)
  if (autoRoot === null) {
    attempts.push({ source: 'auto-detect', outcome: 'not-found' })
    return { root: null, index: null, attempts }
  }
  const result = validateKnowledgeRoot(autoRoot)
  if (result.ok) {
    attempts.push({ source: 'auto-detect', path: autoRoot, outcome: 'used' })
    return { root: autoRoot, index: result.index, attempts }
  }
  attempts.push({ source: 'auto-detect', path: autoRoot, outcome: 'invalid', reason: result.reason })
  return { root: null, index: null, attempts }
}
```

**Note on the import path:** the import is from `./engine/checks/observability-config.js`, which puts `knowledge-index.ts` and `engine/` as siblings under `src/observability/`. Confirm with `ls src/observability/` before pasting if the layout differs.

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run src/observability/knowledge-index.test.ts
```

Expected: PASS — every describe block (loadKnowledgeIndex, formatForStderr, findScaffoldKnowledgeRoot, validateKnowledgeRoot, emitOnceForAudit, resolveKnowledgeRoot) green.

- [ ] **Step 5: Commit**

```bash
git add src/observability/knowledge-index.ts src/observability/knowledge-index.test.ts
git commit -m "feat(lens-i): add resolveKnowledgeRoot 3-tier resolver (T6)

CLI override → yaml (via loadObservabilityConfig) → auto-detect.
KnowledgeRootCliInvalidError on invalid override (CLI handler will
catch). Returns a KnowledgeRootResolution carrying root + pre-loaded
index + attempts trail. Decisions #5, #13, #15, #16, #19 implemented.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Extend `LensContext` + `RunChecksInput`

**Files:**
- Modify: `src/observability/engine/checks/runner.ts`

- [ ] **Step 1: Edit the interfaces**

Two edits inside `src/observability/engine/checks/runner.ts`:

(a) Add ONE new import at the top of the file, alongside the existing imports (currently `import type { Event, Finding, AvailabilityMap, AdapterId, DocGraph } from '../types.js'` and `import type { LensManifest } from './registry.js'`). The new import goes immediately after them:

```typescript
import type { KnowledgeRootAttempt } from '../../knowledge-index.js'
```

(b) Replace the existing `LensContext` and `RunChecksInput` interface declarations (lines 4-27 of the current file — but NOT the import lines above them) with the extended versions below:

```typescript
export interface LensContext {
  profile: 'fast' | 'full'
  cwd: string
  /** Validated absolute path to a content/knowledge/ directory whose
   *  entry slugs are used to suppress Lens I findings. Undefined when
   *  no path was resolved (or when a caller bypassed runAudit). Lens I
   *  treats undefined/null as "no suppression". */
  knowledgeRoot?: string | null
  /** Pre-loaded index Set, populated by resolveKnowledgeRoot during
   *  validation. Lens I reads this directly — does NOT call
   *  loadKnowledgeIndex itself. */
  knowledgeIndex?: Set<string> | null
  /** Audit trail of which knowledge-root tiers were tried. Lens I
   *  uses this to compose a precise warn-once message when
   *  knowledgeRoot is null. Defaults to empty when undefined. */
  knowledgeRootAttempts?: KnowledgeRootAttempt[]
  /** Per-audit-run Set passed to emitOnceForAudit for deduplicating
   *  warnings. Fresh Set per runAudit invocation. */
  warnedKeys?: Set<string>
}

export type LensFn = (
  graph: DocGraph,
  ledger: { events: Event[] },
  availability: AvailabilityMap,
  upstreamFindings: Finding[],
  enabledIds: Set<string>,
  context?: LensContext,
) => Promise<Finding[]>

export interface RunChecksInput {
  registry: LensManifest[]
  lenses: Record<string, LensFn>
  graph: DocGraph
  ledger: { events: Event[] }
  availability: AvailabilityMap
  profile: 'fast' | 'full'
  cwd?: string
  enabledIds?: Set<string>
  /** Optional pre-computed knowledge-root resolution. When provided
   *  the runner threads root/index/attempts into every LensContext.
   *  runAudit populates this; tests that bypass runAudit can leave
   *  it undefined (the lens treats that as "no suppression"). */
  knowledgeRootResolution?: {
    root: string | null
    index: Set<string> | null
    attempts: KnowledgeRootAttempt[]
  }
  /** Optional caller-provided warn-once Set. runAudit creates a fresh
   *  one per invocation; tests bypassing runAudit may leave it
   *  undefined (runChecks then creates an empty Set per call). */
  warnedKeys?: Set<string>
}
```

Then update the `runChecks` function's context construction (around line 77) to:

```typescript
  const context: LensContext = {
    profile: input.profile,
    cwd: input.cwd ?? process.cwd(),
    knowledgeRoot: input.knowledgeRootResolution?.root,
    knowledgeIndex: input.knowledgeRootResolution?.index,
    knowledgeRootAttempts: input.knowledgeRootResolution?.attempts ?? [],
    warnedKeys: input.warnedKeys ?? new Set<string>(),
  }
```

(All other lines in `runChecks` stay untouched.)

- [ ] **Step 2: Run the runner-tier tests and confirm they still pass**

```bash
npx vitest run src/observability/engine/checks/runner.test.ts
```

Expected: PASS (existing tests don't supply the new fields; defaults handle it).

- [ ] **Step 3: Run the existing lens tests and confirm they still pass**

```bash
npx vitest run src/observability/checks/
```

Expected: PASS — the lens-h-cross-doc.test.ts literals (`{ profile: 'full', cwd: process.cwd() }`) and the lens-i-knowledge-gaps.test.ts `makeContext` helper all stay valid because every new field is optional.

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/checks/runner.ts
git commit -m "feat(lens-i): extend LensContext + RunChecksInput with knowledge-root fields (T7)

All four new fields are optional so existing test literals at
lens-h-cross-doc.test.ts (5 sites) and lens-i-knowledge-gaps.test.ts
keep compiling. The runChecks constructor substitutes safe defaults.
Decision #17 (LensContext optionality + zero test migration).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Wire `runAudit` to `resolveKnowledgeRoot`

**Files:**
- Modify: `src/observability/engine/api.ts`

- [ ] **Step 1: Edit RunAuditInput + runAudit**

In `src/observability/engine/api.ts`:

Add to imports near the top of the file (alongside the existing `loadObservabilityConfig` import):

```typescript
import { resolveKnowledgeRoot } from '../knowledge-index.js'
import { dirname } from 'node:path'        // if not already imported
import { fileURLToPath } from 'node:url'   // if not already imported
```

(Note: `dirname` and `fileURLToPath` may already be imported in api.ts
for `scaffoldVersion()`. If they are, don't re-add them — just use the
existing imports.)

Then update the `RunAuditInput` interface (around line 54) by adding the new optional field at the end:

```typescript
export interface RunAuditInput {
  primaryRoot: string
  profile: 'fast' | 'full'
  scope: 'docs' | 'code' | 'all'
  sinceHours?: number
  lensIds?: string[]
  fixThresholdOverride?: string
  ghBin?: string
  bdBin?: string
  args?: Record<string, unknown>
  /** Operator-supplied --knowledge-root override. Set by handleAudit
   *  when the flag was passed; left undefined by all internal callers
   *  except runFixFlow (which forwards from its own input). */
  knowledgeRootOverride?: string
}
```

Then update the `runAudit` function (around line 85). After the `loadObservabilityConfig` call and before the `runChecks` call, insert the resolver invocation:

```typescript
  // The selfLocation anchors the auto-detect parent-walk to the CLI
  // install directory. Without it, a downstream user auditing their
  // own project (~/my-project/) would have the walk start from
  // ~/my-project/ and never find the scaffold install's package.json.
  // api.ts always lives inside the install (dist/observability/engine/
  // after build), so dirname(fileURLToPath(import.meta.url)) is the
  // correct anchor.
  const resolution = resolveKnowledgeRoot({
    override: input.knowledgeRootOverride,
    cwd: input.primaryRoot,
    selfLocation: dirname(fileURLToPath(import.meta.url)),
  })
  const warnedKeys = new Set<string>()
```

Then update the `runChecks(...)` call to pass the resolution and warnedKeys:

```typescript
  const rawFindings = await runChecks({
    registry: LENS_REGISTRY,
    lenses: makeLensImplementations(input.primaryRoot),
    graph,
    ledger: { events: merged.events },
    availability,
    profile: input.profile,
    cwd: input.primaryRoot,
    enabledIds,
    knowledgeRootResolution: resolution,
    warnedKeys,
  })
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run the existing api.test.ts (if present) and any audit smoke tests**

```bash
npx vitest run tests/
```

Expected: PASS. The runAudit signature change is additive (`knowledgeRootOverride` is optional), so existing callers (phase-audit.ts, fix-flow.ts, the MMR doc-conformance channel, the CLI handler) keep compiling.

- [ ] **Step 4: Commit**

```bash
git add src/observability/engine/api.ts
git commit -m "feat(lens-i): wire runAudit to resolveKnowledgeRoot (T8)

Adds knowledgeRootOverride to RunAuditInput. Every runAudit call now
resolves the knowledge-root (CLI → yaml → auto-detect) and threads
the resolution + a fresh warnedKeys Set into runChecks. Internal
callers that don't pass an override automatically get yaml +
auto-detect. Decision #13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Lens I — consume `knowledgeIndex`, emit warn-once

**Files:**
- Modify: `src/observability/checks/lens-i-knowledge-gaps.ts`
- Modify: `src/observability/checks/lens-i-knowledge-gaps.test.ts`

- [ ] **Step 1: Write failing tests**

Append the following describe block to `src/observability/checks/lens-i-knowledge-gaps.test.ts`:

```typescript
describe('lensIKnowledgeGaps — existing-entry suppression', () => {
  function makeSignals(topic: string, projectIds: string[], count: number): Event[] {
    // Spread `count` signals across `projectIds` (cycling).
    const events: Event[] = []
    for (let i = 0; i < count; i++) {
      const projectId = projectIds[i % projectIds.length]
      events.push(makeEvent({ payload: {
        topic, source: 'agent_search', project_id: projectId,
      } }))
    }
    return events
  }

  it('suppresses a bucket whose topic is in the knowledge index (P2 threshold)', async () => {
    const events = makeSignals('covered-topic', [VALID_HEX_A, VALID_HEX_B], 3)
    const ctx: LensContext = {
      profile: 'fast',
      cwd: makeTmpProject(),
      knowledgeRoot: '/fake/kb',
      knowledgeIndex: new Set(['covered-topic']),
      knowledgeRootAttempts: [],
      warnedKeys: new Set(),
    }
    const findings = await lensIKnowledgeGaps(
      emptyGraph, { events }, stubAvailability, [], new Set(['I-knowledge-gaps']), ctx,
    )
    expect(findings).toEqual([])
  })

  it('suppresses a bucket at P1 threshold too', async () => {
    const events = makeSignals('covered-hot', [VALID_HEX_A, VALID_HEX_B, VALID_HEX_C], 5)
    const ctx: LensContext = {
      profile: 'fast', cwd: makeTmpProject(),
      knowledgeRoot: '/fake/kb',
      knowledgeIndex: new Set(['covered-hot']),
      knowledgeRootAttempts: [], warnedKeys: new Set(),
    }
    const findings = await lensIKnowledgeGaps(
      emptyGraph, { events }, stubAvailability, [], new Set(['I-knowledge-gaps']), ctx,
    )
    expect(findings).toEqual([])
  })

  it('does NOT suppress a bucket whose topic is not in the index', async () => {
    const events = makeSignals('uncovered-topic', [VALID_HEX_A, VALID_HEX_B], 3)
    const ctx: LensContext = {
      profile: 'fast', cwd: makeTmpProject(),
      knowledgeRoot: '/fake/kb',
      knowledgeIndex: new Set(['something-else']),
      knowledgeRootAttempts: [], warnedKeys: new Set(),
    }
    const findings = await lensIKnowledgeGaps(
      emptyGraph, { events }, stubAvailability, [], new Set(['I-knowledge-gaps']), ctx,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].evidence).toMatchObject({ topic: 'uncovered-topic' })
  })

  it('emits one lens-i:no-root warning when knowledgeRoot is null', async () => {
    const events = makeSignals('orphan-topic', [VALID_HEX_A, VALID_HEX_B], 3)
    const warnedKeys = new Set<string>()
    const stderrChunks: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr.write as any) = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }
    try {
      const ctx: LensContext = {
        profile: 'fast', cwd: makeTmpProject(),
        knowledgeRoot: null, knowledgeIndex: null,
        knowledgeRootAttempts: [
          { source: 'cli', outcome: 'not-provided' },
          { source: 'yaml', outcome: 'not-provided' },
          { source: 'auto-detect', outcome: 'not-found' },
        ],
        warnedKeys,
      }
      const findings = await lensIKnowledgeGaps(
        emptyGraph, { events }, stubAvailability, [], new Set(['I-knowledge-gaps']), ctx,
      )
      expect(findings).toHaveLength(1)   // no suppression — finding still emitted
      expect(stderrChunks.join('')).toMatch(/\[Lens I\] knowledge-root not located/)
      // Second call with the same warnedKeys Set should NOT re-emit.
      await lensIKnowledgeGaps(
        emptyGraph, { events }, stubAvailability, [], new Set(['I-knowledge-gaps']), ctx,
      )
      expect(stderrChunks.filter(c => c.includes('[Lens I]')).length).toBe(1)
    } finally {
      process.stderr.write = originalWrite
    }
  })

  it('includes the yaml-was-invalid note in the warning when applicable', async () => {
    const events = makeSignals('orphan', [VALID_HEX_A, VALID_HEX_B], 3)
    const warnedKeys = new Set<string>()
    const stderrChunks: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr.write as any) = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }
    try {
      const ctx: LensContext = {
        profile: 'fast', cwd: makeTmpProject(),
        knowledgeRoot: null, knowledgeIndex: null,
        knowledgeRootAttempts: [
          { source: 'cli', outcome: 'not-provided' },
          {
            source: 'yaml', path: '/tmp/bad', outcome: 'invalid',
            reason: 'path does not exist',
          },
          { source: 'auto-detect', outcome: 'not-found' },
        ],
        warnedKeys,
      }
      await lensIKnowledgeGaps(
        emptyGraph, { events }, stubAvailability, [], new Set(['I-knowledge-gaps']), ctx,
      )
      const combined = stderrChunks.join('')
      expect(combined).toMatch(/yaml lenses\.I-knowledge-gaps\.knowledge_root '\/tmp\/bad' was invalid: 'path does not exist'/)
    } finally {
      process.stderr.write = originalWrite
    }
  })

  it('does NOT warn when Lens I is not in enabledIds', async () => {
    const events = makeSignals('orphan', [VALID_HEX_A, VALID_HEX_B], 3)
    const stderrChunks: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr.write as any) = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }
    try {
      const ctx: LensContext = {
        profile: 'fast', cwd: makeTmpProject(),
        knowledgeRoot: null, knowledgeIndex: null,
        knowledgeRootAttempts: [{ source: 'auto-detect', outcome: 'not-found' }],
        warnedKeys: new Set(),
      }
      await lensIKnowledgeGaps(
        emptyGraph, { events }, stubAvailability, [],
        new Set([]),  // Lens I NOT enabled
        ctx,
      )
      // Note: runChecks normally skips disabled lenses entirely.
      // This test pins the defensive behavior in case a future
      // direct call passes empty enabledIds AND the lens still runs.
      // If runChecks's contract guarantees lens-fn-not-called-when-disabled,
      // the test is documenting "if it WAS called, it would still
      // gate the warning"; the gate is on enabledIds.has(lensId).
      expect(stderrChunks.filter(c => c.includes('[Lens I]')).length).toBe(0)
    } finally {
      process.stderr.write = originalWrite
    }
  })

  it('two consecutive lens calls with fresh warnedKeys both emit (multi-audit case)', async () => {
    const events = makeSignals('orphan2', [VALID_HEX_A, VALID_HEX_B], 3)
    const stderrChunks: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr.write as any) = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }
    try {
      for (let i = 0; i < 2; i++) {
        const ctx: LensContext = {
          profile: 'fast', cwd: makeTmpProject(),
          knowledgeRoot: null, knowledgeIndex: null,
          knowledgeRootAttempts: [{ source: 'auto-detect', outcome: 'not-found' }],
          warnedKeys: new Set(),  // fresh Set per "audit"
        }
        await lensIKnowledgeGaps(
          emptyGraph, { events }, stubAvailability, [], new Set(['I-knowledge-gaps']), ctx,
        )
      }
      expect(stderrChunks.filter(c => c.includes('[Lens I]')).length).toBe(2)
    } finally {
      process.stderr.write = originalWrite
    }
  })
})
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx vitest run src/observability/checks/lens-i-knowledge-gaps.test.ts -t "existing-entry suppression"
```

Expected: FAIL — the lens doesn't read `knowledgeIndex` yet and doesn't emit warnings.

- [ ] **Step 3: Implement Lens I changes**

In `src/observability/checks/lens-i-knowledge-gaps.ts`, modify the imports at the top to add:

```typescript
import { emitOnceForAudit, formatForStderr } from '../knowledge-index.js'
```

Then rename the lens function's 5th parameter from `_enabled` to `enabled` so it can be referenced from the new warning gate. The current signature is:

```typescript
export const lensIKnowledgeGaps: LensFn = async (
  _graph, ledger, _availability, _upstream, _enabled, context,
) => {
```

Change to:

```typescript
export const lensIKnowledgeGaps: LensFn = async (
  _graph, ledger, _availability, _upstream, enabled, context,
) => {
```

Then modify the lens body. The current loop at lines 97-150 emits a finding for every bucket above threshold. Add a suppression check inside that loop AND add a warn-once block above it. Replace the section from the start of "4. Apply finding rules" comment through the end of the for loop with:

```typescript
  // 4. Compose the warn-once message ONCE if Lens I is enabled but
  //    no knowledgeRoot was resolved. The lens still runs and emits
  //    unsuppressed findings — suppression is an enhancement, not a
  //    contract. Gates on:
  //      (a) context && !context.knowledgeRoot → null root or legacy caller
  //      (b) enabled.has(lensId) → defensive guard for tests/callers
  //          that invoke the lens directly with an empty enabledIds set.
  //          (runChecks already skips disabled lenses BEFORE calling the
  //          lensFn, so this guard is redundant in production but
  //          protects direct-call tests and any future programmatic
  //          path that might bypass runChecks.)
  if (context && !context.knowledgeRoot && enabled.has(lensId)) {
    const yamlAttempt = (context.knowledgeRootAttempts ?? []).find(
      a => a.source === 'yaml' && a.outcome === 'invalid',
    )
    const yamlNote = yamlAttempt
      ? ` — yaml lenses.I-knowledge-gaps.knowledge_root ${formatForStderr(yamlAttempt.path)} was invalid: ${formatForStderr(yamlAttempt.reason)}`
      : ''
    emitOnceForAudit(
      context.warnedKeys ?? new Set<string>(),
      'lens-i:no-root',
      `[Lens I] knowledge-root not located; existing-entry suppression disabled${yamlNote}. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.\n`,
    )
  }

  // 5. Apply finding rules — suppress buckets covered by the index
  const index = context?.knowledgeIndex ?? null
  for (const bucket of buckets.values()) {
    const signalCount = bucket.signals.length
    const distinctProjectCount = bucket.realProjects.size

    let severity: 'P1' | 'P2' | null = null
    if (signalCount >= 5 && distinctProjectCount >= 3) severity = 'P1'
    else if (signalCount >= 3 && distinctProjectCount >= 2) severity = 'P2'
    if (!severity) continue

    // Existing-entry suppression: skip both P1 and P2 paths when the
    // topic is covered by an existing knowledge entry. Pre-loaded
    // index from the resolver (decision #16); lens does not re-walk.
    if (index && index.has(bucket.topic)) continue

    const projectsSample = [...bucket.realProjects].slice(0, MAX_SAMPLE_PROJECTS)
    // ... rest of the existing finding push UNCHANGED ...
```

The rest of the `findings.push({ ... })` block stays exactly as it was. Just keep the existing properties.

- [ ] **Step 4: Run and confirm pass**

```bash
npx vitest run src/observability/checks/lens-i-knowledge-gaps.test.ts
```

Expected: PASS — all existing tests + all new suppression tests.

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/observability/checks/lens-i-knowledge-gaps.ts src/observability/checks/lens-i-knowledge-gaps.test.ts
git commit -m "feat(lens-i): consume knowledgeIndex; emit warn-once on null root (T9)

Suppression at both P1 (>=5/>=3) and P2 (>=3/>=2) severities when
context.knowledgeIndex contains the bucket's topic. Single warn-once
via emitOnceForAudit(context.warnedKeys, ...) when the lens runs but
no root was resolved; warning includes the yaml-was-invalid note
formatted via formatForStderr when applicable. Lens does NOT re-walk
the tree (decision #16). Decision #11 (warn-once via caller-Set).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: `runFixFlow` propagation

**Files:**
- Modify: `src/observability/engine/fix-flow.ts`

- [ ] **Step 1: Edit RunFixFlowInput + defaultVerifier + postfix runAudit**

In `src/observability/engine/fix-flow.ts`:

Update `RunFixFlowInput` (around line 20) by adding the new optional field:

```typescript
export interface RunFixFlowInput {
  primaryRoot: string
  initial: EngineOutput
  dispatcher?: FixDispatcher
  verifier?: FixVerifier
  ghBin?: string
  bdBin?: string
  abortSnapshot?: AbortSnapshot
  /** Forwarded from `handleAudit --fix --knowledge-root <path>`. When
   *  set, every internal runAudit call (verifier + postfix) inherits
   *  the same override, so Lens I suppression behavior is consistent
   *  across the whole fix run (decision #20). Internal callers of
   *  runFixFlow that don't pass this field continue to behave as
   *  before (yaml + auto-detect). */
  knowledgeRootOverride?: string
}
```

Update `defaultVerifier` (around line 64) to accept the override. The function currently has signature `(cwd, finding)` — change it to a closure-style factory that captures the override. (No need to pass `selfLocation` here — when `runFixFlow`'s verifier calls `runAudit`, runAudit itself does the `dirname(fileURLToPath(import.meta.url))` resolution against api.ts's own module, which is correct for the auto-detect path.)

```typescript
function makeDefaultVerifier(knowledgeRootOverride?: string): FixVerifier {
  return (cwd, finding) =>
    runAudit({
      primaryRoot: cwd, profile: 'fast', scope: 'all',
      sinceHours: 24, lensIds: [finding.lens_id],
      knowledgeRootOverride,
      args: { profile: 'fast', scope: 'all', lensIds: [finding.lens_id], verifying: finding.id },
    }).then((out) => ({ stillPresent: out.findings.some((f) => f.id === finding.id) }))
}
```

Delete the original `defaultVerifier` function. Then update `runFixFlow` (around line 115) to use the factory:

```typescript
  const verifier = input.verifier ?? makeDefaultVerifier(input.knowledgeRootOverride)
```

Update the postfix `runAudit` call (around line 137) to pass the override:

```typescript
  const postfix = await runAudit({
    primaryRoot: input.primaryRoot,
    profile: 'fast', scope: 'all', sinceHours: 24,
    ghBin: input.ghBin, bdBin: input.bdBin,
    knowledgeRootOverride: input.knowledgeRootOverride,
    args: { profile: 'fast', scope: 'all', postfix: true },
  })
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 3: Run fix-flow tests if present**

```bash
npx vitest run src/observability/engine/fix-flow.test.ts 2>/dev/null
ls src/observability/engine/fix-flow.test.ts 2>/dev/null && echo "test file exists"
```

If the test file doesn't exist, that's fine — the broader integration test in Task 12 covers the path.

- [ ] **Step 4: Commit**

```bash
git add src/observability/engine/fix-flow.ts
git commit -m "feat(lens-i): propagate --knowledge-root through runFixFlow (T10)

Decision #20: the operator's --knowledge-root intent must be
consistent across the whole --fix lifecycle (initial + verifier +
postfix). defaultVerifier becomes a factory that captures the
override; the postfix runAudit call also inherits it. Internal
callers of runFixFlow that don't supply the field continue unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: CLI flag `--knowledge-root`

**Files:**
- Modify: `src/cli/commands/observe.ts`

- [ ] **Step 1: Add the import**

Near the top of `src/cli/commands/observe.ts` (alongside the other observability imports), add:

```typescript
import { KnowledgeRootCliInvalidError } from '../../observability/knowledge-index.js'
```

- [ ] **Step 2: Add the new field to HandleAuditInput**

Update `HandleAuditInput` (around line 206) by adding the new optional field at the end:

```typescript
export interface HandleAuditInput {
  cwd: string
  json: boolean
  profile: 'fast' | 'full'
  scope: 'docs' | 'code' | 'all'
  sinceHours: number
  lensIds?: string[]
  fixThresholdOverride?: string
  maskPaths?: boolean
  showAcknowledged?: boolean
  output?: string
  render?: 'dashboard-fragment-audit'
  outputMode?: 'mmr-findings'
  fix?: boolean
  ghBin?: string
  bdBin?: string
  /** Operator-supplied --knowledge-root override, forwarded to both
   *  runAudit and runFixFlow so Lens I suppression behavior is
   *  consistent across the whole --fix lifecycle. */
  knowledgeRootOverride?: string
}
```

- [ ] **Step 3: Wire the override into the runAudit + runFixFlow calls**

Inside `handleAudit` (around line 224), wrap the body in a try/catch for the CLI-invalid error and pass the override into both runAudit and runFixFlow.

Locate the first `runAudit({ ... })` call (around line 226) and add `knowledgeRootOverride: input.knowledgeRootOverride,` inside the input object (anywhere in the field list).

Locate the `runFixFlow({ ... })` call inside the `if (input.fix && out.summary.blocking > 0)` block (around line 282) and add the same field there.

Add an outer try/catch around the very first statement in `handleAudit` (the `runAudit` call) so `KnowledgeRootCliInvalidError` produces a clean exit:

```typescript
export async function handleAudit(input: HandleAuditInput): Promise<number> {
  try {
    const out = await runAudit({
      primaryRoot: input.cwd,
      profile: input.profile,
      scope: input.scope,
      sinceHours: input.sinceHours,
      lensIds: input.lensIds,
      fixThresholdOverride: input.fixThresholdOverride,
      ghBin: input.ghBin,
      bdBin: input.bdBin,
      knowledgeRootOverride: input.knowledgeRootOverride,
      args: { profile: input.profile, scope: input.scope, sinceHours: input.sinceHours, lensIds: input.lensIds },
    })
    // ... existing body unchanged through the end of the try block ...
  } catch (err) {
    if (err instanceof KnowledgeRootCliInvalidError) {
      process.stderr.write(`scaffold observe audit: ${err.message}\n`)
      return 1
    }
    throw err
  }
}
```

If the existing function already has a try-block at the top, just merge the new catch arm into it.

- [ ] **Step 4: Add the yargs option**

Find the audit subcommand builder (search for `command: 'audit'` or the existing options like `.option('fix', { ... })` around line 477). After the `.option('fix', { ... })` line, add:

```typescript
        .option('knowledge-root', {
          type: 'string',
          describe: 'Path to a content/knowledge directory; overrides yaml + auto-detect for Lens I existing-entry suppression',
        }),
```

In the handler that calls `handleAudit({ ... })` (around line 493), add the new field:

```typescript
        const code = await handleAudit({
          cwd: findProjectRoot(process.cwd()) ?? process.cwd(),
          json: !!(argv.json),
          maskPaths: !!(argv['mask-paths'] ?? argv.maskPaths),
          sinceHours: (argv['since-hours'] ?? argv.sinceHours ?? 24) as number,
          profile: (argv.profile ?? 'fast') as 'fast' | 'full',
          scope: (argv.scope ?? 'all') as 'docs' | 'code' | 'all',
          lensIds: argv.lens as string[] | undefined,
          fixThresholdOverride: argv['fix-threshold'] as string | undefined,
          // ... existing fields unchanged ...
          knowledgeRootOverride: (argv['knowledge-root'] ?? argv.knowledgeRoot) as string | undefined,
        })
```

(Match the existing pattern of accepting both `argv['kebab-name']` and `argv.camelName` for yargs flag aliases.)

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

Expected: PASS.

- [ ] **Step 6: Smoke test the CLI**

```bash
npm run build
node dist/index.js observe audit --help 2>&1 | grep knowledge-root
```

Expected: the help output includes `--knowledge-root` with the describe text.

```bash
node dist/index.js observe audit --knowledge-root /tmp/definitely-nope-99999 2>&1 | head -5
echo "exit=$?"
```

Expected: stderr contains `--knowledge-root path '/tmp/definitely-nope-99999' is invalid: path does not exist`, exit code 1.

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/observe.ts
git commit -m "feat(lens-i): add --knowledge-root CLI flag to observe audit (T11)

Operator-typed --knowledge-root flag flows through HandleAuditInput
into RunAuditInput.knowledgeRootOverride AND
RunFixFlowInput.knowledgeRootOverride. handleAudit catches
KnowledgeRootCliInvalidError and exits 1 with a clean message rather
than letting it surface as an unhandled promise rejection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Integration test

**Files:**
- Create: `src/observability/engine/knowledge-root-integration.test.ts`

This test exercises the full flow: resolveKnowledgeRoot → runAudit → Lens I suppression → finding output.

- [ ] **Step 1: Write the test**

```typescript
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { runAudit } from './api.js'

const tmpDirs: string[] = []

function makeFixtureProject(opts: {
  events: Array<{ topic: string; project_id: string }>
  withKbRoot?: boolean
  kbEntries?: string[]
}): { primaryRoot: string; kbRoot?: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-i-int-'))
  tmpDirs.push(root)
  // Ledger lives at <root>/.scaffold/activity.jsonl (NOT
  // .scaffold/ledger/events.jsonl). The path is set by ledgerPath() in
  // src/observability/engine/ledger-writer.ts and consumed by
  // readMergedLedger via synthesizer.ts.
  const ledgerDir = path.join(root, '.scaffold')
  fs.mkdirSync(ledgerDir, { recursive: true })
  const now = new Date().toISOString()
  const lines = opts.events.map(ev => JSON.stringify({
    event_id: crypto.randomUUID(),
    worktree_id: '00000000-0000-4000-8000-000000000000',
    actor_label: 'test', branch: 'main', task_id: null, ts: now,
    type: 'knowledge_gap_signal',
    payload: { topic: ev.topic, source: 'agent_search', project_id: ev.project_id },
  })).join('\n') + '\n'
  fs.writeFileSync(path.join(ledgerDir, 'activity.jsonl'), lines)
  // Optional KB root
  let kbRoot: string | undefined
  if (opts.withKbRoot) {
    kbRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-i-int-kb-'))
    tmpDirs.push(kbRoot)
    fs.writeFileSync(path.join(kbRoot, 'VERSION'), '0.1.0\n')
    for (const slug of opts.kbEntries ?? []) {
      const sub = path.join(kbRoot, 'core')
      fs.mkdirSync(sub, { recursive: true })
      fs.writeFileSync(path.join(sub, `${slug}.md`), `---\nname: ${slug}\n---\nbody\n`)
    }
  }
  return { primaryRoot: root, kbRoot }
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

const HEX_A = 'a'.repeat(64)
const HEX_B = 'b'.repeat(64)

describe('Lens I knowledge-root integration', () => {
  it('suppresses covered topic and surfaces uncovered topic in one runAudit', async () => {
    const events = [
      { topic: 'covered', project_id: HEX_A },
      { topic: 'covered', project_id: HEX_A },
      { topic: 'covered', project_id: HEX_B },
      { topic: 'uncovered', project_id: HEX_A },
      { topic: 'uncovered', project_id: HEX_A },
      { topic: 'uncovered', project_id: HEX_B },
    ]
    const { primaryRoot, kbRoot } = makeFixtureProject({
      events, withKbRoot: true, kbEntries: ['covered'],
    })
    const out = await runAudit({
      primaryRoot, profile: 'fast', scope: 'docs',
      lensIds: ['I-knowledge-gaps'],
      knowledgeRootOverride: kbRoot,
    })
    const gapFindings = out.findings.filter(f => f.lens_id === 'I-knowledge-gaps')
    const topics = gapFindings.map(f =>
      (f.evidence as { topic?: string }).topic
    )
    expect(topics).toEqual(['uncovered'])
  })

  it('throws on invalid --knowledge-root override at audit time', async () => {
    const { primaryRoot } = makeFixtureProject({ events: [] })
    await expect(runAudit({
      primaryRoot, profile: 'fast', scope: 'docs',
      lensIds: ['I-knowledge-gaps'],
      knowledgeRootOverride: '/tmp/definitely-nope-99999',
    })).rejects.toThrow(/--knowledge-root path .* is invalid/)
  })

  it('runs without suppression when no knowledgeRoot is resolvable', async () => {
    const events = [
      { topic: 'lonely', project_id: HEX_A },
      { topic: 'lonely', project_id: HEX_A },
      { topic: 'lonely', project_id: HEX_B },
    ]
    const { primaryRoot } = makeFixtureProject({ events })
    // No override, no yaml, no scaffold install above the tmp dir
    const out = await runAudit({
      primaryRoot, profile: 'fast', scope: 'docs',
      lensIds: ['I-knowledge-gaps'],
    })
    const gap = out.findings.find(f => f.lens_id === 'I-knowledge-gaps')
    expect(gap).toBeDefined()
    expect((gap?.evidence as { topic?: string }).topic).toBe('lonely')
  })
})
```

- [ ] **Step 2: Run the test**

```bash
npx vitest run src/observability/engine/knowledge-root-integration.test.ts
```

Expected: PASS — all three describe cases green.

- [ ] **Step 3: Commit**

```bash
git add src/observability/engine/knowledge-root-integration.test.ts
git commit -m "test(lens-i): end-to-end suppression integration test (T12)

Exercises the full chain runAudit → resolveKnowledgeRoot → runChecks
→ Lens I → suppression. Pins three scenarios: valid override
suppresses covered topic; invalid override hard-errors; no resolvable
root → lens runs without suppression.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Docs updates

**Files:**
- Modify: `docs/knowledge-freshness/operations.md`
- Modify: `CLAUDE.md`
- Modify: `docs/architecture/operations-runbook.md`

- [ ] **Step 1: Append a subsection to operations.md**

In `docs/knowledge-freshness/operations.md`, add a new top-level section (search for the last `## ` heading and place this after the most relevant existing section, typically near the "Audit" or "Operator workflow" content):

```markdown
## Existing-entry suppression (Lens I)

Lens I (knowledge gaps) automatically suppresses gap findings for topics
that already have an entry in `content/knowledge/`. Adding
`content/knowledge/<category>/<slug>.md` with frontmatter `name: <slug>`
removes the matching finding on the next audit — no need to `scaffold
observe ack` it.

**How the audit finds the knowledge base.** Three-tier resolution
(highest precedence first):

1. `scaffold observe audit --knowledge-root <path>` — operator-typed
   CLI override; hard-errors if `<path>` doesn't exist, isn't a
   directory, or lacks the `VERSION` marker file.
2. `.scaffold/observability.yaml`:
   ```yaml
   lenses:
     I-knowledge-gaps:
       knowledge_root: /absolute/path/to/content/knowledge
   ```
   Soft-fails to auto-detect if the path is invalid.
3. Auto-detect — walks parent directories of the running CLI module
   looking for a `package.json` whose `name` is `@zigrivers/scaffold`
   AND a sibling `content/knowledge/` directory.

If all three tiers miss, Lens I emits exactly one warning to stderr
(`[Lens I] knowledge-root not located; …`) and runs without
suppression. Findings still appear; new entries just won't close
them automatically.

**`--fix` flow.** `scaffold observe audit --fix --knowledge-root <p>`
threads the override into the initial audit, the per-finding verifier
audits, and the postfix audit — suppression behavior is consistent
across the whole fix run.

**Relationship to `scaffold observe ack`.** Suppression is automatic
for the mechanical case (entry exists with matching slug → no
finding). `ack` remains the manual override for everything else
(noise topics, stale signals, intentionally-deferred gaps).
```

- [ ] **Step 2: Update the CLAUDE.md yaml example**

In `CLAUDE.md`, locate the example `.scaffold/observability.yaml` block (search for `lenses:` in CLAUDE.md). Add the new key under `lenses:` (commented as optional). The exact existing block format varies — match it. If the example currently looks like:

```yaml
lenses:
  C-standards:
    enforce_via_linter: true
    rule_overrides:
      no-console: P1
  E-design:
    ad_hoc_token_threshold: 5
    ui_glob: "src/components/**/*.{tsx,vue}"
  F-scope:
    untouched_story_grace_hours: 168
```

Add:

```yaml
  I-knowledge-gaps:
    # knowledge_root: /absolute/path/to/content/knowledge   # optional; defaults to auto-detect
```

right after the existing per-lens entries (still inside the `lenses:` block).

- [ ] **Step 3: Add a release-checklist note to operations-runbook.md**

In `docs/architecture/operations-runbook.md`, locate the release checklist section (search for `release` or `publish`). Add this bullet under the checklist:

```markdown
- **Do NOT remove `"content/"` from `package.json#files`.** The Lens I
  knowledge-root auto-detection relies on the published npm artifact
  shipping `content/knowledge/` so downstream projects can locate the
  scaffold install's KB. Removing the entry would silently disable
  existing-entry suppression for every downstream auto-detect path
  (CLI override + yaml config would still work, but the no-flag
  default would fall back to "knowledge-root not located" warnings).
```

- [ ] **Step 4: Run validate to confirm no broken markdown**

```bash
make check 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/knowledge-freshness/operations.md CLAUDE.md docs/architecture/operations-runbook.md
git commit -m "docs(lens-i): operator-facing docs for existing-entry suppression (T13)

- operations.md: new 'Existing-entry suppression' section covering
  3-tier resolution, --fix lifecycle, and the relationship to
  scaffold observe ack
- CLAUDE.md: yaml example gains the I-knowledge-gaps.knowledge_root
  comment so downstream projects can opt in
- operations-runbook.md: release-checklist note about the implicit
  package.json#files dependency

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Final verification + PR

- [ ] **Step 1: Run the full check-all**

```bash
make check-all 2>&1 | tail -20
```

Expected: PASS — bash + TypeScript gates green.

- [ ] **Step 2: Verify the new module is in the dist build**

```bash
npm run build
ls dist/observability/knowledge-index.js
```

Expected: file exists. (Confirms the TS build picked up the new file.)

- [ ] **Step 3: End-to-end smoke against the live scaffold tree**

```bash
node dist/index.js observe audit --scope docs --lens I-knowledge-gaps 2>&1 | tail -10
```

Expected: runs without stderr warnings about knowledge-root (because auto-detect resolves to the scaffold's own `content/knowledge/`). Findings may or may not appear depending on the current ledger.

- [ ] **Step 4: Push the branch and open the PR**

```bash
git push -u origin feat/lens-i-knowledge-root
gh pr create --title "feat(lens-i): existing-entry suppression with --knowledge-root flag" \
  --body "$(cat <<'EOF'
## Summary
- New `src/observability/knowledge-index.ts` module: index loader,
  install auto-detector (`package.json#name === '@zigrivers/scaffold'`
  signature), 3-tier resolver, warn-once helper, stderr-hygiene helper.
- Lens I now skips gap-finding buckets whose topic matches an existing
  knowledge entry's `name:` slug — adding an entry immediately closes
  the finding.
- `scaffold observe audit --knowledge-root <path>` flag; threaded through
  to `runFixFlow` so the override stays consistent across initial,
  verifier, and postfix audits.
- All four new `LensContext` fields are optional → existing test
  literals at `lens-h-cross-doc.test.ts` and `lens-i-knowledge-gaps.test.ts`
  stay green with zero changes.

## Acceptance
- `make check-all` green locally
- Integration test pins suppression + invalid-override-hard-errors +
  null-root-fallback paths
- Lens I unit tests pin: suppression at P1 + P2 severities; warn-once
  semantics (including the yaml-was-invalid note); multi-audit fresh-Set
  isolation; lens-disabled-no-warning gating

## Design
See `docs/superpowers/specs/2026-05-26-lens-i-knowledge-root-design.md`
(20 resolved decisions across 11 rounds of MMR + grok spec review).

## Test plan
- [x] `make check-all`
- [x] Integration test green
- [x] Lens I extended tests green
- [ ] CI green
- [ ] MMR + grok PR review loop per branch CLAUDE.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Run the MMR + grok PR review loop per the project workflow**

Use the same parallel-MMR-+-grok pattern documented in the branch's working CLAUDE.md. Iterate per the round budget (P2+ for rounds 1-5, P0/P1 only for rounds 6+).

---

## Self-review checklist

After implementing, before pushing the final commit:

- [ ] Every new file in the "Create" list exists and is committed.
- [ ] Every modified file in the "Modify" list shows the expected change in `git diff`.
- [ ] `make check-all` exits 0.
- [ ] `node dist/index.js observe audit --help | grep knowledge-root` shows the flag.
- [ ] `node dist/index.js observe audit --knowledge-root /tmp/nope` exits 1 with the validation error on stderr.
- [ ] No `console.warn` calls in the new module (all stderr writes go through `process.stderr.write` via `emitOnceForAudit`).
- [ ] No `import yaml` (js-yaml) in `src/observability/knowledge-index.ts` — yaml reading is delegated to `loadObservabilityConfig`.
- [ ] The companion spec's 20 resolved decisions each have at least one task that implements them (see mapping below).

**Decision → Task mapping** (verify each):

| Decision | Task |
|---|---|
| #1 (skip-bucket suppression policy) | T9 |
| #2 (3-tier KB lookup) | T6 |
| #3 (exact slug match against `name:`) | T9 |
| #4 (auto-detect-fails soft-fail w/ warn) | T9 |
| #5 (CLI override hard-error) | T6 (throws) + T11 (catches in handler) |
| #6 (one walk per audit run) | T8 (runAudit calls resolver once) |
| #7 (no `topics:` array matching) | T9 (only `index.has(bucket.topic)`) |
| #8 (no bundled static index) | not implemented = correctly not present |
| #9 (`knowledgeRoot` = knowledge dir itself) | T6 (no `/content/knowledge` append anywhere) |
| #10 (install signature = `package.json#name`) | T2 |
| #11 (warn-once via caller-Set) | T5 + T9 |
| #12 (no per-file warn for malformed entries) | T1 (silent skip) |
| #13 (resolver in `knowledge-index.ts`, called by `runAudit`) | T6 + T8 |
| #14 (loader permissive, slug regex stays in validator) | T1 (any non-empty trimmed `name:`) |
| #15 (VERSION marker as sole identification) | T3 |
| #16 (resolver loads index once; lens reuses) | T3 (returns index) + T8 (threads) + T9 (consumes) |
| #17 (optional `LensContext` fields) | T7 |
| #18 (`formatForStderr` hygiene) | T1 + T9 |
| #19 (yaml read via `loadObservabilityConfig`) | T4 + T6 |
| #20 (`runFixFlow` forwards override) | T10 |
