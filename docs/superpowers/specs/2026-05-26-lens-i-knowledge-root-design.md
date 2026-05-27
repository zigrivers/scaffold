---
status: decisions-locked
owner: zigrivers
created: 2026-05-26
related-plan: docs/superpowers/plans/2026-05-26-lens-i-knowledge-root.md
parent-spec: docs/superpowers/specs/2026-05-26-knowledge-freshness-gap-detection-design.md
---

# Lens I — Existing-Entry Suppression (Workstream B)

A focused enhancement to the Lens I knowledge-gap aggregator: skip
gap-finding buckets whose `topic` slug is already covered by an entry
in `content/knowledge/`. Resolves Phase 3 deferred finding F-001
(`docs/superpowers/deferred-findings/feat+knowledge-freshness-phase-3.md`).

This is a design document, not an implementation. All decisions are
resolved (see end); implementation proceeds per the companion plan.

## Definitions

- **knowledgeRoot** — the absolute path to a `content/knowledge/`
  *directory* (the dir that contains the per-category subdirs of `.md`
  entries). Throughout this spec, `knowledgeRoot` is always the
  knowledge directory itself, never an enclosing install root or
  package root. Operators pass `--knowledge-root /some/path/to/knowledge`;
  the auto-detector returns `<scaffold-install>/content/knowledge` (not
  the install root). No code appends `/content/knowledge` to the value
  — it is already the final path.
- **scaffold install** — a directory rooted by a `package.json` whose
  `name` is `@zigrivers/scaffold`. The auto-detector uses this signature
  (not just the presence of `content/knowledge/`) to identify a real
  scaffold install and distinguish it from any sibling project that
  happens to contain a directory of the same name.

## Problem Statement

Lens I (`src/observability/checks/lens-i-knowledge-gaps.ts`) currently
emits a `knowledge_gap` finding whenever a topic accumulates enough
signals in the rolling 90-day window:

- `signalCount >= 5 && distinctProjectCount >= 3` → **P1**
- `signalCount >= 3 && distinctProjectCount >= 2` → **P2**

(Exact thresholds live in `lens-i-knowledge-gaps.ts:103-105`.)

It never checks whether the topic is already covered by an existing
knowledge entry, so once a threshold is crossed the finding persists
until the signals age out — up to 90 days after the entry lands.

Two failure modes follow:

1. **Operator confusion.** A maintainer adds `content/knowledge/<category>/<topic>.md`
   to close the gap, then keeps seeing the same Lens I finding in the next
   audit and wonders why the fix didn't take.
2. **Noise dilution.** The lens loses signal-to-noise as covered topics
   take up the limited surface in `docs/audits/<id>.md`. Operators stop
   trusting it.

`scaffold observe ack` is the current escape hatch — operators can manually
silence each covered topic. That works but treats a known mechanical
case (entry exists → suppress finding) as if it required human judgment.

## Goals & Non-Goals

**Goals**

- Skip Lens I findings — at both severities — for topics whose slug
  matches an existing knowledge entry's `name:` field.
- Make the check work in **downstream project worktrees** where
  `content/knowledge/` lives in the scaffold install, not in
  `context.cwd`.
- Soft-fail gracefully: if the knowledge index cannot be located or
  loaded, the lens runs as it does today, emits a single warning
  (exactly once per audit run, no matter which code path produced it),
  and never blocks the audit.
- Match the convention other lenses use for project-local configuration
  (CLI flag + `.scaffold/observability.yaml` entry + auto-detected
  default).

**Non-goals**

- Semantic match against entry `description` or `topics:` fields.
  Exact slug match only — see Resolved Decisions.
- Replacing or hiding `scaffold observe ack`. Both mechanisms remain.
  Suppression is automatic for the mechanical case; `ack` stays the
  manual override for everything else.
- Bundling a static knowledge index into the npm package. The auto-detect
  path resolves the live tree directly — see Resolved Decisions.
- Periodic refresh of the index between audit runs. Each audit run
  loads the index once.

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│ scaffold observe audit [--knowledge-root <path-to-knowledge-dir>]      │
│                                                                        │
│   handleAudit reads the CLI flag and calls runAudit with               │
│   RunAuditInput.knowledgeRootOverride = <flag-value-or-undefined>      │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐    │
│   │ runAudit (src/observability/engine/api.ts)                   │    │
│   │   - calls resolveKnowledgeRoot({ override, cwd })            │    │
│   │   - instantiates fresh warnedKeys: Set<string>               │    │
│   │   - passes both into runChecks                               │    │
│   └──────────────────────┬───────────────────────────────────────┘    │
│                          │                                              │
│                          ▼                                              │
│   ┌──────────────────────────────────────────────────────────────┐    │
│   │ resolveKnowledgeRoot                                         │    │
│   │   defined in knowledge-index.ts;                             │    │
│   │   imported and called by runAudit (not by handleAudit)       │    │
│   │ Three-tier; returns KnowledgeRootResolution:                 │    │
│   │   1. CLI override → validate → use, OR throw                 │    │
│   │      KnowledgeRootCliInvalidError (handleAudit catches       │    │
│   │      and exits non-zero)                                      │    │
│   │   2. yaml lenses.I-knowledge-gaps.knowledge_root             │    │
│   │      → validate → use, OR record invalid attempt + fall      │    │
│   │      through (no stderr write)                                │    │
│   │   3. findScaffoldKnowledgeRoot()                              │    │
│   │      → if found, validate → use; else record not-found       │    │
│   │ Returns { root: string|null, index: Set<string>|null,        │    │
│   │           attempts: Attempt[] }. Validation REUSES the loader │    │
│   │ AND requires a `<path>/VERSION` marker file (the KB SemVer   │    │
│   │ file added in Phase 1) to distinguish the knowledge dir      │    │
│   │ from any other dir of slug-bearing .md files.                │    │
│   └──────────────────────┬───────────────────────────────────────┘    │
└────────────────────────────┼──────────────────────────────────────────┘
                             │
                             ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ LensContext (extends src/observability/engine/checks/runner.ts) │
   │   profile, cwd                          (existing)               │
   │   knowledgeRoot?:        string | null  (new, OPTIONAL)         │
   │   knowledgeIndex?:       Set<string> | null  (new, OPTIONAL —   │
   │                                          pre-loaded by resolver) │
   │   knowledgeRootAttempts?: Attempt[]     (new, OPTIONAL)         │
   │   warnedKeys?:           Set<string>    (new, OPTIONAL)         │
   │ All four new fields default to undefined for existing test      │
   │ literals; runChecks substitutes safe defaults before invoking   │
   │ each lens.                                                       │
   └──────────────────────┬─────────────────────────────────────────┘
                          │ threaded into every lens by runChecks
                          ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ Lens I (existing aggregator) — modified                         │
   │   - aggregate ledger signals as before                          │
   │   - use context.knowledgeIndex DIRECTLY (no re-load — resolver  │
   │     already loaded it during validation)                        │
   │   - for each bucket at P1 (≥5×≥3) or P2 (≥3×≥2) threshold:      │
   │       if index && index.has(bucket.topic): skip                 │
   │       else emit finding at the existing severity                │
   │   - if knowledgeRoot is null AND Lens I actually ran            │
   │     (gated by enabledIds), emit ONE warning via                 │
   │     emitOnceForAudit(warnedKeys, key, message)                  │
   └────────────────────────────────────────────────────────────────┘

           ┌────────────────────────────────────────────────────────┐
           │ src/observability/knowledge-index.ts (new)              │
           │                                                         │
           │   loadKnowledgeIndex(knowledgeDir): Set<string>         │
           │     globs <knowledgeDir>/**/*.md, excludes README.md    │
           │     parses YAML frontmatter, extracts `name:`           │
           │     returns Set of slugs                                │
           │                                                         │
           │   findScaffoldKnowledgeRoot(): string | null            │
           │     walks parents up from import.meta.url               │
           │     returns first <parent>/content/knowledge for a      │
           │     <parent> whose package.json `name` is               │
           │     "@zigrivers/scaffold"                               │
           │                                                         │
           │   resolveKnowledgeRoot({override, cwd}):                │
           │     KnowledgeRootResolution                             │
           │       (3-tier; called only by runAudit)                 │
           │                                                         │
           │   validateKnowledgeRoot(path):                          │
           │     { ok, index? } — exists + isDir + has VERSION       │
           │     marker file + loader returns non-empty Set          │
           │                                                         │
           │   emitOnceForAudit(warnedKeys, key, message): void      │
           │     write to stderr if !warnedKeys.has(key);             │
           │     called ONLY from inside Lens I                      │
           └────────────────────────────────────────────────────────┘
