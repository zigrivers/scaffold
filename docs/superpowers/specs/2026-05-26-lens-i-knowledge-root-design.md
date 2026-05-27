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
┌──────────────────────────────────────────────────────────────────────┐
│ scaffold observe audit [--knowledge-root <path-to-knowledge-dir>]    │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │ resolveKnowledgeRoot() — runs in handleAudit                 │   │
│   │ Three-tier precedence; returns string | null:                │   │
│   │   1. CLI --knowledge-root <p>                                │   │
│   │        validate p exists, is a directory, and contains at    │   │
│   │        least one .md file other than README.md → keep        │   │
│   │        OR hard-error and exit non-zero                       │   │
│   │   2. yaml lenses.I-knowledge-gaps.knowledge_root             │   │
│   │        same validation; on failure, fall through (silently)  │   │
│   │   3. findScaffoldKnowledgeRoot()                             │   │
│   │        on failure, return null                               │   │
└─────┴────────────────┬─────────────────────────────────────────────┴───┘
                       │ (validated path or null)
                       ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ LensContext { profile, cwd, knowledgeRoot: string | null }    │
   │  (extends the existing LensContext in                         │
   │   src/observability/engine/checks/runner.ts:4-7)              │
   └──────────────────────┬───────────────────────────────────────┘
                          │ threaded into every lens by runChecks
                          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ Lens I (existing aggregator) — modified                       │
   │   - aggregate ledger signals as before                        │
   │   - if knowledgeRoot != null, load knowledge index ONCE       │
   │     (catch load errors; warn-once on failure; treat as null)  │
   │   - for each bucket above either P1 or P2 threshold:          │
   │       if index && index.has(bucket.topic): skip               │
   │       else emit finding at the existing severity              │
   │   - if knowledgeRoot is null AND Lens I actually ran          │
   │     (i.e. enabled), warn-once that suppression is disabled    │
   └──────────────────────────────────────────────────────────────┘

           ┌──────────────────────────────────────────────────────┐
           │ src/observability/knowledge-index.ts (new)            │
           │                                                       │
           │   loadKnowledgeIndex(knowledgeDir: string): Set<string>│
           │     globs <knowledgeDir>/**/*.md, excludes README.md  │
           │     parses YAML frontmatter, extracts `name:`         │
           │     returns Set of slugs                              │
           │                                                       │
           │   findScaffoldKnowledgeRoot(): string | null          │
           │     walks parents up from the running CLI module      │
           │     returns the first <parent>/content/knowledge      │
           │     for a <parent> whose package.json `name` is       │
           │     "@zigrivers/scaffold"                             │
           │                                                       │
           │   emitOnceForAudit(key: string, message: string): void│
           │     warn-once helper used by both the resolver and    │
           │     Lens I; deduplicates by key within a single       │
           │     audit-run process                                 │
           └──────────────────────────────────────────────────────┘
```

## Detailed Design

### 1. Knowledge-index loader (`src/observability/knowledge-index.ts`)

A new, dependency-free module. Public surface: `loadKnowledgeIndex`,
`findScaffoldKnowledgeRoot`, `emitOnceForAudit`. No private helpers
exported.

#### `loadKnowledgeIndex(knowledgeDir: string): Set<string>`

- **Argument:** the absolute path to the knowledge *directory* (the
  `content/knowledge/` dir). The caller is responsible for resolving
  any install-root → knowledge-dir mapping.
- Globs `<knowledgeDir>/**/*.md` using a small custom walker
  (`fs.readdirSync` recursive; no globby dep — match the existing
  zero-runtime-dep style of `lens-i-knowledge-gaps.ts`).
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
  caller (Lens I) catches and treats as "index unavailable".

The lens calls `loadKnowledgeIndex` at most once per invocation.

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
`lenses.<lens-id>`.

#### Validation

All paths (CLI, yaml, auto-detect) refer to a knowledge directory and
are validated by the same check. The validator REUSES the loader: a
candidate directory is valid only if `loadKnowledgeIndex(path)` returns
a non-empty Set. A non-empty Set proves the directory actually contains
KB-frontmatter entries (not just any `.md` files), so an operator who
typed `--knowledge-root content/` or `--knowledge-root content/tools/`
gets a precise failure rather than silent zero-suppression.

```
validateKnowledgeRoot(path) → { ok: true } | { ok: false, reason }:
  if !path exists                           → { ok: false, reason: 'path does not exist' }
  if !path is a directory                   → { ok: false, reason: 'path is not a directory' }
  index = try loadKnowledgeIndex(path)
        catch e                             → { ok: false, reason: `index load failed: ${e.message}` }
  if index.size === 0                       → { ok: false, reason: 'directory contains no knowledge entries (loader returned empty)' }
  else                                      → { ok: true }
