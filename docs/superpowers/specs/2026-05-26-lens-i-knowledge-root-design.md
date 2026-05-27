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

## Problem Statement

Lens I (`src/observability/checks/lens-i-knowledge-gaps.ts`) currently
emits a P2 `knowledge_gap` finding whenever a topic accumulates `≥3`
signals across `≥2` distinct projects in the rolling 90-day window. It
never checks whether the topic is already covered by an existing
knowledge entry, so once the threshold is crossed the finding persists
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

- Skip Lens I findings for topics whose slug matches an existing knowledge
  entry's `name:` field.
- Make the check work in **downstream project worktrees** where
  `content/knowledge/` lives in the scaffold install, not in
  `context.cwd`.
- Soft-fail gracefully: if the knowledge index cannot be located, the
  lens runs as it does today, emits a single warning, and never blocks
  the audit.
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
┌──────────────────────────────────────────────────────────────────┐
│ scaffold observe audit [--knowledge-root <path>]                 │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ Knowledge-root resolution (3-tier precedence)            │  │
│   │   1. --knowledge-root CLI flag                           │  │
│   │   2. .scaffold/observability.yaml                        │  │
│   │      lenses.I-knowledge-gaps.knowledge_root              │  │
│   │   3. findScaffoldInstall() → ${install}/content/knowledge│  │
│   │   (none of the above) → null + warn-once                 │  │
│   └─────────────────────┬────────────────────────────────────┘  │
│                         │ (resolved path or null)                │
│                         ▼                                        │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ AuditContext { knowledgeRoot: string | null, ... }        │  │
│   └─────────────────────┬────────────────────────────────────┘  │
│                         │ threaded into every lens               │
│                         ▼                                        │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ Lens I (existing aggregator)                              │  │
│   │   - aggregate ledger signals as before                    │  │
│   │   - load knowledge index ONCE per audit run if root != null│  │
│   │   - filter buckets whose topic slug is in the index       │  │
│   │   - emit P2 findings for remaining buckets                │  │
│   └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

           ┌──────────────────────────────────────────────────────┐
           │ src/observability/knowledge-index.ts (new)            │
           │                                                       │
           │   loadKnowledgeIndex(root: string): Set<string>       │
           │     - globs <root>/**/*.md, excludes README.md        │
           │     - parses YAML frontmatter, extracts `name:`       │
           │     - returns Set of slugs                            │
           │                                                       │
           │   findScaffoldInstall(): string | null                │
           │     - walks up from __dirname of running CLI          │
           │     - returns first parent containing                 │
           │       `content/knowledge/`                            │
           │     - stops at filesystem root or user's home         │
           └──────────────────────────────────────────────────────┘
```

## Detailed Design

### 1. Knowledge-index loader (`src/observability/knowledge-index.ts`)

A new, dependency-free module. Two public functions plus a small private
slug-extractor.

#### `loadKnowledgeIndex(root: string): Set<string>`

- Globs `<root>/**/*.md` using a small custom walker (no globby dep —
  match the existing zero-runtime-dep style of `lens-i-knowledge-gaps.ts`).
- Excludes any file named `README.md` (matches `knowledge-loader.ts`
  exclusion at lines 138-139 / 186-187).
- For each remaining file, reads the YAML frontmatter and extracts the
  `name:` field. Same parser shape as `extractKBFrontmatter` in
  `src/core/assembly/knowledge-loader.ts` — but only `name:` is needed
  (everything else ignored).
- Files without a parseable frontmatter, without a `name:` field, or
  whose `name:` is not a slug pattern `[a-z][a-z0-9-]*` are skipped with
  a per-file `console.warn` (not fatal). Surfacing these warnings is
  intentional — they indicate a malformed entry that the freshness
  validator would also flag.
- Returns a `Set<string>` of valid slugs.

Lazy + memoized at the caller (Lens I) — the lens loads the index once
per audit run, not once per bucket.

#### `findScaffoldInstall(): string | null`

- Starts from `import.meta.url` resolved to a directory (or
  `__dirname` if running in CJS test context).
- Walks parents upward checking each for the presence of
  `<parent>/content/knowledge/` AND `<parent>/package.json` (the
  scaffold install always has both).
- Stops at:
  - **Filesystem root.** If we hit `/` (or the Windows drive root) we
    return `null`.
  - **User home boundary.** If we cross above `os.homedir()` without
    finding a hit, we return `null`. Prevents accidentally pointing at
    a totally unrelated scaffold install in a sibling project on the
    same machine.
- Returns the absolute path of the directory containing `content/`, NOT
  the path of `content/knowledge/` itself. (Callers append
  `/content/knowledge` once.)

#### Edge cases

| Case | Behavior |
|---|---|
| Empty knowledge dir | Returns empty Set; lens treats no topic as covered (lens runs as today). |
| Knowledge dir is a file, not a directory | `loadKnowledgeIndex` throws; caller catches and treats as "index unavailable" → soft-fail path. |
| Symlinked content/knowledge | Followed normally (Node `fs.readdir` follows by default). |
| Frontmatter `name:` differs from filename basename | Slug from `name:` wins (matches assembly engine behavior). |
| Two entries with the same `name:` | Set dedupes; both files map to one slug. No warning — entry-uniqueness is the knowledge-frontmatter validator's job, not this loader's. |

### 2. CLI flag + yaml config

#### Flag

`scaffold observe audit --knowledge-root <path>` — string flag,
optional. Resolved to absolute path before being placed in context.

#### Yaml config

In `.scaffold/observability.yaml`:

```yaml
lenses:
  I-knowledge-gaps:
    knowledge_root: /path/to/scaffold/install   # optional
