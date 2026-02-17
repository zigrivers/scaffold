<!-- scaffold:user-stories-mmr v1.0 2026-02-17 -->
# PRD Requirements Index

Atomic requirements extracted from `docs/plan.md` for traceability. Each requirement is a single, testable assertion that a developer could write a pass/fail test for.

**Source**: PRD v1 (928 lines)
**Extraction date**: 2026-02-17
**Total requirements**: 142

## Section 4: Feature Requirements

### F-PE-1: Dependency Graph Resolution

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-001 | Prompts declare dependencies via `depends-on` in frontmatter | F-PE-1 | Must |
| REQ-002 | Engine performs topological sort to determine execution order | F-PE-1 | Must |
| REQ-003 | Within a phase, prompts with satisfied dependencies appear in profile-defined order | F-PE-1 | Must |
| REQ-004 | Circular dependencies are detected at pipeline resolution time (before any prompt executes) | F-PE-1 | Must |
| REQ-005 | Circular dependency error reports the full cycle path | F-PE-1 | Must |
| REQ-006 | Missing dependency in profile reports: "Prompt X depends on Y, but Y is not in this pipeline" | F-PE-1 | Must |
| REQ-007 | Dependencies are always on prompt names (strings), not on artifact files | F-PE-1 | Must |
| REQ-008 | extra-prompts/add-prompts referencing non-existent prompt at any tier is a resolution error | F-PE-1 | Must |
| REQ-009 | Topological sort uses Kahn's algorithm with profile-defined order as tiebreaker | F-PE-1 | Must |
| REQ-010 | After sorting, verification step confirms every prompt appears after all its dependencies | F-PE-1 | Must |
| REQ-011 | Resolution happens once at init time and is cached in config.json | F-PE-1 | Must |
| REQ-012 | Resolution re-runs when the profile or prompt list changes | F-PE-1 | Must |

### F-PE-2: Pipeline State Tracking

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-013 | config.json records which prompts are completed, pending, and pipeline metadata | F-PE-2 | Must |
| REQ-014 | Completion is recorded by adding prompt name to `completed` array with timestamp | F-PE-2 | Must |
| REQ-015 | Primary completion detection: `resume` checks if prompt's `produces` artifacts exist on disk | F-PE-2 | Must |
| REQ-016 | Secondary completion detection: `resume` records completion by adding to `completed` array | F-PE-2 | Must |
| REQ-017 | When artifact exists but not in `completed` array, artifact takes precedence (prompt is complete) | F-PE-2 | Must |
| REQ-018 | When `completed` says done but artifacts missing, resume warns and suggests re-run | F-PE-2 | Must |
| REQ-019 | Re-running a completed prompt replaces its previous completion entry (not duplicate) | F-PE-2 | Must |
| REQ-020 | config.json format matches the specified JSON structure (scaffold-version, profile, mode, created, prompts, completed, skipped, extra-prompts, resolved-overrides, custom-config) | F-PE-2 | Must |

### F-PE-3: Pipeline Context

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-021 | Shared context object in `.scaffold/context.json` accumulates data across prompts | F-PE-3 | Should |
| REQ-022 | Context uses namespaced keys (e.g., `tech-stack.language`) | F-PE-3 | Should |
| REQ-023 | Context is append-only; a prompt can overwrite its own namespace but not another's | F-PE-3 | Should |
| REQ-024 | Context values are JSON (strings, numbers, booleans, arrays, objects) — no binary | F-PE-3 | Should |
| REQ-025 | If context.json doesn't exist when read, prompt sees empty object (not an error) | F-PE-3 | Should |
| REQ-026 | If F-PE-3 is deferred, all references to context.json are removed and prompts read predecessor files directly | F-PE-3 | Should |

### F-PE-4: Prompt Execution

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-027 | Scaffold loads prompt content resolved via 3-tier precedence | F-PE-4 | Must |
| REQ-028 | `$ARGUMENTS` is substituted if present; replaced with empty string if no arguments | F-PE-4 | Must |
| REQ-029 | Prompts execute one at a time, sequentially (no automatic parallel execution) | F-PE-4 | Must |
| REQ-030 | Pre-execution preview shows which files will be created/updated from `produces` field | F-PE-4 | Should |
| REQ-031 | After prompt completes, Scaffold shows "Prompt X complete. Next: Y. Run it now?" | F-PE-4 | Must |
| REQ-032 | Failed prompt (user aborts, Claude errors) is NOT marked complete | F-PE-4 | Must |
| REQ-033 | Scaffold does not modify prompt content beyond `$ARGUMENTS` substitution | F-PE-4 | Must |

