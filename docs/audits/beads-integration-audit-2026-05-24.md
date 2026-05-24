# Beads Integration Audit — Scaffold vs Upstream Beads

**Date:** 2026-05-24
**Worktree:** `/Users/kenallred/Developer/scaffold-beads-audit` (branch `beads-audit-workspace`, base `db49a86`)
**Upstream Beads version referenced:** `v1.0.4` (Homebrew, local install verified)
**Upstream repo:** https://github.com/gastownhall/beads (formerly `steveyegge/beads`)
**Scope:** Analysis only — no code changes, no PRs created.

> **MMR Review Addendum (2026-05-24, post-initial-write):** Multi-model review of this audit ran with **2 of 3 channels** (Codex + Gemini completed; **Claude channel auth_failed**, single-source confidence on items not covered by Codex/Gemini). Verified corrections applied inline below — see commit history or look for ★ markers next to corrected findings. Net effect of corrections: F-1.2/F-1.7/F-4.2/F-1.10 recommendation bodies updated to match v1.0.4 CLI; F-2.1 evidence expanded to additional non-pipeline files; F-5.5 downgraded P1→P2 (merged into F-1.6); F-1.3 downgraded P1→P2 and F-4.3 merged into F-1.3; F-2.8 promoted from unverified to verified.

---

## Executive Summary