```

Reusing the loader means a path that passes validation cannot then
fail at lens time — there is exactly one place that decides "this is a
knowledge directory".

#### Resolution architecture

The 3-tier resolution does NOT live in `handleAudit`. It lives in
`runAudit` (in a small helper `resolveKnowledgeRoot`), so EVERY
`runAudit` caller benefits: the CLI `handleAudit`, the
`phase-audit.ts` hook, the `fix-flow.ts` verifier and postfix audits,
the MMR doc-conformance channel, and any future programmatic API
consumer. Internal callers don't have to know about yaml or
auto-detect; they just pass the CLI override when they have one
(usually they don't).

`RunAuditInput` gains:

```typescript
interface RunAuditInput {
  // ... existing fields
  /** Caller-supplied override for the knowledge directory. When set,
   *  the resolver uses this verbatim (after validation) and skips
   *  yaml + auto-detect. Set by `handleAudit` when the operator passed
   *  `--knowledge-root <path>`; left undefined by all internal callers
   *  (phase-audit, fix-flow), which then get the yaml + auto-detect
   *  flow automatically. */
  knowledgeRootOverride?: string
}
```

`resolveKnowledgeRoot(input: { override?: string, cwd: string }): KnowledgeRootResolution`:

```typescript
interface KnowledgeRootResolution {
  /** Validated absolute path to a knowledge directory, or null. */
  root: string | null
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
     non-zero with a clear message. Other callers (phase-audit,
     fix-flow) do not pass `knowledgeRootOverride`, so this branch is
     unreachable for them.
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
`LensContext.knowledgeRoot` (just the `root` string-or-null) and
`LensContext.knowledgeRootAttempts` (the audit trail). Lens I uses the
attempts trail to format precise warnings.

### 3. Lens I integration

#### Context shape

Extend the existing `LensContext` interface in
`src/observability/engine/checks/runner.ts:4-7`:

```typescript
export interface LensContext {
  profile: 'fast' | 'full'
  cwd: string
  /** Validated absolute path to a `content/knowledge/` directory whose
   *  entry slugs (`name:` fields) should be used to suppress Lens I gap
   *  findings whose `topic` matches. Null when no path could be
   *  resolved. Lens I is the only current consumer; other lenses
   *  ignore this field. */
  knowledgeRoot: string | null
  /** Audit trail of which knowledge-root tiers were tried during
   *  resolution. Lens I uses this to compose a precise warn-once
   *  message when `knowledgeRoot` is null. Always present (possibly
   *  empty if no resolution was attempted, e.g. legacy callers). */
  knowledgeRootAttempts: KnowledgeRootResolution['attempts']
  /** Per-audit-run Set passed to `emitOnceForAudit` for deduplicating
   *  warnings. Fresh Set instantiated by `runAudit` for each
   *  invocation; never shared across audits in the same process. */
  warnedKeys: Set<string>
}
```

`RunChecksInput` in the same file gains a `knowledgeRootResolution?:
KnowledgeRootResolution` field and a `warnedKeys?: Set<string>` field
(both optional for backward compatibility with existing test callers).
The constructor at line 77 propagates them into `LensContext`,
defaulting `knowledgeRootResolution` to `{ root: null, attempts: [] }`
and `warnedKeys` to a fresh empty `Set`.

`runAudit` (`src/observability/engine/api.ts:85`) calls
`resolveKnowledgeRoot({ override: input.knowledgeRootOverride, cwd:
input.primaryRoot })`, then constructs a fresh `Set<string>` for
`warnedKeys`, and passes both into `runChecks`. The internal callers
(`phase-audit.ts`, `fix-flow.ts`) need no code change beyond accepting
the resolution behavior — they don't pass `knowledgeRootOverride` and
therefore get yaml + auto-detect automatically.

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

# Load the index ONCE per invocation. Soft-fail on any error.
# `emitOnceForAudit` here takes context.warnedKeys as its first arg.
index = null
if context.knowledgeRoot:
  try:
    index = loadKnowledgeIndex(context.knowledgeRoot)
  catch err:
    emitOnceForAudit(
      context.warnedKeys,
      'lens-i:index-load-failed',
      `[Lens I] knowledge index could not be loaded from '${context.knowledgeRoot}': ${err.message}; existing-entry suppression disabled.`
    )
else:
  # Lens I IS enabled (it's running). Compose a precise warning using
  # the attempts trail so the operator knows whether their yaml was
  # tried-and-failed or never existed.
  yamlAttempt = context.knowledgeRootAttempts.find(a => a.source === 'yaml')
  if yamlAttempt && yamlAttempt.outcome === 'invalid':
    yamlNote = ` (yaml lenses.I-knowledge-gaps.knowledge_root '${yamlAttempt.path}' was invalid: ${yamlAttempt.reason})`
  else:
    yamlNote = ''
  emitOnceForAudit(
    context.warnedKeys,
    'lens-i:no-root',
    `[Lens I] knowledge-root not located; existing-entry suppression disabled${yamlNote}. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.`
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
3. A `loadKnowledgeIndex` exception does NOT crash the lens or the
   audit; it produces a warn-once and falls through to "no suppression".

#### Warning policy

Both messages are routed through `emitOnceForAudit(context.warnedKeys,
...)` and written to `process.stderr` (not `console.warn`, which can
pollute JSON output of
`scaffold observe audit --render=dashboard-fragment-audit`):

| Trigger | Key | Message |
|---|---|---|
| Lens I enabled, `context.knowledgeRoot` is null | `lens-i:no-root` | `[Lens I] knowledge-root not located; existing-entry suppression disabled[ (yaml ... was invalid: <reason>)]. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.` |
| Lens I enabled, `context.knowledgeRoot` is set, but `loadKnowledgeIndex` throws | `lens-i:index-load-failed` | `[Lens I] knowledge index could not be loaded from '<path>': <reason>; existing-entry suppression disabled.` |
| Lens I DISABLED (not in `enabledIds` per the runChecks filter) | (none) | No warning — Lens I never ran, suppression has no meaning. |

`resolveKnowledgeRoot` (the helper inside `runAudit`) never writes to
stderr. It only produces the resolution record (root + attempts).
Lens I composes the warning from that record — and only if the lens
actually ran. This solves the "Lens I disabled, spurious warning"
problem.

The `lens-i:no-root` message conditionally includes "(yaml ... was
invalid: <reason>)" when the attempts trail shows a yaml entry was
tried and rejected, so the operator sees which input failed without
having to re-derive it from configuration.

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
- **No new dependencies.** Custom walker, custom YAML extraction. Matches
  the dependency-free style of the existing lens.

## Test Surface

| Test target | Coverage |
|---|---|
| `loadKnowledgeIndex` | empty dir → empty Set; dir with valid entries → expected slugs; dir with README.md only → empty Set; entry with no frontmatter → skipped silently; entry with `name:` that is not a slug pattern but IS a non-empty string → INCLUDED in Set (matches assembly loader, not validator); duplicate `name:` across files → deduped; symlinked subdir → followed; non-existent path → throws; path is a file → throws; permission-denied on one subdir → continues, skips it; dir of non-knowledge .md files (e.g. pipeline steps with frontmatter that has `name:`) → returns those slugs too (caller's job to point at the right dir — validator enforces non-empty result) |
| `findScaffoldKnowledgeRoot` | dev worktree layout (matches via `package.json#name === '@zigrivers/scaffold'`); npm-global layout under `/opt/homebrew/lib/node_modules` (matches; verifies NO homedir boundary); a sibling project with a `content/knowledge/` dir but a different `package.json#name` (does NOT match — keeps walking); no scaffold install anywhere above (returns null, walks all the way to `/`) |
| `validateKnowledgeRoot` | exists + dir + loader returns non-empty Set → ok; doesn't exist → fail; exists but file → fail; exists, is dir, contains only README.md → fail (loader returns empty); exists, is dir of pipeline/tool .md files (with `name:` frontmatter) but NOT a knowledge dir → fail-or-pass per loader result (acceptable: validator can't distinguish, so the operator gets a misleading "valid" — but this is the same shape as any other reusing-the-loader design, and the worst case is over-broad suppression on slugs that exist in pipeline meta-prompts; the loader returning a non-empty Set proves *some* slug-bearing tree is there) |
| `emitOnceForAudit` | first call with `(set, key, message)` writes to stderr and adds key to set; second call with the same set + key is no-op; second call with the same set + different key writes again; calls with a fresh set always write again (proves per-audit Set isolation works) |
| `resolveKnowledgeRoot` (the helper inside `runAudit`) | override valid → `root: <path>`, attempts: `[{ source: 'cli', outcome: 'used' }]`; override invalid → throws `KnowledgeRootCliInvalidError`; no override, yaml valid → `root: <yamlPath>`, attempts include `{ source: 'yaml', outcome: 'used' }`; no override, yaml invalid → attempts include `{ source: 'yaml', outcome: 'invalid', reason }` + falls through; no override, no yaml, auto-detect finds it → attempts ends with `{ source: 'auto-detect', outcome: 'used' }`; no override, no yaml, auto-detect misses → `root: null`, attempts end with `{ source: 'auto-detect', outcome: 'not-found' }`; called with no `cwd` (test path) → resolves yaml from cwd undefined, treats as not-provided |
| `lens-i-knowledge-gaps.ts` | existing tests still pass; new: bucket suppressed when topic is in index (both P1 and P2 paths); bucket NOT suppressed when topic is not in index (both severities); null `knowledgeRoot`, lens runs → one-line `lens-i:no-root` warning + no suppression; null `knowledgeRoot` with yaml-was-invalid attempt → warning includes the yaml note; load throws → one-line `lens-i:index-load-failed` warning + no suppression; Lens I disabled (not in `enabledIds`) → NO warning emitted at all; two `runAudit` calls in one test → fresh `warnedKeys` per call, BOTH calls emit their respective warnings (proves fix-flow / phase-audit multi-audit case works) |
| Integration | `scaffold observe audit --knowledge-root <fixture>` with a fixture KB containing slug `covered` and a ledger with three signals each on `covered` and `uncovered` → only `uncovered` becomes a finding; `scaffold observe audit` (no flag) in the repo's own dev worktree → auto-detect resolves the real `content/knowledge/`; `scaffold observe audit --knowledge-root /tmp/nope` → exit non-zero with the validation error; `scaffold observe audit --knowledge-root <repo>/content` → exit non-zero (loader returns 0 KB entries when pointed at the parent dir, even though it contains .md files in pipeline/ and tools/ which lack KB-style `name:` patterns OR contain non-KB names — actually: this test pins the behavior the implementation produces, NOT what we wish it produced; if the loader accepts pipeline-step `name:` fields the validator will say "ok" and the lens will just have an over-broad index. Document this in the test as a known limitation) |

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
| 13 | Where the 3-tier resolution lives (handler vs `runAudit`) | Inside `runAudit` via a `resolveKnowledgeRoot` helper, NOT inside `handleAudit` | Every `runAudit` caller benefits — CLI, `phase-audit.ts`, `fix-flow.ts` (verifier + postfix), MMR doc-conformance channel — without each having to re-implement yaml + auto-detect. The CLI flag becomes `RunAuditInput.knowledgeRootOverride`; internal callers leave it undefined and get yaml + auto-detect automatically. |
| 14 | Validator slug-rule alignment with the loader | Index loader accepts any non-empty trimmed `name:` (matches `extractKBFrontmatter`); validator-style slug regex stays in `knowledge-frontmatter-validator.ts` only | Round-2 spec earlier claimed both functions enforced the slug regex; that was wrong (the regex lives only in the validator). Keeping the index loader permissive matches the assembly engine and prevents drift between which entries the assembly engine sees vs which the suppression logic sees. |
