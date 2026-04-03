# Project Directory Restructure for Scaffold 3.x

**Date:** 2026-04-03
**Status:** Approved
**Scope:** Full project directory restructure to align with v3.x architecture

## Motivation

The Scaffold project has evolved through three generations (v1 monolith, v2 modular pipeline, v3 hidden output), accumulating structural debt along the way:

- **Skill duplication:** 3 copies of each skill across `skills/`, `agent-skills/`, and auto-installed locations with manual sync requirements
- **Dead delivery mechanism:** `commands/` (73 slash commands) superseded by the scaffold CLI + runner skill
- **Build artifacts in git:** `dist/` (697 files) tracked when it should be gitignored
- **Legacy files:** `prompts.md` (6,175 lines, v1 monolith), `.beads/` (unused task tracker), `extract-commands.sh` (dead code)
- **Cluttered docs:** 173 files mixing canonical standards, active architecture, and historical audit artifacts
- **Unclear data flow:** Build inputs (`pipeline/`, `tools/`, `knowledge/`, `methodology/`, `skills/`) scattered at root alongside implementation code

The restructure makes the project's data flow visible at a glance and eliminates redundancy.

## Design Principles

1. **Visible data flow:** `content/` (build inputs) -> `src/` (engine) -> `.scaffold/generated/` (outputs)
2. **Single source of truth:** One copy of each skill with templating, not multiple diverging copies
3. **Committed vs generated:** Source templates committed, platform-resolved copies gitignored
4. **Living vs archived:** Canonical docs at hand, historical artifacts clearly separated

## Architecture

### Top-Level Layout

```
scaffold/
├── content/                      # Build inputs (all committed)
│   ├── pipeline/                 # 60 phase files (16 phases)
│   ├── tools/                    # 10 tool meta-prompts
│   ├── knowledge/                # 61 domain expertise entries
│   ├── methodology/              # Preset configs
│   └── skills/                   # Skill templates with {{markers}}
│       ├── scaffold-pipeline/
│       ├── scaffold-runner/
│       └── multi-model-dispatch/
│
├── src/                          # TypeScript CLI + assembly engine
├── scripts/                      # Bash utilities
├── lib/                          # Shared assets (dashboard CSS)
├── tests/                        # Test suite
├── tasks/                        # Lessons learned
│
├── skills/                       # Generated resolved skills (gitignored)
├── dist/                         # Build output (gitignored)
│
├── docs/                         # Reorganized documentation
│   ├── [canonical living docs]
│   ├── architecture/             # Active architecture docs
│   ├── superpowers/              # Superpowers specs/plans
│   └── archive/                  # Historical artifacts
│
├── .claude-plugin/               # Plugin manifest
├── .github/                      # CI/CD
├── .scaffold/                    # Runtime state + generated output
│
├── CLAUDE.md, AGENTS.md, README.md, CHANGELOG.md
├── Makefile, package.json, tsconfig.json, .gitignore
```

### Data Flow

```
content/skills/ (templates)  ──┐
content/pipeline/ (phases)   ──┤
content/tools/ (utilities)   ──┼──> src/ (assembly engine) ──> .scaffold/generated/ (adapter output)
content/knowledge/ (domain)  ──┤                          ──> skills/ (resolved skills for plugin)
content/methodology/ (presets)─┘                          ──> .claude/skills/ (project-local)
                                                          ──> .agents/skills/ (project-local)
```

## Component Details

### 1. `content/` — Build Inputs

All inputs to the build system grouped under one directory. Internal structure of each subdirectory is unchanged from current layout.

| Subdirectory | Source | Files | Notes |
|-------------|--------|-------|-------|
| `content/pipeline/` | moved from `pipeline/` | 60 | 16 phase subdirectories, unchanged |
| `content/tools/` | moved from `tools/` | 10 | Stateless utility tools, unchanged |
| `content/knowledge/` | moved from `knowledge/` | 61 | 7 category subdirectories, unchanged |
| `content/methodology/` | moved from `methodology/` | 4 | Preset configs + README, unchanged |
| `content/skills/` | consolidated from `skills/` + `agent-skills/` | 3 | Templatized (see Skills Templating) |

### 2. Skills Templating

Skill files in `content/skills/` use template markers resolved per platform during build:

**Template markers:**

| Marker | Claude Code | Gemini CLI | Codex CLI |
|--------|------------|------------|-----------|
| `{{INSTRUCTIONS_FILE}}` | `CLAUDE.md` | `GEMINI.md` | `AGENTS.md` |
| `{{PLATFORM}}` | `claude-code` | `gemini` | `codex` |
| `{{SKILLS_DIR}}` | `.claude/skills` | `.agents/skills` | `.agents/skills` |

**Example usage in a skill template:**

```markdown
## Setup
Ensure your project has a `{{INSTRUCTIONS_FILE}}` with scaffold guidance.
```

**Resolution outputs:**

| Output Path | Purpose | Git Status |
|-------------|---------|------------|
| `skills/` (root) | Plugin auto-discovery for Claude Code | Gitignored |
| `.claude/skills/` | Project-local Claude Code skills | Gitignored |
| `.agents/skills/` | Project-local Gemini/Codex skills | Gitignored |

The build system resolves templates during `scaffold build` and `scaffold skill install`.

**Note:** The existing `agent-skills/` variants contain a bug where the pipeline slug `claude-md-optimization` was incorrectly changed to `Codex-md-optimization`. Pipeline slugs are canonical identifiers and must not vary by platform. The consolidated template in `content/skills/` will use the canonical slug; only the markers listed above should vary per platform.

