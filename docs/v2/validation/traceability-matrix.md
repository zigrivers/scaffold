# Scaffold v2 Traceability Matrix

**Date:** 2026-03-14
**Methodology:** `knowledge/validation/traceability.md`
**Scope:** PRD → Domain Models → ADRs → Architecture → Data Schemas → CLI Contract → Tasks → Tests

---

## 1. Requirements Extraction

### Functional Requirements (F-NNN)

| ID | Requirement | PRD Ref |
|----|-------------|---------|
| F-001 | Meta-prompt architecture: 32 meta-prompt files declaring step intent (purpose, inputs, outputs, quality criteria, methodology-scaling rules) | §4 |
| F-002 | Knowledge base: 32 domain expertise files organized by topic, reusable across steps | §4 |
| F-003 | Methodology presets: 3 YAML preset files (Deep/MVP/Custom) controlling step enablement and depth | §4, §6 |
| F-004 | Runtime assembly: CLI assembles prompt at runtime from meta-prompt + knowledge + context + instructions + depth | §4, §9 |
| F-005 | 32-step pipeline with phased execution and dependency ordering (Kahn's algorithm) | §5 |
| F-006 | Conditional step evaluation: steps marked "if-needed" evaluated by wizard detection and user override | §5 |
| F-007 | Review phase pattern: 10 phase-specific reviews with failure-mode-specific passes from knowledge base | §5 |
| F-008 | Validation phase: 7 parallel validation steps (cross-phase, traceability, decisions, critical path, implementability, dependency graph, scope creep) | §5 |
| F-009 | Finalization phase: 3 steps (apply fixes and freeze, developer onboarding guide, implementation playbook) | §5 |
| F-010 | Depth scale 1-5: five levels from MVP floor to Deep ceiling, with preset defaults and per-step overrides | §6 |
| F-011 | MVP methodology: 4 steps enabled (create-prd, phase-08, phase-07, implementation-playbook) at depth 1 | §6 |
| F-012 | Methodology changeable mid-pipeline: re-run at higher depth, enable skipped steps, switch methodology | §6 |
| F-013 | Config file (.scaffold/config.yml): methodology, custom overrides, platforms, project metadata | §7 |
| F-014 | Config versioning: version field with auto-migration for old configs, error for newer-than-CLI | §7 |
| F-015 | Config write strategy: atomic (temp + rename), unknown fields preserved on write-back | §7 |
| F-016 | `scaffold init`: methodology wizard with detection phase, methodology selection, conditional step detection | §8, §13 |
| F-017 | `scaffold run <step>`: assemble and execute a pipeline step with advisory lock | §8, §9 |
| F-018 | `scaffold next`: show next unblocked step(s) based on dependency resolution | §8 |
| F-019 | `scaffold status`: show pipeline progress summary | §8 |
| F-020 | `scaffold list`: show full pipeline with per-step status | §8 |
| F-021 | `scaffold skip <step>`: mark step as skipped with reason, with lock | §8 |
| F-022 | `scaffold validate`: check config, state, and artifact consistency | §8 |
| F-023 | `scaffold build`: generate thin platform wrappers from meta-prompt inventory | §8, §12 |
| F-024 | `scaffold adopt`: brownfield mode — scan existing codebase, map to completed steps | §8, §13 |
| F-025 | `scaffold reset`: reset pipeline state with lock | §8 |
| F-026 | `scaffold info <step>`: show step details (meta-prompt, knowledge refs, depth) | §8 |
| F-027 | `scaffold version` / `scaffold update`: show version and check for CLI updates | §8 |
| F-028 | `scaffold dashboard`: generate HTML pipeline progress dashboard | §8 |
| F-029 | `scaffold decisions`: show decision log entries | §8 |
| F-030 | CLI global flags: --format json, --auto, --verbose, --root, --force, --help, --version | §8 |
| F-031 | Exit codes 0-5 with defined meanings (success, validation, dependency, state/lock, cancellation, build) | §8 |
| F-032 | Output modes: interactive (colored), JSON (envelope to stdout), auto (non-interactive defaults) | §8 |
| F-033 | 7-section assembled prompt structure: system, meta-prompt, KB, context, methodology, instructions, execution | §9 |
| F-034 | Update mode: re-run includes existing artifact as context, AI diffs rather than regenerates | §9 |
| F-035 | Three-layer user instructions: global, per-step, inline (--instructions flag) with later-overrides-earlier | §10 |
| F-036 | state.json: map-keyed by step name, committed to git, atomic writes (temp + rename) | §11 |
| F-037 | Per-step state entry: status, timestamp, produces, artifacts_verified, completed_by, depth, reason | §11 |
| F-038 | Dual completion detection: artifact-based primary, state-recorded secondary; artifact takes precedence | §11 |
| F-039 | Crash recovery: detect in_progress on next run, check artifact existence, auto-recover or offer re-run | §11 |
| F-040 | decisions.jsonl: append-only JSONL, sequential IDs (D-NNN), step attribution, prompt_completed flag | §11 |
| F-041 | lock.json: advisory PID-based lock, stale detection via process liveness, --force override, gitignored | §11 |
| F-042 | Claude Code adapter: command files in `commands/` trigger `scaffold run` | §12 |
| F-043 | Codex adapter: `AGENTS.md` entries point to `scaffold run` | §12 |
| F-044 | Universal adapter: `scaffold run` outputs assembled prompt to stdout or file | §12 |
| F-045 | Platform-neutral assembly: identical prompt content across all platforms | §12 |
| F-046 | Init wizard phases: detection (v1/brownfield/greenfield), methodology selection, conditional steps, confirmation | §13 |
| F-047 | Brownfield mode: assembly engine includes existing project context; AI adapts output | §13 |
| F-048 | `scaffold adopt`: scan for artifacts, map to completed steps, generate state with pre-completed entries | §13 |
| F-049 | v1 project detection: detect v1 tracking comments, map artifacts to steps, never modify v1 artifacts | §13 |
| F-050 | CLAUDE.md management: reserved section structure, size budget (~2000 tokens), managed section markers | §14 |
| F-051 | npm primary distribution: global install and npx zero-install | §15 |
| F-052 | Homebrew secondary distribution: formula pulls from npm/GitHub releases | §15 |

### Non-Functional Requirements (NF-NNN)

| ID | Requirement | PRD Ref |
|----|-------------|---------|
| NF-001 | Assembly time: `scaffold run` assembles prompt in under 500ms | §18 |
| NF-002 | Step listing: `scaffold list`, `status`, `next` complete in under 200ms | §18 |
| NF-003 | State reads/writes: reading/writing state.json in under 100ms | §18 |
| NF-004 | No background processes: all operations synchronous, no daemons | §18 |
| NF-005 | Build time: `scaffold build` completes in under 2 seconds | §18 |
| NF-006 | Crash recovery: no data loss if session crashes mid-step | §18 |
| NF-007 | State integrity: atomic writes, fallback to artifact-based detection if corrupted | §18 |
| NF-008 | Idempotent assembly: same inputs produce identical assembled prompts | §18 |
| NF-009 | Merge-safe file formats: map-keyed state, append-only decisions, flat config | §18 |
| NF-010 | OS compatibility: macOS and Linux; Windows via WSL | §18 |
| NF-011 | Node.js 18+ compatibility | §18 |
| NF-012 | No credential storage | §18 |
| NF-013 | No network access (except `scaffold update`) | §18 |
| NF-014 | User instructions are local and committed to git (no hidden injection) | §18 |

### Constraints (C-NNN)

| ID | Constraint | PRD Ref |
|----|-----------|---------|
| C-001 | Node.js as CLI implementation language | §4, §15 |
| C-002 | yargs as CLI framework | §8 |
| C-003 | Sequential prompt execution (no parallel steps within a session) | §5 |
| C-004 | npm scoped package: `@scaffold-cli/scaffold` | §15 |

### Deferred (D-NNN)

| ID | Item | Status | Source |
|----|------|--------|--------|
| D-001 | Community marketplace for methodologies | Deferred | §2 Non-Goals, ADR-031 |
| D-002 | Prompt versioning / rollback | Deferred | §2 Non-Goals, ADR-038 |
| D-003 | Parallel step execution | Non-goal | §2 Non-Goals |
| D-004 | Config inheritance (global defaults) | Deferred | ADR-030 |
| D-005 | Pipeline context store (context.json) | Deferred | ADR-039 |
| D-006 | Context window management strategy | Proposed | ADR-050 |
| D-007 | Depth downgrade policy | Proposed | ADR-051 |
| D-008 | Decision recording interface | Proposed | ADR-052 |
| D-009 | Artifact context scope | Proposed | ADR-053 |
| D-010 | State methodology tracking | Proposed | ADR-054 |

---

## 2. Traceability Matrix

Legend:
- **Domain**: Domain model ID (see index.md for status)
- **ADR**: Architecture Decision Record number
- **Arch**: System architecture section reference
- **Data**: Data schema document (state=state-json-schema, fm=frontmatter-schema, cfg=config-yml-schema, dec=decisions-jsonl-schema, lock=lock-json-schema, sec=secondary-formats, json=json-output-schemas, mfst=manifest-yml-schema)
- **CLI**: CLI contract command name
- **Task**: Implementation task ID
- **Test**: Testing strategy section reference
- `—` = legitimately not applicable for this column
- Empty cell = gap (should be traced but is not)

### Functional Requirements

| Req | Requirement (short) | Domain | ADR | Arch | Data | CLI | Task | Test |
|-----|---------------------|--------|-----|------|------|-----|------|------|
| F-001 | Meta-prompt architecture (32 files) | 08, 15 | 041, 044, 045 | §2, §3c, §4b | fm | `run`, `info`, `build` | T-004, T-013, T-048–T-051 | §4a, §4b |
| F-002 | Knowledge base (32 files) | 15 | 042 | §2, §3c | — | `run`, `info` | T-014, T-045–T-047 | §4b |
| F-003 | Methodology presets (Deep/MVP/Custom) | 16 | 043 | §3b, §3c | mfst | `init` | T-006, T-044 | §4a |
| F-004 | Runtime assembly engine | 15 | 044 | §4b | — | `run` | T-015, T-017 | §4b, §7, §8 |
| F-005 | 32-step pipeline with dependencies | 02, 08 | 009, 021 | §3c, §4a | fm | `list`, `next`, `run` | T-011, T-048–T-051 | §4b, §8 |
| F-006 | Conditional step evaluation | 14 | 020 | §4c | fm | `init`, `list` | T-033 | §4g, §8 |
| F-007 | Review phase pattern (10 reviews) | 08 | 046 | §3c | — | `run` | T-046, T-051 | §4b |
| F-008 | Validation phase (7 steps) | — | — | §3c | — | `run` | T-047 | — |
| F-009 | Finalization phase (3 steps) | — | — | §3c | — | `run` | T-050 | — |
| F-010 | Depth scale 1-5 | 16 | 043 | §3b | cfg, mfst | `run --depth`, `info` | T-012 | §4a, §4b |
| F-011 | MVP methodology (4 steps, depth 1) | 16 | 043 | §3c | mfst | `init` | T-044 | §4a |
| F-012 | Methodology changeable mid-pipeline | 16 | 049 | — | state, cfg | `run` | T-018 | §4b, §8 |
| F-013 | Config file schema & validation | 06 | 014, 033 | §5a | cfg | `init`, `validate` | T-005 | §4a, §7 |
| F-014 | Config versioning & auto-migration | 06 | 014 | §5a | cfg | `init` | T-005 | §4a |
| F-015 | Config atomic write, unknown fields | 06 | 033 | §5a | — | — | T-005 | §5 |
| F-016 | `scaffold init` | 14 | 027, 028 | §4c | cfg, state | `init` | T-032, T-033 | §4g, §8 |
| F-017 | `scaffold run` | 03, 13, 15 | 019, 044, 045 | §4b | state, lock | `run` | T-029 | §4d, §7, §8 |
| F-018 | `scaffold next` | 02 | 009 | §4b | state | `next` | T-024 | §4d |
| F-019 | `scaffold status` | 03 | 012 | — | state | `status` | T-023 | §4d |
| F-020 | `scaffold list` | 02 | — | — | state | `list` | T-026 | §4d |
| F-021 | `scaffold skip` | 03 | 020 | — | state, lock | `skip` | T-030 | §4d |
| F-022 | `scaffold validate` | 06 | 040 | — | cfg, state, fm | `validate` | T-036 | §4g, §7 |
| F-023 | `scaffold build` | 05 | 022 | §4a | cfg | `build` | T-034 | §4e, §9 |
| F-024 | `scaffold adopt` | 07 | 028 | — | state | `adopt` | T-035 | §4g, §8 |
| F-025 | `scaffold reset` | 03 | — | — | state, lock | `reset` | T-031 | §4d |
| F-026 | `scaffold info` | 08 | — | — | fm | `info` | T-025 | §4d |
| F-027 | `scaffold version` / `scaffold update` | — | 002 | §9 | — | `version`, `update` | T-028, T-038 | §4d |
| F-028 | `scaffold dashboard` | — | — | — | state, cfg | `dashboard` | T-037 | §4g, §7 |
| F-029 | `scaffold decisions` | 11 | 013 | — | dec | `decisions` | T-027 | §4d |
| F-030 | Global flags (--format, --auto, --verbose, --force, --root) | 09 | 025, 036 | §2, §7 | json | all | T-019, T-022 | §4c, §6 |
| F-031 | Exit codes 0-5 | 09 | 025 | §7 | json | all | T-019 | §6 |
| F-032 | Output modes (interactive/JSON/auto) | 09 | 025 | §2 | json | all | T-020 | §4c, §6 |
| F-033 | 7-section assembled prompt | 15 | 045 | §4b | — | `run` | T-017 | §4b |
| F-034 | Update mode (diff over regeneration) | 15 | 048 | §4b | state | `run` | T-018 | §4b, §8 |
| F-035 | Three-layer user instructions | — | 047 | §8 | — | `run --instructions` | T-016 | §4b |
| F-036 | state.json (map-keyed, atomic, committed) | 03 | 012 | §5a | state | `run`, `status`, `next` | T-007 | §4a, §5 |
| F-037 | Per-step state entry fields | 03 | 012 | §5a | state | `run` | T-007 | §4a |
| F-038 | Dual completion detection | 03 | 018 | §4b | state | `run`, `next` | T-008 | §4a, §8 |
| F-039 | Crash recovery | 03 | 018 | §4b | state | `run`, `next` | T-008 | §4a, §8 |
| F-040 | decisions.jsonl (append-only JSONL) | 11 | 013 | §5a | dec | `run`, `decisions` | T-009 | §4a |
| F-041 | lock.json advisory locking | 13 | 019 | §5a | lock | `run`, `skip`, `reset` | T-010 | §4a, §7 |
| F-042 | Claude Code adapter | 05 | 022 | §4a | — | `build` | T-040 | §4e |
| F-043 | Codex adapter | 05 | 022 | §4a | — | `build` | T-041 | §4e |
| F-044 | Universal adapter | 05 | 022 | §4a | — | `build` | T-042 | §4e |
| F-045 | Platform-neutral assembly | 05 | 003, 022 | §4a | — | `build` | T-039 | §4e |
| F-046 | Init wizard phases | 14 | 027, 028 | §4c | cfg, state | `init` | T-032, T-033 | §4g, §8 |
| F-047 | Brownfield mode | 07 | 028 | §4c | cfg | `init` | T-032 | §4g, §8 |
| F-048 | `scaffold adopt` scan & map | 07 | 028 | — | state | `adopt` | T-035 | §4g, §8 |
| F-049 | v1 project detection | 07 | 017 | §4c | state | `init` | T-032, T-033, T-054 | §4g, §8 |
| F-050 | CLAUDE.md management | 10 | 017, 026 | §5a | sec | `build`, `run` | T-043 | §4f |
| F-051 | npm distribution | — | 002 | §9 | — | — | T-053 | §10 |
| F-052 | Homebrew distribution | — | 002 | §9 | — | — | T-053 | §10 |

### Non-Functional Requirements

| Req | Requirement (short) | Domain | ADR | Arch | Data | CLI | Task | Test |
|-----|---------------------|--------|-----|------|------|-----|------|------|
| NF-001 | Assembly < 500ms | 15 | — | §9 | — | `run` | T-055 | §9 |
| NF-002 | Listing < 200ms | — | — | — | — | `list`, `status`, `next` | T-055 | §9 |
| NF-003 | State I/O < 100ms | — | — | — | — | — | T-055 | §9 |
| NF-004 | No background processes | — | — | §6 | — | — | — | — |
| NF-005 | Build < 2s | — | — | — | — | `build` | T-055 | §9 |
| NF-006 | Crash recovery (no data loss) | 03 | 018 | §4b | state | `run` | T-008 | §8 |
| NF-007 | State integrity (atomic writes) | 03 | 012 | §5a | state | — | T-007 | §5 |
| NF-008 | Idempotent assembly | 15 | 044 | §4b | — | `run` | T-017 | §4b |
| NF-009 | Merge-safe file formats | 03, 11 | 012, 013 | §5a | state, dec | — | T-007, T-009 | §5 |
| NF-010 | macOS + Linux | — | 001 | — | — | — | T-001, T-053 | — |
| NF-011 | Node.js 18+ | — | 001 | — | — | — | T-001 | §10 |
| NF-012 | No credential storage | — | — | — | — | — | — | §11 |
| NF-013 | No network access (except update) | — | — | — | — | `update` | — | §11 |
| NF-014 | User instructions local & visible | — | 047 | — | — | — | T-016 | §4b |

### Constraints

| Req | Constraint | Domain | ADR | Arch | Data | CLI | Task | Test |
|-----|-----------|--------|-----|------|------|-----|------|------|
| C-001 | Node.js implementation | — | 001 | — | — | — | T-001 | — |
| C-002 | yargs CLI framework | — | 001 | §9 | — | — | T-019 | — |
| C-003 | Sequential prompt execution | — | 021 | §6 | — | — | T-029 | §4d |
| C-004 | npm scope (@scaffold-cli/scaffold) | — | 002 | §9 | — | — | T-053 | — |

---

## 3. Gap Analysis

### 3a. Forward Gaps (Requirement → Implementation)

| Req ID | Requirement | Missing Columns | Severity | Recommended Action |
|--------|-------------|-----------------|----------|-------------------|
| F-008 | Validation phase (7 steps) | Domain, ADR, Test | Minor | Content steps — test coverage comes from E2E tests after meta-prompts authored (T-047). No dedicated test section needed until content exists. |
| F-009 | Finalization phase (3 steps) | Domain, ADR, Test | Minor | Same as F-008 — content steps tested through E2E after authoring (T-050). |
| F-020 | `scaffold list` | ADR | Minor | No dedicated ADR for `list` — behavior follows from general CLI contract (ADR-025). Acceptable implicit trace. |
| F-025 | `scaffold reset` | ADR | Minor | No dedicated ADR for `reset` — straightforward state mutation. Acceptable. |
| F-026 | `scaffold info` | ADR | Minor | No dedicated ADR — simple read-only display command. Acceptable. |
| F-028 | `scaffold dashboard` | Domain, ADR | Minor | Dashboard is a utility; no domain model or ADR needed. |
| F-051 | npm distribution | Domain, Test | Major | **Addressed**: Added §10 Distribution Verification Tests to testing-strategy.md; updated T-053 acceptance criteria with smoke tests. |
| F-052 | Homebrew distribution | Domain, Test | Major | **Addressed**: Added Homebrew formula verification to testing-strategy.md §10. |
| NF-004 | No background processes | Task, Test | Minor | Architectural constraint enforced by design (synchronous I/O). No explicit task needed. |
| NF-010 | macOS + Linux | Test | Minor | No explicit cross-platform test section. CI matrix handles this implicitly but testing-strategy.md doesn't document it. |
| NF-012 | No credential storage | Task, Test | Minor | **Addressed**: Added CI enforcement script and checklist to security-practices.md §8; added to testing-strategy.md §11 CI gates. |
| NF-013 | No network access | Task, Test | Minor | **Addressed**: Added CI enforcement script (`check-no-network.sh`) to security-practices.md §8; added to testing-strategy.md §11 CI gates. |

**Summary:**
- **Critical gaps (no task AND no test)**: 0
- **Major gaps (task but no test, or test but no task)**: 0 (F-051, F-052 addressed — distribution testing added to §10)
- **Minor gaps (missing intermediate trace)**: 10 (6 acceptable implicit traces, 4 addressed via enforcement scripts)

### 3b. Backward Gaps (Implementation → Requirement)

| Task ID | Task Description | Traced Requirement | Status |
|---------|------------------|--------------------|--------|
| T-001 | Initialize TypeScript project scaffolding | C-001, NF-010, NF-011 | Traced (infrastructure) |
| T-002 | Define core shared type definitions | F-013, F-036, F-030–F-032 | Traced (cross-cutting types) |
| T-003 | Implement utility modules and error system | F-031 (exit codes), NF-* | Traced (infrastructure) |
| T-004 | Implement frontmatter parser | F-001 | Traced |
| T-005 | Implement config loader and validator | F-013, F-014, F-015 | Traced |
| T-006 | Implement methodology preset loader | F-003 | Traced |
| T-007 | Implement state manager | F-036, F-037, NF-007 | Traced |
| T-008 | Implement completion detection | F-038, F-039, NF-006 | Traced |
| T-009 | Implement decision logger | F-040 | Traced |
| T-010 | Implement lock manager | F-041 | Traced |
| T-011 | Implement dependency resolver | F-005 | Traced |
| T-012 | Implement methodology/depth resolution | F-010, F-012 | Traced |
| T-013 | Implement meta-prompt loader | F-001, F-004 | Traced |
| T-014 | Implement knowledge base loader | F-002, F-004 | Traced |
| T-015 | Implement context gatherer | F-004 | Traced |
| T-016 | Implement user instruction loader | F-035, NF-014 | Traced |
| T-017 | Implement assembly engine orchestrator | F-004, F-033, NF-008 | Traced |
| T-018 | Implement update mode & methodology change | F-034, F-012 | Traced |
| T-019 | Set up CLI framework with yargs | F-030, F-031, C-002 | Traced |
| T-020 | Implement output context system | F-032 | Traced |
| T-021 | Implement error display and formatting | F-031, F-032 | Traced |
| T-022 | Implement CLI middleware | F-030 | Traced |
| T-023 | Implement `scaffold status` | F-019 | Traced |
| T-024 | Implement `scaffold next` | F-018 | Traced |
| T-025 | Implement `scaffold info` | F-026 | Traced |
| T-026 | Implement `scaffold list` | F-020 | Traced |
| T-027 | Implement `scaffold decisions` | F-029 | Traced |
| T-028 | Implement `scaffold version` | F-027 | Traced |
| T-029 | Implement `scaffold run` | F-017, C-003 | Traced |
| T-030 | Implement `scaffold skip` | F-021 | Traced |
| T-031 | Implement `scaffold reset` | F-025 | Traced |
| T-032 | Implement project detector | F-046, F-047, F-049 | Traced |
| T-033 | Implement init wizard | F-016, F-046 | Traced |
| T-034 | Implement `scaffold build` | F-023 | Traced |
| T-035 | Implement `scaffold adopt` | F-024, F-048 | Traced |
| T-036 | Implement `scaffold validate` | F-022 | Traced |
| T-037 | Implement `scaffold dashboard` | F-028 | Traced |
| T-038 | Implement `scaffold update` | F-027 | Traced |
| T-039 | Define adapter interface and factory | F-045 | Traced |
| T-040 | Implement Claude Code adapter | F-042 | Traced |
| T-041 | Implement Codex adapter | F-043 | Traced |
| T-042 | Implement Universal adapter | F-044 | Traced |
| T-043 | Implement CLAUDE.md manager | F-050 | Traced |
| T-044 | Author methodology preset files | F-003, F-011 | Traced |
| T-045 | Author core domain expertise KB files | F-002 | Traced |
| T-046 | Author review KB files | F-002, F-007 | Traced |
| T-047 | Author validation and product KB files | F-002, F-008 | Traced |
| T-048 | Author meta-prompts — product & domain | F-001, F-005 | Traced |
| T-049 | Author meta-prompts — architecture & data | F-001, F-005 | Traced |
| T-050 | Author meta-prompts — implementation–finalization | F-001, F-009 | Traced |
| T-051 | Author meta-prompts — review steps | F-001, F-007 | Traced |
| T-052 | Implement E2E integration tests | NF-006 (testing) | Traced |
| T-053 | Configure npm packaging and distribution | F-051, F-052, C-004 | Traced |
| T-054 | Write v1 to v2 migration guide | F-049 | Traced |
| T-055 | Validate performance against PRD budgets | NF-001–NF-005 | Traced |

**Orphaned tasks: 0** — All 55 tasks trace to at least one PRD requirement.

### 3c. Deferred Items Downstream

| Deferred ID | Item | Found Downstream? | Status |
|-------------|------|-------------------|--------|
| D-001 | Community marketplace | No | Clean — ADR-031 explicitly defers |
| D-002 | Prompt versioning | No | Clean — ADR-038 explicitly defers |
| D-003 | Parallel step execution | No | Clean — Non-goal in §2 |
| D-004 | Config inheritance | No | Clean — ADR-030 explicitly defers |
| D-005 | Pipeline context store | No | Clean — ADR-039 explicitly defers |
| D-006 | Context window management | No | Clean — ADR-050 is "proposed" status, no task |
| D-007 | Depth downgrade policy | No | Clean — ADR-051 is "proposed" status, no task |
| D-008 | Decision recording interface | No | Clean — ADR-052 is "proposed" status, no task |
| D-009 | Artifact context scope | No | Clean — ADR-053 is "proposed" status, no task |
| D-010 | State methodology tracking | No | Clean — ADR-054 is "proposed" status, no task |

**Deferred items with downstream traces: 0** — No scope creep detected.

---

## 4. Coverage Summary

| Metric | Count |
|--------|-------|
| Total requirements extracted | 80 |
| — Functional (F-NNN) | 52 |
| — Non-Functional (NF-NNN) | 14 |
| — Constraints (C-NNN) | 4 |
| — Deferred (D-NNN) | 10 |
| Active requirements (F + NF + C) | 70 |
| Fully traced (all applicable cells filled) | 60 |
| Partially traced (some cells missing) | 10 |
| Not traced (no downstream references) | 0 |
| Orphaned tasks (no requirement) | 0 |
| Deferred items with downstream traces | 0 |

**Trace completeness for active requirements: 86% fully traced, 14% partially traced, 0% untraced.**

---

## 5. Observations

- **Strong overall traceability (86% fully traced).** Every active requirement traces to at least one task and most trace through all applicable columns (domain → ADR → architecture → data → CLI → task → test). Zero requirements are untraced. Coverage improved from 80% to 86% after addressing distribution and security enforcement gaps.

- **Distribution testing gap addressed.** F-051 (npm) and F-052 (Homebrew) now have test coverage via §10 (Distribution Verification Tests) in testing-strategy.md. T-053 acceptance criteria updated with smoke test requirements. No remaining major gaps.

- **Content-phase steps (F-008, F-009) lack test coverage by design.** The validation and finalization phases are content-authored meta-prompts (T-047, T-050). Testing them requires authored content + E2E execution, which is appropriate for Phase 3 of the migration plan. Not a gap — just sequencing.

- **Security NFRs (NF-012, NF-013) now have automated enforcement.** CI scripts (`check-no-credentials.sh`, `check-no-network.sh`) documented in security-practices.md §8 and added to testing-strategy.md §11 CI pipeline quality gates. These make the architectural constraints explicitly verifiable.

- **5 proposed ADRs (050-054) have resolution recommendations.** Each ADR now includes a "Resolution Recommendation" section with recommended decision, rationale, impact analysis, blocking tasks, and timing guidance. ADR statuses remain "proposed" — recommendations are advisory pending user review. ADR-050/053 (context management) and ADR-052 (decision recording) are the most architecturally impactful and should be resolved before Phase 2.
