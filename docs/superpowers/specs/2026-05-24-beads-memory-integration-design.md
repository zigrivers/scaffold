# Design: Auto-Memory ↔ `bd remember` Integration

**Date:** 2026-05-24
**Status:** Spike / Investigation (no go/no-go yet)
**Author:** Claude (during execution of `docs/superpowers/plans/2026-05-24-beads-integration-fixes.md` Phase 10)
**Audit source:** `docs/audits/beads-integration-audit-2026-05-24.md` finding F-1.3 (consolidated with former F-4.3)

## Problem

Scaffold ships an **auto-memory** system that writes per-user, per-project memories as Markdown files under `~/.claude/projects/<encoded-cwd>/memory/`. Memory types are `user`, `feedback`, `project`, `reference` (per scaffold's own CLAUDE.md). The system is implemented client-side in the Claude Code CLI; scaffold's CLAUDE.md just documents the taxonomy and rules.

Upstream Beads ships **`bd remember` / `bd recall` / `bd memories` / `bd forget`** — a persistent agent-memory primitive injected into every session via `bd prime`. Upstream's AGENTS.md explicitly says: *"Use `bd remember` for project memory; do NOT create MEMORY.md files."*

When a downstream project initializes Beads, both systems are active simultaneously:
- Filesystem memories at `~/.claude/projects/.../memory/*.md`
- Beads memories in `.beads/embeddeddolt/`

These are not aware of each other. The result is two memory systems with no cross-link, contradicting upstream's "do not create MEMORY.md files" guidance.

## What the spike found

(Note: this design doc was written without executing the full prototype against a live Beads-initialized project. The findings below are inferred from the code paths and AGENTS.md prescriptions. A follow-up spike should execute the prototype before any implementation commits.)

**Filesystem auto-memory** stores small markdown files keyed by a free-form `name` slug. Each file has frontmatter (`name`, `description`, `metadata.type`) and a body. The Claude Code client reads/writes these files; scaffold itself doesn't manage them.

**`bd remember`** stores text records keyed by an optional `--key`. Excluded from default export. Injected into `bd prime` output (top of the context envelope, so it survives truncation). Per-project (per-`.beads/` database), not per-user.

**Key tension:** Filesystem auto-memory is *user-level* (one user, many projects). `bd remember` is *project-level* (one project, possibly many users on a team). Naive "replace one with the other" loses one of those axes:
- Replace filesystem with `bd remember` → memories become per-project; the user loses cross-project recall.
- Replace `bd remember` with filesystem → team members on the same Beads project don't share memories.

## Options

### Option 1 — Replace

When `.beads/` exists, scaffold's CLAUDE.md auto-memory documentation instructs the client to write to `bd remember` instead of `~/.claude/projects/.../memory/`. Filesystem memory keeps working for non-Beads projects.

**Pros:**
- Single source of truth per project, matching upstream's prescription.
- Team-shareable memories (since `.beads/` is committed and synced).
- `bd prime` automatically injects memories into every session — no second mechanism for the client to remember.

**Cons:**
- Per-user, cross-project memories vanish in Beads projects. User-level facts (`"the user is a data scientist"`) get duplicated per project.
- Requires Claude Code client behavior change, not just scaffold prompt edits. Scaffold can document the recommendation but the client's auto-memory subsystem ultimately decides what happens.
- "Replace" is a behavior change for users who already have filesystem memories that they expect to persist.

### Option 2 — Mirror

Write to BOTH on memory updates. Reads come from filesystem (fast path) and fall back to `bd recall` (or vice versa).

**Pros:**
- Both systems' invariants preserved.
- Graceful path for users transitioning between projects with/without Beads.

**Cons:**
- Dual-write complexity. Failure modes multiply: what happens if filesystem write succeeds and `bd remember` fails? Or vice versa? The dual-write must be atomic-ish or the systems drift.
- Doesn't actually solve upstream's "do not create MEMORY.md files" rule — scaffold still creates them.
- Maintenance burden: every memory schema change needs to be applied in two places.

### Option 3 — Document and divide ("explicit dual system")

Leave both systems running. Explicitly document the split:

- **Filesystem auto-memory** (per-user, cross-project): user preferences, expertise level, role, communication style. These are about the *person* and survive across projects.
- **`bd remember`** (per-project, team-shareable): project facts, in-flight context, team conventions, project-specific blockers. These are about the *project* and should be shared via git.

Scaffold's CLAUDE.md auto-memory section is updated to:
1. Specify the user-level scope explicitly (currently it's ambiguous).
2. When `.beads/` exists, add a section saying "for project-level memory, use `bd remember`."
3. Document the boundary with examples.

**Pros:**
- No code changes — pure documentation. Lowest implementation cost.
- Respects both systems' design intent.
- Honest about the reality: the two systems track different scopes.
- Compatible with upstream's prescription if we interpret "do not create MEMORY.md files" as "don't use them for project memory" — filesystem auto-memory becomes the user-memory layer, which upstream doesn't prescribe.

**Cons:**
- Two systems remain. Some users will continue to write project-level facts into filesystem memory anyway.
- Upstream's prescription is not literally followed (filesystem MD files still exist).

## Recommendation

**Option 3 (Document and divide)** — start here.

It's the only one of the three that doesn't require Claude Code client changes (Option 1) or risk drift (Option 2). It treats the two systems as serving different scopes, which is empirically true.

If, after running with Option 3 for a quarter, we find users keep mis-categorizing memories (e.g., writing project facts into user memory because that's the default), we can revisit. Option 1 becomes more attractive once we have data showing the boundary is being violated routinely.

**What changes if Option 3 is approved:**

- Scaffold's CLAUDE.md auto-memory section (in the user's `~/.claude/CLAUDE.md` or equivalent) is amended:
  - Explicitly call filesystem memory "user-level memory" (cross-project).
  - When `.beads/` exists, add a paragraph: "For project-level facts that should be shared with teammates working on this project, use `bd remember "..."` instead. The two systems serve different scopes; pick the right one for each fact."
- Add a brief section to `content/knowledge/core/task-tracking.md` (it already mentions `bd remember` from Phase 4 work) reinforcing the scope split.
- No code changes to scaffold or the Claude Code client.

## Out of scope for this spike

- Building any prototype that auto-routes memory writes between the two systems.
- Modifying the Claude Code client's auto-memory subsystem.
- Migrating existing filesystem memories into `bd remember`.

## Next step

Bring this doc to the user for a go/no-go on Option 3. If approved, the implementation is a small doc PR — no plan needed beyond the current audit.

If the user wants to explore Option 1 or 2 instead, this design becomes the starting point for a more substantial follow-up plan (which would necessarily involve Claude Code client changes, not just scaffold prompt edits).
