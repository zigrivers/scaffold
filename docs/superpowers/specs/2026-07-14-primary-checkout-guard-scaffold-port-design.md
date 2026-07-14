# Design — Port the primary-checkout write-guard into Scaffold

- **Date:** 2026-07-14
- **Status:** Approved design, pre-implementation
- **Repo:** `zigrivers-scaffold`
- **Upstream reference:** nibble `docs/superpowers/specs/2026-07-14-primary-checkout-write-guard-design.md`
  (PR zigrivers/nibble#1714, branch `agent/primary-checkout-write-guard`)

## 1. Problem

Multi-agent projects Scaffold generates have a gap: nothing stops an agent — or a
regen script an agent runs — from writing a **tracked file into the primary
checkout**. Git hooks cannot catch it, because a file write is not a git
operation (the existing commit/push-time guards never fire). The stray
regenerated file then sits in the primary checkout and blocks the next agent's
`main-sync` fast-forward.

This was found and fixed downstream in nibble. We port the **principle**
(generalized, not nibble's literal paths) up into the Scaffold templates so every
generated multi-agent project ships the guardrail from day one. The guard is a
no-op when there are no linked worktrees, so single-agent projects are unaffected
and multi-agent projects get real protection.

## 2. Where it lives — and why bundle-backed

The natural conceptual home is the `/scaffold:git-workflow` step
(`content/pipeline/environment/git-workflow.md`), which owns the parallel-agent
worktree model. But that step does **not** hand-author its scripts — it installs
them via `scaffold agent-ops install --component git`, and `scaffold agent-ops
check` drift-checks each installed script's on-disk hash against
`.scaffold/agent-ops-manifest.json` (`src/core/agent-ops/install.ts`).

Decisive consequence: if the step told the generating agent to **hand-edit the
installed `main-sync.sh`** to add the self-heal call, that project's own
`agent-ops check` drift gate would report `scripts/main-sync.sh` as `modified`
and fail permanently. So the self-heal wiring must live in the **template**
(`content/assets/agent-ops/git/main-sync.sh.tmpl`), not in a meta-prompt
instruction to edit the installed file.

Therefore the guard and the heal ride in the **agent-ops git-component bundle**
(installed, manifest-tracked, drift-clean, tested in the existing harness), and
the git-workflow step **documents** them. Chosen over instructions-only (which
relies on an agent faithfully re-authoring ~150 lines each generation and trips
the drift gate on the `main-sync` edit).

## 3. What ships

### 3.1 New git-component script: `scripts/primary-checkout-guard.sh`

Template: `content/assets/agent-ops/git/primary-checkout-guard.sh.tmpl` →
installs to `scripts/primary-checkout-guard.sh` (executable), manifest-tracked.

Flat `scripts/` (not nibble's `scripts/lib/`) — Scaffold's git-component scripts
all live flat in `scripts/`; there is no `scripts/lib/` convention, and the bats
harness resolves every `*.sh.tmpl` flat into `scripts/`.

**Dual-use bash helper.** Bash generators `source` it and call the function;
non-bash generators (Python/TS/…) shell out to it as a subprocess before writing:

```bash
# bash generator:
. "$(dirname "$0")/primary-checkout-guard.sh"
guard_primary_checkout "$OUTPUT" "the API docs"

# any-language generator: run it, abort on non-zero exit
scripts/primary-checkout-guard.sh "$OUTPUT" "the API docs"
```

**Detection algorithm** (identical to the shell protected-branch guard's
primary-detection and to nibble's; git-based, language-independent):

```
dir        := nearest existing ancestor dir of the OUTPUT path (its checkout)
git_dir    := `git -C dir rev-parse --git-dir`         (resolved absolute, symlink-free)
common_dir := `git -C dir rev-parse --git-common-dir`  (resolved the same way)
is_primary := (git_dir == common_dir)          # a linked worktree's git_dir differs
worktrees  := count of `worktree ` lines in `git -C dir worktree list --porcelain`

REFUSE (exit 1) iff  is_primary AND worktrees > 1
otherwise return 0 (no-op)
```

- **No-op** for standalone clones (`worktrees == 1`) and any run from a linked
  worktree (`is_primary` false).
- **Fail open** (return 0) when not in a git repo / git unavailable — the guard
  never breaks a generator run outside a repo (tests, tarball extraction).
- **Source-safe:** no top-level `set -euo pipefail` (would leak into the caller's
  shell). Strict mode is applied only on the direct-execution path.
- On REFUSE, print the rescue message to **stderr** and exit non-zero. Because
  `guard_primary_checkout` calls `exit 1`, a sourced generator aborts before it
  writes — the intended behavior.
- **Bypass:** `AGENT_OPS_GIT_GUARD_BYPASS=1` (human emergency only). Single
  kit-scoped override. The task's `<PROJECT>_GIT_GUARD_BYPASS` example and its
  "reuse the project's protected-branch-guard var" instruction resolve to this:
  Scaffold's bundle ships no protected-branch guard, so there is no existing var
  to reuse; a stable kit-scoped name is the single documented override, and any
  future bundle guard should share it.

**Rescue message** (generalized to Scaffold's actual worktree command; `.worktrees/<name>`):

```
✗ Blocked: refusing to regenerate <what> into the primary checkout.
  <OUTPUT> lives in the primary checkout, which has N linked worktree(s) —
  generated files belong in a worktree, never the primary checkout
  (docs/git-workflow.md — primary-checkout invariant):
    1. scripts/setup-agent-worktree.sh <name> --install --task "<goal>"
    2. cd .worktrees/<name>/ && re-run this generator there
    3. commit + push there, then open a PR.
  Standalone clone with no worktrees? This guard is a no-op — you won't see this.
  (Human emergency only: AGENT_OPS_GIT_GUARD_BYPASS=1 to override.)
```

### 3.2 New git-component script: `scripts/heal-regen-artifacts.sh`

Template: `content/assets/agent-ops/git/heal-regen-artifacts.sh.tmpl` → installs
to `scripts/heal-regen-artifacts.sh` (executable), manifest-tracked.

`Usage: heal-regen-artifacts.sh <checkout-path>`. For each file in the checkout
that is **modified only in the working tree** (porcelain `" M"` — tracked,
unstaged), restore it to HEAD **iff its entire working-tree diff is a
timestamp-only change** — i.e. the file is byte-identical to HEAD except inside
`Generated [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC` footers.

**The gate is normalize-and-compare, not a per-line substring match** (hardened
after MMR review — a substring match would treat a line carrying real content
*plus* a timestamp, e.g. `<div>Updated Generated … UTC v2</div>`, as
timestamp-only and `git restore` over the real edit). The script collects the
removed (`-`) and added (`+`) diff lines, masks every timestamp to a constant
token, and restores **only when the masked removed text equals the masked added
text**. Any non-timestamp difference — a prefix, a suffix, or another changed
line — makes the two differ, so the file is left untouched. This is safe against
real edits on a timestamped line yet still heals realistic **embedded** footers
(`<footer>Generated … UTC</footer>`), which a full-line anchor would miss.

Robustness (also from review): read `git status --porcelain=v1 -z --no-renames`
(NUL-delimited, never-quoted paths — non-ASCII names, spaces, and newlines
survive; `${line:3}` on quoted porcelain output would otherwise no-op), and pass
`--no-color` to `git diff` so a user's `color.diff=always` cannot inject ANSI.

Generalization from nibble: drop nibble's `docs/`-only path narrowing and scan
all modified tracked files. In a generic Scaffold project, generated files are
not confined to one directory; the normalize-and-compare gate is the protection,
and a non-timestamped change can never satisfy it.

**Safety invariants (load-bearing):**
- Restore **only** when the removed and added diff text are identical after every
  timestamp is masked (byte-exact-except-timestamps).
- **Never** `git clean`, never delete untracked files, never touch staged content
  (any staged/added/deleted status is skipped), never restore a file with any
  non-timestamp change.
- Idempotent: a clean tree is a no-op, exit 0.
- Log each heal: `→ auto-healed stray regen artifact (timestamp-only): <path>`.

### 3.3 `main-sync.sh.tmpl` calls the heal

Edit `content/assets/agent-ops/git/main-sync.sh.tmpl`: after `$main_wt` (the
checkout holding the default branch) is resolved and **before** the
`rev-list` / `merge --ff-only` block, call the heal best-effort:

```bash
# Best-effort: auto-restore timestamp-only regenerated artifacts a stray generator
# left in the checkout that holds the default branch, so they never block the
# ff-only merge. Strictly timestamp-signature-only; never touches real content or
# untracked files. A hiccup here must never fail the sync (|| true).
heal="$(dirname "$0")/heal-regen-artifacts.sh"
[ -x "$heal" ] && "$heal" "$main_wt" || true
```

`|| true` mirrors the best-effort convention. On a clean tree the heal is a no-op,
so existing `main-sync` tests are unaffected.

### 3.4 Installer wiring — `src/core/agent-ops/install.ts`

Add two entries to `AGENT_OPS_FILE_MAP`:

```ts
'git/primary-checkout-guard.sh.tmpl': { dest: 'scripts/primary-checkout-guard.sh', component: 'git', executable: true },
'git/heal-regen-artifacts.sh.tmpl':   { dest: 'scripts/heal-regen-artifacts.sh',   component: 'git', executable: true },
```

Both install with the `git` component (depth 3+, mvp and deep), matching the
existing worktree scripts. No new depth logic. `install.ts` already creates parent
dirs, chmods executables, records manifest hashes, and advances the version
marker on a clean install — the new files inherit all of it.

### 3.5 Meta-prompt — `content/pipeline/environment/git-workflow.md`

1. **Install list** (Instructions → "Install the agent-ops git component"): add
   `scripts/primary-checkout-guard.sh` and `scripts/heal-regen-artifacts.sh` to
   the enumerated list of what the git component installs.
2. **New Instructions subsection** "Guardrail: keep generated files out of the
   primary checkout": the git component now ships the write-guard and the
   `main-sync` self-heal; **the rule** — every generator whose default output is a
   tracked repo path must call the guard immediately before writing (bash: source
   it and call `guard_primary_checkout`; other languages: run it as a subprocess
   and abort on non-zero, or reimplement the detection), enforced in the code that
   writes, not only a wrapper; the bypass env var; a note that it is a no-op for
   standalone clones so single-agent projects are unaffected.
3. **Generated `docs/git-workflow.md`** (section 9, primary-checkout invariant):
   add the one-line rule — "Any script that regenerates a tracked file must call
   the primary-checkout write-guard (`scripts/primary-checkout-guard.sh`);
   regenerate from a worktree, never the primary checkout." — cross-referencing
   the primary-checkout invariant.
4. **Update Mode "Preserve" list**: name `scripts/primary-checkout-guard.sh` and
   `scripts/heal-regen-artifacts.sh` so re-running the step never clobbers a
   project's guard customizations (the installer already refuses to overwrite
   locally modified files without `--force`; naming them makes the intent
   explicit).

## 4. Testing plan (TDD, existing harness)

Write tests first; each must fail before the code exists.

1. **`tests/agent-ops-git-scripts.bats`** (templates auto-resolve flat into
   `scripts/` via the existing `setup()` loop — no harness change):
   - guard: primary checkout **with** a linked worktree → exit 1 + rescue text on
     stderr.
   - guard: standalone clone (no worktrees) → exit 0, silent.
   - guard: run **from** a linked worktree → exit 0.
   - guard: `AGENT_OPS_GIT_GUARD_BYPASS=1` in the primary-with-worktrees case →
     exit 0.
   - guard: outside a git repo → exit 0 (fail-open).
   - heal: timestamp-only change → restored, tree clean, heal logged.
   - heal: real content change → left untouched.
   - heal: mixed (one timestamp-only + one real) → only the timestamp-only
     restored.
   - heal: clean tree → no-op, exit 0.
   - heal: never restores a staged change (staged status skipped).
   - heal (data-loss guards, added after review): a non-timestamp change on a
     line that *also* carries a timestamp → **not** restored; real content
     appended beside the timestamp → **not** restored; an embedded-footer
     timestamp-only change (`<footer>Generated … UTC</footer>`) → restored.
   - heal (path robustness): a git-quoted non-ASCII path (`café.html`) is parsed
     from the NUL-delimited status and healed.
   - main-sync integration: a stray timestamp-only tracked change in the checkout
     holding the default branch is healed before the ff-only merge (proves
     `main-sync.sh` calls the heal).
2. **`src/core/agent-ops/install.test.ts`**: the git-component install test
   asserts both new dests install, are executable, and land in the manifest;
   `checkAgentOps().upToDate === true` already covers all manifest files.
3. **Meta-prompt content test** (new `tests/git-workflow-guardrail-content.bats`,
   modeled on `tests/beads-pipeline-content.bats`): assert
   `content/pipeline/environment/git-workflow.md` contains the Guardrail
   subsection heading, the generator-must-call-the-guard rule, and the
   `primary-checkout-guard.sh` reference.

Run: `make check-all` (bash gates + TypeScript). Visual/dashboard harness is
untouched.

## 5. Files touched

- **New:** `content/assets/agent-ops/git/primary-checkout-guard.sh.tmpl`,
  `content/assets/agent-ops/git/heal-regen-artifacts.sh.tmpl`,
  `tests/git-workflow-guardrail-content.bats`, this spec.
- **Edit:** `content/assets/agent-ops/git/main-sync.sh.tmpl`,
  `src/core/agent-ops/install.ts`, `src/core/agent-ops/install.test.ts`,
  `tests/agent-ops-git-scripts.bats`,
  `content/pipeline/environment/git-workflow.md`.

## 6. Risks & mitigations

- *Auto-heal too aggressive* → strict timestamp-only signature; only ever
  `git restore` tracked, unstaged files; never touches untracked or real edits.
  Covered by tests.
- *Guard false-positive blocks a legit run* → no-op unless primary **and** >1
  worktree; standalone clones/CI unaffected; documented bypass exists.
- *Sourced guard leaking shell options* → no top-level `set -e`; strict mode only
  on the direct-execution path.
- *Drift on the `main-sync` edit* → avoided by construction: the heal call lives
  in the template, so the installed hash matches the manifest.
