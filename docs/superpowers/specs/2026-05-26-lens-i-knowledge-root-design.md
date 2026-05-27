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
  (everything else ignored). **Differences from the assembly loader's
  silent-skip behavior:** like `extractKBFrontmatter`, malformed entries
  (no frontmatter, missing `name:`, non-slug `name:`) are silently
  skipped — no per-file `console.warn`. Malformed-entry surfacing is the
  freshness validator's job (`src/validation/knowledge-frontmatter-validator.ts`),
  not the index loader's; emitting warnings here would either duplicate
  the validator's output or leak into JSON audit output via stderr.
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

#### `emitOnceForAudit(key: string, message: string): void`

- Module-level `Set<string>` (`emittedKeys`) tracks which keys have
  already produced a warning during the current process.
- If `emittedKeys.has(key)`, no-op. Otherwise: write `message` to
  `process.stderr` (NOT `console.warn`, to keep JSON renders clean)
  and add `key` to `emittedKeys`.
- The CLI is single-shot (`scaffold observe audit` exits after each
  run), so "per process" == "per audit run" in practice. No reset hook
  is needed; included for completeness only.

Used by both the resolver in `handleAudit` and Lens I, so a stale yaml
config that also fails auto-detect can never produce two stacked
warnings.

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

#### Precedence + validation

All paths refer to a knowledge directory and are validated by the same
check:

```
validateKnowledgeRoot(path):
  if !path exists                      → invalid
  if !path is a directory              → invalid
  if walking <path>/**/*.md (excluding README.md) finds zero entries
                                       → invalid
  else                                 → valid
```

(The empty-tree check catches an operator who pointed at the wrong
folder, e.g. `--knowledge-root content/` instead of
`content/knowledge`.)

Resolution order in `handleAudit`:

1. **CLI flag** (if provided):
   - `validateKnowledgeRoot(cliPath)` succeeds → use it.
   - `validateKnowledgeRoot(cliPath)` fails → **hard error**, exit
     non-zero with a message naming the path and the failed check.
     The CLI flag is an operator-typed contract; failing it loudly is
     the only safe choice.
2. **Yaml config** (if no CLI flag, and yaml present):
   - `validateKnowledgeRoot(yamlPath)` succeeds → use it.
   - `validateKnowledgeRoot(yamlPath)` fails → fall through to
     auto-detect (yaml is often persisted across operator changes; a
     hard error here surprises someone who didn't write the line).
     The handler does NOT warn here itself; if the eventual resolved
     value is `null` AND Lens I is enabled, the lens emits a single
     warning naming the yaml as one of the inputs.
3. **`findScaffoldKnowledgeRoot()`** (if no CLI flag, no yaml, or yaml
   fell through):
   - Returns a path → use it.
   - Returns `null` → resolved value is `null`.

The resolver lives in `src/cli/commands/observe.ts` (in the `handleAudit`
function — the actual file is `observe.ts`, not `observe-audit.ts`).
The resolver returns either a validated knowledge-directory path or
`null`. It does NOT warn directly; warning is Lens I's job (because
Lens I knows whether it actually ran).

The resolved value is placed on `RunChecksInput.knowledgeRoot` (a new
optional field), which `runChecks` (`src/observability/engine/checks/runner.ts`)
threads into `LensContext.knowledgeRoot`.

### 3. Lens I integration

#### Context shape

Extend the existing `LensContext` interface in
`src/observability/engine/checks/runner.ts:4-7`:

```typescript
export interface LensContext {
  profile: 'fast' | 'full'
  cwd: string
  /** Absolute path to a `content/knowledge/` directory whose entry
   *  slugs (`name:` fields) should be used to suppress Lens I gap
   *  findings whose `topic` matches. Null when no path could be
   *  resolved. Lens I is the only current consumer; other lenses
   *  ignore this field. */
  knowledgeRoot: string | null
}
```

Also extend `RunChecksInput` in the same file with an optional
`knowledgeRoot?: string | null` field and have the constructor at
line 77 pass it through into `LensContext`. `runAudit`
(`src/observability/engine/api.ts:85`) gains a matching parameter on
`RunAuditInput` and passes it to `runChecks`.

All existing lenses ignore the new field; only Lens I reads it. Existing
callers that don't set `knowledgeRoot` get `null` by default, preserving
backward compatibility.

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
index = null
if context.knowledgeRoot:
  try:
    index = loadKnowledgeIndex(context.knowledgeRoot)
  catch err:
    emitOnceForAudit(
      'lens-i:index-load-failed',
      `[Lens I] knowledge index could not be loaded from '${context.knowledgeRoot}': ${err.message}; existing-entry suppression disabled.`
    )