### F-PE-5: Predecessor Artifact Verification (Step Gating)

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-034 | Before prompt executes, verify predecessor prompts' `produces` artifacts exist on disk | F-PE-5 | Must |
| REQ-035 | Missing artifact shows warning with 3 options: Run predecessor / Proceed anyway / Cancel | F-PE-5 | Must |
| REQ-036 | "Run predecessor first" executes the missing prompt, then returns to original | F-PE-5 | Must |
| REQ-037 | "Proceed anyway" continues execution without the missing artifact | F-PE-5 | Must |
| REQ-038 | If predecessor was skipped, its artifacts are not required | F-PE-5 | Must |
| REQ-039 | Verification runs before `$ARGUMENTS` substitution and prompt loading | F-PE-5 | Must |

### F-PE-6: Decision Log

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-040 | Append-only JSON log at `.scaffold/decisions.json` persists key decisions | F-PE-6 | Should |
| REQ-041 | Decision log format: `[{ "prompt": "...", "decision": "...", "at": "..." }]` | F-PE-6 | Should |
| REQ-042 | Entries are never modified or deleted (append-only) | F-PE-6 | Should |
| REQ-043 | Created by `init` as an empty array `[]` | F-PE-6 | Should |
| REQ-044 | Each prompt optionally records 1-3 key decisions after execution | F-PE-6 | Should |
| REQ-045 | Decision log is committed to git alongside other `.scaffold/` files | F-PE-6 | Should |
| REQ-046 | `reset` deletes `.scaffold/decisions.json` | F-PE-6 | Should |

### F-PR-1: Built-in Profiles

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-047 | `web-app` profile includes 18 specific prompts as listed in PRD | F-PR-1 | Must |
| REQ-048 | `cli-tool` profile includes 16 prompts (excludes design-system, add-playwright, add-maestro, multi-model-review, platform-parity-review) | F-PR-1 | Must |
| REQ-049 | `mobile` profile includes 18 prompts including `add-maestro` (not `add-playwright`) | F-PR-1 | Must |
| REQ-050 | `api-service` profile includes same 16 prompts as `cli-tool` | F-PR-1 | Must |
| REQ-051 | `minimal` profile includes 10 prompts (fastest path to implementation) | F-PR-1 | Must |
| REQ-052 | Built-in profiles are read-only (users cannot modify them directly) | F-PR-1 | Must |

### F-PR-2: Custom Profiles

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-053 | Users can create profiles in `.scaffold/profiles/` (project-level) or `~/.scaffold/profiles/` (user-level) | F-PR-2 | Must |
| REQ-054 | Custom profile format: name, extends (optional), description, add-prompts, remove-prompts, prompt-overrides | F-PR-2 | Must |
| REQ-055 | If `extends` omitted, profile must include full `prompts` array | F-PR-2 | Must |
| REQ-056 | `add-prompts` and `remove-prompts` applied after inheriting: adds first, then removes | F-PR-2 | Must |
| REQ-057 | Array order in `prompts` and `add-prompts` is preserved as tiebreaker | F-PR-2 | Must |
| REQ-058 | `prompt-overrides` maps prompt names to file paths; paths resolve relative to project root | F-PR-2 | Must |
| REQ-059 | Custom profiles appear alongside built-in profiles during `scaffold init` | F-PR-2 | Must |
| REQ-060 | Project-level profiles take precedence over user-level profiles with same name | F-PR-2 | Must |

### F-PR-3: Profile Inheritance

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-061 | Inheritance depth limited to 3 levels; deeper chains rejected | F-PR-3 | Must |
| REQ-062 | Resolution order: base profile's prompts → add-prompts → remove-prompts → prompt-overrides (each level) | F-PR-3 | Must |
| REQ-063 | Removing a prompt that an added prompt depends on surfaces dependency conflict | F-PR-3 | Must |
| REQ-064 | Circular inheritance (A extends B extends A) detected and rejected | F-PR-3 | Must |

