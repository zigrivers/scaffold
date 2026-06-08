# Scaffold v1 to v2 Migration Guide

**Last updated:** 2026-03-16
**Status:** current

This guide is for v1 Scaffold users upgrading to v2. It covers what changed conceptually,
how v1 terms map to v2 terms, and the step-by-step process for migrating an existing
project to the v2 pipeline.

---

## What Changed

### The short version

v1 is a 29-prompt pipeline hardwired to Claude Code. You copy-paste prompts in order,
track progress manually, and pick a methodology name at the start. v2 is a CLI-driven
pipeline where each step is assembled at runtime from composable parts — meta-prompts,
a knowledge base, and your own instruction files — and where a 1-5 depth scale replaces
fixed methodology names.

### Meta-prompts replace hard-coded prompts

v1 ships 29 complete prompt texts in `prompts.md`. Each one is 200-500 lines of prose
that you paste into a Claude Code session. Changing any prompt — to add a concern, fix
wording, or skip a section — requires editing `prompts.md` directly.

v2 replaces each prompt with a **meta-prompt** stored in `pipeline/`. A meta-prompt is
30-80 lines that declares the step's purpose, its inputs and outputs, quality criteria,
and scaling rules for different depths. It does not contain the prompt text you'll paste.
Instead, the `scaffold run <step>` command assembles the working prompt at runtime from:

- The meta-prompt (intent + scaling rules)
- Referenced knowledge base entries (domain expertise)
- Project context gathered from your artifacts
- Your instruction files (`.scaffold/instructions/`)

The assembled prompt is handed to the AI. You never write or edit the prompt text
directly. Knowledge base improvements automatically propagate to every step that
references them — no manual edits required.

### Depth scale replaces methodology names

v1 has two named methodologies: `classic` (full pipeline) and `classic-lite` (reduced
pipeline). You pick one at the start and run that version throughout.

v2 replaces methodology names with a **1-5 depth scale** that controls how rigorous each
step's output should be:

| Depth | Meaning |
|-------|---------|
| 1 | Minimum viable artifact — core decisions only, brief rationale, just enough to start |
| 2 | Key trade-offs noted but not explored in depth |
| 3 | Solid documentation — alternatives considered, team-onboardable output |
| 4 | Thorough analysis — edge cases, risk assessment, detailed rationale |
| 5 | Comprehensive — full evaluation matrices, domain modeling, migration paths, operational detail |

Three preset methodologies map to common depth configurations:

| Preset | Description | Default depth |
|--------|-------------|---------------|
| `deep` | All pipeline steps active | 5 at every step |
| `mvp` | Minimal step subset (PRD, testing strategy, tasks, playbook) | 1 at every step |
| `custom` | You choose which steps are active and set depth per step | User-configured |

Depth is configurable per step, so you can run a deep PRD at depth 4 while keeping
the architecture overview at depth 2. Methodology can also be changed mid-pipeline
without invalidating completed steps.

### Runtime assembly replaces build-time resolution

v1 prompts are static text. What you paste is what runs. If you want different
behavior, you edit the prompt.

v2 assembles the prompt at runtime each time you call `scaffold run <step>`. The
9-step assembly process:

1. Load the meta-prompt for the requested step
2. Resolve methodology and depth for the step
3. Load all knowledge base entries referenced by the meta-prompt
4. Gather project context (existing artifacts, config, state)
5. Load global instructions (`.scaffold/instructions/global.md`)
6. Load per-step instructions (`.scaffold/instructions/<step>.md`)
7. Apply inline instructions (`--instructions "..."` flag)
8. Assemble the full prompt from all layers
9. Deliver to the AI (via platform adapter for Claude Code, Codex, or standalone)

Per-invocation context means each prompt run is aware of your current project state,
not the generic state assumed when the prompt text was written.

### Knowledge base replaces inline context

v1 embeds domain expertise directly in prompt text. A prompt about system architecture
contains both the instructions ("produce an architecture document") and the knowledge
("a good architecture document covers component design, data flows, extension points...").
This knowledge is duplicated across prompts and expensive to improve.

