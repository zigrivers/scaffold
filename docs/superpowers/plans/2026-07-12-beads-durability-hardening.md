# Beads Durability Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every gap identified in the 2026-07-12 Beads durability analysis: port nibble's post-wipe protections into Scaffold's generated content, add hard enforcement against database-destroying commands, adopt upstream v1.1.0 safety features (`bd backup`, init-safety flags, migration protocol), unify the bd version floor at 1.1.0, and fix documentation inconsistencies and stale URLs.

**Architecture:** Almost all changes are to *content* Scaffold generates into downstream projects (pipeline meta-prompts, knowledge entries, the work-beads skill, agent-ops shell templates) plus two small TypeScript touches (agent-ops file map, beads adapter version floor). One new shell template (`bd-guard.sh`) becomes a Claude Code PreToolUse hook in generated projects. Content changes are guarded by grep-based bats tests (the repo's established pattern); shell templates by sandbox bats tests; TS by vitest.

**Tech Stack:** Bash (templates + bats-core tests), TypeScript (vitest), markdown meta-prompts. Quality gates: `make check-all`.

## Global Constraints

- **bd version floor is 1.1.0 everywhere** after this plan (was: adapter ≥1.0.0, pipeline ≥1.0.5, skill unchecked). Rationale: v1.0.5 was a git tag only (never a public release); the `bd dolt commit/push` durability runbook requires ≥1.1.0; brew/npm deliver ≥1.1.0.
- **This repo does NOT use Beads for its own tracking** (AGENTS.md:3–4). Never run `bd init`/`bd backup init`/any state-creating `bd` command inside `/Users/kenallred/Developer/scaffold`. Verify bd behavior only in throwaway temp dirs (`mktemp -d`) or bats sandboxes. Read-only commands (`bd version`, `bd backup --help`) are fine anywhere.
- **The locally installed `bd` is 1.1.0 (Homebrew)** — use it to verify every command surface you write into content (`bd <sub> --help`). Do not invent flags.
- **Preserve Mode Detection + Update Mode Specifics blocks** in every pipeline prompt you edit (`content/pipeline/**`). They stay positioned after the opening sections, before/at the end per existing layout. Never delete or reorder them.
- **D7 stays binding:** bead IDs only in commit/PR bodies as `Closes <id>`, never branch names or commit subjects.
- **work-beads skill:** the canonical source is `content/agent-skills/work-beads/SKILL.md`. After editing it, regenerate fan-out with `npm run gen:skills` and verify with `make agent-skills-check`. Commit canonical + generated files together. Keep the `<!-- lean:start -->`/`<!-- lean:end -->` region intact (edits in this plan are all OUTSIDE the lean region).
- **agent-ops bundle:** adding a template requires an `AGENT_OPS_FILE_MAP` entry in `src/core/agent-ops/install.ts`. The manifest version advances automatically from the package version — no manual bump.
- **Error-text-no-echo rule:** any guard/refusal message must NOT contain the destructive command it blocked (upstream lesson: an agent wiped 247 issues by copying `bd init --force` out of an error message). Tests assert this.
- **Commits:** one commit per task minimum, Conventional Commits, never `--no-verify` on commit. (`git push --no-verify` is allowed only at ship time after a green `make check-all` on the pushed commit, per CLAUDE.md.)
- Run `make lint` (ShellCheck) after any shell change; resolved templates must pass ShellCheck.

## Background you need (2 minutes)

The incident driving this plan: in a sibling project (nibble), an agent ran `bd bootstrap` on a checkout with a populated `.beads/` database. Bootstrap is for fresh clones — it *replaced* the local DB with the stale shared Dolt remote (`refs/dolt/data`), silently wiping ~50 beads that bd's ~15-minute auto-push hadn't sent yet. Upstream Beads v1.0.4–v1.1.0 added native guards for `bd init` (destroy tokens, refusal exit codes 10/11/12) and real backups (`bd backup`), but **`bd bootstrap` on a populated DB is still unguarded upstream** — our content and the new guard script are the only protection.

---

### Task 1: `bd-guard.sh` template — hard guard against database-destroying commands

**Files:**
- Create: `content/assets/agent-ops/git/bd-guard.sh.tmpl`
- Modify: `src/core/agent-ops/install.ts:29` (add map entry after the `beads-snapshot` line)
- Modify: `src/core/agent-ops/install.test.ts` (extend expectations)
- Test: `tests/agent-ops-git-scripts.bats` (append tests)

**Interfaces:**
- Produces: `scripts/bd-guard.sh` in generated projects — dual-mode: Claude Code PreToolUse hook (JSON on stdin; exit 0 allow / exit 2 block) and `bd-guard.sh --check "<command>"` CLI mode with the same exit semantics. Task 4 documents it; Task 5 registers it as a hook. The override env var is `BEADS_DESTRUCTIVE_OK=1`.

- [ ] **Step 1: Write the failing bats tests**

Append to `tests/agent-ops-git-scripts.bats` (the file's `setup()` already resolves every `git/*.sh.tmpl` into `$CLONE_DIR/scripts/` and stubs `bd`):

```bash
@test "bd-guard: blocks bd bootstrap when the DB is populated (and never echoes the command)" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd bootstrap'"
    [ "$status" -eq 2 ]
    [[ "$output" == *BLOCKED* ]]
    # error-text-no-echo: the refusal must not contain the blocked command itself
    [[ "$output" != *"bd bootstrap"* ]]
}

@test "bd-guard: blocks destructive bd init flags and rm/dolt against .beads" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'bd init --reinit-local --discard-remote' 'bd admin reset' 'rm -rf .beads' 'dolt sql --data-dir .beads/embeddeddolt'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 2 ] || { echo "not blocked: $c"; false; }
    done
}

@test "bd-guard: allows bootstrap on a fresh clone (no populated DB)" {
    rm -rf "$CLONE_DIR/.beads"
    run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check 'bd bootstrap'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: allows safe bd commands against a populated DB" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    for c in 'bd ready && bd stats' 'bd dolt commit && bd dolt push' 'make beads-snapshot' 'bd init --init-if-missing'; do
        run bash -c "cd '$CLONE_DIR' && scripts/bd-guard.sh --check '$c'"
        [ "$status" -eq 0 ] || { echo "wrongly blocked: $c"; false; }
    done
}

@test "bd-guard: BEADS_DESTRUCTIVE_OK=1 overrides the block" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    run bash -c "cd '$CLONE_DIR' && BEADS_DESTRUCTIVE_OK=1 scripts/bd-guard.sh --check 'bd bootstrap'"
    [ "$status" -eq 0 ]
}

@test "bd-guard: hook mode parses the PreToolUse JSON envelope" {
    mkdir -p "$CLONE_DIR/.beads/embeddeddolt"
    run bash -c "cd '$CLONE_DIR' && printf '%s' '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"bd bootstrap\"}}' | scripts/bd-guard.sh"
    [ "$status" -eq 2 ]
    run bash -c "cd '$CLONE_DIR' && printf '%s' '{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"bd stats\"}}' | scripts/bd-guard.sh"
    [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bats tests/agent-ops-git-scripts.bats`
Expected: the six new tests FAIL (`scripts/bd-guard.sh: No such file or directory`); existing tests still pass.

- [ ] **Step 3: Write the template**

Create `content/assets/agent-ops/git/bd-guard.sh.tmpl`:

```bash
#!/usr/bin/env bash
# bd-guard.sh — refuses destructive Beads commands against a populated database.
# Installed by `scaffold agent-ops install --component git`.
#
# Two modes:
#   1. Claude Code PreToolUse hook (default): reads the hook JSON envelope on
#      stdin, inspects .tool_input.command, exits 2 (block, stderr shown to the
#      agent) or 0 (allow). Registered under hooks.PreToolUse, matcher "Bash".
#   2. CLI check for other harnesses/scripts: bd-guard.sh --check "<command>"
#      — same exit semantics.
#
# Why: bootstrap/reset on a populated .beads/ replaces local (usually-ahead)
# state with the often-stale Dolt remote — this silently wiped ~50 beads in a
# sibling project. The guard is an accident net, not a security boundary; the
# deliberate-reset procedure lives in docs/beads-workflow.md (Durability).
#
# Deliberately does NOT print an override recipe on block (upstream Beads'
# error-text-no-echo lesson: an agent once wiped 247 issues by copying the
# destructive command out of an error message).
set -euo pipefail

cmd=""
if [ "${1:-}" = "--check" ]; then
	cmd="${2:-}"
else
	# Hook mode: JSON envelope on stdin. jq is required to parse it; without
	# jq, fail open — a guard that blocks every Bash call is worse than none.
	if ! command -v jq >/dev/null 2>&1; then
		printf '%s\n' "bd-guard: jq not found — cannot parse hook input; allowing. Install jq to arm the guard." >&2
		exit 0
	fi
	cmd="$(jq -r '.tool_input.command // empty' 2>/dev/null || true)"
fi
[ -n "$cmd" ] || exit 0

# Deliberate, human-approved override (procedure documented in
# docs/beads-workflow.md — not here).
if [ "${BEADS_DESTRUCTIVE_OK:-0}" = "1" ]; then exit 0; fi
case "$cmd" in *BEADS_DESTRUCTIVE_OK=1*) exit 0 ;; esac

# Guard only when there is a populated database to lose.
db_populated() {
	[ -d .beads/embeddeddolt ] && return 0
	[ -d .beads/dolt ] && return 0
	compgen -G ".beads/*.db" >/dev/null 2>&1
}
db_populated || exit 0

# Each pattern is bounded to one command segment ([^|;&]*) so a safe command
# chained after && is not misread as flags of a dangerous one.
dangerous='(^|[^[:alnum:]_./-])bd[[:space:]]+bootstrap([[:space:]|;&]|$)'
dangerous="${dangerous}|(^|[^[:alnum:]_./-])bd[[:space:]]+init[^|;&]*--(force|reinit-local|discard-remote|destroy-token)"
dangerous="${dangerous}|(^|[^[:alnum:]_./-])bd[[:space:]]+admin[[:space:]]+reset"
dangerous="${dangerous}|(^|[^[:alnum:]_./-])rm[[:space:]][^|;&]*\.beads"
dangerous="${dangerous}|(^|[^[:alnum:]_./-])dolt[[:space:]][^|;&]*\.beads"

if printf '%s' "$cmd" | grep -qE "$dangerous"; then
	{
		printf '%s\n' "bd-guard: BLOCKED — this command can destroy the populated Beads database (.beads/)."
		printf '%s\n' "Bootstrap/reset is for FRESH CLONES ONLY; on this checkout it would replace local"
		printf '%s\n' "beads with the (often stale) remote and silently drop unpushed work."
		printf '%s\n' "If beads may be unpushed, first run: bd stats && bd dolt commit && bd dolt push"
		printf '%s\n' "then: make beads-snapshot"
		printf '%s\n' "Deliberate-reset procedure: docs/beads-workflow.md (Durability & the bootstrap trap)."
	} >&2
	exit 2
fi
exit 0
```

Note the tab indentation — match `beads-snapshot.sh.tmpl`'s existing style (tabs).

- [ ] **Step 4: Run the bats tests to verify they pass**

Run: `bats tests/agent-ops-git-scripts.bats`
Expected: ALL tests pass, including the six new ones.

Also run ShellCheck on a resolved copy:
```bash
tmp=$(mktemp -d) && sed 's/{{PROJECT_NAME}}/x/g' content/assets/agent-ops/git/bd-guard.sh.tmpl > "$tmp/bd-guard.sh" && shellcheck "$tmp/bd-guard.sh" && rm -rf "$tmp"
```
Expected: no findings (fix any it reports).

- [ ] **Step 5: Register the template in the installer (vitest first)**

Open `src/core/agent-ops/install.test.ts`, find the test(s) that assert which files a `git`-component install produces, and add `'scripts/bd-guard.sh'` to the expected set. Run `npx vitest run src/core/agent-ops/install.test.ts` — expected: FAIL (bd-guard not installed).

Then add to `AGENT_OPS_FILE_MAP` in `src/core/agent-ops/install.ts`, directly after the `'git/beads-snapshot.sh.tmpl'` entry (line 29):

```ts
  'git/bd-guard.sh.tmpl': {
    dest: 'scripts/bd-guard.sh',
    component: 'git',
    executable: true,
  },
```

Run: `npx vitest run src/core/agent-ops/install.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add content/assets/agent-ops/git/bd-guard.sh.tmpl src/core/agent-ops/install.ts src/core/agent-ops/install.test.ts tests/agent-ops-git-scripts.bats docs/superpowers/plans/2026-07-12-beads-durability-hardening.md
git commit -m "feat(agent-ops): add bd-guard.sh blocking destructive Beads commands on populated DBs"
```
(The `git add` includes this plan document so it ships with the branch.)

---

### Task 2: `beads-snapshot.sh` — full-backup sync + honest wording

**Files:**
- Modify: `content/assets/agent-ops/git/beads-snapshot.sh.tmpl`
- Modify: `content/assets/agent-ops/make/agent-ops.mk.tmpl:19` (help text)
- Test: `tests/agent-ops-git-scripts.bats` (append tests)

**Interfaces:**
- Consumes: nothing new. Produces: `make beads-snapshot` now (a) writes the JSONL restore copy as before and (b) runs `bd backup sync` when a `bd backup` target is configured. Wording fix: `.beads/issues.jsonl` is a **committed** restore copy (generated projects set `export.git-add true` — see `content/pipeline/foundation/beads.md` step 5), not "git-ignored" as the current help text claims.

- [ ] **Step 1: Verify `bd backup status` semantics (read-only, in a temp dir)**

```bash
d=$(mktemp -d) && cd "$d" && git init -q && bd init --init-if-missing >/dev/null 2>&1; bd backup status; echo "exit=$?"; cd - && rm -rf "$d"
```
Record whether an *unconfigured* project makes `bd backup status` exit non-zero (expected) or exit 0 with a "no backup" message. The script below assumes non-zero; if it exits 0, change the detection line to
`if bd backup status 2>/dev/null | grep -qiv 'no backup'; then` and note it in the commit body.

- [ ] **Step 2: Write the failing bats tests**

Append to `tests/agent-ops-git-scripts.bats`:

```bash
@test "beads-snapshot: writes issues.jsonl and syncs bd backup when configured" {
    mkdir -p "$CLONE_DIR/.beads"
    # richer bd stub: export writes the -o target; backup exits per env toggle
    cat > "$CLONE_DIR/stubs/bd" <<'EOF'
#!/usr/bin/env bash
if [ "$1" = "export" ]; then
    while [ $# -gt 0 ]; do
        if [ "$1" = "-o" ]; then printf '{}\n' > "$2"; exit 0; fi
        shift
    done
    exit 1
fi
if [ "$1" = "backup" ]; then exit "${BD_BACKUP_EXIT:-1}"; fi
exit 0
EOF
    chmod +x "$CLONE_DIR/stubs/bd"
    # unconfigured backup: snapshot succeeds, no backup line
    run bash -c "cd '$CLONE_DIR' && BD_BACKUP_EXIT=1 scripts/beads-snapshot.sh"
    [ "$status" -eq 0 ]
    [ -f "$CLONE_DIR/.beads/issues.jsonl" ]
    [[ "$output" != *"backup"*"updated"* ]]
    # configured backup: sync runs and is reported
    run bash -c "cd '$CLONE_DIR' && BD_BACKUP_EXIT=0 scripts/beads-snapshot.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"full-history"* ]]
}

@test "beads-snapshot: success message calls the copy committed, not git-ignored" {
    run grep -i 'git-ignored' "$BATS_TEST_DIRNAME/../content/assets/agent-ops/git/beads-snapshot.sh.tmpl" \
        "$BATS_TEST_DIRNAME/../content/assets/agent-ops/make/agent-ops.mk.tmpl"
    [ "$status" -ne 0 ]
}
```

Run: `bats tests/agent-ops-git-scripts.bats` — expected: both new tests FAIL.

- [ ] **Step 3: Edit the snapshot template**

In `content/assets/agent-ops/git/beads-snapshot.sh.tmpl`:

(a) Replace the success branch (currently lines 37–38) so the success message drops the git-ignored implication and the backup sync runs after a successful snapshot:

```bash
	if mv -f "$tmp" .beads/issues.jsonl; then
		printf '%s\n' "✓ wrote .beads/issues.jsonl — a committed restore copy for 'bd import' after a wipe; still push the Dolt remote (bootstrap won't auto-use it)"
		# Full-fidelity Dolt backup (history included) when the project has one
		# configured via `bd backup init`. Feature-detected: silently skipped
		# when no backup target exists or bd predates `bd backup`.
		if bd backup status >/dev/null 2>&1; then
			if bd backup sync >/dev/null 2>&1; then
				printf '%s\n' "✓ bd backup sync — full-history Dolt backup updated"
			else
				printf '%s\n' "⚠ bd backup sync failed — JSONL snapshot still written; check 'bd backup status'" >&2
			fi
		fi
	else
```

(b) Update the file header comment (lines 2–3): change "a durable local recovery point" sentence to:

```bash
# Export the local beads DB to .beads/issues.jsonl — a committed restore copy
# for `bd import` after a wipe — and sync the full `bd backup` target when one
# is configured. Invoked by `make beads-snapshot`.
```

(c) In `content/assets/agent-ops/make/agent-ops.mk.tmpl` line 19, replace:

```make
beads-snapshot: ## [agent-safe] Export beads DB to a local git-ignored restore copy
```
with:
```make
beads-snapshot: ## [agent-safe] Export beads restore copy (.beads/issues.jsonl) + sync bd backup
```

- [ ] **Step 4: Run tests, lint**

Run: `bats tests/agent-ops-git-scripts.bats` — expected: ALL pass.
Run: ShellCheck on the resolved template (same recipe as Task 1 Step 4). Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add content/assets/agent-ops/git/beads-snapshot.sh.tmpl content/assets/agent-ops/make/agent-ops.mk.tmpl tests/agent-ops-git-scripts.bats
git commit -m "feat(agent-ops): beads-snapshot syncs bd backup; fix committed-vs-ignored wording"
```

---

### Task 3: Unify the bd version floor at 1.1.0

**Files:**
- Modify: `content/pipeline/finalization/materialize-plan-to-beads.md` (6 occurrences of `1.0.5` + the compare function)
- Modify: `content/pipeline/build/single-agent-start.md`, `single-agent-resume.md`, `multi-agent-start.md`, `multi-agent-resume.md` (2 occurrences each)
- Modify: `src/observability/adapters/beads.ts:37-43`
- Modify: `src/observability/adapters/beads.test.ts`, `src/cli/commands/observe.test.ts:41` (version mocks)
- Test: `tests/materialize-plan-to-beads.bats:23-26`

**Interfaces:**
- Produces: the phrase `≥ 1.1.0` as the single floor; the `beads_usable` compare `[ "$have_minor" -ge 1 ]`; adapter reason string `below the supported minimum (1.1.0)`. Task 6's skill gate uses the same 1.1.0 number.

- [ ] **Step 1: Update the bats guard first (failing test)**

In `tests/materialize-plan-to-beads.bats` lines 23–26, change the test to:

```bash
@test "guards on beads_usable: .beads + bd>=1.1.0 + jq, never bare [ -d .beads ] && bd" {
  run grep -qE "beads_usable" "$F"; [ "$status" -eq 0 ]
  run grep -qE "1\.1\.0" "$F"; [ "$status" -eq 0 ]
  run grep -qE "1\.0\.5" "$F"; [ "$status" -ne 0 ]
  run grep -qiE "command -v jq" "$F"; [ "$status" -eq 0 ]
}
```

Run: `bats tests/materialize-plan-to-beads.bats` — expected: this test FAILS (file still says 1.0.5).

- [ ] **Step 2: Edit the materializer prompt**

In `content/pipeline/finalization/materialize-plan-to-beads.md`:
- Line 163–164: `All \`bd\` commands use the verified v1.0.5 surface` → `All \`bd\` commands use the verified v1.1.0 surface`
- Line 173: `**≥ 1.0.5**` → `**≥ 1.1.0**`
- In the `beads_usable()` function, replace the compare block (lines 183–195):

```bash
  # Portable >= 1.1.0 compare — no `sort -V` (absent on macOS/BSD).
  local ver have_major have_minor have_patch
  ver=$(bd version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  [ -n "$ver" ] || return 1
  IFS=. read -r have_major have_minor have_patch <<EOF
$ver
EOF
  # Compare against floor 1.1.0
  if [ "$have_major" -gt 1 ]; then return 0; fi
  if [ "$have_major" -lt 1 ]; then return 1; fi
  [ "$have_minor" -ge 1 ]
```
- Line ~212: `install/upgrade \`bd\` (≥ v1.0.5)` → `install/upgrade \`bd\` (≥ v1.1.0)`
- Sweep the file: `grep -n "1\.0\.5" content/pipeline/finalization/materialize-plan-to-beads.md` must return nothing when done.

- [ ] **Step 3: Edit the four build prompts**

For each of `content/pipeline/build/{single-agent-start,single-agent-resume,multi-agent-start,multi-agent-resume}.md`, replace both `1.0.5` occurrences with `1.1.0` (they appear in the `beads_usable` prose definition and the fail-closed decision-table row). Verify:

```bash
grep -rn "1\.0\.5" content/pipeline/build/
```
Expected: no output.

- [ ] **Step 4: Run the content tests**

Run: `bats tests/materialize-plan-to-beads.bats tests/build-beads-materialize-integration.bats`
Expected: ALL pass.

- [ ] **Step 5: Adapter floor (vitest first)**

In `src/observability/adapters/beads.test.ts`, add/adjust cases: a mocked `bd --version` of `1.0.5` must yield `status: 'degraded'` with reason containing `1.1.0`; a mocked `1.1.0` must yield `available`. Follow the file's existing mock pattern for the exec calls. In `src/cli/commands/observe.test.ts` line 41, change the mocked `bd version 1.0.4` to `bd version 1.1.0` (otherwise the claim-event tests would newly degrade).

Run: `npx vitest run src/observability/adapters/beads.test.ts src/cli/commands/observe.test.ts` — expected: the new beads.test.ts case FAILS.

Then in `src/observability/adapters/beads.ts`, replace lines 37–43:

```ts
    const major = Number(m[1])
    const minor = Number(m[2])
    if (major < 1 || (major === 1 && minor < 1)) {
      const reason =
        `bd version ${m[0]} is below the supported minimum (1.1.0). `
        + 'Run \'brew upgrade beads\' or your equivalent.'
      return { status: 'degraded', reason }
    }
```

Run: `npx vitest run src/observability/adapters/beads.test.ts src/cli/commands/observe.test.ts` — expected: PASS.

- [ ] **Step 6: Repo-wide sweep for stragglers**

```bash
grep -rn "1\.0\.5" content/ src/ tests/ --include='*.md' --include='*.ts' --include='*.bats' | grep -iv changelog
```
Fix any remaining bd-floor references this surfaces (docs/specs history files are fine to leave — only floor *statements* in live content/src/tests must change). Expected final state: no live floor says 1.0.5.

- [ ] **Step 7: Commit**

```bash
git add content/pipeline tests/materialize-plan-to-beads.bats src/observability/adapters src/cli/commands/observe.test.ts
git commit -m "feat(beads): unify bd version floor at 1.1.0 across pipeline, adapter, and tests"
```

---

### Task 4: `beads.md` pipeline step — backup, init-if-missing, durability + upgrade sections

**Files:**
- Modify: `content/pipeline/foundation/beads.md`
- Create + Test: `tests/beads-pipeline-content.bats`

**Interfaces:**
- Consumes: `make beads-snapshot` semantics from Task 2 (JSONL + backup sync), `scripts/bd-guard.sh` from Task 1 (documented here; registered in Task 5).
- Produces: generated `docs/beads-workflow.md` now has **seven** sections (section 4 expanded to "Durability & the bootstrap trap", new section 7 "Upgrades & migration"); setup gains `bd backup init`; step 1 uses `bd init --init-if-missing`.

- [ ] **Step 1: Write the failing content test**

Create `tests/beads-pipeline-content.bats`:

```bash
#!/usr/bin/env bats
# Content guards for the Beads foundation step: durability features the
# 2026-07-12 hardening added must not regress.

F="$BATS_TEST_DIRNAME/../content/pipeline/foundation/beads.md"

@test "setup uses idempotent init and configures a full backup" {
  run grep -qE -- "--init-if-missing" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd backup init" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd backup sync" "$F"; [ "$status" -eq 0 ]
}

@test "generated workflow doc specifies the durability runbook" {
  run grep -qE "Durability & the bootstrap trap" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd dolt commit" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd dolt push" "$F"; [ "$status" -eq 0 ]
  run grep -qE "reinit-local" "$F"; [ "$status" -eq 0 ]
  run grep -qE "bd-guard" "$F"; [ "$status" -eq 0 ]
}

@test "generated workflow doc specifies the upgrade/migration recipe" {
  run grep -qE "Upgrades & migration" "$F"; [ "$status" -eq 0 ]
  run grep -qE "BD_ALLOW_REMOTE_MIGRATE" "$F"; [ "$status" -eq 0 ]
}

@test "stale version framing is gone" {
  run grep -qE "1\.0\.4-Unreleased" "$F"; [ "$status" -ne 0 ]
}
```

Run: `bats tests/beads-pipeline-content.bats` — expected: first three tests FAIL, fourth FAILS (file still says `v1.0.4-Unreleased`).

- [ ] **Step 2: Edit the Instructions steps**

In `content/pipeline/foundation/beads.md` Instructions:

(a) Step 1 code block becomes:
```bash
bd init --init-if-missing   # idempotent (bd >= 1.1.0): no-op when a DB already exists
```
Append to step 1's prose: "bd ≥ 1.1.0 may ask a one-time usage-metrics consent question on first run (`bd metrics`) — answer per project policy; either answer is fine for Scaffold's purposes."

(b) Step 5 (JSONL auto-export) — replace the parenthetical rationale sentence "(Beads v1.0.4-Unreleased flipped these to opt-in)" and the criteria-list twin at lines 79–81 with: "Opt-in since Beads v1.0.4. Upstream treats the Dolt database as the source of truth and JSONL as an export/interchange copy; we enable auto-export + git-add so `.beads/issues.jsonl` stays current and **committed** — it is the issue-level restore copy `make beads-snapshot` refreshes and the recovery source that survived a real database wipe."

(c) Insert a new step 6 after step 5 (renumber the current steps 6–9 to 7–10):

````markdown
6. **Configure a full-fidelity backup** (Dolt history included — `bd export`
   JSONL is issue-level only and NOT a substitute). The target lives outside
   the repository so a checkout deletion or reset cannot take the backup with
   it. Skip if `bd backup status` already reports a configured target:
   ```bash
   bd backup status >/dev/null 2>&1 || bd backup init "$HOME/.beads-backups/$(basename "$(pwd)")"
   bd backup sync
   ```
   From now on `make beads-snapshot` (agent-ops git component) refreshes both
   the JSONL copy and this backup. Restore path after a disaster:
   `bd backup restore` (see docs/beads-workflow.md section 4).
````

(d) Add to Quality Criteria (mvp): "- (mvp) A `bd backup` target is configured (`bd backup status` succeeds) and an initial `bd backup sync` completed".

- [ ] **Step 3: Expand generated-doc section 4 and add section 7**

In the "Generate docs/beads-workflow.md" block, replace item 4 (currently "**The bootstrap trap**…") with:

````markdown
4. **Durability & the bootstrap trap** — verbatim rules:
   - Never run `bd bootstrap`, destructive `bd init`
     (`--reinit-local` / `--discard-remote` / `--destroy-token`; legacy
     `--force`), or any reset on a checkout with a populated local Beads DB —
     it silently replaces local (usually ahead) state with the stale remote.
     Bootstrap is for fresh clones only. Since bd v1.0.4, destructive init
     refuses without explicit flags plus a destroy token (exit codes
     10/11/12) — treat any such refusal as a stop sign, not a puzzle.
   - Push before any reset, and before deleting a checkout with local beads:
     `bd stats` (confirm counts) → `bd dolt commit` → `bd dolt push`. The
     push — not a local snapshot — is what makes beads survivable.
   - Before any reset also run `make beads-snapshot` (agent-ops git
     component): refreshes the committed `.beads/issues.jsonl` restore copy
     and syncs the full `bd backup` target. Bootstrap will NOT auto-use
     either — they are manual restore sources.
   - Drive embedded storage only through `bd` subcommands (`bd dolt …`),
     never a standalone `dolt` CLI — a mismatched engine on the same storage
     can corrupt it.
   - Recovery order if beads go missing: FIRST confirm the remote actually
     lost them (`bd dolt pull`, then `bd stats`) — if the remote still has
     them, pull, don't rebuild. Then `bd backup restore` (full history), then
     `bd import -i .beads/issues.jsonl` (issue-level), and only as a last
     resort reconstruct from committed docs. After any restore:
     `bd dolt commit && bd dolt push`.
   - `scripts/bd-guard.sh` (a PreToolUse hook, registered during git-workflow
     setup) blocks the destructive commands above while the DB is populated.
     A deliberate, human-approved reset sets `BEADS_DESTRUCTIVE_OK=1` for
     that one command — never set it to silence the guard routinely.
````

Append item 7 after item 6:

````markdown
7. **Upgrades & migration** — upgrading the `bd` binary can trigger schema
   migrations; crossing a breaking migration un-coordinated can fork Dolt
   histories permanently. Rules: back up first (`make beads-snapshot`). A
   single-clone project just upgrades and runs `bd doctor --fix`. A
   multi-clone project (a second machine, or any fresh clone that pushes)
   follows the designated-migrator recipe: (1) every clone pushes with the
   OLD binary (`bd dolt commit && bd dolt push`); (2) exactly ONE clone runs
   `BD_ALLOW_REMOTE_MIGRATE=1 bd migrate`, then `bd dolt push`; (3) every
   other clone upgrades its binary and re-clones the tracker with
   `bd bootstrap` — safe here ONLY because step 1 pushed everything. Never
   migrate independently on two clones. bd's migrate gate (on by default
   since v1.1.0) refuses unsafe cases — a refusal is a stop sign.
````

- [ ] **Step 4: Sweep the section-count references**

The file references "six sections" in three places (Purpose ¶, Methodology Scaling deep + mvp, and depth-2 custom). Update each to seven / name the new section, e.g. Methodology deep: "Generates the full docs/beads-workflow.md reference (all seven sections)". In **Update Mode Specifics**, extend the "Triggers for update" bullet with: "docs/beads-workflow.md is missing the Durability & the bootstrap trap runbook or the Upgrades & migration section". Do NOT move or restructure the Mode Detection / Update Mode blocks.

- [ ] **Step 5: Run tests**

Run: `bats tests/beads-pipeline-content.bats` — expected: ALL pass.
Run: `make validate` — expected: frontmatter still valid.

- [ ] **Step 6: Commit**

```bash
git add content/pipeline/foundation/beads.md tests/beads-pipeline-content.bats
git commit -m "feat(pipeline): beads setup adds bd backup + durability/upgrade runbooks to generated docs"
```

---

### Task 5: Register `bd-guard.sh` as a PreToolUse hook in generated projects

**Files:**
- Modify: `content/pipeline/environment/git-workflow.md` (the "Install the agent-ops git component" instructions, near line 162–173)
- Test: `tests/beads-pipeline-content.bats` (append)

**Interfaces:**
- Consumes: `scripts/bd-guard.sh` installed by the git component (Task 1). Registration lives HERE (environment phase) and not in `beads.md` (foundation phase) because the script does not exist until `scaffold agent-ops install --component git` has run.

- [ ] **Step 1: Write the failing content test**

Append to `tests/beads-pipeline-content.bats`:

```bash
@test "git-workflow registers bd-guard as a PreToolUse hook (merge, never overwrite)" {
  G="$BATS_TEST_DIRNAME/../content/pipeline/environment/git-workflow.md"
  run grep -qE "bd-guard\.sh" "$G"; [ "$status" -eq 0 ]
  run grep -qE "PreToolUse" "$G"; [ "$status" -eq 0 ]
}
```

Run: `bats tests/beads-pipeline-content.bats` — expected: new test FAILS.

- [ ] **Step 2: Add the registration instruction**

In `content/pipeline/environment/git-workflow.md`, directly after numbered instruction 2 ("Install the git component and confirm it landed clean", the block ending "never pass `--force` in generation mode."), insert a new instruction 3 (renumber any following instructions):

````markdown
3. **Register the Beads destructive-command guard** (only when the project
   uses Beads — skip entirely when `.beads/` is absent). `scripts/bd-guard.sh`
   (installed by the git component above) is a Claude Code PreToolUse hook
   that refuses `bd bootstrap`, destructive `bd init`, and `.beads` deletion
   while a populated database exists. Merge it into `.claude/settings.json` —
   never overwrite the file; `bd setup claude` hooks and the PR-review
   reminder hook also own entries there:
   ```bash
   if [ -d .beads ] && [ -x scripts/bd-guard.sh ]; then
     mkdir -p .claude
     [ -f .claude/settings.json ] || printf '{}\n' > .claude/settings.json
     if ! grep -q 'bd-guard.sh' .claude/settings.json; then
       tmp=$(mktemp)
       jq '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher":"Bash","hooks":[{"type":"command","command":"scripts/bd-guard.sh"}]}])' \
         .claude/settings.json > "$tmp" && mv "$tmp" .claude/settings.json
     fi
   fi
   ```
   Codex, Cursor, and other harnesses have no PreToolUse hook: for them the
   guard is available as `scripts/bd-guard.sh --check "<command>"`, and the
   AGENTS.md Beads rules (see claude-md-optimization) carry the prose rule.
````

Also: in the step's **Expected Outputs** list, extend the existing `.claude/settings.json` bullet (currently "gains a PostToolUse reminder hook…") with "and, when the project uses Beads, a PreToolUse `bd-guard.sh` entry (merged, never overwritten)". Add a Quality Criteria line: "- (mvp) When `.beads/` exists, `.claude/settings.json` registers `scripts/bd-guard.sh` under hooks.PreToolUse with matcher `Bash`".

- [ ] **Step 3: Run tests + commit**

Run: `bats tests/beads-pipeline-content.bats` and `make validate` — expected: PASS.

```bash
git add content/pipeline/environment/git-workflow.md tests/beads-pipeline-content.bats
git commit -m "feat(pipeline): register bd-guard PreToolUse hook during git-workflow setup"
```

---

### Task 6: work-beads skill — version gate, database-safety rules, batch-end snapshot

**Files:**
- Modify: `content/agent-skills/work-beads/SKILL.md` (canonical)
- Regenerate: `content/skills/work-beads/SKILL.md`, `content/skills/work-beads/agents-block.md`, `content/skills/work-beads/cursor.mdc` (via `npm run gen:skills`)

**Interfaces:**
- Consumes: the 1.1.0 floor (Task 3), `make beads-snapshot` (Task 2). All edits are OUTSIDE the `<!-- lean:start/end -->` region.

- [ ] **Step 1: Edit Step 0**

In `content/agent-skills/work-beads/SKILL.md`, after the Step 0 code block and before the "If `bd` or the agent-ops scripts are missing…" paragraph, insert:

```markdown
Version gate: `bd version` must be **≥ 1.1.0** (the `bd dolt` durability
commands below require it). Older? Stop and report: upgrade with
`brew upgrade beads` or the project's equivalent — never work around the gate.

**Database safety (binding for every step):** never run `bd bootstrap`,
destructive `bd init` (`--reinit-local`/`--discard-remote`; legacy `--force`),
or any reset against a populated `.beads/` — bootstrap replaces local state
with the often-stale remote and silently drops unpushed beads (fresh clones
only). Before any deliberate reset, and before deleting a checkout with local
beads: `bd stats && bd dolt commit && bd dolt push`, then `make beads-snapshot`.
Drive the database only through `bd` subcommands — never a standalone `dolt`
CLI. Full runbook: docs/beads-workflow.md ("Durability & the bootstrap trap").
```

- [ ] **Step 2: Add the batch-end snapshot to Step 3**

In the Step 3 section, after the required-slots code block and before the `launchpad notify` line, insert:

```markdown
Before reporting, refresh the durability net (feature-detect; skip silently
when the target is absent): `make beads-snapshot` — one batch-end snapshot
covers every bead closed above.
```

- [ ] **Step 3: Add a red-flags row**

Append to the Red flags table:

```markdown
| Bootstrap/reset a populated `.beads` DB | Wipes unpushed beads — fresh clones only; push first (`bd dolt commit && bd dolt push`) |
```

- [ ] **Step 4: Regenerate the fan-out and verify drift gate**

```bash
npm run gen:skills
make agent-skills-check
```
Expected: regeneration rewrites `content/skills/work-beads/*`; the check exits 0.

Run: `bats tests/evals/skill-triggers.bats` — expected: PASS (trigger phrases untouched).

- [ ] **Step 5: Commit**

```bash
git add content/agent-skills/work-beads/SKILL.md content/skills/work-beads/
git commit -m "feat(work-beads): version gate (bd >= 1.1.0), database-safety rules, batch-end snapshot"
```

---

### Task 7: Knowledge entries + AGENTS.md ops-core — durability modernization and v1.1.0 primitives

**Files:**
- Modify: `content/knowledge/core/task-tracking.md` (bootstrap-trap block at lines 279–286 + new subsection)
- Modify: `content/pipeline/consolidation/claude-md-optimization.md` (Beads rules item 4, near line 210)
- Modify: `content/knowledge/execution/worktree-management.md` (add `bd -C` tip)
- Modify: `content/pipeline/finalization/materialize-plan-to-beads.md` (add `bd graph check` beside `bd dep cycles`)
- Test: `tests/beads-pipeline-content.bats` (append)

- [ ] **Step 1: Write the failing content test**

Append to `tests/beads-pipeline-content.bats`:

```bash
@test "knowledge + ops-core carry the modernized durability rules" {
  K="$BATS_TEST_DIRNAME/../content/knowledge/core/task-tracking.md"
  C="$BATS_TEST_DIRNAME/../content/pipeline/consolidation/claude-md-optimization.md"
  run grep -qE "bd dolt push" "$K"; [ "$status" -eq 0 ]
  run grep -qE "bd backup" "$K"; [ "$status" -eq 0 ]
  run grep -qE "bd batch" "$K"; [ "$status" -eq 0 ]
  run grep -qE "reinit-local" "$C"; [ "$status" -eq 0 ]
}
```

Run: `bats tests/beads-pipeline-content.bats` — expected: FAILS.

- [ ] **Step 2: Modernize the task-tracking bootstrap-trap block**

In `content/knowledge/core/task-tracking.md`, replace the "**The bootstrap trap.**" paragraph (lines 279–285) with:

```markdown
**The bootstrap trap.** Never run `bd bootstrap`, destructive `bd init`
(`--reinit-local`/`--discard-remote`/`--destroy-token`; legacy `--force`), or
any reset on a checkout with a populated local Beads DB — it silently replaces
local (usually-ahead) state with the stale remote. Bootstrap is for fresh
clones only. Push before any reset (`bd stats` → `bd dolt commit` →
`bd dolt push` — the push is what makes beads survivable), then snapshot
(`make beads-snapshot`, when the agent-ops git component is installed). Drive
embedded storage only through `bd` subcommands, never a standalone `dolt` CLI
against the data files directly. If beads go missing, confirm the remote
actually lost them (`bd dolt pull`) before rebuilding — restore order is
`bd backup restore` (full history) → `bd import -i .beads/issues.jsonl` →
reconstruct from committed docs.
```

- [ ] **Step 3: Add a "Durability toolkit (bd ≥ 1.1.0)" subsection**

In the same file, insert a new `###` subsection after "The Beads Discipline" section and before "Agent context: `bd prime` is the SSOT":

```markdown
### Durability toolkit (bd ≥ 1.1.0)

- **`bd backup init <path>` / `bd backup sync` / `bd backup restore`** — full
  Dolt-history backups; the blessed disaster-recovery and backend-migration
  path. `bd export` JSONL is issue-level only and NOT a substitute. Point the
  target outside the repository (a checkout wipe must not take the backup
  with it).
- **`bd batch`** — atomic multi-operation transactions; prefer it when a
  script must create/update several issues as one unit.
- **`bd doctor --agent`** — agent-oriented health check output; run when a
  loop hits unexplained bd errors.
- **`bd prune --force`** — deletes closed beads and is reference-aware (skips
  closed beads still cited by open work). Destructive; never run it casually.
- **Import safety** — `bd import` refuses stale overwrites (only newer
  `updated_at` wins); `--allow-stale` exists for deliberate rollback only.
```

- [ ] **Step 4: Update the AGENTS.md ops-core Beads rules**

In `content/pipeline/consolidation/claude-md-optimization.md`, item "4. **Beads rules**" (near line 210), replace the clause "never run `bd bootstrap` or `bd init --force` on a checkout with a populated local Beads DB." with:

```markdown
never run `bd bootstrap`, destructive `bd init`
   (`--reinit-local`/`--discard-remote`; legacy `--force`), or any reset on a
   checkout with a populated local Beads DB — push first
   (`bd dolt commit && bd dolt push`); `scripts/bd-guard.sh` enforces this.
```

- [ ] **Step 5: Small primitive adoptions**

(a) `content/knowledge/execution/worktree-management.md` — in the section that discusses running `bd` from the primary checkout (near the `BEADS_ACTOR` notes, lines 264–279), add:

```markdown
Tip: from inside a worktree, `bd -C <primary-checkout-path> …` (bd ≥ 1.0.4)
targets the primary's database without `cd` — useful in scripts that must not
change directory.
```

(b) `content/pipeline/finalization/materialize-plan-to-beads.md` — find the dependency-verification instruction that runs `bd dep cycles` (`grep -n "bd dep cycles"`) and extend it so the same pass also runs `bd graph check` (graph-integrity check, bd ≥ 1.0.0) and fails closed on a non-zero exit, mirroring the `bd dep cycles` handling.

- [ ] **Step 6: Run tests + commit**

Run: `bats tests/beads-pipeline-content.bats tests/materialize-plan-to-beads.bats` and `make validate` — expected: PASS.

```bash
git add content/knowledge/core/task-tracking.md content/knowledge/execution/worktree-management.md content/pipeline/consolidation/claude-md-optimization.md content/pipeline/finalization/materialize-plan-to-beads.md tests/beads-pipeline-content.bats
git commit -m "feat(knowledge): modernize Beads durability rules + adopt v1.1.0 primitives"
```

---

### Task 8: Point every upstream reference at `gastownhall/beads`

**Files:**
- Modify: `docs/knowledge-freshness/authoritative-sources.yaml:88`
- Modify: `content/knowledge/core/task-tracking.md:14`, `content/knowledge/core/task-decomposition.md:16`, `content/knowledge/execution/multi-agent-coordination.md:17`, `content/knowledge/review/review-implementation-tasks.md:14`
- Modify: `content/guides/knowledge-freshness/index.md:597` + regenerate `index.html`

Upstream renamed `steveyegge/beads` → `gastownhall/beads` (April 2026); the old name currently only works via GitHub's redirect.

- [ ] **Step 1: Replace the references**

```bash
grep -rln "steveyegge/beads" docs/knowledge-freshness content/knowledge content/guides/knowledge-freshness/index.md \
  | xargs sed -i '' 's#steveyegge/beads#gastownhall/beads#g'
```
Leave the `hash:`/`retrieved:` lines in knowledge frontmatter untouched — the freshness workflow re-fetches and updates them on its next run.

- [ ] **Step 2: Regenerate the guide HTML**

The generated `content/guides/knowledge-freshness/index.html` embeds the repo list; regenerate it with the repo's guides build (see CLAUDE.md "Reference guides": `scaffold guides --build` — if the globally installed `scaffold` is not this checkout, build first and invoke the local CLI per `package.json`'s `bin` entry).