### F-PS-1: Prompt Format

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-065 | Prompts are Markdown files with optional YAML frontmatter | F-PS-1 | Must |
| REQ-066 | Frontmatter fields: description (required), depends-on, phase, argument-hint, produces, reads | F-PS-1 | Must |
| REQ-067 | `depends-on` defaults to empty array if omitted | F-PS-1 | Must |
| REQ-068 | `phase` defaults to phase of last dependency, or 1 if no dependencies | F-PS-1 | Must |
| REQ-069 | `produces` required for built-in prompts, optional for custom | F-PS-1 | Must |
| REQ-070 | `reads` optional; used by skill to pre-load predecessor documents | F-PS-1 | Must |
| REQ-071 | All v1 prompts will have frontmatter added/updated to declare depends-on and produces | F-PS-1 | Must |
| REQ-072 | The specific dependency graph declared in PRD (prd-gap-analysis depends on create-prd, etc.) | F-PS-1 | Must |
| REQ-073 | `$ARGUMENTS` is the only substitution variable | F-PS-1 | Must |
| REQ-074 | If no arguments provided, `$ARGUMENTS` replaced with empty string; prompt asks user for input | F-PS-1 | Must |

### F-PS-2: Prompt Precedence

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-075 | 4-tier precedence: profile override → project-level → user-level → built-in (first match wins) | F-PS-2 | Must |
| REQ-076 | Profile override pointing to non-existent file is a resolution error | F-PS-2 | Must |
| REQ-077 | Scaffold logs which source was used when executing a prompt | F-PS-2 | Must |
| REQ-078 | Custom prompt with no frontmatter inherits metadata from built-in it overrides | F-PS-2 | Must |
| REQ-079 | New custom prompt with no frontmatter has no dependencies and defaults to Phase 1 | F-PS-2 | Must |

### F-PS-3: Adding Custom Prompts

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-080 | Custom prompts identified by filename (without .md), lowercase, hyphenated | F-PS-3 | Must |
| REQ-081 | Custom prompt appears in pipeline at position determined by phase and depends-on | F-PS-3 | Must |
| REQ-082 | Custom prompts can depend on built-in prompts; built-in prompts never depend on custom | F-PS-3 | Must |
| REQ-083 | Simply placing a file in `.scaffold/prompts/` does NOT auto-include it in pipeline | F-PS-3 | Must |

### F-UX-1: scaffold init

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-084 | `init` is a single entry-point command handling profile selection, resolution, config creation | F-UX-1 | Must |
| REQ-085 | Invoked as `/scaffold:init` or `/scaffold:init <idea>` | F-UX-1 | Must |
| REQ-086 | If `<idea>` provided, stored and passed as `$ARGUMENTS` to create-prd | F-UX-1 | Must |
| REQ-087 | Creates `.scaffold/` directory with config.json | F-UX-1 | Must |
| REQ-088 | If config.json already exists, warns and stops (unless `--force`) | F-UX-1 | Must |
| REQ-089 | After profile selection and pipeline display, asks user to confirm before starting first prompt | F-UX-1 | Must |
| REQ-090 | `init` is NOT a prompt in the pipeline — it's the orchestrator | F-UX-1 | Must |
| REQ-091 | Profile discovery: built-in → project-level → user-level; project-level takes precedence for same name | F-UX-1 | Must |
| REQ-092 | Two-question profile selection flow: Q1 project type, Q2 varies by answer | F-UX-1 | Must |
| REQ-093 | "Custom" option walks through per-phase prompt selection with multiSelect | F-UX-1 | Must |
| REQ-094 | Phases with >4 prompts split across multiple questions (groups of ≤4) | F-UX-1 | Must |
| REQ-095 | Zero prompts selected shows "At least one prompt must be selected" with minimal pipeline | F-UX-1 | Must |
| REQ-096 | User cancels during profile selection → no files written, no state change | F-UX-1 | Must |
| REQ-097 | `--force` deletes config.json, context.json, decisions.json but preserves prompts/ and profiles/ | F-UX-1 | Must |
| REQ-098 | `--force` shows what will be reset and requires user confirmation | F-UX-1 | Must |

### F-UX-2: scaffold resume

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-099 | Reads config.json to determine next uncompleted prompt | F-UX-2 | Must |
| REQ-100 | Shows pipeline progress: "8/18 prompts complete" | F-UX-2 | Must |
| REQ-101 | Supports `--from <prompt-name>` to restart from specific prompt | F-UX-2 | Must |
| REQ-102 | If all prompts complete, suggests next actions (enhancement, implementation) | F-UX-2 | Must |
| REQ-103 | If config.json doesn't exist, shows "No pipeline found. Run /scaffold:init to start." | F-UX-2 | Must |

