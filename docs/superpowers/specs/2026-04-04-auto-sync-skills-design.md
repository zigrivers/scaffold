# Auto-Sync Project Skills on CLI Invocation

**Date:** 2026-04-04
**Status:** Approved
**Scope:** Eliminate manual `scaffold skill install` by auto-syncing skills on every CLI command

## Motivation

Currently, users must run `scaffold skill install` after every Scaffold upgrade to update their project-local skill files (`.claude/skills/`, `.agents/skills/`). Users forget this step, leading to stale skills that don't reflect the latest pipeline changes. Since the scaffold runner skill is the primary interface for Claude Code, Gemini CLI, and Codex CLI users, stale skills directly degrade the user experience.

## Design

### Architecture

The existing `createProjectRootMiddleware` in `src/cli/middleware/project-root.ts` runs on every CLI command and detects the project root. After detection, it calls a new `syncSkillsIfNeeded(projectRoot)` function that:

1. Reads a version marker file (`.scaffold-skill-version`) from each skill install directory
2. Compares against the installed Scaffold package version
3. If stale or missing: resolves skill templates and writes updated files + version marker
4. If current: no-op (1 file read, fast path)

### Shared Module: `src/core/skills/sync.ts`

Extract skill resolution logic from `src/cli/commands/skill.ts` into a shared module used by both the middleware (auto-sync) and the `skill` command (manual install/list/remove).

**Exports:**
- `SKILL_TARGETS` — array of `{ installDir, label, templateVars }` for Claude Code and shared agents
- `INSTALLABLE_SKILLS` — array of `{ name, description }` for runner and pipeline skills
- `resolveSkillTemplate(content, vars)` — resolve `{{KEY}}` markers
- `getSkillTemplateDir()` — path to `content/skills/`
- `syncSkillsIfNeeded(projectRoot)` — the auto-sync entry point
- `installAllSkills(projectRoot, options)` — full install logic (used by `skill install` and `syncSkillsIfNeeded`)

### Version Marker

Each skill install directory gets a `.scaffold-skill-version` file:
- Path: `.claude/skills/.scaffold-skill-version` and `.agents/skills/.scaffold-skill-version`
- Content: single line with the Scaffold package version (e.g., `3.2.2`)
- Written atomically alongside skill files during sync
- Gitignored in downstream projects (these directories are already gitignored)

### Fast Path

On the typical CLI invocation (skills already current):
1. Read `.claude/skills/.scaffold-skill-version` — 1 fs read
2. Compare to package version — string comparison
3. Match → return immediately

Cost: ~1ms per invocation. Negligible.

### Sync Path

When version doesn't match (upgrade detected):
1. Read each template from `content/skills/{name}/SKILL.md`
2. Resolve `{{INSTRUCTIONS_FILE}}` per target platform
3. Write resolved files to `.claude/skills/{name}/SKILL.md` and `.agents/skills/{name}/SKILL.md`
4. Write updated `.scaffold-skill-version` to both directories

### Commands Affected

- **All commands with project root** — auto-sync runs via middleware, no explicit call needed
- **`scaffold init`** — explicit `syncSkillsIfNeeded(projectRoot)` call after `runBuild()` completes (middleware can't handle this because `init` is in `ROOT_OPTIONAL_COMMANDS` and `.scaffold/` doesn't exist when middleware runs)
- **`scaffold skill install`** — still works for manual use; now calls the same shared `installAllSkills` function; `--force` bypasses version check
- **`scaffold skill list`** — unchanged
- **`scaffold skill remove`** — unchanged, also removes version marker

### Edge Cases

- **No project root** (not initialized, or `init`/`version`/`update` commands) — middleware skips sync
- **Template source missing** (corrupted package install) — skip silently, log to stderr only in verbose mode
- **First `scaffold init`** — `.scaffold/` doesn't exist when middleware runs (init is ROOT_OPTIONAL), so init handler calls `syncSkillsIfNeeded(projectRoot)` explicitly after `runBuild()`
- **Scaffold repo itself** — `.claude/skills/` and `.agents/skills/` are gitignored; auto-sync keeps them current during development

### Files Changed

| File | Change |
|------|--------|
| Create: `src/core/skills/sync.ts` | Shared skill sync logic, version checking, template resolution |
| Modify: `src/cli/middleware/project-root.ts` | Add `syncSkillsIfNeeded` call after root detection |
| Modify: `src/cli/commands/skill.ts` | Import from shared module instead of local definitions |
| Create: `src/core/skills/sync.test.ts` | Tests for sync logic |
| Modify: `src/cli/middleware/project-root.test.ts` | Test that middleware triggers sync |
| Modify: `src/cli/commands/skill.test.ts` | Update to use shared module |
| Modify: `src/cli/commands/init.ts` | Add explicit `syncSkillsIfNeeded` call after build |
| Modify: `src/cli/commands/init.test.ts` | Test that init installs skills |

### Testing Strategy

1. Unit tests for `syncSkillsIfNeeded`: version match (no-op), version mismatch (writes), missing marker (writes), missing template source (skips)
2. Unit tests for `installAllSkills`: writes correct files with resolved templates
3. Integration test: `scaffold status` in a project with stale version marker triggers auto-sync
4. Verify `make check-all` passes