### 3. Plugin (`.claude-plugin/`)

The plugin remains for marketplace discoverability. With `commands/` removed, the plugin's value is skill auto-activation via the root `skills/` directory (which is now generated output, resolved from `content/skills/` templates).

**Changes to `plugin.json`:**
- Update `version` to match current release
- Update `description` to reflect CLI + skill delivery (not slash commands)
- Remove `beads` from keywords

**Changes to `marketplace.json`:**
- Update description to reflect current functionality

### 4. `docs/` Reorganization

**Root (`docs/`)** — canonical living docs referenced during active development:
- `coding-standards.md`
- `design-system.md`
- `dev-setup.md`
- `git-workflow.md`
- `project-structure.md` (rewritten for new layout)
- `tdd-standards.md`
- `tech-stack.md`
- `user-stories.md`
- `scaffold-overview.md`
- `glossary.md`
- `plan.md`
- `build-scaffold-skill.md` (moved from `prompts/`)
- `scaffold-completeness-audit.md` (moved from `prompts/`)

**`docs/architecture/`** — active system design docs, moved from `docs/v2/` (excluding `docs/v2/archive/`):
- `adrs/` — Architecture Decision Records
- `api/` — API contract design
- `architecture/` — System architecture specs
- `data/` — Data flow, schema, domain models
- `domain-models/` — Entity relationships
- `implementation/` — Implementation guides
- `reference/` — API reference
- `ux/` — UX specifications
- `validation/` — Validation audit results
- `final/` — Finalization artifacts

**`docs/superpowers/`** — stays as-is (specs and plans).

**`docs/archive/`** — historical artifacts, not referenced during active development:
- `prompts-v1.md` — legacy v1 monolith (from root `prompts.md`)
- `audits/` — alignment audit files (from `docs/` root)
- `reviews/` — multi-model review artifacts (from `docs/` root and `docs/reviews/`)
- `v2-archive/` — old superpowers plans/specs (from `docs/v2/archive/`)

### 5. Removals

**Deleted entirely:**

| Path | Files | Reason |
|------|-------|--------|
| `commands/` | 73 | Superseded by CLI + runner skill |
| `agent-skills/` | 2 | Consolidated into `content/skills/` |
| `scripts/extract-commands.sh` | 1 | Extracted from prompts.md, now dead code |
| `.beads/` | 6 | Legacy task tracker, documented as unused |

**Moved/archived (source path removed):**

| From | To | Files | Reason |
|------|----|-------|--------|
| `prompts/*.md` | `docs/` | 2 | Development guides, not pipeline content |
| `prompts.md` | `docs/archive/prompts-v1.md` | 1 | Legacy v1 monolith, historical reference only |

**Removed from git tracking (gitignored):**

| Path | Files | Reason |
|------|-------|--------|
| `dist/` | 697 | Build output, rebuilt during publish |
| `skills/` | 3 | Generated from templates, not source |

### 6. `.gitignore` Updates

**Add:**
```gitignore
# Build output
dist/

# Generated skills (resolved from content/skills/ templates)
skills/
```

**Already present (from v3 migration):**
```gitignore
# >>> scaffold managed
.scaffold/generated/
.scaffold/lock.json
.scaffold/*.tmp
.scaffold/**/*.tmp
# <<< scaffold managed
```

### 7. Path Updates Required

Every reference to the moved directories must be updated:

| Location | References to Update |
|----------|---------------------|
| `src/` (TypeScript) | All imports/paths referencing `pipeline/`, `tools/`, `knowledge/`, `methodology/` — prefix with `content/` |
| `tests/` | Fixture paths and test references to moved directories |
| `Makefile` | Targets referencing moved directories |
| `CLAUDE.md` | Structure documentation, editing guidelines, all path references |
| `AGENTS.md` | Any path references |
| `package.json` | `files` array — replace individual dirs with `content/` |
| `.github/workflows/` | CI paths if any reference moved directories |
| `docs/project-structure.md` | Full rewrite for new layout |
| `README.md` | Structure references if any |
| `scripts/` | Any scripts referencing old paths |

## Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| Tracked files removed | — | 82 deleted, 3 archived/moved, ~700 gitignored |
| Skill copies | 3 per skill (manual sync) | 1 template (auto-resolved) |
| Root directories | 16 | 10 |
| `docs/` root files | ~25 | ~13 |
| Build input locations | 5 scattered at root | 1 (`content/`) |
| Dead code | `extract-commands.sh`, `prompts.md`, `.beads/` | Removed/archived |

## Risks

1. **Path update churn** — Every `src/` file referencing moved directories needs updating. Mitigated by: systematic find-and-replace, verified by test suite.
2. **Plugin auto-discovery** — Root `skills/` is now generated output. If the build hasn't run, the plugin has no skills to discover. Mitigated by: `scaffold build` as part of install workflow, documented in dev-setup.
3. **`package.json` files array** — Must include `content/` and `dist/` for npm distribution. Must exclude `tests/`, `docs/`, etc. Verified during implementation.
4. **CI breakage** — GitHub Actions workflows may reference old paths. Verified during implementation.

## Testing Strategy

1. Run `make check-all` after all path updates to catch breakage
2. Verify `scaffold build` generates output to correct locations
3. Verify `scaffold skill install` resolves templates correctly
4. Verify plugin auto-discovery finds resolved skills in `skills/`
5. Verify `npm pack` includes correct files for distribution
6. Verify CI passes on the restructure branch