### F-UX-3: Dry Run / Preview

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-104 | `/scaffold:init --dry-run` or `/scaffold:preview` resolves and displays pipeline without executing | F-UX-3 | Should |
| REQ-105 | Shows full resolved pipeline: prompt names, phases, dependencies, source tier, expected artifacts | F-UX-3 | Should |
| REQ-106 | Shows resolution errors inline | F-UX-3 | Should |
| REQ-107 | Does not create `.scaffold/` directory or any files | F-UX-3 | Should |
| REQ-108 | Can be run outside a project directory to preview built-in profiles | F-UX-3 | Should |

### F-UX-4: Pipeline Progress Display

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-109 | After prompt completes or resume runs, shows completed/total, current phase, next prompt | F-UX-4 | Must |
| REQ-110 | Completed prompts show ✓, next prompt shows →, pending prompts indented | F-UX-4 | Must |
| REQ-111 | Progress displayed after each prompt completes and when resume invoked | F-UX-4 | Must |

### F-UX-5: scaffold status

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-112 | `/scaffold:status` displays pipeline progress without offering to run next prompt | F-UX-5 | Must |
| REQ-113 | If config.json doesn't exist, shows "No pipeline found" message | F-UX-5 | Must |
| REQ-114 | If all complete, shows "Pipeline complete (18/18). Profile: web-app." | F-UX-5 | Must |
| REQ-115 | Skipped prompts show as `⊘ prompt-name (skipped)` | F-UX-5 | Must |

### F-UX-6: scaffold skip

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-116 | `/scaffold:skip <prompt-name>` records prompt as skipped in config.json | F-UX-6 | Must |
| REQ-117 | Skipped format: `{ "prompt": "...", "at": "...", "reason": "..." }` in `skipped` array | F-UX-6 | Must |
| REQ-118 | Scaffold prompts for reason (optional) | F-UX-6 | Must |
| REQ-119 | Skipped prompts treated as "done" for dependency resolution | F-UX-6 | Must |
| REQ-120 | Cannot skip an already-completed prompt | F-UX-6 | Must |
| REQ-121 | Cannot skip the last remaining prompt | F-UX-6 | Must |
| REQ-122 | Skipped prompt un-skippable via `--from` | F-UX-6 | Must |

### F-UX-7: Smart Profile Suggestion

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-123 | When idea text provided, Claude analyzes and recommends profile | F-UX-7 | Should |
| REQ-124 | Recommended profile appears first with "(Recommended)" appended | F-UX-7 | Should |
| REQ-125 | Without idea text, no recommendation — all options equal | F-UX-7 | Should |
| REQ-126 | Keyword-to-profile mapping defined in PRD (web app→web-app, CLI→cli-tool, etc.) | F-UX-7 | Should |
| REQ-127 | File-based signals: package.json deps, Expo config, bin/ directory | F-UX-7 | Should |
| REQ-128 | File-based signals override keyword signals when they conflict | F-UX-7 | Should |
| REQ-129 | If no clear signal, default to no recommendation | F-UX-7 | Should |

### F-UX-8: scaffold validate

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-130 | Validates profiles and prompt files for errors without modifying files | F-UX-8 | Must |
| REQ-131 | Performs 7 specific checks (profile JSON, extends, prompt names, override paths, frontmatter, depends-on, cycles) | F-UX-8 | Must |
| REQ-132 | If no errors: "All profiles and prompts are valid." | F-UX-8 | Must |
| REQ-133 | Errors grouped by source file with actionable messages | F-UX-8 | Must |
| REQ-134 | Supports validating specific profile: `/scaffold:validate <name>` | F-UX-8 | Must |

### F-UX-9: scaffold reset

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-135 | Reset deletes config.json, context.json, decisions.json | F-UX-9 | Must |
| REQ-136 | Reset preserves `.scaffold/prompts/` and `.scaffold/profiles/` | F-UX-9 | Must |
| REQ-137 | Shows what will be deleted/preserved and requires user confirmation | F-UX-9 | Must |
| REQ-138 | If config.json doesn't exist: "No pipeline state to reset." | F-UX-9 | Must |