Verify: `grep -rn "steveyegge" content/ docs/knowledge-freshness/` returns nothing.

- [ ] **Step 3: Gates + commit**

Run: `make validate` and `make check` — expected: PASS (the guides drift gate must be green).

```bash
git add docs/knowledge-freshness/authoritative-sources.yaml content/knowledge content/guides/knowledge-freshness/
git commit -m "chore(knowledge): point Beads sources at gastownhall/beads (upstream org rename)"
```

---

### Task 9: Dashboard — gate `bd` calls on `.beads/` presence

**Files:**
- Modify: `scripts/generate-dashboard.sh:223`
- Test: `tests/generate-dashboard.bats`

Today the Beads dashboard section runs `bd list --all --json` whenever `bd` is on PATH — in a project with no `.beads/`, embedded-mode bd may still answer from an ambient database (worktree auto-discovery walks upward), showing another project's beads.

- [ ] **Step 1: Write the failing bats test**

Read the top of `tests/generate-dashboard.bats` first and mirror its sandbox conventions (it drives `scripts/generate-dashboard.sh` against a temp project). Add:

```bash
@test "beads section: not rendered when bd is on PATH but the project has no .beads/" {
    # stub bd that would return an issue if consulted — the gate must prevent the call
    mkdir -p "$TEST_DIR/stubs"
    cat > "$TEST_DIR/stubs/bd" <<'EOF'
#!/usr/bin/env bash
[ "$1" = "list" ] && { echo '[{"id":"leak-1","title":"leaked","status":"open"}]'; exit 0; }
exit 0
EOF
    chmod +x "$TEST_DIR/stubs/bd"
    rm -rf "$TEST_DIR/.beads"
    PATH="$TEST_DIR/stubs:$PATH" run bash -c "cd '$TEST_DIR' && '$DASHBOARD_SCRIPT'"
    [ "$status" -eq 0 ]
    [[ "$(cat "$TEST_DIR"/*.html 2>/dev/null)" != *leak-1* ]]
}
```
Adjust `$TEST_DIR`/`$DASHBOARD_SCRIPT`/output-file names to the variable names that file actually uses — keep the assertion logic identical (stubbed `bd` returns a marker issue; the rendered HTML must not contain it).