1. **Scaffold's Beads integration is broadly working but materially out of date.** Upstream Beads went through a major rewrite around v1.0.0 (April 2026) — SQLite removed, Dolt as the only backend, hash-based IDs (`bd-a1b2`), a sweeping `bd setup` recipe system, MCP server, agent-memory primitives, and a `bd prime` SSOT for AI context injection. Scaffold's prompts predate most of that and operate at roughly the v0.6x command surface.
2. **Live evidence of breakage observed during this audit.** Running `scripts/setup-agent-worktree.sh beads-audit` printed `Error: unknown command "hook" for "bd"` (the upstream command is `bd hooks run`, plural). The fault is in the user's installed `.git/hooks/post-checkout` and `post-merge` shims (calling `bd hook` singular) — but scaffold has no remediation path that tells projects to run `bd doctor --fix` / `bd hooks install` after a `bd` upgrade, so the breakage is sticky.
3. **Multiple scaffold commands do not exist in upstream Beads.** `bd sync` (used in 6 pipeline files for post-PR reconciliation), `bd start BD-xxx`, and `bd status BD-xxx` are not in upstream's command list. The closest equivalents are `bd update --claim` (atomic claim) and `bd show <id>` / `bd state <id>`. `bd sync` in particular looks like a name carried over from a pre-Dolt era — upstream now relies on `bd dolt push` / auto-push or tracker-specific syncs (`bd github sync`, etc.).
4. **Scaffold's task-status vocabulary doesn't match upstream's.** Scaffold prescribes `ready → in-progress → review → done` plus `blocked`. Upstream's actual statuses are `open, in_progress, blocked, deferred, closed, pinned, hooked` — note `in_progress` underscored, no `ready` (it's a query not a status), no `review`, no `done`.
5. **`BD_ACTOR` is the deprecated env var.** Scaffold sets and reads `BD_ACTOR` in multi-agent flows. Upstream renamed it to `BEADS_ACTOR` (still supported as an alias with deprecation warning).
6. **Scaffold reinvents what `bd setup` does natively.** Upstream ships built-in recipes for Claude Code, Codex, Gemini, Cursor, Windsurf, Aider, and others — they install hooks, write AGENTS.md/CLAUDE.md sections, manage markers, support a minimal-vs-full profile, and support custom recipes via `.beads/recipes.toml`. Scaffold's `content/skills/beads/` ignores all of this and hand-writes its own CLAUDE.md block.
7. **High-value upstream features scaffold never surfaces:** `bd prime` (SSOT context for AI sessions, with `--hook-json` for SessionStart hooks), `bd remember`/`bd recall` (persistent agent memory — upstream's AGENTS.md explicitly tells agents *not* to create MEMORY.md files, which contradicts scaffold's auto-memory system), the `discovered-from` dependency type, `bd ready --claim --json` (atomic find-and-claim), `bd preflight` (PR-readiness check), `bd doctor --fix` (health/repair), `bd worktree {create,info,list,remove}` (scaffold has a parallel custom system in `setup-agent-worktree.sh`), and the bundled `beads-mcp` MCP server.
8. **Scaffold's `content/skills/beads/` directory does not exist.** The skill is registered (`scaffold:beads`) and produces output, but there is no template directory under `content/skills/beads/` — the skill is implemented purely in the pipeline meta-prompt `content/pipeline/foundation/beads.md`. This is fine but worth noting because the original audit brief assumed a template dir.
9. **No `.beads/issues.jsonl` guarantee post-upgrade.** Upstream's `[Unreleased]` notes flip `export.auto` to opt-in. Two scaffold tools (`release.md`, `version-bump.md`) parse `.beads/issues.jsonl` as a fallback — that path will silently disappear for newly-init'd projects until they run `bd config set export.auto true`.
10. **Audit verdict:** No P0/critical scaffold-shipped data-loss bugs found — the integration mostly degrades gracefully (`bd sync` is a no-op if missing, statuses are documentation-only, etc.). But the cumulative effect of stale commands, deprecated env vars, and missed features means downstream projects are using ~30% of what current Beads offers. Recommended next-action set is mostly small additive edits, not a redesign.

---

## Upstream Beads — Feature Inventory (terse)

Source: subagent inventory built from local clone `/tmp/beads-upstream`, GitHub releases page, `bd --help` (v1.0.4 from Homebrew), and `docs/{CONFIG,SETUP,CLI_REFERENCE,JSON_SCHEMA}.md` in the upstream repo.

### Install & versioning

| Method | Command |
|---|---|
| Homebrew | `brew install beads` |
| npm (global) | `npm install -g @beads/bd` |
| Install script | `curl -fsSL https://raw.githubusercontent.com/gastownhall/beads/main/scripts/install.sh \| bash` |
| `go install` | restored in v1.0.3 |
| MCP server | `uv tool install beads-mcp` (PyPI) |
| Nix / winget | Both packaged |

Latest release: **v1.0.4** (May 2026). 90 total releases. Repo at `gastownhall/beads` (formerly `steveyegge/beads` — old URL still surfaces in some npm provenance / docs).

### Command surface (selected — full inventory in subagent report)

- **Issue ops:** `create` (alias `new`, `q`), `update` (with `--claim`), `close` (alias `done`, `--reason`/`--reason-file`/`--claim-next`/`--continue`), `reopen`, `delete`, `show` (alias `view`), `assign`, `children`, `comment`, `note`, `label`, `tag`, `priority`, `link`, `query`, `search`, `find-duplicates`, `promote`, `set-state`, `state`, `todo`, `gate`, `merge-slot`.
- **Views & reports:** `list` (huge filter surface inc. `--ready`, `--overdue`, `--label-pattern`, `--metadata-field`), `ready` (with `--claim`, `--explain`, `--sort hybrid|priority|oldest`, `--gated`), `blocked`, `count`, `diff`, `history`, `lint`, `stale`, `status`, `statuses`, `types`, `preflight`.
- **Graph:** `dep {add,remove,list,tree,cycles,relate,unrelate}`, `duplicate`, `duplicates`, `supersede`, `epic`, `swarm`, `graph`.
- **Sync & data:** `export`, `import`, `backup {init,sync,restore,remove,status}` (filesystem + `dolthub://`/`gs://`/`s3://`/`az://`), `branch`, `vc`, `restore`, `dolt {start,stop,push,pull,remote,commit,...}`, `federation`, `ship`, `repo`.
- **Setup & config:** `init`, `init-safety`, `bootstrap`, `setup <recipe>` (claude/codex/gemini/copilot/cursor/windsurf/aider/...), `onboard`, **`prime`** (SSOT for agent context, supports `--hook-json` for hook output), `quickstart`, `human`, `info`, `context`, `where`, `config {get,set,set-many,unset,list,show,drift,apply,validate}`, `hooks {install,uninstall,list,run}`, `remember`, `recall`, `memories`, `forget`, `kv`.
- **Maintenance:** `batch`, `compact`, `doctor` (`--fix`, `--check artifacts|conventions|pollution|validate`), `flatten`, `gc`, `migrate`, `ping`, `prune`, `purge`, `rename-prefix`, `rename`, `rules {audit,compact}`, `sql`, `upgrade {ack,review,status}`, `worktree {create,info,list,remove}`.
- **Tracker sync:** `github`, `gitlab`, `jira`, `linear`, `ado` (Azure DevOps), `notion` — all with `pull`/`push`/`status`/`sync`.

### Data model essentials

- **ID format:** hash-based, e.g. `bd-a1b2` (lowercase prefix + 4-hex). Hierarchical for epics: `bd-a3f8.1`. Prefix configurable at init.
- **Statuses (enum):** `open, in_progress, blocked, deferred, closed, pinned, hooked` — plus status *categories* `active, wip, done, frozen` (v0.62.0+).
- **Issue types:** `bug, feature, task, epic, chore, decision, message, molecule, gate, spike, story, milestone, event` — new: `spike`, `story`, `milestone` (v1.0.0).
- **Priority scale:** `0` (highest/critical) – `4` (lowest/backlog). `P0`–`P4` aliases accepted. Default `2`.
- **Dependency types (well-known):** `blocks, parent-child, conditional-blocks, waits-for, related, discovered-from, replies-to, relates-to, duplicates, supersedes, authored-by, assigned-to, approved-by, attests, tracks, until, caused-by, validates, delegated-from` — plus arbitrary custom strings ≤50 chars (Decision 004).
- **Storage:** Dolt only (SQLite removed in v1.0.0). `.beads/embeddeddolt/` (embedded mode, default) or `.beads/dolt/` (server mode) or `~/.beads/shared-server/` (shared). Optional opt-in JSONL export at `.beads/issues.jsonl`.
- **Config:** Two layers — tool-level (Viper, search order: `~/.beads/config.yaml`, `~/.config/bd/config.yaml`, `.beads/config.yaml`, `.beads/config.local.yaml`) + project-level (`bd config get/set`, stored in DB). Env var `BEADS_ACTOR` (was `BD_ACTOR`, now deprecated alias).
- **JSON contract:** `--json` universal, `schema_version: 1`, envelope mode `BD_JSON_ENVELOPE=1` (default in v2.0).

### Agent / AI integration (the part scaffold cares about most)

- **`bd prime`** — single source of truth for workflow context. Outputs ~1–2k tokens. `--hook-json` gives a Claude/Gemini SessionStart hook envelope. `--memories-only` for low-token contexts. Override with `.beads/PRIME.md`.
- **`bd setup <recipe>`** — built-in recipes for Claude Code, Codex, Gemini CLI, Copilot CLI, Cursor, Windsurf, Cody, Kilocode, Aider, factory, mux. Two profiles: `minimal` (hooks-driven, ~60% smaller) vs `full` (AGENTS.md-driven). Marker-managed integration blocks survive re-runs. Custom recipes via `.beads/recipes.toml`.
- **`bd onboard`** — emits ~10-line snippet for any agent file pointing at `bd prime`.
- **`bd hooks install`** — installs `pre-commit`, `post-merge`, `pre-push`, `post-checkout`, `prepare-commit-msg` via `bd hooks run` shims. `bd doctor --fix` is canonical re-apply.
- **`bd remember "text" [--key K]` / `bd recall K` / `bd memories` / `bd forget`** — persistent agent memory. Excluded from default export. Injected via `bd prime`. Upstream AGENTS.md: "Use `bd remember`; do NOT create MEMORY.md files."
- **`bd update <id> --claim`** — atomic claim (sets assignee=you + status=in_progress, idempotent).
- **`bd ready --claim --json`** — atomic find-first-ready-and-claim.
- **`bd create … --deps discovered-from:bd-123`** — log work discovered while doing other work; doesn't block readiness.
- **`bd preflight`** — PR-readiness checklist for agents about to land work.
- **`bd worktree {create,info,list,remove}`** — git-worktree integration (worktree-awareness across hooks/doctor/config hardened in v1.0.1).
- **`beads-mcp`** — Python PyPI package, bundled in `integrations/beads-mcp/`. 12 tools (init/create/list/ready/show/update/close/dep/blocked/stats/reopen/set_context). `workspace_root` param on every call for multi-project routing. Upstream recommends MCP **only** when CLI shell access is unavailable (e.g., Claude Desktop) — for Claude Code, CLI + hooks is preferred (~1–2k tokens vs 10–50k for MCP schemas).

### Recent-release deltas relevant to downstream

- **`[Unreleased]`** — `export.auto` flips to **opt-in**; `dependencies.depends_on_id` becomes a STORED generated column (writes will fail); foreign keys with `ON DELETE/UPDATE CASCADE` added; `bd dolt status` JSON shape changes.
- **v1.0.4** — `bd init --reinit-local` / `--discard-remote` replace `--force` (deprecated). New `bd -C` (like `git -C`). `bd close --reason-file`. Stable init exit codes `10` (remote divergence), `11` (local exists), `12` (destroy-token missing). Embedded-mode flock removed.
- **v1.0.3** — `bd prune` (delete old closed); `BD_JSON_ENVELOPE` opt-in (default in v2.0). `go install` restored.
- **v1.0.1** — `bd batch` (atomic multi-op transactions), `bd config drift` / `apply` / `show` (provenance), `--issues` / `--parent` selective sync, `started_at` field, public API `beads.OpenBestAvailable`.
- **v1.0.0** — Embedded Dolt as default; SQLite removed; custom statuses/types; new types `spike`/`story`/`milestone`; `bd rules audit/compact`.

---

## Scaffold — Beads Integration Inventory (terse)

### Files that reference Beads (active code/content only — archive omitted)

| Path | Kind | What it does with Beads |
|---|---|---|
| `content/pipeline/foundation/beads.md` | pipeline | Main `/scaffold:beads` step. Initializes `.beads/`, creates `tasks/lessons.md`, edits CLAUDE.md. |
| `content/pipeline/build/single-agent-start.md` | pipeline | `bd ready` → pick → branch `bd-<id>/<desc>` → `bd close <id> && bd sync` after PR merge. |
| `content/pipeline/build/single-agent-resume.md` | pipeline | `bd list` → reconcile merged PRs (`bd close … && bd sync`) → `bd ready`. |
| `content/pipeline/build/multi-agent-start.md` | pipeline | `echo $BD_ACTOR` verification → `bd ready` → `bd close … && bd sync` → `bd sync` conflict detection. |
| `content/pipeline/build/multi-agent-resume.md` | pipeline | `bd list --actor $ARGUMENTS` → `bd close … && bd sync` → `bd ready`. |
| `content/pipeline/build/quick-task.md` | pipeline | `bd list` dedup, `bd create "type(scope): desc" -p <0-3>`. |
| `content/pipeline/build/new-enhancement.md` | pipeline | `bd create "US-XXX: …" -p <priority>`, `bd dep add <child> <parent>`, `bd dep tree <id>`. |
| `content/pipeline/environment/git-workflow.md` | pipeline | Branch fmt `bd-<task-id>/<desc>`, commit fmt `[BD-<id>] type(scope): desc`, mentions `BD_ACTOR`. |
| `content/pipeline/consolidation/workflow-audit.md` | pipeline | Verifies the two commit/branch formats are used consistently. |
| `content/knowledge/core/task-tracking.md` | knowledge | Canonical Beads doc inside scaffold. Includes a command table referencing `bd status BD-xxx`, `bd start BD-xxx`, `bd ready`. |
| `content/knowledge/execution/task-claiming-strategy.md` | knowledge | Task selection algorithm, references `bd ready`, `bd claim` *(non-existent)*, `bd close`. |
| `content/knowledge/execution/worktree-management.md` | knowledge | Sets and documents `BD_ACTOR` env var. |
| `content/tools/release.md` | tool | If `.beads/` exists, lists closed tasks via `bd list --status closed` or parses `.beads/issues.jsonl`. Uses commit fmt `[BD-xxx] chore(release): …`. |
| `content/tools/version-bump.md` | tool | Same as release.md. |
| `content/tools/prompt-pipeline.md` | tool | Pipeline reference. Lists "Install Beads" as optional with `npm install -g @beads/bd` / `brew install beads`. |
| `src/observability/adapters/beads.ts` | src | Probes `.beads/` + `bd --version`; lists tasks via `bd list --all --json`. Returns `available`/`degraded`/`unavailable`. |
| `src/observability/adapters/beads.test.ts` | src test | Tests the three states above. |
| `src/observability/engine/doc-graph/index.ts` | src | Skips `.beads/` in `SKIP_DIRS`. |
| `src/observability/engine/doc-graph/test-discovery.ts` | src | Skips `.beads/` in `SKIP_DIRS`. |
| `CHANGELOG.md` | docs | Many entries claiming to fix `bd hook`, remove `bd worktree create`, fix `bd q`, fix `bd list --all`, remove `--claim` flag. *(Several of these "fixes" are actually regressions — see findings.)* |

**Absent / notable gaps in coverage:**

- No `content/skills/beads/` directory (the skill is implemented as a pipeline meta-prompt only).
- No reference anywhere to `bd prime`, `bd remember`, `bd recall`, `bd setup` (the recipe system), `bd onboard`, `bd preflight`, `bd doctor`, `bd worktree`, `bd ready --claim`, `bd update --claim`, `discovered-from`, or the `beads-mcp` server.
- `content/tools/review-pr.md`, `review-code.md`, `post-implementation-review.md`, observability ledger, and MMR don't reference Beads at all (no link between MMR findings and Beads issues).

### Bd commands scaffold prescribes (deduped)

| Command | Exists upstream? | Where |
|---|---|---|
| `bd init` | ✅ yes (but many flags scaffold ignores) | `task-tracking.md:67`, `beads.md` |
| `bd ready` | ✅ yes (scaffold misses `--claim`, `--explain`, `--sort hybrid`) | `single-agent-start.md:104`, etc. |
| `bd list` | ✅ yes | many |
| `bd list --status closed` | ✅ yes | `release.md`, `version-bump.md` |
| `bd list --actor $ARGUMENTS` | ⚠ probably should be `--assignee` | `multi-agent-resume.md:117` |
| `bd list --all --json` | ✅ yes | `src/observability/adapters/beads.ts:40` |
| `bd create "title" -p <0-3>` | ✅ yes (but upstream priority range is 0-4) | `quick-task.md:201`, `new-enhancement.md:265` |
| `bd close <id>` | ✅ yes | many |
| `bd sync` | ❌ **NOT in upstream** | 6 pipeline files |
| `bd dep add <child> <parent>` | ✅ yes | `new-enhancement.md:294` |
| `bd dep tree <id>` | ✅ yes | `new-enhancement.md:297` |
| `bd status BD-xxx` | ❌ **NOT in upstream as per-issue query** (`bd status` shows DB overview; use `bd show <id>` or `bd state <id>`) | `task-tracking.md:81` |
| `bd start BD-xxx` | ❌ **NOT in upstream**. Use `bd update <id> --claim`. | `task-tracking.md:82,111` |
| `bd claim` | ❌ **NOT in upstream** as standalone. Use `bd update <id> --claim` or `bd ready --claim`. | `task-claiming-strategy.md` |
| `bd --version` | ✅ yes | `beads.ts:27` |

### Statuses / priorities / fields scaffold assumes

- Statuses: `ready, in-progress, review, done, blocked` (`task-tracking.md:37-50`).
  - Upstream: `open, in_progress, blocked, deferred, closed, pinned, hooked`. Mismatch on `ready` (not a status), `in-progress` vs `in_progress`, `review` (doesn't exist), `done` (doesn't exist; use `closed`).
- Priority: `P0–P3` documented; `-p 0|1|2|3` used in `bd create` calls. Upstream: `0–4`.
- ID format: scaffold uses `BD-42` (uppercase + integer) in examples; upstream default is `bd-a1b2` (lowercase + 4-hex). Prefix is customizable at init — but capitalization isn't, and integer-suffix isn't how Beads generates IDs.
- Env var: `BD_ACTOR` (deprecated upstream; use `BEADS_ACTOR`).
- Commit prefix: `[BD-xxx]` — fine in principle, but the actual ID format means this would be `[bd-a1b2]` for new projects.

### Flows that integrate Beads vs that don't

**Integrated:** `/scaffold:beads`, `/scaffold:single-agent-{start,resume}`, `/scaffold:multi-agent-{start,resume}`, `/scaffold:quick-task`, `/scaffold:new-enhancement`, `/scaffold:release`, `/scaffold:version-bump`.

**Conditionally aware (detect `.beads/` and adapt):** `/scaffold:git-workflow`, `/scaffold:workflow-audit`.

**Conspicuously not integrated:** all review commands (`review-pr`, `review-code`, `post-implementation-review`), the observability ledger (`scaffold observe …`), MMR audit channels, dashboard, audit lenses. None of these can correlate findings or events back to Beads issues even though the data model supports it (via `external_ref`, `discovered-from`, metadata).

### Stale / observed-broken at audit time

- **Worktree-setup error observed live:** `scripts/setup-agent-worktree.sh beads-audit` printed `Error: unknown command "hook" for "bd"`. Traced to user's local `/Users/kenallred/Developer/scaffold/.git/hooks/post-checkout:23` and `post-merge:24` calling `exec bd hook <name>` (singular). Upstream's correct invocation is `bd hooks run <name>` (plural + `run` subcommand). The `prepare-commit-msg` hook in the same directory is correctly using `bd hooks run prepare-commit-msg` — so the local install is half-migrated. Scaffold has no skill / pipeline step that runs `bd hooks install` or `bd doctor --fix` after a Beads upgrade.
- **`bd status BD-xxx`, `bd start BD-xxx`, `bd claim`** — referenced in `content/knowledge/core/task-tracking.md:81-82,111` and `task-claiming-strategy.md` but don't exist upstream.
- **`bd sync`** — used in 6 pipeline files for post-PR reconciliation. No `sync` top-level command exists in upstream v1.0.4. Closest matches: `bd dolt push` (when Dolt remotes are configured), or per-tracker `bd github sync` / `bd linear sync` / etc.
- **Priority `-p 3`** — `quick-task.md:201` uses `-p 0..3`; upstream accepts `0..4`. Not broken, just under-utilized.

---

## Findings

Format per item: **severity · short title** — upstream evidence · scaffold evidence · recommendation.

### Bucket 1 — Missing features

#### F-1.1 · P1 · No surfacing of `bd prime` (SSOT for AI context)

- **Upstream:** `bd prime [--hook-json|--memories-only|--full]` is the canonical workflow-context injection. Hook-json envelope is designed for Claude Code SessionStart hooks. Override via `.beads/PRIME.md`.
- **Scaffold:** Zero references. Scaffold's CLAUDE.md skeleton hand-rolls a Beads command reference table that overlaps with what `bd prime` emits.
- **Recommendation:** In `content/pipeline/foundation/beads.md`, add a step that runs `bd onboard` (which emits the canonical "pointer to `bd prime`" snippet) and adds a SessionStart hook calling `bd prime --hook-json`. Replace the hand-rolled command table in CLAUDE.md with a link/pointer.

#### F-1.2 · P1 ★ · No `bd setup` recipe usage — scaffold reinvents the integration layer

- **Upstream:** `bd setup claude` writes the CLAUDE.md integration section, installs hooks, and manages marker pairs (`<!-- BEGIN BEADS INTEGRATION profile:X hash:Y -->`), supporting re-runs without clobbering. Recipe choice determines profile (claude/gemini default to `minimal`, codex/factory/mux default to `full`); there is **no runtime `--profile` flag** in v1.0.4 (`bd setup --help` flags: `--add`, `--check`, `--global`, `--list`, `-o`, `--print`, `--project`, `--remove`, `--stealth`).
- **Scaffold:** `content/pipeline/foundation/beads.md` does its own CLAUDE.md editing.
- **Recommendation:** Replace the hand-rolled CLAUDE.md editing in `content/pipeline/foundation/beads.md` with `bd setup claude` (and `bd setup codex` / `bd setup gemini` for cross-platform downstream scaffolds — pick the recipe; no profile flag). Keeps scaffold out of the marker-management business.
- ★ *MMR correction (Codex P1):* original recommendation called `--profile minimal`, which is not a valid flag.

#### F-1.3 · P2 ★ · No persistent agent memory via `bd remember` (consolidated with former F-4.3)

- **Upstream:** `bd remember "text" [--key K]`, `bd recall`, `bd memories`, `bd forget` provide persistent memory injected by `bd prime`. Upstream AGENTS.md explicitly says: "Use `bd remember`; do NOT create MEMORY.md files."
- **Scaffold:** Scaffold's auto-memory system writes `~/.claude/projects/.../memory/*.md` files (see CLAUDE.md "auto memory" section). When Beads is present, this duplicates the function and contradicts upstream's prescribed pattern. No measured user-visible breakage observed.
- **Recommendation:** Treat as a design discussion (not a quick edit). Two options to explore: (a) when `.beads/` is present, route auto-memory writes through `bd remember` instead of filesystem `memory/`; (b) document the dual-system explicitly so users opting into Beads understand they have two memory layers. Run a small spike before committing to either.
- ★ *MMR corrections:* Codex/Gemini both noted this finding was over-severe (originally P1) given the speculative recommendation, and that the original F-4.3 ("auto-memory contradicts upstream") was duplicative. Downgraded to P2 and consolidated.

#### F-1.4 · P2 · No `discovered-from` dependency tracking

- **Upstream:** `bd create "…" --deps discovered-from:bd-123` is the canonical way to log work an agent finds while doing other work. Doesn't block readiness; preserves the chain.
- **Scaffold:** No reference in any pipeline or knowledge file. Agents who discover bugs while implementing a task have no instructed mechanism beyond "create a task".
- **Recommendation:** Add a section to `content/pipeline/build/quick-task.md` and `content/knowledge/execution/task-claiming-strategy.md` documenting `--deps discovered-from:<id>` for incidental discoveries.

#### F-1.5 · P2 · No `bd preflight` before PR creation

- **Upstream:** `bd preflight` is the PR-readiness checklist.
- **Scaffold:** Single-agent and multi-agent flows go from `bd close` straight to `gh pr create` with no preflight gate.
- **Recommendation:** Add `bd preflight` invocation before `gh pr create` in `single-agent-start.md`, `multi-agent-start.md`, and the resume counterparts (conditional on `.beads/`).

#### F-1.6 · P2 · No `bd doctor --fix` in the toolbox

- **Upstream:** Canonical health-check + auto-repair. Re-applies hooks, migrates schemas, validates conventions.
- **Scaffold:** No mention. The `bd hook` breakage observed at audit time is exactly what `bd doctor --fix` would resolve.
- **Recommendation:** In `content/pipeline/foundation/beads.md`, after `bd init` add `bd doctor --fix` (or `bd hooks install`). In `scripts/setup-agent-worktree.sh`, add an optional `bd hooks install` post-step if `.beads/` exists. In `/scaffold:single-agent-start` / `multi-agent-start`, recommend `bd doctor --fix` as a remediation step when `bd` commands fail.

#### F-1.7 · P2 ★ · `bd worktree` not used; scaffold runs a parallel system

- **Upstream:** `bd worktree {create,info,list,remove}` is worktree-aware across hooks/doctor/config/preflight/reset/bootstrap (v1.0.1+). It manages the Beads DB's relationship to git worktrees (shared DB resolution, hook applicability) — `bd list`/`bd ready` in v1.0.4 do **not** expose a worktree filter flag.
- **Scaffold:** `scripts/setup-agent-worktree.sh` manages worktrees independently and writes `.scaffold/identity.json`. Beads's own worktree registry is not populated.
- **Recommendation:** Evaluate whether `scripts/setup-agent-worktree.sh` should call `bd worktree create` (when `.beads/` exists) to keep Beads-side worktree awareness in sync — primary benefit is correct hook/DB resolution across linked worktrees, not query-filtering. Mark as a design discussion, not a quick fix.
- ★ *MMR correction (Codex P2):* original recommendation claimed `bd ready`/`bd list` would gain a worktree filter, which is not supported by v1.0.4 help text. Removed that claim.

#### F-1.8 · P3 · No MCP server option

- **Upstream:** `beads-mcp` (PyPI) is a 12-tool MCP server. Recommended only when CLI access is unavailable.
- **Scaffold:** No reference. Probably fine to keep this as a footnote rather than a default — upstream itself recommends CLI for shell-capable agents.
- **Recommendation:** Add a one-paragraph callout in `content/knowledge/core/task-tracking.md` explaining when `beads-mcp` is appropriate (Claude Desktop, IDEs without shell). No default install.

#### F-1.9 · P2 · `bd ready --claim --json` not surfaced for atomic claim

- **Upstream:** Atomic find-first-ready-and-claim. Returns the claimed issue as JSON.
- **Scaffold:** `single-agent-start.md` prescribes `bd ready` (no `--claim`) then implicitly trusts the agent to pick the right one. Multi-agent flows have the same gap, making race-window claims possible.
- **Recommendation:** Replace `bd ready` calls in single-agent and multi-agent start prompts with `bd ready --claim --json` (and update the pick-task logic to use the returned object).

#### F-1.10 · P3 ★ · Decision / spike / milestone issue types unused

- **Upstream:** `decision` ships as a built-in `bd create -t` type as of v0.62.0. `spike`, `story`, `milestone` exist as IssueType constants (v1.0.0) but at the CLI level **require `types.custom` config** to be usable via `bd create -t`. Per `bd create --help` in v1.0.4: *"Issue type (bug|feature|task|epic|chore|decision); custom types require types.custom config."*
- **Scaffold:** Templates only invoke `task` / `bug` / `feature` (and `US-XXX:` prefix for user stories). No use of `story`, `decision`, or `milestone`.
- **Recommendation:** Two phases:
  1. **Built-in only (quick win):** In `new-enhancement.md` and decision-logging flows, use `bd create -t decision` where appropriate — no config needed.
  2. **Custom types (opt-in):** For `story` / `milestone` usage, the `/scaffold:beads` step needs to optionally configure `types.custom: [story, milestone, spike]` via `bd config set` after `bd init`, *then* downstream prompts can use `-t story` / `-t milestone`. Make this opt-in, not default.
- ★ *MMR correction (Codex P2):* original recommendation prescribed `-t story` / `-t milestone` directly without the custom-types prerequisite, which would fail on a default install.

### Bucket 2 — Stale assumptions

#### F-2.1 · P1 ★ · `bd sync` is not a real command

- **Upstream:** No `sync` top-level command in v1.0.4. Closest matches: `bd dolt push` for direct DB sync, `bd <tracker> sync` for GH/Linear/Jira/etc.
- **Scaffold (pipeline — original scope):**
  - `content/pipeline/build/single-agent-start.md:107`
  - `content/pipeline/build/single-agent-resume.md:101,190`
  - `content/pipeline/build/multi-agent-start.md:125,213`
  - `content/pipeline/build/multi-agent-resume.md:118,222`
- **Scaffold (additional non-pipeline references discovered post-MMR):**
  - `docs/v2/domain-models/04-abstract-task-verbs.md:787,1298,1335` — the `sync` verb abstraction templates `bd sync` directly
  - `docs/v2/domain-models/12-mixin-injection.md:1140,1513,1621`
  - `docs/architecture/data/secondary-formats.md:708,716,724`
  - *(historical, lower priority)* `docs/superpowers/specs/2026-04-02-beads-contributor-surface-cleanup-design.md:77`, `docs/superpowers/specs/2026-03-12-scaffold-v2-modular-cross-platform-design.md:107`
- **Recommendation:** Replace every `bd close <id> && bd sync` with `bd close <id>` in pipeline files (Dolt auto-commits; configure `dolt.auto-push=true` if remote push is desired). Replace standalone `bd sync` in conflict-detection paragraphs with `git pull` + `bd doctor --fix` (or `bd dolt pull` if Dolt remotes configured). For the v2 domain-model docs, update the `sync` verb template — if these docs are still authoritative, the template needs a real verb (likely `bd dolt push` or a no-op). For historical specs in `docs/superpowers/specs/`, leave as-is (historical record) but add a note that `bd sync` is non-existent.
- ★ *MMR correction (Codex P1):* original scope listed only pipeline files; v2 domain-model docs and architecture/data docs also reference `bd sync` and would have been left stale.

#### F-2.2 · P1 · `bd start` and `bd claim` don't exist as standalone commands

- **Upstream:** Atomic claim is `bd update <id> --claim`. Find-and-claim is `bd ready --claim`.
- **Scaffold:**
  - `content/knowledge/core/task-tracking.md:82` — `bd start BD-xxx`
  - `content/knowledge/core/task-tracking.md:111` — `bd start BD-xxx`
  - `content/knowledge/execution/task-claiming-strategy.md` — uses `bd claim` in algorithm pseudocode
- **Recommendation:** Replace with `bd update <id> --claim` (atomic). Update `task-claiming-strategy.md` to recommend `bd ready --claim --json` for first-available.

#### F-2.3 · P1 · `bd status BD-xxx` is not a per-issue query

- **Upstream:** `bd status` shows database overview (counts by status). Per-issue inspection is `bd show <id>` (full) or `bd state <id>` (state dimension only).
- **Scaffold:** `content/knowledge/core/task-tracking.md:81` lists `bd status BD-xxx | Check task state | Before picking up work`.
- **Recommendation:** Replace with `bd show <id>` in the command table.

#### F-2.4 · P1 · Task status vocabulary mismatch

- **Upstream:** `open, in_progress, blocked, deferred, closed, pinned, hooked`. Status *categories*: `active, wip, done, frozen`.
- **Scaffold:** `task-tracking.md:37-50` documents `ready → in-progress → review → done` + `blocked`. Three of those five are not upstream statuses (`ready` is a query, `review` and `done` don't exist; `in-progress` is hyphenated upstream is underscored).
- **Recommendation:** Update the state-machine doc to the upstream enum. If scaffold genuinely wants a `review` state, document it as a custom status (upstream supports up to 50 custom via `custom_statuses(name, category)`).

#### F-2.5 · P2 · `BD_ACTOR` env var is deprecated

- **Upstream:** `BEADS_ACTOR` is canonical; `BD_ACTOR` is a deprecated alias.
- **Scaffold:**
  - `content/pipeline/environment/git-workflow.md:41`
  - `content/pipeline/build/multi-agent-start.md:93`
  - `content/pipeline/build/multi-agent-resume.md:88`
  - `content/knowledge/execution/worktree-management.md:182-187` (canonical block)
- **Recommendation:** Rename to `BEADS_ACTOR` throughout. Mention the legacy `BD_ACTOR` alias in `worktree-management.md` for users on older Beads.

#### F-2.6 · P3 · Priority scale is 0–4 (not 0–3)

- **Upstream:** Priority `0` (critical) – `4` (backlog). Default `2`.
- **Scaffold:** `quick-task.md:155-159` documents `P0..P3` only.
- **Recommendation:** Add `P4 — Backlog / future-consideration` to the table.

#### F-2.7 · P3 · ID format example is inaccurate

- **Upstream:** Default IDs are hash-based, lowercase: `bd-a1b2`. Prefix is configurable; capitalization is not.
- **Scaffold:** Examples show `BD-42`, `BD-12`, `BD-13`. Looks like integer-incrementing.
- **Recommendation:** Update examples to `bd-a1b2` style. Note the prefix-customization knob.

#### F-2.8 · P2 ★ · `bd list --actor` is the wrong filter flag

- **Upstream (verified post-MMR via `bd list --help`):** `bd list` filter for who owns a task is `-a, --assignee string`. `--actor` is a global audit-trail flag, not a list filter.
- **Scaffold:** `content/pipeline/build/multi-agent-resume.md:117` — `bd list --actor $ARGUMENTS`.
- **Recommendation:** Replace with `bd list --assignee $ARGUMENTS`.
- ★ *MMR correction (Gemini P3):* original finding was marked unverified; `--assignee` is confirmed correct.

#### F-2.9 · P3 · `bd init --quiet` flag unverified

- **Upstream:** v1.0.4 has `--non-interactive` for headless init. `--quiet` is a `bd` global flag (`-q, --quiet`) for error-only output, not init-specific. Behavior together untested.
- **Scaffold:** `docs/prd-v1.md` (archived) references `bd init --quiet`. Active pipeline does not.
- **Recommendation:** Low priority. If a future revision wants headless init, use `--non-interactive` (or set `BD_NON_INTERACTIVE=1`).

### Bucket 3 — Underused features

(See Bucket 1; the boundary between "missing" and "underused" is fuzzy. Calling out two specifically here that scaffold *installs* but doesn't *use*:)

#### F-3.1 · P2 · `.beads/` is installed but command surface is shallow

- The `/scaffold:beads` step installs `.beads/` with the full Dolt-backed feature set, but scaffold only uses `create`, `list`, `ready`, `close`, `dep`. The upstream surface includes `query` (filter expressions), `batch` (atomic multi-op), `gate` (async coordination), `merge-slot` (serialized merge), `molecule` / `swarm` (multi-agent templates) — all relevant to scaffold's multi-agent workflows.
- **Recommendation:** Spike on integrating `bd gate` / `bd merge-slot` into `multi-agent-start.md` for serialized merges; integrate `bd swarm` for parallel-agent orchestration. Treat as a follow-up exploration, not a quick task.

#### F-3.2 · P3 · `bd backup` not surfaced

- Upstream supports `bd backup init <path|dolthub://|gs://|s3://|az://>` for off-site backup, with `bd backup sync` and `bd backup restore`. Scaffold scaffolds projects that may want this for solo-dev or production usage; never mentioned.
- **Recommendation:** Document in `content/knowledge/core/task-tracking.md` as a one-line "production option".

### Bucket 4 — Misalignment with scaffold's own workflows

#### F-4.1 · P1 · MMR / review channels don't link findings to Beads

- MMR produces findings (location, severity, category). These could be filed as `bd create -t bug` with `--external-ref` and `--deps discovered-from:<source-bd-id>`, giving downstream projects an automatic feedback loop where review findings become tracked issues. Currently they live only in JSON sidecars and the dashboard.
- **Recommendation:** Add a (opt-in via `.mmr.yaml`) MMR post-step that creates `bd` issues from blocking findings when `.beads/` exists. Probably a `content/tools/review-pr.md` Step 8 add.

#### F-4.2 · P2 ★ · Observability ledger and Beads are siloed

- `scaffold observe event …` writes a JSONL ledger of build-workflow events. Beads stores its own audit trail of issue-state changes. There's no cross-linking — a ledger event for "task-claimed" doesn't reference the `bd-<id>`, and Beads's `external_ref` / metadata fields aren't populated with the ledger event ID.
- **Recommendation:** Standardize a metadata key (`ledger_event_id`) and write it via `bd update <id> --set-metadata ledger_event_id=<uuid>` (the metadata-setting flag lives on `bd update`, not `bd close`). The flow per claim/close is: (1) `bd update <id> --set-metadata ledger_event_id=<event-id> --claim` to atomically claim AND record the link; (2) before `bd close`, run `bd update <id> --set-metadata close_event_id=<event-id>`; (3) then `bd close <id> --reason "…"`. Surface `bd-<id>` in the corresponding ledger event payload. Low-cost change, high-value debugging.
- ★ *MMR correction (Codex P2):* original recommendation suggested `--set-metadata` on `bd close`, which has no such flag. Rewritten to use `bd update` for metadata side effects.

#### F-4.3 · ★ Merged into F-1.3

*This finding was a duplicate of F-1.3 (auto-memory ↔ `bd remember` integration). MMR (Gemini P2) flagged the redundancy; both have been consolidated into F-1.3 above. Kept as a placeholder for stable F-ID references.*

#### F-4.4 · P3 · Worktree teardown doesn't sync Beads state

- `scripts/teardown-agent-worktree.sh` harvests the build-observability ledger but doesn't push Beads commits, run `bd dolt push`, or run `bd doctor`.
- **Recommendation:** Add an optional `bd dolt push` / `bd doctor --fix` step when tearing down a worktree (conditional on `.beads/` existing).

### Bucket 5 — Version drift risk

#### F-5.1 · P1 · No installed-version check anywhere

- **Upstream:** `bd --version` exists; v1.0.4 vs the v0.6x-era CLI scaffold appears to target are very different surfaces.
- **Scaffold:** The observability adapter does run `bd --version` (`src/observability/adapters/beads.ts:27`) for *availability* probing — but it doesn't parse the version or warn on too-old/too-new. The `/scaffold:beads` pipeline doesn't check version at all.
- **Recommendation:** Add a min-version check (e.g., `>=1.0.0`) in `content/pipeline/foundation/beads.md` and in `src/observability/adapters/beads.ts` (downgrade to `degraded` if too old). Surface a one-line recommendation to upgrade.

#### F-5.2 · P2 · Install instructions are stale (npm package name correct, Homebrew correct, but no install-script option)

- **Upstream:** v1.0.4 docs recommend the install script first; Homebrew second; npm/`go install`/Nix/winget all supported.
- **Scaffold:** `content/tools/prompt-pipeline.md:30` documents only `npm install -g @beads/bd` or `brew install beads`.
- **Recommendation:** Either include the install script (`curl … install.sh | bash`) as another option, or leave it but link to upstream README. Low-stakes.

#### F-5.3 · P2 · Auto-export will silently break on upgrade

- **Upstream `[Unreleased]`:** `export.auto` flips to opt-in. New `bd init` won't auto-export. `.beads/issues.jsonl` won't be regenerated.
- **Scaffold:** `content/tools/release.md` and `content/tools/version-bump.md` parse `.beads/issues.jsonl` as a fallback when `bd list` fails.
- **Recommendation:** In `content/pipeline/foundation/beads.md`, after `bd init` run `bd config set export.auto true` and `bd config set export.git-add true` explicitly. Drop the JSONL-parsing fallback in `release.md`/`version-bump.md` in favor of `bd list --status closed --json`.

#### F-5.4 · P2 · `bd init --force` deprecated — scaffold doesn't pin against the deprecation

- Scaffold doesn't currently use `--force`, but it doesn't gate on the new `--reinit-local` / `--discard-remote` / `--destroy-token` flags either. If a future re-init scenario emerges, scaffold has no guidance.
- **Recommendation:** Add a paragraph in `content/pipeline/foundation/beads.md` on safe re-init (call out `--reinit-local`, the destroy-token format, and exit codes 10/11/12).

#### F-5.5 · P2 ★ · Local hooks are half-migrated (evidence supporting F-1.6)

- **Observed:** `/Users/kenallred/Developer/scaffold/.git/hooks/post-checkout:23` and `post-merge:24` use `exec bd hook <name>` (singular, no `run`). `prepare-commit-msg:24` uses correct `exec bd hooks run prepare-commit-msg`. The legacy two will continue to fail until regenerated.
- **Recommendation:** Folded into F-1.6 — the `bd doctor --fix` / `bd hooks install` remediation step that scaffold should add. This finding stands as observed-in-the-wild evidence motivating that step, not a separate action.
- ★ *MMR correction (Codex P2):* original P1 severity overstated scaffold risk (this is a user-machine artifact, not a scaffold-shipped bug). Downgraded to P2 and re-scoped as supporting evidence for F-1.6.

---

## Recommended Next Actions (prioritized)

Each item is scoped to be a single PR (or `/scaffold:quick-task`).

### P1 — fix-on-sight

1. **(F-2.1) Remove `bd sync` everywhere.** Edit across 4 pipeline files + 3 v2 domain-model docs + `docs/architecture/data/secondary-formats.md`. Replace `bd close <id> && bd sync` with `bd close <id>`; replace conflict-detection `bd sync` paragraphs with `git pull` + `bd doctor --fix` guidance; fix the `sync` verb template in `docs/v2/domain-models/04-abstract-task-verbs.md`. 1 PR, ~25 line changes.
2. **(F-2.2, F-2.3) Fix `bd start` / `bd claim` / `bd status BD-xxx`.** Edit `content/knowledge/core/task-tracking.md` and `content/knowledge/execution/task-claiming-strategy.md` to use `bd update <id> --claim`, `bd ready --claim`, and `bd show <id>`. 1 PR.
3. **(F-2.4) Align status vocabulary.** Update `task-tracking.md` state machine to upstream enum (`open, in_progress, blocked, deferred, closed`) + note status categories. 1 PR.
4. **(F-2.5) Rename `BD_ACTOR` → `BEADS_ACTOR`.** Search-and-replace in 4 files; add a one-line back-compat note. 1 PR.
5. **(F-1.6, F-5.5) Add `bd doctor --fix` / `bd hooks install` remediation step.** Edit `content/pipeline/foundation/beads.md` to run `bd doctor --fix` after `bd init`. Add the same to `setup-agent-worktree.sh` (conditional on `.beads/`). Add a CLAUDE.md callout. 1 PR.
6. **(F-5.1) Min-version check.** Edit `src/observability/adapters/beads.ts` to parse `bd --version` and degrade if `<1.0.0`. Add note in `content/pipeline/foundation/beads.md`. 1 PR with tests.

### P2 — high-value additive

7. **(F-1.1, F-1.2) Adopt `bd prime` + `bd setup claude`.** Rewrite `content/pipeline/foundation/beads.md` to use upstream's recipe system (`bd setup claude` — the `claude` recipe defaults to a minimal profile; there is no `--profile` flag) instead of hand-rolled CLAUDE.md edits. Largest single change in this list — probably its own scoping conversation. 1 design+PR.
7b. **(F-1.3, formerly F-4.3) Spike: auto-memory ↔ `bd remember`.** Downgraded from P1 — recommendation is speculative. Time-box a small spike: prototype routing `~/.claude/projects/.../memory/*.md` writes to `bd remember` when `.beads/` exists, and decide whether to ship the integration, document the dual system, or do nothing.
8. **(F-1.9) Switch to atomic `bd ready --claim --json`.** Edit single-agent and multi-agent start prompts. 1 PR.
9. **(F-5.3) Make export.auto explicit.** Add `bd config set export.auto true` + `git-add true` after `bd init`. Optionally replace JSONL-parsing fallback with `bd list --status closed --json`. 1 PR.
10. **(F-1.4, F-1.5) Add `discovered-from` and `bd preflight`.** Two small additions to `quick-task.md` and the start/resume prompts. 1 PR.
11. **(F-4.1) MMR → Beads bridge.** Opt-in post-step in `content/tools/review-pr.md` that creates `bd` issues from blocking findings. 1 PR with `.mmr.yaml` schema bump.
12. **(F-4.2) Cross-link observability ledger and Beads.** Standardize on `ledger_event_id` metadata key + emit `bd-<id>` in ledger events. 1 PR.

### P3 — nice-to-have

13. **(F-2.6, F-2.7) Priority + ID-format doc fixes.** Trivial edits.
14. **(F-1.10) Use richer issue types** (`story`, `decision`, `milestone`) in PRD/user-story pipeline.
15. **(F-3.2) Mention `bd backup`** in `task-tracking.md`.
16. **(F-1.8) MCP-server callout** in `task-tracking.md`.
17. **(F-5.2) Add install-script as third install option** in `prompt-pipeline.md`.
18. **(F-2.8) Verify `bd list --actor` vs `--assignee`** in `multi-agent-resume.md`. *(needs upstream CLI run to confirm)*

### Design discussions (not single PRs)

- **(F-1.3, formerly F-4.3) Auto-memory ↔ `bd remember` integration.** Architectural — affects how scaffold's user-level memory system interacts with project-level Beads. *(Now P2; see item 7b for the recommended spike.)*
- **(F-1.7) `bd worktree` vs scaffold's worktree script.** Decide whether `setup-agent-worktree.sh` should call `bd worktree create` when `.beads/` exists, for correct Beads-side hook/DB resolution. (No filter-flag benefit; corrected post-MMR.)
- **(F-3.1) `bd gate`, `bd merge-slot`, `bd swarm`, `bd molecule`.** Whether to integrate any of these into multi-agent flows.
- **(F-1.10 phase 2) Custom-types config (`types.custom: [story, milestone, spike]`).** Decide whether `/scaffold:beads` should opt into custom types by default, leave to user, or document as an enhancement step.

---

## Caveats / Unverifieds

- `bd list --actor` semantics (F-2.8) was inferred from the global-flag vs list-filter mismatch in upstream help text. Not confirmed against a live DB. **(unverified)**
- `bd init --quiet` (F-2.9) compatibility with current CLI not run live. **(unverified)**
- Whether scaffold's auto-memory should *fully* be replaced by `bd remember` (F-1.3) is a product judgment call — flagged but not asserted.
- The cumulative integration estimate ("downstream projects use ~30% of current Beads") is a rough estimate from feature-counting, not a measured stat.
- I read the cloned upstream at depth 50 and did not inspect every release between v0.62.0 and v1.0.0 in detail — for older-version drift questions, additional checking against the upstream CHANGELOG (304KB) is warranted.

---

**Report path:** `/Users/kenallred/Developer/scaffold-beads-audit/docs/audits/beads-integration-audit-2026-05-24.md`
**Worktree:** `/Users/kenallred/Developer/scaffold-beads-audit` (branch `beads-audit-workspace`)