### F-UX-10: Brownfield Mode

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-139 | Detection triggers: package manifest with ≥1 dep, or src/lib/ with ≥1 source file | F-UX-10 | Should |
| REQ-140 | Offers brownfield vs greenfield choice when detection triggers | F-UX-10 | Should |
| REQ-141 | `--brownfield` flag sets mode without prompting | F-UX-10 | Should |
| REQ-142 | Config.json includes `"mode": "brownfield"` or `"mode": "greenfield"` | F-UX-10 | Should |
| REQ-143 | Only 4 prompts have brownfield variants: create-prd, tech-stack, project-structure, dev-env-setup | F-UX-10 | Should |
| REQ-144 | Brownfield variants: create-prd reads existing code to draft PRD | F-UX-10 | Should |
| REQ-145 | Brownfield variants: tech-stack reads package manifests and presents detected stack | F-UX-10 | Should |
| REQ-146 | Brownfield variants: project-structure documents existing structure | F-UX-10 | Should |
| REQ-147 | Brownfield variants: dev-env-setup documents existing dev commands | F-UX-10 | Should |
| REQ-148 | Brownfield implemented as conditional sections within existing prompts, not separate files | F-UX-10 | Should |
| REQ-149 | Prompts detect brownfield by reading config.json `mode` field | F-UX-10 | Should |

### F-UX-11: scaffold next

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-150 | `/scaffold:next` shows next eligible prompt with name, description, produces, reads | F-UX-11 | Must |
| REQ-151 | If multiple eligible (parallel within phase), shows all | F-UX-11 | Must |
| REQ-152 | If all complete: "Pipeline complete. All prompts have been executed." | F-UX-11 | Must |
| REQ-153 | If no config: "No pipeline found. Run /scaffold:init to start." | F-UX-11 | Must |
| REQ-154 | Does not modify state or offer to execute | F-UX-11 | Must |

### F-UX-12: scaffold adopt

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-155 | `/scaffold:adopt` scans for package manifests, docs/, README, test configs, CI configs | F-UX-12 | Should |
| REQ-156 | Maps findings to Scaffold prompts and marks them complete | F-UX-12 | Should |
| REQ-157 | Sets `mode: "brownfield"` in config.json | F-UX-12 | Should |
| REQ-158 | Shows what was detected and requires user confirmation | F-UX-12 | Should |

### F-V1-1: v1 Project Detection

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-159 | Detects v1 project by presence of expected artifacts without `.scaffold/` directory | F-V1-1 | Should |
| REQ-160 | Artifact-to-prompt mapping uses `produces` field from frontmatter | F-V1-1 | Should |
| REQ-161 | Never modifies existing v1 artifacts during detection | F-V1-1 | Should |
| REQ-162 | Shows what was detected and asks user to confirm | F-V1-1 | Should |
| REQ-163 | After detection, pipeline continues with uncompleted prompts | F-V1-1 | Should |

### F-V1-2: v1 Migration (Deprecated)

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-164 | No dedicated migration prompts needed — universal update mode handles v1 projects | F-V1-2 | Won't |

### F-SC-1: Standalone Commands

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-165 | Standalone commands (quick-task, new-enhancement, etc.) accessible at any time | F-SC-1 | Must |
| REQ-166 | Standalone commands do not appear in pipeline preview or progress | F-SC-1 | Must |
| REQ-167 | Standalone commands do not require config.json to exist (except resume) | F-SC-1 | Must |
| REQ-168 | `prompt-pipeline` shows resolved pipeline from config.json if exists, else built-in reference | F-SC-1 | Must |
| REQ-169 | `user-stories-multi-model-review` and `platform-parity-review` are opt-in pipeline prompts | F-SC-1 | Must |
| REQ-170 | Opt-in prompts addable via `add-prompts` in profile or `extra-prompts` in config.json | F-SC-1 | Must |

## Section 3: Core User Flows (additional requirements not in Section 4)

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-171 | Init flow: resolved pipeline displayed as numbered, phase-grouped list before user confirms | Flow 1 | Must |
| REQ-172 | Resume flow: corrupt config.json → fallback to artifact-based detection and regenerate | Flow 2 | Must |
| REQ-173 | Resume flow: user-modified config.json → validate extra-prompts references and re-resolve deps | Flow 2 | Must |
| REQ-174 | Resume flow: newer scaffold-version in config → warn but continue operating | Flow 2 | Must |
| REQ-175 | Resume all complete: show completion summary with artifacts created, decisions logged, total time, next steps | Flow 2 | Must |
| REQ-176 | Custom prompt flow: custom prompt file follows same format (Markdown + optional YAML frontmatter) | Flow 3 | Must |
| REQ-177 | Custom prompt flow: invalid frontmatter shows clear error with field name and valid values | Flow 3 | Must |
| REQ-178 | Custom prompt flow: Scaffold does not validate prompt content — trusts user's customization | Flow 3 | Must |
| REQ-179 | Profile flow: profile appears in init selection alongside built-in profiles | Flow 4 | Must |
| REQ-180 | v1 detection flow: ambiguous profile → present candidates via AskUserQuestion | Flow 6 | Should |
| REQ-181 | v1 detection flow: partial v1 project → only mark prompts complete where ALL produces exist | Flow 6 | Should |