Run: `bats tests/generate-dashboard.bats` — expected: new test FAILS (marker leaks into the HTML).

- [ ] **Step 2: Add the gate**

In `scripts/generate-dashboard.sh` line 223, change:

```bash
if command -v bd &>/dev/null; then
```
to:
```bash
if [[ -d .beads ]] && command -v bd &>/dev/null; then
```

- [ ] **Step 3: Run tests + commit**

Run: `bats tests/generate-dashboard.bats` and `make lint` — expected: PASS.

```bash
git add scripts/generate-dashboard.sh tests/generate-dashboard.bats
git commit -m "fix(dashboard): render Beads section only when the project has a .beads directory"
```

---

### Task 10: Beads-bridge removal — migration notes

**Files:**
- Modify: `CHANGELOG.md` (v3.41.0 entry, near line 40)
- Modify: `docs/review-standards.md` (round-budget escalation bullet, near line 54)

v3.41.0 removed the opt-in MMR→Beads bridge with no migration guidance; projects that had set `beads.create_issues_from_blocking_findings: true` silently lost auto-filing.

- [ ] **Step 1: Amend the CHANGELOG entry**

In `CHANGELOG.md`, the v3.41.0 breaking bullet currently ends with "No `scaffold` CLI command or flag changed." Append one sentence to that bullet:

```markdown
  Migration: delete the `beads:` block from `.mmr.yaml` if present, and file
  surviving findings manually at the round-budget cap (`bd create` with a
  `discovered-from` dependency) per `docs/review-standards.md`.
```

- [ ] **Step 2: Note the manual flow in review-standards**

In `docs/review-standards.md`, in the cap bullet that reads "…file P2/P3 as follow-ups (Beads where the project uses it)…", append after that sentence:

```markdown
  (Filing is manual: the former automatic MMR→Beads bridge was removed in
  scaffold v3.41.0.)
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md docs/review-standards.md
git commit -m "docs: add migration guidance for the removed MMR-to-Beads bridge"
```

---

### Task 11: bd 1.1.0 surface audit + upstream watch items

**Files:**
- Create: `docs/audits/beads-surface-audit-2026-07-12.md`
- Modify: any content file whose documented bd surface turns out wrong (expected: few or none)

The previous audit validated content against bd v1.0.4 (see `docs/audits/beads-integration-audit-2026-05-24.md` for the format). This task re-validates against the installed v1.1.0 and records what to watch upstream.

- [ ] **Step 1: Extract the documented surface**

```bash
grep -rhoE '\bbd [a-z][a-z-]*( [a-z][a-z-]*)?' content/ --include='*.md' --include='*.tmpl' | sort | uniq -c | sort -rn
grep -rhoE '\bbd [a-z-]+[^`]*--[a-z-]+' content/ --include='*.md' --include='*.tmpl' | sort -u
```

- [ ] **Step 2: Verify each subcommand and flag against bd 1.1.0**

For every distinct subcommand from Step 1, run `bd <subcommand> --help` (read-only; safe anywhere) and confirm each documented flag exists. Pay specific attention to the surfaces this plan itself writes: `bd init --init-if-missing`, `bd backup init|sync|restore|status`, `bd dolt commit|push|pull`, `bd migrate`, `bd graph check`, `bd batch`, `bd doctor --agent`, `bd prune --force`, `bd import --allow-stale`, `bd ready --claim --has-metadata-key`, `bd merge-slot`, `bd gate`, `bd prime --hook-json`, `bd setup claude --check`. If a flag doesn't exist as documented, fix the content file in this task and note it in the audit doc.

- [ ] **Step 3: Write the audit document**

Create `docs/audits/beads-surface-audit-2026-07-12.md` with this skeleton, filled from Step 2's actual results:

```markdown
# Beads surface audit — 2026-07-12 (bd 1.1.0)