```

Matches the existing pattern of nesting per-lens config under
`lenses.<lens-id>`.

#### Precedence

1. CLI flag (if present, used unconditionally — if it points at
   nothing, that's a hard error, see below)
2. Yaml config (if present and non-empty)
3. `findScaffoldInstall()` result (auto-detected default)
4. `null` — suppression disabled, single one-line warning emitted

A path that resolves to a non-existent directory:

- **CLI flag** → hard error. Operator-provided contract.
  `scaffold observe audit` exits non-zero with
  `--knowledge-root path '<x>' does not exist or is not a directory`.
- **Yaml config** → soft warning + fall through to auto-detect. The yaml
  may be a stale entry left in a checked-in config; failing the audit on
  it surprises operators who didn't write that line. The fallthrough
  preserves the "audit always runs" promise.
- **Auto-detect** → `null` path, single warning, suppression disabled.

The resolution happens in `src/cli/commands/observe-audit.ts` (the
command handler), not in Lens I. The lens only sees a resolved
`context.knowledgeRoot: string | null`.

### 3. Lens I integration

#### Context shape

Extend the `AuditContext` type (`src/observability/types.ts` or
wherever the shared shape lives) with:

```typescript
interface AuditContext {
  // ... existing fields
  /** Absolute path to a scaffold install directory whose
   *  content/knowledge/ should be consulted for existing-entry
   *  suppression. Null when no path could be resolved. */
  knowledgeRoot: string | null
}
```

All existing lenses ignore this field; only Lens I reads it.

#### Lens I logic change

Existing pseudocode (paraphrased from `lens-i-knowledge-gaps.ts`):

```
buckets = aggregate(signals, window=90d)
for bucket in buckets:
  if bucket.signal_count >= 3 and distinct_projects(bucket) >= 2:
    emit P2 finding
```

New pseudocode:

```
buckets = aggregate(signals, window=90d)
index = context.knowledgeRoot ? loadKnowledgeIndex(context.knowledgeRoot + '/content/knowledge') : null
if context.knowledgeRoot && !index:
  // soft-fail path — load threw; warn once
  console.warn('[Lens I] knowledge index unavailable; existing-entry suppression disabled')
for bucket in buckets:
  if bucket.signal_count >= 3 and distinct_projects(bucket) >= 2:
    if index && index.has(bucket.topic):
      continue        # suppression: topic is already covered
    emit P2 finding