elif lens_i_is_enabled:
  emitOnceForAudit(
    'lens-i:no-root',
    `[Lens I] knowledge-root not located; existing-entry suppression disabled. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.`
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

All three messages are routed through `emitOnceForAudit` and written to
`process.stderr` (not `console.warn`, which can pollute JSON output of
`scaffold observe audit --render=dashboard-fragment-audit`):

| Trigger | Key | Message |
|---|---|---|
| Lens I enabled, `context.knowledgeRoot` is null | `lens-i:no-root` | `[Lens I] knowledge-root not located; existing-entry suppression disabled. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.` |
| Lens I enabled, `context.knowledgeRoot` is set, but `loadKnowledgeIndex` throws | `lens-i:index-load-failed` | `[Lens I] knowledge index could not be loaded from '<path>': <reason>; existing-entry suppression disabled.` |
| Lens I DISABLED (via `disabled_lenses` in yaml or `--lens` selecting only other lenses) | (none) | No warning — Lens I never ran, suppression has no meaning. |

The resolver in `handleAudit` never warns directly. If yaml validation
fails and auto-detect also misses, the final null state is what triggers
the `lens-i:no-root` warning, exactly once, from inside the lens — and
only when the lens actually runs. This solves the "Lens I disabled,
spurious warning" problem.

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
| `loadKnowledgeIndex` | empty dir; dir with valid entries; dir with README.md only (returns empty set); entry with no frontmatter; entry with non-slug `name:`; duplicate `name:` across files (deduped); symlinked subdir; non-existent path (throws); path is a file (throws); permission-denied on one subdir (continues, skips it) |
| `findScaffoldKnowledgeRoot` | dev worktree layout (matches via `package.json#name === '@zigrivers/scaffold'`); npm-global layout under `/opt/homebrew/lib/node_modules` (matches; verifies NO homedir boundary); a sibling project with a `content/knowledge/` dir but a different `package.json#name` (does NOT match — keeps walking); no scaffold install anywhere above (returns null, walks all the way to `/`) |
| `validateKnowledgeRoot` | exists + dir + non-empty .md tree → ok; doesn't exist → fail; exists but file → fail; exists, is dir, contains only README.md → fail (empty tree); exists, is dir, contains .md files in subdirs → ok |
| `emitOnceForAudit` | first call with a key writes to stderr; second call with same key is no-op; different key writes again |
| `resolveKnowledgeRoot` (the 3-tier resolver in `handleAudit`) | CLI flag valid → returned; CLI flag invalid → hard error (process exits non-zero); yaml valid (no CLI) → returned; yaml invalid (no CLI) → fall through to auto-detect; both yaml and auto-detect miss → null; **CLI flag points at a dir that exists and is non-empty but loadKnowledgeIndex later throws** → hard error at resolver time (validator catches readability before lens-time). |
| `lens-i-knowledge-gaps.ts` | existing tests still pass; new: bucket suppressed when topic is in index (both P1 and P2 paths); bucket NOT suppressed when topic is not in index (both severities); null `knowledgeRoot` → no suppression + one-line `lens-i:no-root` warning; load throws → one-line `lens-i:index-load-failed` warning + no suppression; Lens I disabled (not in `enabledIds`) → NO warning emitted at all |
| Integration | `scaffold observe audit --knowledge-root <fixture>` with a fixture KB containing slug `covered` and a ledger with three signals each on `covered` and `uncovered` → only `uncovered` becomes a finding; `scaffold observe audit` (no flag) in the repo's own dev worktree → auto-detect resolves the real `content/knowledge/`; `scaffold observe audit --knowledge-root /tmp/nope` → exit non-zero with the validation error |

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
| 5 | CLI-flag-points-at-nothing behavior | Hard error at the resolver, before any lens runs | Operator-typed contracts get sharp errors; yaml entries get soft-fail. Resolver validates exists + is-directory + non-empty tree, so the hard-error is comprehensive, not just an existence check. |
| 6 | Index refresh cadence | Once per audit run, no caching across runs | Walk is cheap (~270 files). Cross-run cache adds invalidation complexity for no measurable gain. |
| 7 | Match against `topics:` array (in addition to `name:`) | No | `topics:` is broad-keyword soup; would suppress real gaps. Out of scope. |
| 8 | Bundle a static index | No | Adds a build step + drift risk between the live tree and the bundle. Direct walk is cheaper than the maintenance cost. |
| 9 | Semantics of `knowledgeRoot` (install root vs knowledge directory) | The knowledge *directory* (the `content/knowledge/` dir itself) | Removes the implicit `+ '/content/knowledge'` append the lens would otherwise need; matches what operators naturally type for `--knowledge-root`; eliminates the double-append failure mode. |
| 10 | Auto-detect install signature | `package.json#name === '@zigrivers/scaffold'` (NOT presence of `content/knowledge/` alone, NOT homedir boundary) | The homedir boundary breaks npm-global/Homebrew installs (`/opt/homebrew/...`, `/usr/local/...` are outside home). Matching on the package name is precise: only actual scaffold installs match. |
| 11 | Warn-once mechanism | Module-level `Set` in `knowledge-index.ts` (`emitOnceForAudit(key, message)`), called by Lens I; resolver doesn't warn | One sink, one place to look for the dedup logic. CLI is single-shot so process-level == audit-run-level. |
| 12 | Per-file `console.warn` for malformed entries in the loader | No | Matches the assembly loader's silent-skip behavior. The freshness validator already surfaces malformed entries; duplicating output would either leak into JSON or confuse operators about which subsystem flagged the issue. |