Re-validation of every `bd` command surface in `content/` against the
installed bd 1.1.0 (Homebrew), following the durability-hardening plan.
Previous audit: docs/audits/beads-integration-audit-2026-05-24.md (v1.0.4).

## Verified surface
| Subcommand | Flags checked | Status |
| --- | --- | --- |
<one row per subcommand from Step 2, Status = ok | fixed (commit) | filed>

## Discrepancies found and fixed
<list, or "none">

## Upstream watch items (not yet released as of 2026-07-12)
- **Work leases** (schema v54, upstream PR #4537): claims get a TTL with
  `bd heartbeat <id>` and `bd reclaim --older-than <dur>` to recover issues
  stranded by dead workers. When released: adopt in the work-beads skill's
  claim step (2.1) and multi-agent-coordination knowledge.
- **`bd setup cursor`** (Cursor hooks parity): when released, add alongside
  `bd setup claude` / `bd setup codex` in content/pipeline/foundation/beads.md.
- **Upstream issue #4692** (v1.1.0): server→embedded fallback can write a bad
  `.beads` redirect that hides all issues — if a generated project reports
  "all beads vanished", check this before assuming a wipe.
- **JSONL auto-import races** (upstream #3931/#4038/#4245/#4331, several
  open): keep auto-IMPORT off in generated projects; auto-export + git-add
  (what we enable) is the safe direction.
- **`bd bootstrap` on a populated DB remains unguarded upstream** — our
  bd-guard.sh + docs rule is the only protection; consider filing/tracking an
  upstream feature request.

## Next re-audit trigger
Re-run this audit when `bd version` on the dev machine advances past 1.1.x,
or when any generated-project loop hits an unknown-flag error.
```

- [ ] **Step 4: Commit**

```bash
git add docs/audits/beads-surface-audit-2026-07-12.md content/
git commit -m "docs(audit): re-validate Beads command surface against bd 1.1.0 + record watch items"
```

---

### Task 12: Ship — gates, PR, mandatory review, merge

- [ ] **Step 1: Full gates**

Run: `make check-all`
Expected: every gate green. Fix anything red before proceeding (bats content guards from Tasks 3–7 are the likeliest to catch a missed rename).

- [ ] **Step 2: Push and open the PR**

```bash
git push --no-verify -u origin HEAD   # --no-verify OK: check-all just ran green on this exact commit
gh pr create --title "feat: Beads durability hardening (bd-guard, bd backup, 1.1.0 floor, upgrade runbooks)" --body "$(cat <<'EOF'
## Summary
Closes the gaps from the 2026-07-12 Beads durability analysis (nibble bd-bootstrap wipe + upstream v1.1.0 review):
- NEW agent-ops template `bd-guard.sh` — PreToolUse hook blocking `bd bootstrap` / destructive `bd init` / `.beads` deletion on populated DBs; registered by git-workflow setup
- `beads-snapshot.sh` now also syncs `bd backup` (full Dolt history); wording fixed (the JSONL copy is committed, not git-ignored)
- Generated Beads setup: `bd init --init-if-missing`, `bd backup init` outside the repo, durability + upgrade/migration runbooks in docs/beads-workflow.md (push-before-reset, designated-migrator recipe, recovery order)
- work-beads skill: bd >= 1.1.0 gate, database-safety rules, batch-end snapshot
- bd version floor unified at 1.1.0 (pipeline prompts, adapter, tests)
- Knowledge/ops-core modernization (v1.0.4 init-safety flags, bd batch / bd -C / bd doctor --agent / bd graph check)
- Upstream URLs → gastownhall/beads; dashboard bd calls gated on .beads/; bridge-removal migration notes; bd 1.1.0 surface audit + watch items

## Test plan
- `make check-all` green
- New bats: bd-guard (6 cases incl. error-text-no-echo), beads-snapshot backup sync, beads-pipeline content guards, dashboard .beads gate
- vitest: agent-ops install map, beads adapter 1.1.0 floor

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Mandatory review (per CLAUDE.md)**

Run the full review flow: `scaffold run review-pr` (all channels, foreground only). Fix findings at or above the fix threshold; 3-round cap; proceed only on `pass`/`degraded-pass`. If the verdict is `blocked` or `needs-user-decision`, stop and surface it to the user.

- [ ] **Step 4: Merge and clean up**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```
Expected: squash-merged; branch deleted. Report the PR number, review verdict, and any findings deferred.

---

## Self-review notes (already applied)

- **Ordering:** Task 1 (guard exists) precedes Task 5 (guard registered); Task 2 (snapshot syncs backup) precedes Task 4 (setup references that behavior); Task 3 (floor) precedes Task 6 (skill gate uses the same number). Tasks 8–11 are order-independent.
- **Cross-task name consistency:** `scripts/bd-guard.sh` (install.ts dest, jq registration snippet, docs section 4, ops-core rule); `BEADS_DESTRUCTIVE_OK=1` (guard, docs section 4); `make beads-snapshot` (snapshot script, skill Step 3, docs section 4/7); floor string `1.1.0` (materializer, build prompts, adapter reason, skill gate).
- **Spec coverage vs. the gap analysis:** high #1 → Task 6; high #2 → Tasks 1+5; high #3 → Tasks 2+4 (+ routine cadence via skill Step 3 in Task 6); medium #4 → Tasks 3+11; medium #5 → Tasks 2+4; medium #6 → Task 4 (+ Task 7 knowledge); medium #7 → Task 8; low bd batch/-C/init-if-missing/doctor --agent/prune/graph check → Tasks 4+7; watch items (work leases, bd setup cursor) → Task 11; dashboard gating → Task 9; bridge migration note → Task 10; bd metrics note → Task 4 Step 2a.