```

## Detailed Design

### 1. Knowledge-index module (`src/observability/knowledge-index.ts`)

A new, dependency-free module. Public surface (all exported so Lens I,
`runAudit`, and tests can import each independently):

- `loadKnowledgeIndex(dir): Set<string>` — raw filesystem walk + frontmatter parse.
- `findScaffoldKnowledgeRoot(): string | null` — auto-detect the install's knowledge dir.
- `validateKnowledgeRoot(path): { ok: true, index } | { ok: false, reason }` — VERSION marker + loader; returns the loaded index on success.
- `resolveKnowledgeRoot({override, cwd}): KnowledgeRootResolution` — 3-tier resolver called by `runAudit`.
- `emitOnceForAudit(warnedKeys, key, message): void` — warn-once helper.
- `formatForStderr(value): string` — quote/escape a value for one-line stderr output.

Lens I imports `emitOnceForAudit` and `formatForStderr` from this
module. `runAudit` imports `resolveKnowledgeRoot`. The CLI (`handleAudit`)
imports nothing directly — it only reads the CLI flag and passes it to
`runAudit` as `knowledgeRootOverride`.

#### `loadKnowledgeIndex(knowledgeDir: string): Set<string>`

- **Argument:** the absolute path to the knowledge *directory* (the
  `content/knowledge/` dir). The caller is responsible for resolving
  any install-root → knowledge-dir mapping.
- Globs `<knowledgeDir>/**/*.md` using a small custom walker
  (`fs.readdirSync` recursive; no globby dep — match the existing
  zero-runtime-dep style of `lens-i-knowledge-gaps.ts`).
- Performs **minimal hand-rolled `name:` extraction** on each file's
  YAML frontmatter (read until the second `---`, regex-match for
  `^name:\s*['"]?(.+?)['"]?\s*$`). Does NOT import `js-yaml` — that's
  the resolver's job for the yaml tier (see decision #19). Keeping
  the loader parser-free preserves the zero-additional-dep style of
  `lens-i-knowledge-gaps.ts` and means a future security/perf change
  to the project's yaml reader can't accidentally regress the
  knowledge index.
- Excludes any file named `README.md` (matches the assembly loader at
  `src/core/assembly/knowledge-loader.ts:138-139, :186-187`).
- For each remaining file, reads the YAML frontmatter and extracts the
  `name:` field. Same parser style as `extractKBFrontmatter` in
  `src/core/assembly/knowledge-loader.ts` — but only `name:` is needed
  (everything else ignored). Match `extractKBFrontmatter`'s acceptance
  rule exactly: any non-empty trimmed string is accepted as a slug.
  (The slug regex `^[a-z][a-z0-9-]*$` lives in the separate freshness
  validator at `src/validation/knowledge-frontmatter-validator.ts:43`,
  not in the assembly loader. The index loader is a runtime path and
  matches the assembly loader's behavior, NOT the validator's.)
  Files without a parseable frontmatter or without a `name:` field are
  silently skipped — no per-file `console.warn`. Malformed-entry
  surfacing is the freshness validator's job, not the index loader's;
  emitting warnings here would either duplicate the validator's output
  or leak into JSON audit output via stderr.
- Returns a `Set<string>` of valid slugs.
- **On unrecoverable I/O failure** (path doesn't exist, path is a file
  not a directory, permission denied at the top level): throws. The
  caller is the resolver (`validateKnowledgeRoot` inside
  `resolveKnowledgeRoot`); the resolver catches and records the error
  as a validation failure. Lens I does NOT call `loadKnowledgeIndex`
  itself — by design (decision #16), all I/O on the knowledge tree
  happens once, in the resolver, during validation.

#### `findScaffoldKnowledgeRoot(): string | null`

- **Return value:** the absolute path of the knowledge directory
  (e.g. `/opt/homebrew/lib/node_modules/@zigrivers/scaffold/content/knowledge`),
  not the install root. Callers never append `/content/knowledge`.
- Resolves the running module's directory via `fileURLToPath(import.meta.url)`
  (matches the pattern in `src/observability/engine/api.ts`).
- Walks parents upward checking each `<parent>` for **all** of:
  - `<parent>/package.json` exists and is readable
  - That `package.json` has `"name": "@zigrivers/scaffold"` (the
    install signature; prevents matching a sibling project that
    happens to contain a `content/knowledge/` directory)
  - `<parent>/content/knowledge/` exists and is a directory
- On the first match: returns `<parent>/content/knowledge` as an
  absolute path.
- Stops at the filesystem root (`path.parse(p).root === p`); does NOT
  use any home-directory boundary. (npm-global installs live at
  `/opt/homebrew/...` or `/usr/local/...`, which are typically OUTSIDE
  `os.homedir()`; the home-directory boundary would unconditionally
  break those.)
- Returns `null` if no parent matches.

#### `emitOnceForAudit(warnedKeys: Set<string>, key: string, message: string): void`

- **Caller-provided Set.** The dedup state is passed in, not held in
  module-level state. The audit pipeline (`runAudit`) creates a fresh
  `Set<string>` per invocation and threads it into `LensContext.warnedKeys`;
  every call to `emitOnceForAudit` from inside the audit references that
  Set.
- If `warnedKeys.has(key)`, no-op. Otherwise: write `message` to
  `process.stderr` (NOT `console.warn`, to keep JSON renders clean)
  and add `key` to `warnedKeys`.

**Why caller-provided, not module-global:**

- The `--fix` flow (`src/observability/engine/fix-flow.ts`) calls
  `runAudit` multiple times in a single process (initial audit +
  per-finding verifier audit + postfix audit). A module-global Set
  would dedup across those distinct audit runs and silently swallow
  legitimate warnings on the later runs.
- `phase-audit.ts` also calls `runAudit` from inside `StateManager.markCompleted()`.
- Test files (vitest) share module state within a file. Multiple test
  cases that exercise the warning path would see only the first one
  emit unless tests reset state, which is fragile.

Fresh-Set-per-audit makes the warning policy match the documented
intent ("once per audit run") without any reset hook and without any
test-isolation seam.

Called from **inside Lens I only**. The resolver in `runAudit` does not
warn — it just produces a resolution record (see §2) which Lens I reads
to compose its single warning.

#### Edge cases

| Case | Behavior |
|---|---|
| Empty knowledge dir | Returns empty Set; lens treats no topic as covered (lens runs as today). |
| Knowledge dir is a file, not a directory | `loadKnowledgeIndex` throws; caller catches and treats as "index unavailable" → soft-fail path. |
| Symlinked content/knowledge | Followed normally (Node `fs.readdir` follows by default). |
| Frontmatter `name:` differs from filename basename | Slug from `name:` wins (matches assembly engine behavior). |
| Two entries with the same `name:` | Set dedupes; both files map to one slug. No warning — entry-uniqueness is the knowledge-frontmatter validator's job, not this loader's. |
| Permission denied on a single subdir during walk | Walker logs nothing, drops that subdir from the index, continues. Same shape as the assembly loader's silent-skip. |
| package.json exists but its `name` field is missing or wrong | `findScaffoldKnowledgeRoot` does NOT match that parent; keeps walking up. |
| `import.meta.url` is `file:///dev/stdin` (test runners, REPL) | `findScaffoldKnowledgeRoot` returns `null`; tests that need a specific root must pass one via the public API. |

### 2. CLI flag + yaml config

#### Flag

`scaffold observe audit --knowledge-root <path>` — string flag,
optional. The path points at a knowledge directory (NOT a scaffold
install root). Resolved to absolute path before validation.

#### Yaml config

In `.scaffold/observability.yaml`:

```yaml
lenses:
  I-knowledge-gaps:
    knowledge_root: /absolute/path/to/content/knowledge   # optional
```

Matches the existing pattern of nesting per-lens config under
`lenses.<lens-id>` (see how `C-standards`, `E-design`, `F-scope`,
`G-decisions`, and `H-cross-doc` are configured).

**Read mechanism (decision #19):** `resolveKnowledgeRoot` reads the
yaml tier by reusing the existing `loadObservabilityConfig(cwd)` from
`src/observability/engine/checks/observability-config.ts:99`. This is
the SAME function every other configurable lens uses; it returns a
typed `ObservabilityConfig` produced by `deepMerge(DEFAULT_CONFIG,
fileContents)` with full handling of missing/malformed yaml.
`resolveKnowledgeRoot` reads `config.lenses['I-knowledge-gaps']?.knowledge_root`
and treats absent or empty-string values as "not provided" (recorded
as `{ source: 'yaml', outcome: 'not-provided' }` in the attempts
trail). A value that's present-but-invalid (path doesn't exist, fails
`validateKnowledgeRoot`) records `outcome: 'invalid'` with the reason.

The "dependency-free" / "custom YAML extraction" language in
Cross-Cutting Principles applies ONLY to the KB frontmatter `name:`
walk inside `loadKnowledgeIndex` — it does NOT apply to the yaml tier,
which delegates to the project's standard config reader (already a
`js-yaml` consumer).

**Type extension:** `ObservabilityConfig['lenses']` in
`observability-config.ts:46` gets an optional `'I-knowledge-gaps'?: {
knowledge_root?: string }` entry. `DEFAULT_CONFIG.lenses` at line 64
gains `'I-knowledge-gaps': {}` for the matching default. This closes
the deferred R3-P3 finding about untyped access; existing config tests
continue to pass because they assert specific known keys, not
exhaustive shape.

#### Validation

All paths (CLI, yaml, auto-detect) refer to a knowledge directory and
are validated by the same check. The validator combines two
complementary signals so it cannot be fooled by an enclosing or
sibling directory:

1. **VERSION marker file.** The validator requires `<path>/VERSION` to
   exist. This is the KB SemVer file added in Phase 1 (see parent
   design "Version the knowledge base"); it lives ONLY at
   `content/knowledge/VERSION` and nowhere else in the repo. An
   operator who points at `content/` or any other ancestor fails this
   check immediately because no `content/VERSION` exists.
2. **Loader returns non-empty Set.** Confirms the directory actually
   contains parseable KB-frontmatter entries.

The validator also returns the loaded index, so callers don't re-walk
the tree.

```
validateKnowledgeRoot(path)
  → { ok: true, index: Set<string> } | { ok: false, reason }:
  if !path exists                       → { ok: false, reason: 'path does not exist' }
  if !path is a directory               → { ok: false, reason: 'path is not a directory' }
  if !exists(`<path>/VERSION`)          → { ok: false, reason: 'missing knowledge-base VERSION marker — path does not appear to be a scaffold knowledge directory' }
  index = try loadKnowledgeIndex(path)
        catch e                         → { ok: false, reason: `index load failed: ${e.message}` }
  if index.size === 0                   → { ok: false, reason: 'directory contains no knowledge entries (loader returned empty)' }
  else                                  → { ok: true, index }
```

Two effects of this design:

- **Resolver loads the index once.** The validator returns it; the
  resolution record carries it through `LensContext.knowledgeIndex`.
  Lens I uses the pre-loaded index directly — no second walk.
- **`lens-i:index-load-failed` warning is unreachable from inside the
  lens.** Validation runs the loader and fails fast on any load error,
  so by the time `LensContext.knowledgeRoot` is non-null the loader
  has already succeeded. The lens code therefore does NOT include a
  defensive try/catch around `loadKnowledgeIndex` — the index either
  arrives in context or it does not. The `lens-i:index-load-failed`
  warning key is reserved for future use (e.g., a hypothetical
  refresh-during-audit path) but emits nothing today.

#### Resolution architecture

The 3-tier resolution is performed by `resolveKnowledgeRoot`, a
function **defined in `src/observability/knowledge-index.ts`** (the
same module that exports `loadKnowledgeIndex` and
`findScaffoldKnowledgeRoot`). It is **called by `runAudit`**
(`src/observability/engine/api.ts`), NOT by `handleAudit`. Every
`runAudit` caller therefore benefits without doing the resolution
themselves: the CLI `handleAudit`, the `phase-audit.ts` hook, the
`fix-flow.ts` verifier and postfix audits, the MMR doc-conformance
channel, and any future programmatic API consumer. Internal callers don't have to know about yaml or
auto-detect; they just pass the CLI override when they have one
(usually they don't).

`RunAuditInput` gains:

```typescript
interface RunAuditInput {
  // ... existing fields
  /** Caller-supplied override for the knowledge directory. When set,
   *  the resolver uses this verbatim (after validation) and skips
   *  yaml + auto-detect. Set by `handleAudit` when the operator passed
   *  `--knowledge-root <path>`. `phase-audit.ts` never sets it
   *  (state-triggered audits). `fix-flow.ts` forwards it into the
   *  inner verifier + postfix `runAudit` calls when present, per
   *  decision #20, so the operator's intent stays consistent across
   *  the whole `--fix` lifecycle. */
  knowledgeRootOverride?: string
}
```

`resolveKnowledgeRoot(input: { override?: string, cwd?: string }): KnowledgeRootResolution`:

(Both fields are optional. `cwd` is the working directory used to
resolve `.scaffold/observability.yaml` for the yaml tier; when
undefined, the yaml tier is skipped and the attempts trail records
`{ source: 'yaml', outcome: 'not-provided' }`. Tests can invoke
the resolver without a `cwd` to isolate the CLI-override and
auto-detect tiers.)

```typescript
interface KnowledgeRootResolution {
  /** Validated absolute path to a knowledge directory, or null. */
  root: string | null
  /** Pre-loaded index of entry slugs, populated by the validator's
   *  `loadKnowledgeIndex` call. Lens I reads this directly instead of
   *  re-walking the tree. Null when root is null. */
  index: Set<string> | null
  /** Audit trail of what was tried. Lens I uses this to compose a
   *  precise warn-once message when root is null but the lens
   *  actually ran. */
  attempts: Array<{
    source: 'cli' | 'yaml' | 'auto-detect'
    path?: string              // path actually tried, if any
    outcome: 'used' | 'invalid' | 'not-provided' | 'not-found'
    reason?: string            // failure detail for the invalid case
  }>
}
```

#### Resolution order (inside `resolveKnowledgeRoot`)

1. **CLI override** (`input.override`, if defined):
   - `validateKnowledgeRoot` succeeds → `root: <path>`, attempts:
     `[{ source: 'cli', path, outcome: 'used' }]`.
   - `validateKnowledgeRoot` fails → **hard error**: `runAudit`
     throws a typed `KnowledgeRootCliInvalidError` carrying the path
     and reason. The CLI handler (`handleAudit`) catches it and exits
     non-zero with a clear message. `phase-audit.ts` doesn't pass
     `knowledgeRootOverride` (state-transition-triggered audits never
     supply one), so this branch is unreachable for it. `fix-flow.ts`
     DOES forward the override when `handleAudit --fix
     --knowledge-root <p>` runs (see decision #20), so the same
     hard-error fires uniformly across the initial, verifier, and
     postfix audits — they all reject an invalid CLI path early,
     never silently differ.
2. **Yaml config** (read from `<cwd>/.scaffold/observability.yaml`,
   path `lenses.I-knowledge-gaps.knowledge_root`, if present and
   non-empty):
   - Validate → if ok, `root: <yamlPath>`, attempts: `[{ source: 'yaml', path, outcome: 'used' }]`.
   - Validate → if fail, record `{ source: 'yaml', path, outcome: 'invalid', reason }` and fall through.
3. **`findScaffoldKnowledgeRoot()`**:
   - Returns path → validate. If ok, append `{ source: 'auto-detect', path, outcome: 'used' }` and return that root.
   - Returns null → append `{ source: 'auto-detect', outcome: 'not-found' }`.
4. If no tier produced a path: `root: null`, attempts contains the
   trail of what was tried.

The resolution is placed on `RunChecksInput.knowledgeRootResolution`
(a new optional field), which `runChecks`
(`src/observability/engine/checks/runner.ts`) threads into
`LensContext.knowledgeRoot` (the `root` string-or-null),
`LensContext.knowledgeIndex` (the pre-loaded Set, so Lens I doesn't
re-walk), and `LensContext.knowledgeRootAttempts` (the audit trail
for warning composition).

### 3. Lens I integration

#### Context shape

Extend the existing `LensContext` interface in
`src/observability/engine/checks/runner.ts:4-7`. **All four new fields
are OPTIONAL** so existing test-side literal constructions (e.g.
`{ profile: 'full', cwd: process.cwd() }` in
`src/observability/checks/lens-h-cross-doc.test.ts` lines 104, 119,
133, 158, 182, and `makeContext` in
`src/observability/checks/lens-i-knowledge-gaps.test.ts:74-75`) keep
compiling without modification:

```typescript
export interface LensContext {
  profile: 'fast' | 'full'
  cwd: string
  /** Validated absolute path to a `content/knowledge/` directory whose
   *  entry slugs are used to suppress Lens I findings whose `topic`
   *  matches. Optional; undefined when no path was resolved or when
   *  a legacy caller bypassed `runAudit` and didn't supply one.
   *  Treated as `null` by Lens I (no suppression). */
  knowledgeRoot?: string | null
  /** Pre-loaded index Set, populated by the resolver during validation.
   *  Lens I reads this directly — does NOT call `loadKnowledgeIndex`
   *  itself. Undefined for legacy callers. */
  knowledgeIndex?: Set<string> | null
  /** Audit trail of which knowledge-root tiers were tried during
   *  resolution. Lens I uses this to compose a precise warn-once
   *  message when `knowledgeRoot` is null. Defaults to an empty
   *  array when undefined. */
  knowledgeRootAttempts?: KnowledgeRootResolution['attempts']
  /** Per-audit-run Set passed to `emitOnceForAudit` for deduplicating
   *  warnings. Fresh Set instantiated by `runAudit` for each
   *  invocation; never shared across audits in the same process.
   *  Defaults to a fresh empty Set when undefined. */
  warnedKeys?: Set<string>
}
```

`RunChecksInput` in the same file gains a `knowledgeRootResolution?:
KnowledgeRootResolution` field and a `warnedKeys?: Set<string>` field
(both optional for backward compatibility with existing test callers).
The constructor at line 77 propagates them into `LensContext`,
defaulting `knowledgeRootResolution` to
`{ root: null, index: null, attempts: [] }` and `warnedKeys` to a
fresh empty `Set`.

**Test migration plan.** The existing test sites that construct
`LensContext` literals do NOT need to be updated, because all four
new fields are optional and Lens I treats `undefined` exactly like
"no knowledge-root resolved". New tests that exercise the
suppression / warning paths supply the relevant fields explicitly
(`{ ...existing, knowledgeRoot, knowledgeIndex, warnedKeys: new Set() }`).
The Test Surface section calls out the specific new fixtures.

`runAudit` (`src/observability/engine/api.ts:85`) calls
`resolveKnowledgeRoot({ override: input.knowledgeRootOverride, cwd:
input.primaryRoot })`, then constructs a fresh `Set<string>` for
`warnedKeys`, and passes both into `runChecks`. The internal callers
`phase-audit.ts` does not need to set `knowledgeRootOverride` (its
audits are triggered by state transitions, not by an operator-typed
flag), so it correctly falls through to yaml + auto-detect.

**`fix-flow.ts` is different — its inner audits MUST inherit the
override.** `runFixFlow` (`src/observability/engine/fix-flow.ts`)
calls `runAudit` multiple times in one process: an initial audit, a
per-finding verifier audit, and a postfix audit. If
`handleAudit --knowledge-root <path> --fix` is invoked, only the
initial audit gets the override; the verifier and postfix audits
would auto-detect a different knowledge tree (or yaml-resolve to
something else), producing inconsistent suppression behavior across
the audits in one fix run. That can:

- Mark a fix as failed because the verifier audit re-surfaced a Lens I
  finding that the initial audit's KB had suppressed.
- Re-surface covered topics in the postfix report despite the initial
  audit correctly suppressing them.

To prevent both: `runFixFlow` accepts a new optional
`knowledgeRootOverride?: string` on its input shape (the same shape
the existing `--fix` plumbing already passes through), and threads it
into every internal `runAudit` call (verifier, postfix). `handleAudit`
populates this field from the same CLI flag it uses for
`RunAuditInput.knowledgeRootOverride`. Internal callers of
`runFixFlow` that don't pass the field continue to behave as today.

All existing lenses ignore the new fields; only Lens I reads them.
Existing test callers that bypass `runAudit` and call `runChecks`
directly get the same backward-compatible defaults
(`{ root: null, attempts: [] }` and a fresh empty Set per `runChecks`
call).

#### Lens I logic change

Current behavior (paraphrased from `lens-i-knowledge-gaps.ts:97-110`):

```
buckets = aggregate(signals, window=90d)
for bucket in buckets:
  severity = null
  if bucket.signal_count >= 5 and distinct_projects(bucket) >= 3: severity = 'P1'
  elif bucket.signal_count >= 3 and distinct_projects(bucket) >= 2: severity = 'P2'
  if !severity: continue
  emit finding(severity)
```

New behavior:

```
buckets = aggregate(signals, window=90d)

# The index was already loaded by the resolver during validation and
# arrives in context. The lens does NOT call loadKnowledgeIndex itself
# — by design, all I/O on the knowledge tree happens once, in the
# resolver, so a stale or unreadable tree cannot fail Lens I mid-run
# after passing validation.
index = context.knowledgeIndex   # Set<string> | null | undefined

# If the lens is running but no root was resolved, emit one warning
# composed from the attempts trail. The yaml-was-invalid case appends
# context so the operator can fix the failing config without re-deriving
# it. All interpolated path/reason strings go through formatForStderr()
# (a small helper that escapes embedded quotes and newlines) so a
# pathological path can't produce ragged stderr output.
if !context.knowledgeRoot:
  yamlAttempt = (context.knowledgeRootAttempts ?? []).find(a => a.source === 'yaml')
  yamlNote = ''
  if yamlAttempt && yamlAttempt.outcome === 'invalid':
    yamlNote =
      ' — yaml lenses.I-knowledge-gaps.knowledge_root '
      + formatForStderr(yamlAttempt.path)
      + ' was invalid: '
      + formatForStderr(yamlAttempt.reason)
  emitOnceForAudit(
    context.warnedKeys ?? new Set(),
    'lens-i:no-root',
    '[Lens I] knowledge-root not located; existing-entry suppression disabled'
      + yamlNote
      + '. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.'
  )

for bucket in buckets:
  severity = null
  if bucket.signal_count >= 5 and distinct_projects(bucket) >= 3: severity = 'P1'
  elif bucket.signal_count >= 3 and distinct_projects(bucket) >= 2: severity = 'P2'
  if !severity: continue
  if index && index.has(bucket.topic): continue   # SUPPRESSION
  emit finding(severity)
```

Three guarantees this preserves from the current implementation:

1. Both P1 and P2 thresholds remain in place; suppression filters
   findings at either severity.
2. A null `knowledgeRoot` produces zero behavior change from
   `origin/main` (other than the one-line warning).
3. The lens does no synchronous I/O on the knowledge tree. The
   resolver did it once during validation; the lens reads the
   pre-loaded index from context. This guarantees the lens cannot
   crash on a tree that became unreadable between resolution and
   lens-time.

**`formatForStderr` helper** (in `knowledge-index.ts`):

```typescript
/** Make a value safe to interpolate into a one-line stderr message.
 *  Wraps in single quotes; escapes embedded single quotes; replaces
 *  newlines/control chars with the literal character "?" so multiline
 *  paths/reasons don't break the line. Returns "'<missing>'" for
 *  undefined or empty inputs. */
function formatForStderr(value: string | undefined): string {
  if (value === undefined || value === '') return "'<missing>'"
  return "'" + value
    .replace(/'/g, "\\'")
    .replace(/[\r\n\t\x00-\x1f]/g, '?')
    + "'"
}
```

The helper exists to keep operator-visible output legible when an
attacker-controlled or just-messy path/reason value appears in the
attempts trail.

#### Warning policy

Both messages are routed through `emitOnceForAudit(context.warnedKeys,
...)` and written to `process.stderr` (not `console.warn`, which can
pollute JSON output of
`scaffold observe audit --render=dashboard-fragment-audit`):

| Trigger | Key | Message |
|---|---|---|
| Lens I enabled, `context.knowledgeRoot` is null, no invalid yaml attempt in the trail | `lens-i:no-root` | `[Lens I] knowledge-root not located; existing-entry suppression disabled. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.` |
| Lens I enabled, `context.knowledgeRoot` is null, AND the trail contains a yaml attempt with `outcome: 'invalid'` | `lens-i:no-root` | `[Lens I] knowledge-root not located; existing-entry suppression disabled — yaml lenses.I-knowledge-gaps.knowledge_root <formatForStderr(path)> was invalid: <formatForStderr(reason)>. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.` |
| reserved (see Validation) | `lens-i:index-load-failed` | not emitted today; the validator forecloses this path. Reserved for a future refresh-during-audit feature. |
| Lens I DISABLED (not in `enabledIds` per the runChecks filter) | (none) | No warning — Lens I never ran, suppression has no meaning. |

`resolveKnowledgeRoot` (defined in `knowledge-index.ts`, called by `runAudit`) never writes to
stderr. It only produces the resolution record (root + index + attempts).
Lens I composes the warning from that record — and only if the lens
actually ran. This solves the "Lens I disabled, spurious warning"
problem.

The `lens-i:no-root` message conditionally appends "yaml ... was
invalid: <reason>" when the attempts trail shows a yaml entry was
tried and rejected, so the operator sees which input failed without
having to re-derive it from configuration. Path and reason fragments
pass through `formatForStderr` (a small helper in `knowledge-index.ts`)
that wraps the value in single quotes and replaces newlines / control
chars with `?`, so a pathological value can't produce ragged stderr.

### 4. CLI/operator surface updates

- `scaffold observe audit --help` documents the new flag.
- `docs/knowledge-freshness/operations.md` gets a short subsection
  "Existing-entry suppression" describing the 3-tier resolution,
  what happens when none of them resolves, and the relationship to
  `scaffold observe ack`.
- `.scaffold/observability.yaml` example in CLAUDE.md gains the new
  `lenses.I-knowledge-gaps.knowledge_root` line (commented; default is
  auto-detect).
- `package.json` `files` already declares `content/`; the auto-detect
  path depends on this. Add a single-line note in
  `docs/architecture/operations-runbook.md` under the release checklist
  that removing `content/` from `package.json#files` would silently
  break downstream auto-detection.

## Cross-Cutting Principles

- **Soft-fail by default.** Suppression is an enhancement, not a contract.
  Lens I MUST continue to produce useful findings if the knowledge index
  is unavailable.
- **Single source of truth at index-time.** No periodic refresh, no
  cached static index — each `scaffold observe audit` run walks the live
  tree. Cheap (~270 file headers parsed).
- **Operator-provided contracts are sharp.** A `--knowledge-root` flag
  the operator typed must point at a valid knowledge directory; we
  hard-error on it (path doesn't exist, isn't a directory, or contains
  no entries). Auto-detect and yaml are softer.
- **Warn at most once per audit run, from one place.** All three
  warning paths route through a single `emitOnceForAudit` helper, keyed
  by the failure mode, with the warning emitted from inside the lens
  (not the resolver) so a disabled Lens I never produces spurious noise.
- **No new dependencies (scoped to the KB walk).** Inside
  `loadKnowledgeIndex` only: custom recursive walker (`fs.readdirSync`,
  no globby) and minimal hand-rolled `name:` extraction (no `js-yaml`
  import in `knowledge-index.ts`). The "Same parser style as
  `extractKBFrontmatter`" language elsewhere in this spec refers to
  the *acceptance rule* (any non-empty trimmed string) and
  silent-skip-on-malformed *behavior* — not to importing the same
  underlying parser. The yaml-tier read inside `resolveKnowledgeRoot`
  deliberately delegates to `loadObservabilityConfig` (js-yaml) per
  decision #19; that's not a "new dependency" — it reuses the
  observability engine's existing reader.
- **Context construction contract.** `LensContext.knowledgeRoot` and
  `LensContext.knowledgeIndex` are PAIRED — the resolver populates both
  or neither. Production code never creates a context with one set and
  the other null/undefined. Lens I's suppression logic (`if (index &&
  index.has(topic))`) silently does nothing in the mismatched-pair case
  rather than warning, because (a) a production caller can't reach that
  state, (b) defensive behavior is the right choice for a runtime
  consistency violation, and (c) a future test that constructs the
  mismatch directly is exercising a test-construction bug, not a real
  scenario. The Test Surface includes one test that pins this defensive
  behavior so the invariant doesn't drift.

## Test Surface

| Test target | Coverage |
|---|---|
| `loadKnowledgeIndex` | empty dir → empty Set; dir with valid entries → expected slugs; dir with README.md only → empty Set; entry with no frontmatter → skipped silently; entry with `name:` that is not a slug pattern but IS a non-empty string → INCLUDED in Set (matches assembly loader, not validator); duplicate `name:` across files → deduped; symlinked subdir → followed; non-existent path → throws; path is a file → throws; permission-denied on one subdir → continues, skips it; dir of non-knowledge .md files (e.g. pipeline steps with frontmatter that has `name:`) → returns those slugs too — this is by design; the validator catches the wrong-dir case via the VERSION marker, not via the loader |
| `findScaffoldKnowledgeRoot` | dev worktree layout (matches via `package.json#name === '@zigrivers/scaffold'`); npm-global layout under `/opt/homebrew/lib/node_modules` (matches; verifies NO homedir boundary); a sibling project with a `content/knowledge/` dir but a different `package.json#name` (does NOT match — keeps walking); no scaffold install anywhere above (returns null, walks all the way to `/`) |
| `validateKnowledgeRoot` | exists + dir + has VERSION marker + loader returns non-empty Set → `{ ok: true, index }`; doesn't exist → fail (reason: 'path does not exist'); exists but is file → fail; exists + dir but NO `<path>/VERSION` file → fail (reason mentions the marker); exists + dir + has VERSION but loader returns empty Set → fail (reason: 'directory contains no knowledge entries'); pointing at `content/` or `content/tools/` (no VERSION file) → fail FAST on the marker check, before loader even runs; pointing at `content/knowledge/` → ok with index populated |
| `emitOnceForAudit` | first call with `(set, key, message)` writes to stderr and adds key to set; second call with the same set + key is no-op; second call with the same set + different key writes again; calls with a fresh set always write again (proves per-audit Set isolation works) |
| `resolveKnowledgeRoot` (defined in `knowledge-index.ts`, called by `runAudit`) | override valid → `root: <path>`, attempts: `[{ source: 'cli', outcome: 'used' }]`; override invalid → throws `KnowledgeRootCliInvalidError`; no override, yaml valid → `root: <yamlPath>`, attempts include `{ source: 'yaml', outcome: 'used' }`; no override, yaml invalid → attempts include `{ source: 'yaml', outcome: 'invalid', reason }` + falls through; no override, no yaml, auto-detect finds it → attempts ends with `{ source: 'auto-detect', outcome: 'used' }`; no override, no yaml, auto-detect misses → `root: null`, attempts end with `{ source: 'auto-detect', outcome: 'not-found' }`; called with no `cwd` (test path) → resolves yaml from cwd undefined, treats as not-provided |
| `lens-i-knowledge-gaps.ts` | existing tests still pass; new: bucket suppressed when topic is in `context.knowledgeIndex` (both P1 and P2 paths); bucket NOT suppressed when topic is not in the index (both severities); null `knowledgeRoot`, lens runs → one-line `lens-i:no-root` warning via `emitOnceForAudit(warnedKeys, ...)` + no suppression; null `knowledgeRoot` with yaml-was-invalid attempt → warning includes the yaml note formatted via `formatForStderr`; Lens I disabled (not in `enabledIds`) → NO warning emitted at all; two `runAudit` calls in one test → fresh `warnedKeys` per call, BOTH calls emit their respective warnings (proves fix-flow / phase-audit multi-audit case works); manual `LensContext` with `knowledgeRoot` set but `knowledgeIndex` undefined (the construction-contract violation case — should never happen in production but covered defensively) → no crash, no suppression, NO `lens-i:no-root` warning (root is non-null so the warning gate doesn't fire). |
| Construction-contract documentation | A short prose note in the spec + a one-line invariant in the lens implementation comment: "`knowledgeRoot` and `knowledgeIndex` are paired — the resolver populates both or neither. Lens I's suppression activates only when both are set. A future test or internal caller that supplies one without the other gets silent 'no suppression' (no warning) — this is intentional defensive behavior, but exercising the path is a test-construction bug, not a production scenario." |
| Integration | `scaffold observe audit --knowledge-root <fixture>` where the fixture is a dir containing a `VERSION` file AND `<category>/covered.md` with `name: covered` frontmatter, plus a ledger with three signals each on `covered` and `uncovered` → only `uncovered` becomes a finding (suppression of `covered` confirms the validator returned the index and Lens I consulted it); `scaffold observe audit` (no flag) in the repo's own dev worktree → auto-detect resolves the real `content/knowledge/` via the `package.json#name === '@zigrivers/scaffold'` signature; `scaffold observe audit --knowledge-root /tmp/nope` → exit non-zero with `path does not exist`; `scaffold observe audit --knowledge-root <repo>/content` → exit non-zero with `missing knowledge-base VERSION marker — path does not appear to be a scaffold knowledge directory` (the VERSION check fires BEFORE the loader runs, so the over-broad-pipeline-slugs failure mode the round-3 review surfaced is foreclosed); `scaffold observe audit --knowledge-root <fixture-with-VERSION-but-no-md-files>` → exit non-zero with `directory contains no knowledge entries` |

## Cost & Performance

- One directory walk per audit run (~270 files in the scaffold tree as
  of Phase 4). Sub-millisecond on a warm cache.
- Frontmatter parse per file: trivial — only the leading YAML block is
  scanned and only `name:` is extracted.
- No LLM calls. Pure I/O + string parsing.
- Memoized within a single audit run by virtue of being called from one
  call-site (Lens I).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Auto-detect picks the wrong scaffold install (e.g. a sibling project on the same machine) | Walk requires `package.json#name === '@zigrivers/scaffold'`; sibling projects with their own `content/knowledge/` dirs don't match. CLI flag and yaml override always win. |
| Index drifts during a long audit run | Single-shot load at audit start. If a maintainer adds an entry mid-audit, the next run picks it up — within tolerance for a 90-day signal window. |
| `name:` slug differs from filename basename | Loader trusts `name:` (matches assembly engine), not basename. |
| Operator pins yaml `knowledge_root` to a stale path | Soft-fail to auto-detect; if auto-detect ALSO misses, the warning surfaces the failure and Lens I runs without suppression. |
| Operator passes `--knowledge-root` to a parent dir (e.g. install root) by mistake | Validator's "contains at least one .md other than README.md" check fails fast with a precise error message. |
| Scaffold installed via a wrapper that hides the package root from `import.meta.url` | `--knowledge-root` flag and yaml config are the escape hatches. Tests cover the `null`-returning case. |
| Two installs side-by-side (e.g. dev worktree + Homebrew install) and auto-detect picks the older one | Walk picks the *nearest* parent matching the install signature. From a downstream cwd this is reliably the install whose CLI is actually running (its `import.meta.url` is rooted in that install). |
| `package.json#files` field in a future release accidentally drops `content/` | Auto-detect silently fails; documented in the release-checklist note (see §4) as a release-time check. |
| Lens I disabled (via `disabled_lenses` or `--lens` selecting other lenses) | Warning emission is inside Lens I, gated on actually running; disabled Lens I → no warnings. |

## Resolved Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Suppression policy when topic is covered | Skip the bucket entirely; emit no finding | Matches operator mental model ("gap = missing thing"). Lower-severity-emit and new-finding-type alternatives add noise without adding signal. |
| 2 | KB lookup mechanism | Auto-detect via `findScaffoldKnowledgeRoot()` + `--knowledge-root` flag + yaml escape hatches | Auto-detect handles the common case (npm-global, Homebrew, local, dev worktree). Flag/yaml handle testing, pinning, air-gapped installs. Bundled-static-index adds a build step and creates drift; rejected. |
| 3 | Match rule | Exact slug match against entry `name:` field | Deterministic. Matches how the assembly engine identifies entries. Substring/topics-array matching introduces false-positive suppression of real gaps. |
| 4 | Auto-detect-fails fallback | Soft-fail with one-line warning (emitted from Lens I, only when the lens runs); suppression disabled, lens runs as today | Suppression is an enhancement, not a contract. Hard-failing the audit would surprise downstream projects with `scaffold observe audit` workflows. Emitting from the lens prevents spurious warnings when Lens I is disabled. |
| 5 | CLI-override-points-at-nothing behavior | Hard error at the resolver, before any lens runs | Operator-typed contracts get sharp errors; yaml entries get soft-fail. Resolver validates by *reusing the loader* — a candidate is valid only if `loadKnowledgeIndex(path).size > 0`. This catches "pointed at the wrong dir" cases without a second predicate to maintain. |
| 6 | Index refresh cadence | Once per audit run, no caching across runs | Walk is cheap (~270 files). Cross-run cache adds invalidation complexity for no measurable gain. |
| 7 | Match against `topics:` array (in addition to `name:`) | No | `topics:` is broad-keyword soup; would suppress real gaps. Out of scope. |
| 8 | Bundle a static index | No | Adds a build step + drift risk between the live tree and the bundle. Direct walk is cheaper than the maintenance cost. |
| 9 | Semantics of `knowledgeRoot` (install root vs knowledge directory) | The knowledge *directory* (the `content/knowledge/` dir itself) | Removes the implicit `+ '/content/knowledge'` append the lens would otherwise need; matches what operators naturally type for `--knowledge-root`; eliminates the double-append failure mode. |
| 10 | Auto-detect install signature | `package.json#name === '@zigrivers/scaffold'` (NOT presence of `content/knowledge/` alone, NOT homedir boundary) | The homedir boundary breaks npm-global/Homebrew installs (`/opt/homebrew/...`, `/usr/local/...` are outside home). Matching on the package name is precise: only actual scaffold installs match. |
| 11 | Warn-once mechanism | `emitOnceForAudit(warnedKeys, key, message)` with **caller-provided per-audit `Set<string>`** threaded via `LensContext.warnedKeys`; called by Lens I only; resolver never writes to stderr | Module-global Set would dedup across the `--fix` flow's multiple `runAudit` calls in one process (initial + verifier + postfix), silently swallowing real warnings. Test files (vitest) share module state and would see the same swallow. Per-audit Set fixes both. Resolver-doesn't-warn keeps the warning gated on the lens actually running, preventing spurious noise when Lens I is disabled. |
| 12 | Per-file `console.warn` for malformed entries in the loader | No | Matches the assembly loader's silent-skip behavior. The freshness validator already surfaces malformed entries; duplicating output would either leak into JSON or confuse operators about which subsystem flagged the issue. |
| 13 | Where the 3-tier resolution lives (handler vs `runAudit`) | `resolveKnowledgeRoot` is **defined in `knowledge-index.ts`** alongside the loader and auto-detector, and **called by `runAudit`** (not by `handleAudit`) | Every `runAudit` caller benefits — CLI, `phase-audit.ts`, `fix-flow.ts` (verifier + postfix), MMR doc-conformance channel — without each having to re-implement yaml + auto-detect. The CLI flag becomes `RunAuditInput.knowledgeRootOverride`. `phase-audit.ts` doesn't supply one (state-triggered audits use yaml + auto-detect); `fix-flow.ts` forwards it through to its inner verifier and postfix `runAudit` calls per decision #20. Tests import `resolveKnowledgeRoot` directly from `knowledge-index.ts` for unit coverage. |
| 14 | Validator slug-rule alignment with the loader | Index loader accepts any non-empty trimmed `name:` (matches `extractKBFrontmatter`); validator-style slug regex stays in `knowledge-frontmatter-validator.ts` only | Round-2 spec earlier claimed both functions enforced the slug regex; that was wrong (the regex lives only in the validator). Keeping the index loader permissive matches the assembly engine and prevents drift between which entries the assembly engine sees vs which the suppression logic sees. |
| 15 | Validator strictness for "is this actually a knowledge directory?" | Require `<path>/VERSION` marker file (the KB SemVer file from Phase 1) in addition to a non-empty loader result | Round-3 review caught that `loadKnowledgeIndex(path).size > 0` alone passes for any ancestor of the knowledge dir, because the recursive walk finds the nested KB files (and would also accept `content/tools/`, `content/pipeline/`, etc., which have their own `name:` frontmatter). The VERSION marker exists only at `content/knowledge/VERSION` and nowhere else in the repo, so requiring it precisely identifies the knowledge dir. |
| 16 | Where the index is loaded (resolver vs lens) | Resolver loads it during validation and returns the Set in `KnowledgeRootResolution.index`; Lens I uses the pre-loaded index without re-walking | Eliminates a redundant filesystem walk and removes the dead `lens-i:index-load-failed` code path (the resolver already failed if loading would fail). Single source of I/O on the knowledge tree per audit run. |
| 17 | LensContext field optionality + test migration | The four new fields (`knowledgeRoot`, `knowledgeIndex`, `knowledgeRootAttempts`, `warnedKeys`) are all OPTIONAL on `LensContext`; existing test literals at `lens-h-cross-doc.test.ts` and `lens-i-knowledge-gaps.test.ts` keep compiling without changes | Tests that bypass `runChecks` and construct `LensContext` literals to call lens functions directly would otherwise fail TypeScript after the interface change. Optional fields + lens treating `undefined === null` for behavior makes the migration zero-cost. |
| 18 | Operator-visible warning string hygiene | All interpolated path/reason fragments pass through `formatForStderr()` (wraps in single quotes, escapes embedded quotes, replaces newlines/control chars with `?`) | A path or reason containing unbalanced quotes or newlines would otherwise produce ragged or multiline stderr output that's hard to parse in CI logs and audit sidecars. |
| 19 | Yaml tier read mechanism | `resolveKnowledgeRoot` reuses `loadObservabilityConfig(cwd)` (the project-wide yaml reader at `src/observability/engine/checks/observability-config.ts:99`) rather than rolling its own parse | One yaml-reader code path across the whole observability surface. Inherits the standard error handling, defaults via `deepMerge`, and `js-yaml` choice that the C/E/F/G/H lenses already use. Also extends `ObservabilityConfig['lenses']` with a typed `'I-knowledge-gaps'?: { knowledge_root?: string }` slot, closing the previously-deferred R3-P3 finding about untyped config access. The "dependency-free / custom YAML extraction" Cross-Cutting principle applies only to the KB frontmatter walk in `loadKnowledgeIndex`. |
| 20 | `--fix` flow inherits the CLI override | `runFixFlow` accepts an optional `knowledgeRootOverride` on its input shape and threads it into the verifier and postfix `runAudit` calls; `handleAudit --fix --knowledge-root <p>` propagates the flag value to both initial and inner audits | Without this, only the initial audit would see the override; verifier and postfix audits would auto-detect/yaml-resolve a different KB, producing inconsistent Lens I suppression across audits in one fix run — fixes could be marked failed by re-surfacing topics the initial audit correctly suppressed, or covered topics could re-appear in the postfix report. The forwarding is symmetric with how the operator's intent ("use THIS knowledge root") flows through the whole fix lifecycle. |