## Section 5: Data Model (additional constraints)

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-182 | Config versioning: unknown fields preserved on read/write, missing fields use defaults | Section 5 | Must |
| REQ-183 | If scaffold-version newer than running version, warn but don't refuse to operate | Section 5 | Must |
| REQ-184 | `.scaffold/` directory contents committed to git; `~/.scaffold/` is not | Section 5 | Must |

## Section 6: External Integrations

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-185 | All pipeline logic expressed as natural-language instructions in prompt files (not compiled code) | Section 6 | Must |
| REQ-186 | Instructions must be precise with verification steps | Section 6 | Must |
| REQ-187 | Plugin manifest updated with new version and description | Section 6 | Must |
| REQ-188 | Auto-activated skill updated to reference v2 pipeline from config.json | Section 6 | Must |
| REQ-189 | Skill falls back to showing profiles if no config exists | Section 6 | Must |
| REQ-190 | Optional `reads` field: skill ensures Claude has read listed files before prompt runs | Section 6 | Should |
| REQ-191 | Missing file in `reads` is skipped silently (no error) | Section 6 | Should |

## Section 7: Non-Functional Requirements

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-192 | Pipeline resolution for up to 50 prompts completes in under 1 second | NFR-Perf | Must |
| REQ-193 | Prompt loading from any tier completes in under 100ms | NFR-Perf | Must |
| REQ-194 | Config reads/writes complete in under 100ms | NFR-Perf | Must |
| REQ-195 | No background processes, daemons, or watchers | NFR-Perf | Must |
| REQ-196 | Crash recovery: session crash mid-prompt → prompt not marked complete, user can resume | NFR-Rel | Must |
| REQ-197 | Config integrity: incomplete config.json → resume detects and recovers via artifact scanning | NFR-Rel | Must |
| REQ-198 | Idempotent prompts: running twice does not produce corrupt state | NFR-Rel | Must |
| REQ-199 | Requires Claude Code with plugin support | NFR-Compat | Must |
| REQ-200 | macOS and Linux supported; Windows via WSL expected to work | NFR-Compat | Must |
| REQ-201 | No Node.js dependency for Scaffold itself | NFR-Compat | Must |
| REQ-202 | Each prompt is self-contained — modifying one doesn't require changes to others | NFR-Maint | Must |
| REQ-203 | Config files versioned with scaffold-version field for future migrations | NFR-Maint | Must |
| REQ-204 | Plugin remains small with no external runtime dependencies | NFR-Maint | Must |
| REQ-205 | No credential storage by Scaffold | NFR-Sec | Must |
| REQ-206 | No network access by Scaffold's engine | NFR-Sec | Must |
| REQ-207 | `.scaffold/` uses default file permissions | NFR-Sec | Must |

## Section 9: Out of Scope (Negative Requirements)

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-208 | No automatic prompt execution without user confirmation | Out of Scope | Won't |
| REQ-209 | No prompt versioning or rollback within Scaffold | Out of Scope | Won't |
| REQ-210 | No remote profile registry or marketplace | Out of Scope | Won't |
| REQ-211 | No GUI or web interface — CLI-only | Out of Scope | Won't |
| REQ-212 | No support for non-Claude Code environments | Out of Scope | Won't |
| REQ-213 | No runtime prompt generation — prompts are static Markdown | Out of Scope | Won't |
| REQ-214 | No prompt marketplace for third-party prompts | Out of Scope | Won't |
| REQ-215 | No parallel prompt execution (only parallel agents during implementation) | Out of Scope | Won't |
| REQ-216 | No breaking changes to prompt content in v2 (engine only) | Out of Scope | Won't |
| REQ-217 | No removal of Beads dependency | Out of Scope | Won't |

## Section 2: UX Constraints (additional)

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-218 | AskUserQuestion supports 2-4 options per question (plus automatic "Other") | UX Constraints | Must |
| REQ-219 | multiSelect: true allows selecting multiple from same 2-4 limit | UX Constraints | Must |
| REQ-220 | Interrupted AskUserQuestion results in no state change | UX Constraints | Must |
| REQ-221 | Selections with >4 items split across multiple sequential questions | UX Constraints | Must |