v2 extracts domain expertise into a **knowledge base** — topic-organized markdown files
in `knowledge/`. Each file covers one domain comprehensively (e.g.,
`knowledge/core/system-architecture.md`). Meta-prompts reference entries by name in
their frontmatter. The CLI loads referenced entries during assembly. Improving a
knowledge base entry improves every step that uses it, automatically.

### Three-layer instruction system for customization

v1 has no customization mechanism. You either edit `prompts.md` or accept the defaults.

v2 provides a three-layer instruction system in `.scaffold/instructions/`:

| Layer | File | Scope | Persistence |
|-------|------|-------|-------------|
| Global | `.scaffold/instructions/global.md` | All steps | Committed to git |
| Per-step | `.scaffold/instructions/<step-name>.md` | One step | Committed to git |
| Inline | `--instructions "..."` flag | One invocation | Ephemeral |

Later layers take precedence over earlier ones when instructions conflict. All layers
are optional — missing files are silently skipped. Team-shared instruction files are
committed alongside your code.

### State management tracks step completion

v1 has no automated tracking. You track which prompts you've run in your head or in a
separate document.

v2 writes `.scaffold/state.json` — a map-keyed file committed to git that records every
step's status (`pending`, `in_progress`, `skipped`, `completed`) along with timestamps
and actor information. New sessions resume exactly where the previous session left off.
Team members can see pipeline progress in the repository.

State is updated atomically (temp-file-then-rename) so crashes cannot corrupt it.

### Lock system prevents concurrent execution

v1 has no locking. Running two prompts concurrently is possible and can produce
conflicting artifacts.

v2 maintains `.scaffold/lock.json` — a local-only (gitignored) advisory lock file that
prevents concurrent write operations on the same machine. The lock is PID-based with
automatic stale detection; there is no manual unlock command. Cross-machine coordination
happens through git's merge behavior on `state.json`.

### Artifact provenance via tracking comments

Both v1 and v2 write a tracking comment on line 1 of every produced artifact:

```
<!-- scaffold:<step-slug> v<version> <date> <methodology> <mixin-summary> -->
```

v2 uses the presence and format of this comment to detect mode (fresh vs. update) and
to recognize v1 artifacts during migration. The v1 format omits the methodology and
mixin summary — this difference is how `scaffold adopt` identifies v1-produced files.
`scaffold adopt` does not modify tracking comments; they are written when steps execute.

---

## Methodology Name Mapping

| v1 | v2 |
|----|----|
| `classic` | `deep` |
| `classic-lite` | `mvp` |

---

## Concept Mapping

| v1 Concept | v2 Concept | Notes |
|------------|------------|-------|
| Hard-coded prompts (`prompts.md`) | Meta-prompts (`pipeline/*.md`) | Now composable; 30-80 lines each instead of 200-500 |
| Mixin files | Knowledge base (`knowledge/**/*.md`) | Topic-organized, reusable across steps |
| Inline context injection | Assembly engine | 9-step runtime process per invocation |
| Build-time resolution | Runtime assembly | Assembled fresh on each `scaffold run` call |
| Manual progress tracking | `state.json` | Automated completion tracking committed to git |
| No locking | `lock.json` | Advisory file locking, local-only, auto-stale detection |
| No customization | `.scaffold/instructions/` | 3-layer precedence: global, per-step, inline |
| Methodology name (`classic`, `classic-lite`) | Depth scale (1-5) + preset (`deep`, `mvp`, `custom`) | Per-step configurable |
| 29 fixed prompts | Composable pipeline steps | Steps enabled/disabled per methodology preset |
| Copy-paste workflow | `scaffold run <step>` | CLI-driven with platform adapters |
| v1 tracking comment format | v2 tracking comment format | v2 adds methodology + mixin summary fields |

---

## Migration Steps

### Before you begin

Make sure you have:

- Your existing project directory with v1-produced artifacts
- A `docs/` directory with at least one scaffold-produced file (the tracking comment on
  line 1 is how v2 detects your existing work)
- Node.js 18+ or Homebrew available for installation

### Step 1 — Install Scaffold v2

**Via npm:**

```bash
npm install -g @scaffold/cli
```

**Via Homebrew:**

```bash
brew install scaffold
```

Verify installation:

```bash
scaffold --version
```

### Step 2 — Navigate to your project directory