```

The lens calls `loadKnowledgeIndex` ONCE per invocation, not per bucket.
The cost is one directory walk of `content/knowledge/` (~270 entries
today) — negligible compared to the LLM-graded full-profile checks in
Lens H.

#### Warning policy

- **Auto-detect path returns `null`** → emit warning ONCE per audit run.
  Message: `[Lens I] knowledge-root not located; existing-entry suppression disabled. Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root in .scaffold/observability.yaml.`
- **Yaml path doesn't exist** → emit warning with the bad path quoted:
  `[Lens I] yaml knowledge_root '<x>' not found; falling back to auto-detect.`
- **Index load fails** (path exists but unreadable / unparseable as a
  knowledge tree) → emit warning with the path:
  `[Lens I] knowledge index could not be loaded from '<x>': <reason>; existing-entry suppression disabled.`

Warnings go to stderr so they don't pollute JSON output (`scaffold
observe audit --render=dashboard-fragment-audit` etc.).

### 4. CLI/operator surface updates

- `scaffold observe audit --help` documents the new flag.
- `docs/knowledge-freshness/operations.md` gets a short subsection
  "Existing-entry suppression" describing the 3-tier resolution,
  what happens when none of them resolves, and the relationship to
  `scaffold observe ack`.
- `.scaffold/observability.yaml` example in CLAUDE.md gains the new
  `lenses.I-knowledge-gaps.knowledge_root` line (commented; default is
  auto-detect).

## Cross-Cutting Principles

- **Soft-fail by default.** Suppression is an enhancement, not a contract.
  Lens I MUST continue to produce useful findings if the knowledge index
  is unavailable.
- **Single source of truth at index-time.** No periodic refresh, no
  cached static index — each `scaffold observe audit` run walks the live
  tree. Cheap (~270 file headers parsed).
- **Operator-provided contracts are sharp.** A `--knowledge-root` flag
  the operator typed must point somewhere real; we hard-error on it.
  Auto-detect and yaml are softer.
- **No new dependencies.** Custom walker, custom YAML extraction. Matches
  the dependency-free style of the existing lens.

## Test Surface

| Test target | Coverage |
|---|---|
| `loadKnowledgeIndex` | empty dir; dir with valid entries; dir with README.md only; entry with no frontmatter; entry with non-slug `name:`; duplicate `name:` across files; symlinked subdir |
| `findScaffoldInstall` | dev worktree layout (walks up to the right root); npm-global layout (walks up through `node_modules/`); no scaffold install above cwd (returns null); home-dir boundary respected |
| `resolveKnowledgeRoot` (the 3-tier resolver in `observe-audit.ts`) | CLI flag wins; yaml wins when no CLI; auto-detect wins when no CLI no yaml; CLI flag pointing at nothing → hard error; yaml pointing at nothing → warn + fallthrough; nothing resolves → warn + null |
| `lens-i-knowledge-gaps.ts` | existing tests still pass; new: bucket suppressed when topic is in index; bucket NOT suppressed when topic is not in index; null index → no suppression (matches origin/main behavior); index load throws → warn-once + no suppression |
| Integration | `scaffold observe audit --knowledge-root <fixture>` with a fixture KB containing two slugs and a ledger with three signals each on `covered-slug` and `uncovered-slug` → only `uncovered-slug` becomes a finding |

## Cost & Performance

- One directory walk per audit run (~270 files in the scaffold tree as
  of Phase 4). Sub-millisecond.
- Frontmatter parse per file: trivial — only `name:` is extracted.
- No LLM calls. Pure I/O + string parsing.
- Memoized within a single audit run.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Auto-detect picks the wrong scaffold install (e.g. a sibling project on the same machine) | Walk stops at `os.homedir()` boundary; CLI flag and yaml override always win. |
| Index drifts during a long audit run | Single-shot load at audit start. If a maintainer adds an entry mid-audit, the next run picks it up — within tolerance for a 90-day signal window. |
| `name:` slug differs from filename basename | Loader trusts `name:` (matches assembly engine), not basename. |
| Operator pins yaml `knowledge_root` to a stale path | Soft-fail to auto-detect; warning surfaces the bad path so the operator can fix or remove it. |
| Scaffold installed via a wrapper that hides the package root from `__dirname` | `--knowledge-root` flag and yaml config are the escape hatches. |
| Two installs side-by-side (e.g. dev worktree + Homebrew install) and auto-detect picks the older one | Walk picks the *nearest* parent containing `content/knowledge/`. From a downstream cwd this is reliably the install whose CLI is actually running. |

## Resolved Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Suppression policy when topic is covered | Skip the bucket entirely; emit no finding | Matches operator mental model ("gap = missing thing"). Lower-severity-emit and new-finding-type alternatives add noise without adding signal. |
| 2 | KB lookup mechanism | Auto-detect via `findScaffoldInstall()` + `--knowledge-root` flag + yaml escape hatches | Auto-detect handles the common case (npm-global, Homebrew, local). Flag/yaml handle testing, pinning, air-gapped installs. Bundled-static-index adds a build step and creates drift; rejected. |
| 3 | Match rule | Exact slug match against entry `name:` field | Deterministic. Matches how the assembly engine identifies entries. Substring/topics-array matching introduces false-positive suppression of real gaps. |
| 4 | Auto-detect-fails fallback | Soft-fail with one-line warning; suppression disabled, lens runs as today | Suppression is an enhancement, not a contract. Hard-failing the audit would surprise downstream projects with `scaffold observe audit` workflows. |
| 5 | CLI-flag-points-at-nothing behavior | Hard error | Operator-typed contracts get sharp errors; yaml entries get soft-fail. Yaml may persist across operator changes; CLI flag is intentional in the moment. |
| 6 | Index refresh cadence | Once per audit run, no caching across runs | Walk is cheap (~270 files). Cross-run cache adds invalidation complexity for no measurable gain. |
| 7 | Match against `topics:` array (in addition to `name:`) | No | `topics:` is broad-keyword soup; would suppress real gaps. Out of scope. |
| 8 | Bundle a static index | No | Adds a build step + drift risk between the live tree and the bundle. Direct walk is cheaper than the maintenance cost. |