```bash
cd /path/to/your/project
```

Run all subsequent commands from the project root — the same directory that contains
your `docs/` folder.

### Step 3 — Run `scaffold init`

```bash
scaffold init
```

The init wizard:

1. Detects that you have an existing project (looks for source files, package manifests,
   or existing docs)
2. Recognizes v1 tracking comments in your artifact files and switches to v1-migration
   mode automatically
3. Asks which methodology to use going forward (`deep`, `mvp`, or `custom`)
4. Writes `.scaffold/config.yml` with your selections

v2 will suggest a methodology based on your v1 methodology (for example, if your
artifacts have `<!-- scaffold:... classic -->` comments, it will suggest `deep`). You
can accept the suggestion or choose a different one.

### Step 4 — Choose your methodology

The init wizard will prompt you. Use the table in the **Methodology Name Mapping** section
above to translate your v1 choice. If you used `classic`, choose `deep`. If you used
`classic-lite`, choose `mvp`. If you want fine-grained control over which steps run and
at what depth, choose `custom`.

Custom methodology configuration example (`.scaffold/config.yml`):

```yaml
methodology: custom
custom:
  default_depth: 3
  steps:
    create-prd:
      enabled: true
      depth: 4
    system-architecture:
      enabled: true
      depth: 2
    testing-strategy:
      enabled: true
      depth: 3
```

### Step 5 — Run `scaffold adopt`

```bash
scaffold adopt
```

`scaffold adopt` scans your project for artifacts with v1 tracking comments and maps
each one to the corresponding v2 pipeline step. It then pre-populates `state.json`,
marking steps as `completed` where artifacts exist.

`scaffold adopt` is a read-only operation — it does not modify your existing files or
tracking comments. It only writes `state.json`.

To preview what `scaffold adopt` will do without making changes:

```bash
scaffold adopt --dry-run
```

The dry-run output shows:
- Which artifacts were detected and which steps they map to
- Which steps will be marked `completed` vs. `pending`
- Any artifacts that couldn't be matched to a known step

### Step 6 — Review the adoption report

After running `scaffold adopt`, review the output carefully. The adoption report shows:

- **Auto-completed steps** — steps where v1 artifacts were found; these will be treated
  as done, and re-running them will invoke update mode (diff over regeneration)
- **Pending steps** — steps where no v1 artifact was found; these need to be run fresh
- **Unmatched files** — scaffold-produced files that don't map to any v2 step (this can
  happen if v1 had prompts that v2 reorganized or combined)

If the report looks wrong, re-run with `--dry-run` and inspect the file-to-step mapping.

### Step 7 — Run `scaffold status`

```bash
scaffold status
```

This shows your full pipeline state: which steps are completed, which are pending, and
which is next. Use this as your reference for where to continue.

Example output:

```
Pipeline: my-project (deep, depth 5)

  completed  create-prd
  completed  system-architecture
  completed  tech-stack
  pending    testing-strategy       <- next
  pending    implementation-tasks
  pending    implementation-playbook
```

### Step 8 — Continue with `scaffold run`

```bash
scaffold run <next-step>
```

For any steps marked `pending`, run them in pipeline order. The CLI reads your existing
artifacts as context, assembles the prompt with your methodology and depth settings, and
delivers it to the AI.

For steps marked `completed` where you want a deeper or updated artifact:

```bash
scaffold run <step> --depth 4
```

This triggers update mode — the step reads your existing artifact, identifies what needs
to change for the new depth, and proposes a targeted diff rather than regenerating from
scratch.

---

## What Gets Preserved

When you run `scaffold adopt`, v2 preserves:

- **All existing documentation artifacts** — your v1-produced files are not touched
- **v1 tracking comments** — v2 uses them for detection; they remain in place until
  the step executes in v2 (at which point v2 overwrites the comment with v2 format)
- **Artifact content** — the substance of your PRD, architecture docs, user stories,
  and other artifacts is not modified by `scaffold adopt`

---

## What Changes

After running `scaffold init` and `scaffold adopt`:

- **New `.scaffold/` directory** is created containing:
  - `config.yml` — methodology and depth configuration
  - `state.json` — pipeline step completion tracking
  - `decisions.jsonl` — decision log (written as you run steps)
  - `instructions/` — your customization files (empty initially)
  - `lock.json` — transient lock file (gitignored)

- **Pipeline execution changes** — instead of copy-pasting prompt text, you run
  `scaffold run <step>` and the CLI handles assembly and delivery

- **Methodology changes** — `classic` becomes `deep` (depth 5), `classic-lite` becomes
  `mvp` (depth 1); depth is now configurable per step

- **Tracking comments update** — when a step executes in v2, the tracking comment on
  its artifact is updated from v1 format to v2 format (adds methodology + mixin summary)

---

## Troubleshooting

### "No v1 artifacts detected"

`scaffold init` and `scaffold adopt` scan for tracking comments (`<!-- scaffold:... -->`)
on line 1 of files in your project.

**Checks:**

1. Confirm you're running the command from the project root — the directory that
   contains `docs/` (or wherever your artifacts live).
2. Open one of your artifact files and check that line 1 is a scaffold tracking comment.
   If line 1 is something else (a blank line, a title, frontmatter), the file won't be
   detected.
3. If your docs are in a non-standard location, you may need to run `scaffold adopt`
   with a path: `scaffold adopt --path ./my-docs`.

### "Step already completed but artifacts missing"

This can happen if `scaffold adopt` mapped a v1 artifact to a step, but the artifact
was subsequently deleted or moved.

**Resolution:**

```bash
scaffold adopt --dry-run
```

Review the file-to-step mapping. If an artifact is missing, you have two options:

1. Restore the artifact from git history and re-run `scaffold adopt`
2. Reset the step to `pending` and re-run it fresh:

   ```bash
   scaffold reset <step>
   scaffold run <step>
   ```

### "Methodology changed warning"

If you switch methodology after running `scaffold adopt` (e.g., from `deep` to `mvp`
mid-pipeline), v2 will warn that completed steps were run at a different methodology.
This is expected behavior and does not block execution.

**What it means:** Steps completed under `deep` produced depth-5 artifacts. If you
switch to `mvp`, new steps will produce depth-1 artifacts. The artifacts from the
earlier methodology are still valid — they're just more detailed than the current
methodology would produce. You can leave them as-is or re-run them at the new depth.

**To suppress the warning** and explicitly accept mixed-methodology state:

```bash
scaffold run <step> --methodology mvp
```

### "Lock file exists but no process is running"

If scaffold crashed while executing a step, it may leave `.scaffold/lock.json` behind.
v2 detects stale locks automatically using PID and process start time comparison. On the
next `scaffold run` call, the CLI will detect that the locking process is no longer
running and clear the stale lock automatically.

If automatic stale detection fails (rare edge case with PID recycling), remove the lock
file manually:

```bash
rm .scaffold/lock.json
```

Then re-run your command. Check `state.json` to see if the interrupted step is marked
`in_progress` — if so, run `scaffold reset <step>` before re-running it.

### "Tracking comment format mismatch"

If you see a warning about tracking comment format, the artifact has a v1-format comment
that v2 can't fully parse. This is informational — v2 will still operate on the file.
The tracking comment will be updated to v2 format when the step next executes.

---

## Further Reading

- [v2 PRD](scaffold-v2-prd.md) — authoritative product requirements for v2
- [Assembly Engine](domain-models/15-assembly-engine.md) — how prompts are assembled at runtime
- [Brownfield Adopt](domain-models/07-brownfield-adopt.md) — detailed spec for `scaffold adopt`
- [Methodology & Depth Resolution](domain-models/16-methodology-depth-resolution.md) — depth precedence rules
- [State File Design](adrs/ADR-012-state-file-design.md) — `state.json` structure and merge semantics
- [Tracking Comments](adrs/ADR-017-tracking-comments-artifact-provenance.md) — provenance comment format and v1 detection
- [Advisory Locking](adrs/ADR-019-advisory-locking.md) — `lock.json` stale detection algorithm
- [Three-Layer Instructions](adrs/ADR-047-user-instruction-three-layer-precedence.md) — customization via `.scaffold/instructions/`
- [Depth Scale](adrs/ADR-043-depth-scale.md) — the 1-5 depth scale and three methodology presets
