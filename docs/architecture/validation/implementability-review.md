# Scaffold v2 Implementability Review

**Date:** 2026-03-14
**Methodology:** `knowledge/validation/implementability-review.md`
**Scope:** 55 tasks (T-001 through T-055) dry-run against 8 specification artifacts

---

## Summary

| Task | Title | Score | Gaps | Critical | Assessment | Status |
|------|-------|-------|------|----------|------------|--------|
| T-001 | Initialize TypeScript project scaffolding | 4→5 | 3 | 0 | Minor clarifications needed | Resolved |
| T-002 | Define core shared type definitions | 3→4 | 6 | 1 | Schema version conflict; massive scope without per-file guidance | Resolved |
| T-003 | Implement utility modules and error system | 4→5 | 3 | 0 | Minor clarifications needed | Resolved |
| T-004 | Implement frontmatter parser | 4→5 | 4 | 0 | Missing `reads` field; kebab-to-camelCase conversion | Resolved |
| T-005 | Implement config loader and validator | 4→5 | 4 | 0 | Validation pipeline phasing; v1 migration format | Resolved |
| T-006 | Implement methodology preset loader | 3→4 | 5 | 1 | Preset files don't exist; path resolution unclear | Resolved |
| T-007 | Implement state manager with atomic writes | 3→4 | 6 | 1 | Schema version conflict (1 vs 2); missing required fields | Resolved |
| T-008 | Implement completion detection and crash recovery | 4→5 | 3 | 0 | "Ask user" behavior undefined at data layer | Resolved |
| T-009 | Implement decision logger | 4→5 | 3 | 0 | Minor gaps in write mechanism | Resolved |
| T-010 | Implement lock manager with PID liveness detection | 3→4 | 5 | 1 | Cross-platform PID detection; incomplete error coverage | Resolved |
| T-011 | Implement dependency resolver with Kahn's algorithm | 4→5 | 2 | 0 | Phase sort order unspecified | Resolved |
| T-012 | Implement methodology and depth resolution | 4→5 | 3 | 0 | Depth precedence confusion; overlap with T-018 | Resolved |
| T-013 | Implement meta-prompt loader | 3→4 | 3 | 1 | Body section parsing algorithm undefined | Resolved |
| T-014 | Implement knowledge base loader | 3→4 | 3 | 1 | Name-to-file resolution missing; KB schema missing | Resolved |
| T-015 | Implement context gatherer | 4→5 | 2 | 0 | Artifact scope ambiguous | Resolved |
| T-016 | Implement user instruction loader | 5/5 | 0 | 0 | Ready to implement | No changes needed |
| T-017 | Implement assembly engine orchestrator | 3→4 | 4 | 1 | System framing/execution instruction content missing | Resolved |
| T-018 | Implement update mode and methodology change detection | 4→5 | 3 | 0 | Ownership overlap with T-012 | Resolved |
| T-019 | Set up CLI framework with yargs | 5/5 | 0 | 0 | Ready to implement | No changes needed |
| T-020 | Implement output context system | 4→5 | 2 | 0 | Progress indicator API undefined | Resolved |
| T-021 | Implement error display and formatting | 4→5 | 2 | 0 | Accumulator responsibility ambiguous | Resolved |
| T-022 | Implement CLI middleware | 5/5 | 0 | 0 | Ready to implement | No changes needed |
| T-023 | Implement scaffold status command | 4→5 | 2 | 0 | Missing `--phase` flag; orphaned entries | Resolved |
| T-024 | Implement scaffold next command | 4→5 | 2 | 0 | Missing `--count` flag | Resolved |
| T-025 | Implement scaffold info command | 4→5 | 2 | 0 | Missing project-info mode | Resolved |
| T-026 | Implement scaffold list command | 4→5 | 3 | 0 | Flag design contradicts CLI contract | Resolved |
| T-027 | Implement scaffold decisions command | 5/5 | 0 | 0 | Ready to implement | No changes needed |
| T-028 | Implement scaffold version command | 4→5 | 2 | 0 | Task contradicts contract on network check | Resolved |
| T-029 | Implement scaffold run command | 3→4 | 5 | 2 | Phantom `--no-confirm` flag; missing completion gate | Resolved |
| T-030 | Implement scaffold skip command | 4→5 | 3 | 0 | Task/contract conflict on completed-step behavior | Resolved |
| T-031 | Implement scaffold reset command | 3→4 | 4 | 2 | Major task/contract divergence | Resolved |
| T-032 | Implement project detector | 4/5 | 3 | 0 | DetectionResult type undefined | No changes (type defined in T-002) |
| T-033 | Implement init wizard and scaffold init command | 3→4 | 5 | 1 | Wizard questions mismatch CLI contract | Resolved |
| T-034 | Implement scaffold build command | 4/5 | 2 | 0 | Universal adapter build-time behavior ambiguous | No changes (resolved via T-042) |
| T-035 | Implement scaffold adopt command | 3→4 | 4 | 1 | AdaptationStrategy enum conflicts with domain model | Resolved |
| T-036 | Implement scaffold validate command | 4→5 | 3 | 0 | Missing `--fix` and `--scope` flags | Resolved |
| T-037 | Implement scaffold dashboard command | 4→5 | 3 | 0 | Staleness notice missing from acceptance criteria | Resolved |
| T-038 | Implement scaffold update command | 3→4 | 5 | 1 | Flag names mismatched; install detection unspecified | Resolved |
| T-039 | Define adapter interface and factory | 5/5 | 0 | 0 | Ready to implement | No changes needed |
| T-040 | Implement Claude Code adapter | 5/5 | 0 | 0 | Ready to implement | No changes needed |
| T-041 | Implement Codex adapter | 5/5 | 0 | 0 | Ready to implement | No changes needed |
| T-042 | Implement Universal adapter | 4→5 | 1 | 0 | Task conflicts with spec on file generation | Resolved |
| T-043 | Implement CLAUDE.md manager | 4→5 | 4 | 0 | Error code mismatch; token counting unspecified | Resolved |
| T-044 | Author methodology preset files | 4→5 | 2 | 0 | Minor: step name cross-reference | Resolved |
| T-045 | Author core domain expertise KB files | 3→4 | 3 | 1 | File path mismatch; no KB schema; no content example | Resolved |
| T-046 | Author phase-specific review KB files | 3→4 | 4 | 0 | No KB schema; vague detection heuristic definition | Resolved |
| T-047 | Author validation and product KB files | 3→4 | 3 | 0 | Directory placement ambiguity; thin content guidance | Resolved |
| T-048 | Author pipeline meta-prompts — product/domain | 4→5 | 2 | 0 | No meta-prompt body example | Resolved |
| T-049 | Author pipeline meta-prompts — architecture/data | 4→5 | 3 | 0 | Step name mismatches with manifest | Resolved |
| T-050 | Author pipeline meta-prompts — impl/finalization | 4→5 | 3 | 0 | Step name mismatches with manifest | Resolved |
| T-051 | Author pipeline meta-prompts — review steps | 5/5 | 0 | 0 | Ready to implement | No changes needed |
| T-052 | Implement end-to-end integration tests | 3→4 | 4 | 1 | AI execution boundary undefined; no fixture spec | Resolved |
| T-053 | Configure npm packaging and distribution | 4→5 | 2 | 0 | Package name unconfirmed | Resolved |
| T-054 | Write v1 to v2 migration guide | 4/5 | 2 | 0 | V1 methodology mapping confirmation needed | No changes needed |
| T-055 | Validate performance against PRD budgets | 4→5 | 3 | 0 | Assembly sequence scope ambiguous | Resolved |

**Overall (post-fix):** 33/55 tasks at 5/5, 22 tasks at 4/5, 0 tasks below 4/5. All 55 tasks ≥ 4/5.
**Target:** All tasks ≥ 4/5 before implementation begins — **MET**

---

## Phase-by-Phase Findings

### Phase 0: Foundation (T-001 through T-003)

Phase 0 is generally well-specified. T-001 and T-003 need only minor clarifications. T-002 is the weakest task in this phase due to its massive scope (15 type files across 10+ reference documents) and a schema version value conflict with `state-json-schema.md`.

**Key risk:** T-002's `schema-version` value conflict (task says 2, spec says 1) will propagate to every downstream task that reads or writes state.json.

### Phase 1: Core Components (T-004 through T-010)

Phase 1 has the most 3/5 scores (4 tasks). The data layer tasks are individually well-scoped but collectively suffer from three cross-cutting gaps: (1) the `schema-version` conflict from T-002 propagates here, (2) T-006 references preset files that no task in Phase 0-1 creates, and (3) T-007 addresses only a subset of state.json's required fields.

**Key risks:**
- T-006 cannot be tested without preset YAML files (created later in T-044)
- T-007 will produce state files missing 6+ required top-level fields
- T-010's cross-platform PID detection is non-trivial and underspecified

### Phase 2: Core Engine (T-011 through T-018)

Three tasks score 3/5 (T-013, T-014, T-017). The assembly engine orchestrator (T-017) has the most critical gap: the system framing and execution instruction section content is unspecified. These are the "voice" of scaffold that directly control AI output quality.

**Key risks:**
- T-013 requires parsing meta-prompt body sections but no section structure convention exists
- T-014 has no resolution algorithm for mapping KB entry names to file paths
- T-017's section header format and boilerplate content are unspecified

**Bright spot:** T-016 (user instruction loader) is fully implementable at 5/5.

### Phase 3: CLI Shell (T-019 through T-022)

Phase 3 is the strongest phase — two tasks at 5/5, two at 4/5. The CLI framework and middleware are well-specified. Only minor gaps in the output context system's progress indicator API.

### Phase 4: Commands (T-023 through T-038)

Phase 4 has two 3/5 tasks with critical gaps:
- T-029 (scaffold run) has a phantom `--no-confirm` flag, missing completion gate implementation details, and missing depth downgrade check
- T-031 (scaffold reset) has a fundamental task/contract divergence — the task describes single-step reset and `--methodology` flag that don't exist in the CLI contract

Several command tasks (T-023, T-024, T-025, T-026) are missing flags that exist in the CLI contract. T-038 has mismatched flag names and missing algorithms.

**Key risks:**
- T-029 is on the critical path and blocks T-052 and T-054
- T-031's task description contradicts the CLI contract in multiple ways
- T-033's wizard question sequence doesn't match the CLI contract
- T-035's AdaptationStrategy enum conflicts with the domain model

### Phase 5: Platform Adapters (T-039 through T-043)

Phase 5 is very strong — three tasks at 5/5, two at 4/5. The adapter-interface.md specification is thorough and provides complete TypeScript interfaces with examples. Only T-042 (Universal adapter) has a conflict between the task (generates files) and the spec (does not generate files at build time).

### Phase 6: Content (T-044 through T-051)

Content tasks are the weakest category overall with three 3/5 scores (T-045, T-046, T-047). Cross-cutting issues:
1. No knowledge base entry frontmatter schema exists
2. File paths in T-045 use flat `knowledge/` instead of `knowledge/core/` per ADR-042
3. Step names in T-049 and T-050 differ from manifest-yml-schema.md examples
4. No complete meta-prompt body example exists anywhere in the specs

**Bright spot:** T-051 (review meta-prompts) is 5/5.

### Phase 7: Integration (T-052 through T-055)

T-052 (e2e tests) is the weakest at 3/5 — the AI execution boundary in tests is undefined, and no fixture specification exists. T-053, T-054, and T-055 are all 4/5 with minor gaps.

---

## Per-Task Findings

### T-001: Initialize TypeScript project scaffolding

**Score:** 4/5
**Referenced Specs:** ADR-001, PRD §18, system-architecture.md §3a

#### Gaps

1. **[MISSING]** — No ESLint configuration details
   - What the spec says: Task lists `eslint.config.js` but not which plugins/configs to use
   - What the implementer needs: ESLint plugin list, parser config, which rule preset (e.g., `@typescript-eslint/strict-type-checked`)
   - Impact: Agent will guess at ESLint configuration; affects all subsequent linting behavior
   - Suggested fix: Add: "Use `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` with `eslint.config.js` flat config. Enable strict type-checked rules."

2. **[MISSING]** — No specification of exact npm dependencies
   - What the spec says: "vitest for testing, and eslint for linting" without version constraints or full list
   - What the implementer needs: Full `devDependencies` list; whether runtime deps like `js-yaml` are installed now or later
   - Impact: Minor — agent will make reasonable choices
   - Suggested fix: List key dev dependencies; note that runtime deps are added by their respective tasks

3. **[MISSING]** — test-utils.ts function signatures unspecified
   - What the spec says: "exports shared utilities (temp directory creation, fixture loading)"
   - What the implementer needs: Specific function signatures for downstream consumers
   - Impact: Low — agent creates reasonable stubs
   - Suggested fix: Add: "`createTempDir(): Promise<string>`, `loadFixture(name: string): string`"

---

### T-002: Define core shared type definitions

**Score:** 3/5
**Referenced Specs:** state-json-schema.md, config-yml-schema.md, frontmatter-schema.md, decisions-jsonl-schema.md, lock-json-schema.md, cli-contract.md, system-architecture.md §3a

#### Gaps

1. **[AMBIGUITY]** — schema-version value conflict (1 vs 2)
   - What the spec says: state-json-schema.md §2: `"schema-version": { "const": 1 }` (hyphen, value 1)
   - What the implementer needs: Task acceptance criteria say "schema_version 2" but the normative JSON Schema says const value is 1
   - Impact: Wrong schema version constant causes state validation failures across all downstream tasks
   - Suggested fix: Align task with spec — either update spec to version 2, or fix task to say version 1

2. **[MISSING]** — Massive scope with vague per-file guidance
   - What the spec says: 15 files listed, referencing 10+ spec documents
   - What the implementer needs: Per file, which specific interfaces/types to define. Files like `adapter.ts`, `wizard.ts`, `claude-md.ts`, `assembly.ts` have no field-level specification
   - Impact: Agent must reverse-engineer types from 10+ domain models; high likelihood of missing fields
   - Suggested fix: For each type file, list the specific interfaces and reference the exact spec section

3. **[AMBIGUITY]** — ExitCode enum naming
   - What the spec says: cli-contract.md §1b: Exit codes 0-5 with descriptions
   - What the implementer needs: Whether to use named enum values (e.g., `ExitCode.Success = 0`)
   - Impact: Low — readability concern
   - Suggested fix: Specify named values: Success=0, ValidationError=1, MissingDependency=2, StateCorruption=3, UserCancellation=4, BuildError=5

4. **[MISSING]** — MethodologyPreset type not listed
   - What the spec says: T-006 needs "MethodologyPreset" but it's not in T-002's file list
   - What the implementer needs: Where MethodologyPreset type goes (assembly.ts? config.ts?)
   - Impact: T-006 must define its own type or guess
   - Suggested fix: Add MethodologyPreset to assembly.ts or config.ts

5. **[AMBIGUITY]** — OutputMode enum values
   - What the spec says: Task says "OutputMode (interactive/json/auto)" — three values
   - What the implementer needs: CLI contract describes four behaviors (interactive, json, auto, auto+json combined). Is combined mode a separate enum value?
   - Impact: Downstream CLI implementation may need different resolution
   - Suggested fix: Clarify OutputMode is three values; combined mode derived from flags at runtime

6. **[MISSING]** — PlatformAdapter interface specifics
   - What the spec says: Creates `src/types/adapter.ts` but no methods/properties listed
   - What the implementer needs: Interface shape (methods, properties)
   - Impact: Downstream adapter tasks may need revision
   - Suggested fix: Reference adapter-interface.md or define interface shape

---

### T-003: Implement utility modules and error system

**Score:** 4/5
**Referenced Specs:** ADR-040, ADR-025, cli-contract.md (exit codes), error-messages.md

#### Gaps

1. **[MISSING]** — Incomplete error factory function list
   - What the spec says: "Error factory functions for each error code prefix" — but error-messages.md has 60+ codes across 17 groups
   - What the implementer needs: Which factories to create now vs. defer to downstream tasks
   - Impact: Agent creates too many (wasted effort) or too few (downstream tasks blocked)
   - Suggested fix: List the specific error codes for Phase 0-1; note that later tasks add their own factories

2. **[MISSING]** — `context` property type on ScaffoldError
   - What the spec says: "`context` (affected file/line)" — type unspecified
   - What the implementer needs: Is it `{ file?: string; line?: number }` or `Record<string, string | number>`?
   - Impact: Low — inconsistency with error-messages.md template variables
   - Suggested fix: Define: `context: Record<string, string | number | undefined>` matching `{variable}` placeholders

3. **[IMPLICIT]** — fs.ts function signatures undefined
   - What the spec says: "atomic file write, file existence check, directory creation"
   - What the implementer needs: Should `atomicWriteFile` take string or Buffer? Is `ensureDir` recursive?
   - Impact: Minor signature mismatches with downstream consumers
   - Suggested fix: Specify: `atomicWriteFile(path: string, content: string): Promise<void>`, `fileExists(path: string): Promise<boolean>`, `ensureDir(path: string): Promise<void>`

---

### T-004: Implement frontmatter parser

**Score:** 4/5
**Referenced Specs:** frontmatter-schema.md, domain 08, ADR-041

#### Gaps

1. **[MISSING]** — File location mismatch
   - What the spec says: Task says `src/project/frontmatter.ts`; frontmatter-schema.md §1 says `src/core/frontmatter/parser.ts`
   - What the implementer needs: Which path is correct
   - Impact: Low — task path matches architecture doc; frontmatter-schema reference is stale
   - Suggested fix: Update frontmatter-schema.md §1 to `src/project/frontmatter.ts`

2. **[MISSING]** — `reads` field validation not mentioned
   - What the spec says: frontmatter-schema.md §2 defines `reads` with validation rules (FRONTMATTER_READS_INVALID_STEP)
   - What the implementer needs: Whether frontmatter parser should validate `reads` during structural parsing
   - Impact: Missing `reads` field means assembly engine can't load cross-cutting artifacts
   - Suggested fix: Add `reads` parsing to description and acceptance criteria

3. **[MISSING]** — kebab-case to camelCase conversion
   - What the spec says: frontmatter-schema.md §6: "Frontmatter Parser converts kebab-case YAML keys to camelCase TypeScript properties"
   - What the implementer needs: Task doesn't mention key transformation
   - Impact: All downstream consumers expect camelCase; type mismatches everywhere
   - Suggested fix: Add acceptance criterion: "Converts kebab-case YAML keys to camelCase (e.g., `knowledge-base` → `knowledgeBase`)"

4. **[MISSING]** — YAML library choice not specified
   - What the spec says: T-005 specifies `js-yaml` but T-004 does not
   - What the implementer needs: Consistency across YAML parsing
   - Impact: Low — agent will likely choose `js-yaml`
   - Suggested fix: Add: "Use `js-yaml`. Configure to reject anchors, aliases, and custom tags."

---

### T-005: Implement config loader and validator

**Score:** 4/5
**Referenced Specs:** config-yml-schema.md, domain 06, ADR-014, ADR-033, ADR-043

#### Gaps

1. **[MISSING]** — Validation pipeline phasing not mapped
   - What the spec says: config-yml-schema.md §7 defines 6 validation phases with specific short-circuit behavior
   - What the implementer needs: Whether to implement phased validation or flat validation
   - Impact: Different error-reporting behavior
   - Suggested fix: Add: "Implement 6-phase validation pipeline per config-yml-schema.md §7. Phases 1-3 short-circuit; Phases 4-6 accumulate."

2. **[AMBIGUITY]** — "Validates custom.steps entries match known step names" — known how?
   - What the spec says: Task validates step names but doesn't specify the source of valid names
   - What the implementer needs: Does the loader get names from a parameter or scan `pipeline/*.md`?
   - Impact: Config loader has no dependency on frontmatter parser for this
   - Suggested fix: Clarify: "Known step names provided as parameter to validation function"

3. **[MISSING]** — v1 config format details for migration
   - What the spec says: "Migrates v1 config (removes mixins, maps methodology names)" without v1 format spec
   - What the implementer needs: What a v1 config looks like; what methodology name mappings exist
   - Impact: Cannot write correct migration logic
   - Suggested fix: Add v1 config example and methodology mapping: `classic` (v1 name) → `deep`, `classic-lite` (v1 name) → `mvp`, others → `custom`

4. **[MISSING]** — Error accumulation return type
   - What the spec says: "Returns validated ScaffoldConfig object or accumulated errors"
   - What the implementer needs: Exact return type signature
   - Impact: Downstream consumers don't know if they try/catch or check a result object
   - Suggested fix: Specify: `{ config: ScaffoldConfig | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] }`

---

### T-006: Implement methodology preset loader

**Score:** 3/5
**Referenced Specs:** manifest-yml-schema.md, domain 16, ADR-043

#### Gaps

1. **[AMBIGUITY]** — Acceptance criteria reference step counts not yet established
   - What the spec says: "Loads deep.yml preset with all 36 steps enabled" — but preset files don't exist yet
   - What the implementer needs: Are preset files created by T-006, T-044, or assumed to exist?
   - Impact: All tests fail without preset files
   - Suggested fix: Clarify that T-006 tests use fixture preset files; actual presets created by T-044

2. **[MISSING]** — File path resolution unclear
   - What the spec says: "Load from `methodology/` directory" — relative to what?
   - What the implementer needs: Whether path is relative to package root (shipped) or project root (user's)
   - Impact: Presets won't be found if wrong root
   - Suggested fix: Specify: "Resolved relative to scaffold package root using `import.meta.url`"

3. **[MISSING]** — MethodologyPreset return type undefined
   - What the spec says: "Return structured MethodologyPreset" — type not in T-002
   - What the implementer needs: Interface definition
   - Impact: Type drift
   - Suggested fix: Add MethodologyPreset to T-002's types, or note T-006 creates it

4. **[MISSING]** — Step name validation source of truth
   - What the spec says: "Validate that all step names match known meta-prompt names"
   - What the implementer needs: How to get the list of known names (parameter? pipeline scan?)
   - Impact: PRESET_INVALID_STEP validation cannot work without this
   - Suggested fix: "Preset loader receives known step names as parameter from caller"

5. **[MISSING]** — Error codes not in error-messages.md
   - What the spec says: PRESET_MISSING, PRESET_PARSE_ERROR, PRESET_INVALID_STEP, PRESET_MISSING_STEP
   - What the implementer needs: Message templates, severity, exit codes
   - Impact: Agent must invent error messages
   - Suggested fix: Add PRESET_* error codes to error-messages.md

---

### T-007: Implement state manager with atomic writes

**Score:** 3/5
**Referenced Specs:** state-json-schema.md, domain 03, ADR-012, ADR-018

#### Gaps

1. **[AMBIGUITY]** — schema-version value conflict (1 vs 2)
   - What the spec says: state-json-schema.md: `"schema-version": { "const": 1 }`; Task: "schema_version 2"
   - What the implementer needs: Which value is correct
   - Impact: State files fail validation
   - Suggested fix: Align task with spec (likely value is 1; spec is normative)

2. **[MISSING]** — initializeState parameter shape
   - What the spec says: `initializeState(enabledSteps)` — but what is an "enabled step"?
   - What the implementer needs: Parameter type with slug, source, produces fields
   - Impact: Function signature ambiguous
   - Suggested fix: Specify: `initializeState(steps: Array<{slug, source, produces}>, methodology, initMode)`

3. **[MISSING]** — Many required state fields not addressed
   - What the spec says: state-json-schema.md requires 11 top-level fields; task only mentions 4
   - What the implementer needs: How to populate `scaffold-version`, `init_methodology`, `config_methodology`, `init-mode`, `created`, `next_eligible`, `extra-prompts`
   - Impact: State files missing required fields
   - Suggested fix: List all required top-level fields and how each is populated

4. **[MISSING]** — markCompleted signature incomplete
   - What the spec says: Completed entries require `completed_by` and `depth` per state-json-schema.md
   - What the implementer needs: Function must accept completedBy and depth parameters
   - Impact: Completed entries missing required fields
   - Suggested fix: Update signature: `markCompleted(step, outputs, completedBy, depth)`

5. **[MISSING]** — next_eligible computation
   - What the spec says: "Recomputed on every state mutation" per state-json-schema.md
   - What the implementer needs: Does state manager recompute this? Requires dependency graph knowledge
   - Impact: next_eligible field always stale or missing
   - Suggested fix: Accept dependency graph parameter or defer to integration layer

6. **[IMPLICIT]** — in_progress conflict behavior
   - What the spec says: "Only one step can be in_progress at a time"
   - What the implementer needs: Does setInProgress throw if in_progress non-null, or silently replace?
   - Impact: Wrong behavior breaks crash recovery
   - Suggested fix: Specify: "setInProgress throws PSM_ALREADY_IN_PROGRESS if in_progress is non-null"

---

### T-008: Implement completion detection and crash recovery

**Score:** 4/5
**Referenced Specs:** state-json-schema.md, domain 03, ADR-018

#### Gaps

1. **[MISSING]** — "Ask user" behavior undefined for partial artifacts
   - What the spec says: "(3) partial artifacts → ask user"
   - What the implementer needs: How a data-layer module triggers interactive prompts. Should return action type for CLI layer to handle
   - Impact: Architecture violation if prompt logic in data module
   - Suggested fix: Return `CrashRecoveryAction` of type `'ask_user'` with present/missing artifact lists; CLI handles prompt

2. **[AMBIGUITY]** — Return type of checkCompletion
   - What the spec says: Returns status strings like 'confirmed_complete'
   - What the implementer needs: Is it a string union, enum, or object with artifact details?
   - Impact: Downstream consumers need missing artifact list for error messages
   - Suggested fix: Define: `{ status: CompletionStatus; presentArtifacts: string[]; missingArtifacts: string[] }`

3. **[MISSING]** — Outputs source for checkCompletion
   - What the spec says: "Uses outputs from meta-prompt frontmatter"
   - What the implementer needs: Does it re-parse frontmatter or read `produces` from state.json?
   - Impact: Determines dependency direction
   - Suggested fix: "Read `produces` from step's PromptStateEntry in state.json"

---

### T-009: Implement decision logger

**Score:** 4/5
**Referenced Specs:** decisions-jsonl-schema.md, domain 11, ADR-013

#### Gaps

1. **[MISSING]** — getNextId concurrent safety
   - What the spec says: "Returns next sequential D-NNN ID"
   - What the implementer needs: How concurrent writers (multiple worktrees) are handled
   - Impact: Duplicate IDs expected per spec; should be acknowledged
   - Suggested fix: "Read file, find max ID, return D-(max+1). Concurrent duplicates resolved by `scaffold validate --fix`"

2. **[MISSING]** — Write atomicity mechanism
   - What the spec says: decisions-jsonl-schema.md §6 specifies `O_APPEND` for line-level atomicity
   - What the implementer needs: Whether to use `fs.appendFileSync()` or `fs.writeSync` with `O_APPEND`
   - Impact: Low — spec is clear for anyone who reads it
   - Suggested fix: Add: "Use `fs.appendFileSync()` for atomic writes"

3. **[MISSING]** — Optional fields in acceptance criteria
   - What the spec says: Optional fields include category, tags, review_status, depth
   - What the implementer needs: Tests should cover optional field round-tripping
   - Impact: Low
   - Suggested fix: Add criterion: "appendDecision serializes optional fields when provided"

---

### T-010: Implement lock manager with PID liveness detection

**Score:** 3/5
**Referenced Specs:** lock-json-schema.md, domain 13, ADR-019, ADR-036

#### Gaps

1. **[MISSING]** — processStartedAt retrieval implementation
   - What the spec says: "Compare processStartedAt with actual process start time"
   - What the implementer needs: Cross-platform code to get process start time — non-trivial (macOS: `ps -o lstart=`; Linux: `/proc/PID/stat`). lock-json-schema.md §3 documents this but the task does not
   - Impact: Without platform-specific retrieval, PID recycling detection won't work
   - Suggested fix: Add `getProcessStartTime(pid)` implementation guidance with platform-specific commands

2. **[MISSING]** — `--force` flag API not defined
   - What the spec says: "--force flag bypasses lock contention"
   - What the implementer needs: Is force a parameter to acquireLock? How is it surfaced?
   - Impact: Interface ambiguity
   - Suggested fix: `acquireLock(step, command, { force?: boolean }): Promise<LockAcquisitionResult>`

3. **[MISSING]** — Lock release ownership verification
   - What the spec says: lock-json-schema.md §6: "Verify PID ownership before deletion"
   - What the implementer needs: Task says "releaseLock() deletes lock.json" — no ownership check mentioned
   - Impact: --force scenarios could let one process release another's lock
   - Suggested fix: Add: "releaseLock verifies pid === process.pid before deleting"

4. **[MISSING]** — Incomplete error code coverage
   - What the spec says: lock-json-schema.md §7 defines 9 error codes
   - What the implementer needs: Task only mentions LOCK_HELD and LOCK_STALE_CLEARED
   - Impact: Missing error handling for race conditions, corruption, write failures
   - Suggested fix: List all lock error codes in acceptance criteria

5. **[AMBIGUITY]** — Exit code conflict for LOCK_HELD
   - What the spec says: cli-contract says exit 3; lock-json-schema says 3 in auto, 5 otherwise
   - What the implementer needs: Canonical exit code per mode
   - Impact: Incorrect exit code breaks CI pipelines
   - Suggested fix: Clarify: "LOCK_HELD always exits 3; LOCK_WRITE_FAILED/LOCK_RELEASE_FAILED exit 5"

---

### T-011: Implement dependency resolver with Kahn's algorithm

**Score:** 4/5
**Referenced Specs:** Domain 02, ADR-009, ADR-011, frontmatter-schema.md

#### Gaps

1. **[MISSING]** — Phase tiebreaker sort order undefined
   - What the spec says: "Phase-based tiebreaker for deterministic ordering" — but phase is a string with values like "pre", "1", "1a", "2", ..., "validation", "finalization"
   - What the implementer needs: Explicit sort key mapping for phase string values (Is `"1a"` between `"1"` and `"2"`?)
   - Impact: Two implementers could produce different orderings
   - Suggested fix: Add PHASE_SORT_ORDER constant mapping each phase string to a numeric sort key

2. **[AMBIGUITY]** — getParallelSets return type
   - What the spec says: "Groups eligible steps by phase for parallel execution display"
   - What the implementer needs: Return type (Map? Array of arrays?)
   - Impact: Minor — reasonable inference possible
   - Suggested fix: Add return type to acceptance criteria

---

### T-012: Implement methodology and depth resolution

**Score:** 4/5
**Referenced Specs:** Domain 16, ADR-043, ADR-049, config-yml-schema.md

#### Gaps

1. **[AMBIGUITY]** — Four-level vs three-level depth precedence chain
   - What the spec says: Task says 4 levels (CLI flag > custom override > preset default > built-in 3). Domain 16 Algorithm 3 shows only 3 levels. "Built-in default (3)" is not in any spec.
   - What the implementer needs: Whether resolver accepts CLI flag argument or caller handles it
   - Impact: Built-in fallback duplicated or misplaced
   - Suggested fix: Clarify function signature — does it accept `cliDepthFlag?` parameter?

2. **[IMPLICIT]** — MVP step names not listed
   - What the spec says: "MVP preset enables exactly 7 steps at depth 1"
   - What the implementer needs: Preset files don't exist yet; specific 7 step names needed for testing
   - Impact: Test criteria untestable without fixtures
   - Suggested fix: List the 4 MVP steps or depend on T-044

3. **[AMBIGUITY]** — Overlap with T-018 on methodology change detection
   - What the spec says: T-012 AC #4-5 and T-018 AC #7-8 describe identical ASM_METHODOLOGY_CHANGED behavior
   - What the implementer needs: Clear ownership — which module handles change detection?
   - Impact: Duplicated work if parallel agents
   - Suggested fix: Remove ASM_METHODOLOGY_CHANGED from T-012; delegate to T-018

---

### T-013: Implement meta-prompt loader

**Score:** 3/5
**Referenced Specs:** Domain 15, ADR-041, frontmatter-schema.md, system-architecture.md §3a

#### Gaps

1. **[MISSING]** — Body section parsing algorithm undefined
   - What the spec says: "Separates body into sections: purpose, inputs, expected outputs, quality criteria, methodology scaling guidance"
   - What the implementer needs: How sections are identified (heading level? text matching? markers?). Domain 15's MetaPromptFile has `body: string` (raw, not structured). No parsing algorithm documented.
   - Impact: Cannot build section parsing without knowing heading conventions
   - Suggested fix: Define heading convention (e.g., `## Purpose`, `## Inputs`, etc.) or simplify to return raw body string

2. **[AMBIGUITY]** — MetaPrompt vs MetaPromptFile naming
   - What the spec says: Task returns "MetaPrompt" object; Domain 15 defines "MetaPromptFile"
   - What the implementer needs: Are these the same? Does MetaPrompt extend MetaPromptFile?
   - Impact: Type naming drift
   - Suggested fix: Align naming with Domain 15

3. **[MISSING]** — `reads` and `conditional` not in acceptance criteria
   - What the spec says: frontmatter-schema.md defines both fields
   - What the implementer needs: Confirmation that MetaPrompt includes all frontmatter fields
   - Impact: Missing `reads` blocks context gatherer
   - Suggested fix: Add `reads` and `conditional` to acceptance criteria field list

---

### T-014: Implement knowledge base loader

**Score:** 3/5
**Referenced Specs:** ADR-042, Domain 15, system-architecture.md §3c

#### Gaps

1. **[MISSING]** — Name-to-file resolution algorithm
   - What the spec says: frontmatter-schema.md says `"system-architecture"` → `knowledge/core/system-architecture.md`. ADR-042 defines subdirectories: core/, review/, validation/, product/, finalization/
   - What the implementer needs: Resolution strategy — scan subdirectories? Match by frontmatter name? Build index?
   - Impact: Wrong resolution means KB entries not found at runtime
   - Suggested fix: "Recursively scan `knowledge/` subdirectories. Build name→filepath index using filename stems."

2. **[MISSING]** — KB entry frontmatter schema
   - What the spec says: ADR-042 says entries have `name`, `description`, `topics` but no formal schema
   - What the implementer needs: Types, validation rules, error codes for KB entry frontmatter
   - Impact: Cannot validate KB entries without schema
   - Suggested fix: Create KB entry schema or add section to existing data schema doc

3. **[IMPLICIT]** — knowledge/ path root
   - What the spec says: "Content-to-package mapping" suggests shipped with CLI
   - What the implementer needs: Is `knowledge/` relative to package root (shipped) or project root (user)?
   - Impact: Silent failure if wrong root
   - Suggested fix: "knowledge/ is relative to CLI package root (shipped content)"

---

### T-015: Implement context gatherer

**Score:** 4/5
**Referenced Specs:** Domain 15, ADR-044, ADR-048, state-json-schema.md, config-yml-schema.md

#### Gaps

1. **[MISSING]** — Artifact scope: all vs dependency chain
   - What the spec says: Task says "all artifacts produced by completed steps." frontmatter-schema.md says `reads` field extends context beyond dependency chain. ADR-050/053 address scoping.
   - What the implementer needs: Should context include ALL completed step artifacts (context window bloat) or only dependency-chain + reads?
   - Impact: Late pipeline steps would include 31 prior artifacts without scoping
   - Suggested fix: Clarify: "Load artifacts from dependency-chain steps plus `reads` references (not all completed steps)"

2. **[IMPLICIT]** — decisions.jsonl formatting
   - What the spec says: "Format as readable summary" — no specifics
   - What the implementer needs: Which decisions to include, what format
   - Impact: Minor — reasonable inference possible
   - Suggested fix: "Include confirmed decisions (promptCompleted: true), formatted as `D-NNN: <text> (<step>)`"

---

### T-017: Implement assembly engine orchestrator

**Score:** 3/5
**Referenced Specs:** Domain 15, ADR-044, ADR-045, system-architecture.md §4b, error-messages.md §3.7

#### Gaps

1. **[MISSING]** — System framing and execution instruction content
   - What the spec says: 7-section prompt includes "System framing" (section 1) and "Execution instruction" (section 7) — these are scaffold-generated boilerplate, not meta-prompt content
   - What the implementer needs: Actual template text for these sections. No specification exists.
   - Impact: Critical — these sections control AI behavior. Implementer must invent them.
   - Suggested fix: Add system framing template and execution instruction template to T-017 or a referenced document

2. **[MISSING]** — Section header format
   - What the spec says: "Each section has clear header" — but no format specified
   - What the implementer needs: Exact delimiter format (markdown headers? XML tags? separator lines?)
   - Impact: Different formats produce different AI comprehension
   - Suggested fix: Provide example assembled prompt showing exact header format

3. **[AMBIGUITY]** — Step 2 "check prerequisites" delegation
   - What the spec says: "(deps completed, step status, lock — delegated to callers)"
   - What the implementer needs: Whether engine.ts validates prerequisites or trusts caller
   - Impact: Error handling path unclear
   - Suggested fix: Clarify whether engine validates or trusts caller

4. **[MISSING]** — AssemblyResult metadata cross-reference
   - What the spec says: Domain 15 defines AssemblyMetadata interface
   - What the implementer needs: Task doesn't cross-reference Domain 15 for metadata shape
   - Impact: Minor — Domain 15 has the answer
   - Suggested fix: Reference Domain 15 §3 AssemblyMetadata explicitly

---

### T-018: Implement update mode and methodology change detection

**Score:** 4/5
**Referenced Specs:** ADR-048, ADR-049, Domain 15, Domain 16, error-messages.md

#### Gaps

1. **[AMBIGUITY]** — Overlap with T-012 on methodology change detection
   - What the spec says: T-012 AC #4-5 and T-018 AC #7-8 are identical
   - What the implementer needs: Clear ownership — which module handles detection
   - Impact: Duplicated work
   - Suggested fix: T-012 delegates to T-018's methodology-change.ts

2. **[MISSING]** — ASM_DEPTH_CHANGED trigger semantics contradictory
   - What the spec says: T-018 says "step executing at different depth than original." error-messages.md says "depth overridden by per-step configuration" (current invocation, not re-run)
   - What the implementer needs: Which trigger is correct
   - Impact: Warning fires in wrong situations
   - Suggested fix: Clarify ASM_DEPTH_CHANGED fires for per-step override; ASM_DEPTH_DOWNGRADE fires for re-run at lower depth

3. **[IMPLICIT]** — previousDepth storage in state.json
   - What the spec says: ExistingArtifact has previousDepth
   - What the implementer needs: Confirmation that state.json step entries store depth
   - Impact: Minor — T-007 dependency is listed
   - Suggested fix: No action needed

---

### T-020: Implement output context system

**Score:** 4/5
**Referenced Specs:** cli-contract.md §1, json-output-schemas.md §1, error-messages.md §1

#### Gaps

1. **[MISSING]** — Progress indicator API undefined
   - What the spec says: "Spinner for 1-5s operations at 80ms interval, progress bar for >5s"
   - What the implementer needs: API signatures for start/stop spinner, progress bar interface
   - Impact: Downstream commands must consume this API
   - Suggested fix: Define method signatures in OutputContext interface

2. **[IMPLICIT]** — AutoOutput safe defaults
   - What the spec says: "Resolves with safe defaults"
   - What the implementer needs: Generic prompt resolution API shape
   - Impact: Low — command handlers supply defaults
   - Suggested fix: "AutoOutput's `prompt()` accepts a default value and returns it immediately"

---

### T-021: Implement error display and formatting

**Score:** 4/5
**Referenced Specs:** error-messages.md, json-output-schemas.md §3, system-architecture.md §7

#### Gaps

1. **[MISSING]** — Fuzzy match utility ownership
   - What the spec says: "Fuzzy match suggestions in error context"
   - What the implementer needs: Whether this task creates the fuzzy utility or consumes T-003's Levenshtein
   - Impact: Potential duplication
   - Suggested fix: "Consumes `findClosestMatch` from `src/utils/levenshtein.ts` (T-003); threshold ≤ 2"

2. **[AMBIGUITY]** — Accumulator responsibility
   - What the spec says: "Build-time: accumulate all errors. Runtime: fail-fast."
   - What the implementer needs: Whether error-display owns the accumulator or just formatting
   - Impact: Unclear responsibility boundary
   - Suggested fix: "Error-display handles formatting only; accumulation owned by calling code"

---

### T-023: Implement scaffold status command

**Score:** 4/5
**Referenced Specs:** cli-contract.md (status), json-output-schemas.md §2.7, error-messages.md §3.8

#### Gaps

1. **[MISSING]** — `--phase` flag not mentioned
   - What the spec says: cli-contract.md: `--phase <n>` for filtering by phase
   - What the implementer needs: Task omits this flag entirely
   - Impact: Incomplete CLI contract implementation
   - Suggested fix: Add `--phase` flag to task description and acceptance criteria

2. **[MISSING]** — Orphaned entries handling
   - What the spec says: cli-contract.md: "Orphaned (methodology changed)" section; JSON includes `orphaned_entries` array
   - What the implementer needs: Task doesn't mention orphaned entries
   - Impact: Missing feature in both interactive and JSON output
   - Suggested fix: Add orphaned entries display to task

---

### T-024: Implement scaffold next command

**Score:** 4/5
**Referenced Specs:** cli-contract.md (next), json-output-schemas.md §2.8

#### Gaps

1. **[MISSING]** — `--count` flag not mentioned
   - What the spec says: cli-contract.md: `--count <n>` for showing multiple eligible steps
   - What the implementer needs: Task omits this flag
   - Impact: Incomplete contract implementation
   - Suggested fix: Add `--count` flag to task

2. **[MISSING]** — `blocked_prompts` field structure
   - What the spec says: json-output-schemas.md NextData includes `blocked_prompts` with `slug` and `blocked_by`
   - What the implementer needs: Task says "optional blocked info" — vague
   - Impact: Incomplete JSON output
   - Suggested fix: Reference structured `blocked_prompts` array from JSON schema

---

### T-025: Implement scaffold info command

**Score:** 4/5
**Referenced Specs:** cli-contract.md (info), json-output-schemas.md §2.11

#### Gaps

1. **[MISSING]** — Dual-mode behavior not fully specified
   - What the spec says: cli-contract: `scaffold info [step]` — without step shows project info; with step shows step details. Two JSON schemas: InfoData and InfoStepData
   - What the implementer needs: Task only covers step-info mode
   - Impact: Project-info mode entirely missing
   - Suggested fix: Add project-info mode (no step argument) to task

2. **[MISSING]** — Exit code for step-not-found
   - What the spec says: Task mentions fuzzy match on not-found but no exit code
   - What the implementer needs: Exit code (likely 1 based on pattern)
   - Impact: Low
   - Suggested fix: Specify exit code 1 for step-not-found

---

### T-026: Implement scaffold list command

**Score:** 4/5
**Referenced Specs:** cli-contract.md (list), json-output-schemas.md §2.10

#### Gaps

1. **[AMBIGUITY]** — Flag design contradicts CLI contract
   - What the spec says: cli-contract uses `--section <name>` (single flag with values `methodologies`, `platforms`). Task describes two boolean flags `--methodologies` and `--platforms`
   - What the implementer needs: Which flag interface is correct
   - Impact: Wrong flag interface built
   - Suggested fix: Update task to use `--section` flag matching CLI contract

2. **[AMBIGUITY]** — Default behavior contradicts contract
   - What the spec says: cli-contract: "Display all available methodologies and installed platform adapters. No project required." Task: "show all pipeline steps grouped by phase with status"
   - What the implementer needs: Default behavior (steps vs methodologies)
   - Impact: Fundamental behavior difference
   - Suggested fix: Reconcile task with contract

3. **[MISSING]** — `default_depth` in JSON schema
   - What the spec says: Task expects it; JSON schema doesn't include it
   - What the implementer needs: Whether to include default_depth in methodology output
   - Impact: JSON output inconsistency
   - Suggested fix: Add to JSON schema or remove from task

---

### T-028: Implement scaffold version command

**Score:** 4/5
**Referenced Specs:** cli-contract.md (version), json-output-schemas.md §2.12

#### Gaps

1. **[IMPLICIT]** — Task says "no network" but contract includes latest_version
   - What the spec says: cli-contract: "when network is available, the latest published version." JSON includes `latest_version` and `update_available`
   - What the implementer needs: Task contradicts spec
   - Impact: Missing feature
   - Suggested fix: Update task to include optional network check with null fallback

2. **[MISSING]** — JSON fields `node_version` and `platform`
   - What the spec says: VersionData requires `version`, `node_version`, `platform`
   - What the implementer needs: Task only mentions `current`
   - Impact: Incomplete JSON output
   - Suggested fix: List all required JSON fields

---

### T-029: Implement scaffold run command

**Score:** 3/5
**Referenced Specs:** cli-contract.md (run), json-output-schemas.md §2.4, error-messages.md §3.6-3.9, ADR-048, ADR-049

#### Gaps

1. **[MISSING]** — Phantom `--no-confirm` flag
   - What the spec says: cli-contract lists only `--instructions`, `--depth`, and `--force`. No `--no-confirm`
   - What the implementer needs: Task mentions a flag that doesn't exist in the contract
   - Impact: Builds nonexistent flag; update mode confirmation uses --auto semantics per contract
   - Suggested fix: Remove `--no-confirm`; clarify update mode confirmation uses --auto behavior

2. **[AMBIGUITY]** — Completion gate lifecycle
   - What the spec says: cli-contract: interactive blocks with `"Step '<step>' complete? [Y/n/skip]"`; auto exits immediately after prompt output
   - What the implementer needs: Task says "after AI execution: mark step completed" without specifying mechanism
   - Impact: Missing the core interactive/auto divergence
   - Suggested fix: Add explicit implementation notes about interactive blocking prompt vs auto immediate exit

3. **[MISSING]** — Depth downgrade check not mentioned
   - What the spec says: cli-contract step 6: depth downgrade check with interactive/auto/force behaviors
   - What the implementer needs: Task omits this entirely
   - Impact: Missing user protection feature
   - Suggested fix: Add depth downgrade check to task description

4. **[MISSING]** — `depth_source` field in JSON output
   - What the spec says: cli-contract mentions `depth_source` in narrative
   - What the implementer needs: Task doesn't mention it in JSON output
   - Impact: Incomplete JSON output
   - Suggested fix: Add depth_source to task description

5. **[IMPLICIT]** — CLAUDE.md section fill and downstream stale warning
   - What the spec says: cli-contract describes post-completion CLAUDE.md fill and downstream warning
   - What the implementer needs: Task omits these post-completion behaviors
   - Impact: Incomplete post-completion processing
   - Suggested fix: Add to task scope or explicitly defer

---

### T-030: Implement scaffold skip command

**Score:** 4/5
**Referenced Specs:** cli-contract.md (skip), json-output-schemas.md §2.5, error-messages.md §3.8

#### Gaps

1. **[AMBIGUITY]** — Completed-step behavior contradicts contract
   - What the spec says: cli-contract: "Prompt is already completed. Re-mark as skipped?" (allows with confirmation). Task: "Errors if step already completed" (prevents)
   - What the implementer needs: Contract allows re-skipping with confirmation; task forbids it
   - Impact: More restrictive than contract
   - Suggested fix: Match contract: warn in interactive (allow with confirmation); error in auto unless --force

2. **[MISSING]** — newly_eligible computation
   - What the spec says: cli-contract: "2 prompts now unblocked." JSON includes required `newly_eligible` field
   - What the implementer needs: Task doesn't mention computing newly-eligible steps
   - Impact: Missing required JSON field
   - Suggested fix: Add newly_eligible computation to task

3. **[MISSING]** — In-progress step warning
   - What the spec says: cli-contract: "If prompt is in_progress, warns that a session may be actively executing it"
   - What the implementer needs: Task doesn't mention in_progress case
   - Impact: Missing safety warning
   - Suggested fix: Add in-progress warning to task

---

### T-031: Implement scaffold reset command

**Score:** 3/5
**Referenced Specs:** cli-contract.md (reset), json-output-schemas.md §2.6, error-messages.md

#### Gaps

1. **[AMBIGUITY]** — Major task/contract divergence on reset scope
   - What the spec says: cli-contract describes only full reset (delete state.json + decisions.jsonl). No single-step reset, no step argument
   - What the implementer needs: Task describes single-step reset (default) and `--all` for full reset — fundamentally different from contract
   - Impact: Implementation contradicts CLI contract
   - Suggested fix: Reconcile — either update task to match contract (full reset only) or update contract

2. **[AMBIGUITY]** — Phantom `--methodology` flag
   - What the spec says: cli-contract lists only `--confirm-reset` and `--force`. No `--methodology`
   - What the implementer needs: Task specifies flag that doesn't exist in contract
   - Impact: Builds nonexistent flag
   - Suggested fix: Remove from task or add to CLI contract

3. **[MISSING]** — JSON output field mismatch
   - What the spec says: ResetData has `files_deleted` and `files_preserved`. Task says "clearedSteps, newMethodology"
   - What the implementer needs: Correct field names
   - Impact: Wrong JSON output
   - Suggested fix: Use contract's `files_deleted`, `files_preserved`

4. **[MISSING]** — No named error code for --auto without --confirm-reset
   - What the spec says: Exit 1 with message but no named error code
   - What the implementer needs: Error code for factory function
   - Impact: Low
   - Suggested fix: Add RESET_CONFIRM_REQUIRED to error catalog

---

### T-032: Implement project detector

**Score:** 4/5
**Referenced Specs:** Domain 07, ADR-017, ADR-028, cli-contract.md (adopt)

#### Gaps

1. **[MISSING]** — Signal pattern list incomplete
   - What the spec says: "package-manifest (package.json, pyproject.toml, etc.)" — open-ended
   - What the implementer needs: Bounded list of file patterns per category
   - Impact: Inconsistent detection; test coverage gaps
   - Suggested fix: Add signal-pattern table mapping categories to file globs

2. **[VAGUE]** — Smart methodology suggestion algorithm
   - What the spec says: "Provides smart methodology suggestion based on signals"
   - What the implementer needs: Signal-to-methodology mapping rules
   - Impact: Conflicts with T-033's expectations
   - Suggested fix: Define mapping rules

3. **[IMPLICIT]** — DetectionResult type not defined
   - What the spec says: "Returns DetectionResult with mode, signals, and methodology suggestion"
   - What the implementer needs: Interface shape
   - Impact: Type mismatch with T-033 and T-035
   - Suggested fix: Define interface or reference domain-07

---

### T-033: Implement init wizard and scaffold init command

**Score:** 3/5
**Referenced Specs:** Domain 14, cli-contract.md (init), ADR-027, error-messages.md, json-output-schemas.md §2.1

#### Gaps

1. **[AMBIGUITY]** — Wizard question sequence doesn't match CLI contract
   - What the spec says: Task says "per-step toggle with depth slider" for custom methodology. CLI contract does not mention depth slider
   - What the implementer needs: Exact wizard question sequence from CLI contract
   - Impact: Wizard diverges from contract
   - Suggested fix: Align task with cli-contract's wizard phases

2. **[MISSING]** — Project traits selection contradicts config schema
   - What the spec says: CLI contract: "frontend, web, mobile, multi-platform." Config schema: `project.platforms` accepts `web, mobile, desktop`
   - What the implementer needs: Which set does wizard present?
   - Impact: Wizard output fails config validation
   - Suggested fix: Reconcile with config schema enum values

3. **[MISSING]** — Smart suggestion algorithm not defined
   - What the spec says: "Keyword analysis of idea argument + file signals"
   - What the implementer needs: Concrete keyword→methodology mapping rules
   - Impact: Agent invents heuristics
   - Suggested fix: Add mapping table

4. **[AMBIGUITY]** — Backup collision behavior
   - What the spec says: "`--force` backs up to .scaffold.backup/"
   - What the implementer needs: What if backup directory already exists?
   - Impact: Edge case ambiguity
   - Suggested fix: Specify collision behavior

5. **[MISSING]** — Auto-run scaffold build dependency unclear
   - What the spec says: "(9) Auto-run scaffold build"
   - What the implementer needs: Whether to import build function directly or invoke as subprocess. T-034 not listed as dependency
   - Impact: Integration failure
   - Suggested fix: Add T-034 dependency or clarify programmatic invocation

---

### T-034: Implement scaffold build command

**Score:** 4/5
**Referenced Specs:** Domain 09, Domain 05, cli-contract.md (build), adapter-interface.md

#### Gaps

1. **[MISSING]** — Pipeline directory may be empty at implementation time
   - What the spec says: "Scan pipeline/ for meta-prompts" — content created in Phase 6
   - What the implementer needs: Test fixture requirements for pipeline/*.md files
   - Impact: Tests need fixtures
   - Suggested fix: Note test fixture requirements

2. **[IMPLICIT]** — Universal adapter at build time
   - What the spec says: adapter-interface.md: "Universal adapter does not generate files at build time"
   - What the implementer needs: Whether Universal appears in BuildResult despite generating no files
   - Impact: JSON output shape ambiguity
   - Suggested fix: Clarify Universal's presence in BuildResult

---

### T-035: Implement scaffold adopt command

**Score:** 3/5
**Referenced Specs:** Domain 07, cli-contract.md (adopt), json-output-schemas.md §2.3

#### Gaps

1. **[AMBIGUITY]** — AdaptationStrategy enum conflict
   - What the spec says: Task: `update-mode`, `skip-recommended`, `context-only`, `full-run`. Domain 07: `draft-from-existing`, `pre-populate-decisions`, `document-existing`, `discover-existing`
   - What the implementer needs: Which enum is canonical — completely different sets
   - Impact: Type mismatch with domain model
   - Suggested fix: Reconcile task with domain-07 or declare task's version canonical

2. **[MISSING]** — JSON schema lacks strategy field
   - What the spec says: json-output-schemas.md AdoptData has no `strategy` or `adaptation_strategies` field
   - What the implementer needs: Task expects fields not in schema
   - Impact: JSON output violation
   - Suggested fix: Update JSON schema or remove from task

3. **[AMBIGUITY]** — v1 migration flow unclear
   - What the spec says: CLI contract says adopt requires config.yml to exist. Task says adopt handles v1 migration
   - What the implementer needs: Does user run init first, then adopt? Or does adopt create config?
   - Impact: Flow ambiguity
   - Suggested fix: Document exact v1 migration sequence

4. **[MISSING]** — Artifact matching algorithm
   - What the spec says: "Uses outputs fields to match existing files to steps"
   - What the implementer needs: Matching algorithm (exact? glob? fuzzy?). JSON schema has `match_type: "exact" | "fuzzy"` but no algorithm
   - Impact: Agent invents matching logic
   - Suggested fix: Define matching algorithm

---

### T-036: Implement scaffold validate command

**Score:** 4/5
**Referenced Specs:** cli-contract.md (validate), ADR-040, json-output-schemas.md §2.9

#### Gaps

1. **[MISSING]** — `--fix` flag not in task
   - What the spec says: cli-contract: `--fix` for safe auto-fixes
   - What the implementer needs: Task doesn't mention --fix at all
   - Impact: Missing flag
   - Suggested fix: Add --fix to task or explicitly defer

2. **[MISSING]** — `--scope` flag not in task
   - What the spec says: cli-contract: `--scope <list>` with values config, manifests, frontmatter, artifacts, state, decisions
   - What the implementer needs: Task omits this flag
   - Impact: Partial contract implementation
   - Suggested fix: Add --scope to task

3. **[AMBIGUITY]** — `--verbose` flag conflict with architecture
   - What the spec says: Architecture §10a says "no --verbose flag" generally; CLI contract says validate has verbose mode
   - What the implementer needs: CLI contract is authoritative for command-specific flags
   - Impact: Minor confusion; implementable from contract
   - Suggested fix: No action needed

---

### T-037: Implement scaffold dashboard command

**Score:** 4/5
**Referenced Specs:** dashboard-spec.md, cli-contract.md (dashboard), json-output-schemas.md §2.14

#### Gaps

1. **[MISSING]** — Data staleness notice not in acceptance criteria
   - What the spec says: dashboard-spec.md §5e: "Data may be stale" notice after 1 hour
   - What the implementer needs: Feature described in spec but not in task acceptance criteria
   - Impact: Feature missed
   - Suggested fix: Add staleness notice to acceptance criteria

2. **[MISSING]** — Parent directory creation not in acceptance criteria
   - What the spec says: dashboard-spec.md §5d: "CLI creates parent directories if they do not exist"
   - What the implementer needs: Edge case in spec but not in task
   - Impact: Edge case missed in testing
   - Suggested fix: Add to acceptance criteria

3. **[VAGUE]** — HTML template implementation approach
   - What the spec says: "Generate self-contained HTML dashboard" — template approach not specified
   - What the implementer needs: Template literals? Template engine?
   - Impact: Low — `template.ts` filename implies template literals; spec is thorough on content
   - Suggested fix: None strictly needed

---

### T-038: Implement scaffold update command

**Score:** 3/5
**Referenced Specs:** cli-contract.md (update), ADR-002, json-output-schemas.md §2.13

#### Gaps

1. **[AMBIGUITY]** — Flag names mismatch CLI contract
   - What the spec says: Task: `--check`, `--dry-run`. Contract: `--check-only`, `--skip-build`
   - What the implementer needs: Canonical flag names
   - Impact: Wrong flag interface
   - Suggested fix: Use contract's `--check-only` and `--skip-build`

2. **[MISSING]** — Install channel detection algorithm
   - What the spec says: "Detect install channel (npm global vs npx vs Homebrew)"
   - What the implementer needs: How to detect — no algorithm provided
   - Impact: Agent invents detection logic
   - Suggested fix: Define detection algorithm

3. **[MISSING]** — npm registry query mechanism
   - What the spec says: "Compare installed version against npm registry"
   - What the implementer needs: Query method and package name
   - Impact: Cannot implement version check
   - Suggested fix: Specify package name and query approach

4. **[MISSING]** — Auto-rebuild not in task
   - What the spec says: cli-contract: "If project detected: invokes scaffold build"
   - What the implementer needs: Task omits auto-rebuild after install
   - Impact: Missing feature
   - Suggested fix: Add auto-rebuild behavior

5. **[MISSING]** — JSON field names mismatch schema
   - What the spec says: json-output-schemas.md: `changelog`, `rebuild_result`. Task: `upgraded`, `changes`
   - What the implementer needs: Correct field names
   - Impact: Wrong JSON output
   - Suggested fix: Align with schema field names

---

### T-042: Implement Universal adapter

**Score:** 4/5
**Referenced Specs:** adapter-interface.md §4c, Domain 05

#### Gaps

1. **[AMBIGUITY]** — Task conflicts with spec on file generation
   - What the spec says: adapter-interface.md §4c: "Universal adapter does not generate files at build time"
   - What the implementer needs: Task says "creates prompts/<slug>.md" — direct contradiction
   - Impact: Wrong behavior if spec is followed vs task
   - Suggested fix: Reconcile — update one to match the other

---

### T-043: Implement CLAUDE.md manager

**Score:** 4/5
**Referenced Specs:** Domain 10, ADR-026, ADR-017, system-architecture.md §5/10

#### Gaps

1. **[AMBIGUITY]** — Error code name mismatch
   - What the spec says: Task: "PSM_SECTION_OVER_BUDGET." Architecture §5b: "CMD_SECTION_OVER_BUDGET"
   - What the implementer needs: Canonical warning code
   - Impact: Wrong error code used
   - Suggested fix: Use CMD_SECTION_OVER_BUDGET per architecture

2. **[MISSING]** — Token counting method
   - What the spec says: "200-300 tokens per section, 2000 total" — counting method unspecified
   - What the implementer needs: Counting algorithm (word count? char/4? tokenizer library?)
   - Impact: Budget enforcement depends on method
   - Suggested fix: Specify approximation (e.g., `content.split(/\s+/).length`)

3. **[MISSING]** — CMD_SECTION_OVER_BUDGET template not in error-messages.md
   - What the spec says: error-messages.md catalog doesn't include this warning
   - What the implementer needs: Message template
   - Impact: Agent invents message
   - Suggested fix: Add template to error-messages.md

4. **[IMPLICIT]** — Section registry data source
   - What the spec says: "Registry maps step slugs to section names" — source unspecified
   - What the implementer needs: Hardcoded? Loaded from file? From methodology manifest?
   - Impact: Can build but can't test without knowing data source
   - Suggested fix: Clarify registry source

---

### T-044: Author methodology preset files

**Score:** 4/5
**Referenced Specs:** manifest-yml-schema.md, ADR-043, config-yml-schema.md

#### Gaps

1. **[AMBIGUITY]** — Step name canonical list not cross-referenced
   - What the spec says: "All 36 steps enabled" but step names come from not-yet-created meta-prompts
   - What the implementer needs: Canonical step name list from manifest-yml-schema.md §8.1
   - Impact: Low — deep.yml example provides the list
   - Suggested fix: Cross-reference manifest-yml-schema.md §8.1 as canonical source

2. **[AMBIGUITY]** — Conditional marking in custom-defaults.yml
   - What the spec says: "Conditionals marked" — but manifest §8.3 example is incomplete
   - What the implementer needs: Which steps get `conditional: "if-needed"`
   - Impact: Low — inferred from deep.yml example
   - Suggested fix: Explicitly list conditional steps

---

### T-045: Author core domain expertise KB files

**Score:** 3/5
**Referenced Specs:** ADR-042, ADR-041, prompts.md (v1)

#### Gaps

1. **[AMBIGUITY]** — File path mismatch
   - What the spec says: Task: `knowledge/domain-modeling.md` (flat). ADR-042 and frontmatter-schema.md: `knowledge/core/domain-modeling.md` (subdirectory)
   - What the implementer needs: Correct directory
   - Impact: High — knowledge-loader won't find entries; meta-prompt references fail
   - Suggested fix: Update paths to `knowledge/core/` prefix

2. **[MISSING]** — No formal KB entry frontmatter schema
   - What the spec says: ADR-042 says entries have name/description/topics but no formal schema exists
   - What the implementer needs: Types, constraints, validation rules for KB frontmatter
   - Impact: Cannot validate entries as acceptance criteria require
   - Suggested fix: Create KB entry schema document

3. **[VAGUE]** — Content guidance is generic
   - What the spec says: "Each entry covers expertise, patterns, pitfalls, evaluation criteria"
   - What the implementer needs: Example entry, length guidance, section structure template
   - Impact: Inconsistency across 10 files
   - Suggested fix: Add one complete example KB entry

---

### T-046: Author phase-specific review KB files

**Score:** 3/5
**Referenced Specs:** ADR-046, ADR-042, prompts.md (v1)

#### Gaps

1. **[MISSING]** — No formal KB entry schema (same as T-045)
   - Same issue as T-045 gap 2

2. **[VAGUE]** — "Detection heuristics" undefined
   - What the spec says: "Failure modes with detection heuristics unique to that artifact type"
   - What the implementer needs: Example of what a "detection heuristic" looks like in practice
   - Impact: Novel concept needs grounding
   - Suggested fix: Add one worked example failure mode + detection heuristic pair

3. **[VAGUE]** — "Multi-pass review structure" undefined
   - What the spec says: "Multi-pass review structure specific to this artifact type"
   - What the implementer needs: What constitutes a "pass"? How many? What naming convention?
   - Impact: Inconsistency across 10 review entries
   - Suggested fix: Provide structural template for review entries

4. **[MISSING]** — No content example
   - What the spec says: ADR-046 gives topic examples but no complete entry
   - What the implementer needs: One fully worked review KB entry
   - Impact: Experimental first entry
   - Suggested fix: Add complete example

---

### T-047: Author validation and product KB files

**Score:** 3/5
**Referenced Specs:** ADR-042, prompts.md (v1)

#### Gaps

1. **[AMBIGUITY]** — Directory placement ambiguity
   - What the spec says: Task puts `implementation-playbook.md` in `knowledge/product/`. ADR-042 defines both `product/` and `finalization/` categories
   - What the implementer needs: Which entries go where
   - Impact: Affects knowledge-base reference resolution
   - Suggested fix: Map each entry to its correct ADR-042 directory

2. **[MISSING]** — No formal KB entry schema (same as T-045)
   - Same issue as T-045 gap 2

3. **[VAGUE]** — Thin content guidance for validation entries
   - What the spec says: "Validation entries cover specific verification techniques"
   - What the implementer needs: More specific guidance per entry
   - Impact: Agent must invent structure
   - Suggested fix: Add 1-2 sentences per entry describing scope

---

### T-048: Author pipeline meta-prompts — product/domain phases

**Score:** 4/5
**Referenced Specs:** ADR-041, ADR-043, ADR-048, frontmatter-schema.md

#### Gaps

1. **[MISSING]** — No complete meta-prompt body example
   - What the spec says: ADR-041 says "30-80 lines" with Purpose/Inputs/Outputs/Quality Criteria/Methodology Scaling/Mode Detection sections. No complete example exists.
   - What the implementer needs: One fully worked meta-prompt file (frontmatter + body)
   - Impact: First meta-prompt will be experimental
   - Suggested fix: Add complete example to ADR-041 or system-architecture.md §4a

2. **[AMBIGUITY]** — "No actual prompt text" boundary unclear
   - What the spec says: "Meta-prompts MUST NOT contain actual prompt text — they declare intent"
   - What the implementer needs: Where the line is between intent and prompt text
   - Impact: Low — reasonable interpretation: describe *what*, not *how*
   - Suggested fix: Add one "good" and one "bad" example to ADR-041

---

### T-049: Author pipeline meta-prompts — architecture/data phases

**Score:** 4/5
**Referenced Specs:** ADR-041, ADR-043, ADR-048, frontmatter-schema.md

#### Gaps

1. **[MISSING]** — Same meta-prompt body example gap as T-048
   - Lower impact since T-048 establishes the pattern

2. **[AMBIGUITY]** — Step name: `api-contract` (task) vs `api-contracts` (manifest)
   - What the spec says: manifest-yml-schema.md §8.1 uses plural form
   - What the implementer needs: Canonical form; mismatch causes PRESET_INVALID_STEP
   - Impact: Validation failures
   - Suggested fix: Use manifest's `api-contracts`

3. **[AMBIGUITY]** — Step name: `ui-ux-specification` (task) vs `ux-spec` (manifest)
   - What the spec says: manifest-yml-schema.md §8.1 uses shorter form
   - What the implementer needs: Canonical form
   - Impact: Same validation concern
   - Suggested fix: Use manifest's `ux-spec`

---

### T-050: Author pipeline meta-prompts — impl/finalization

**Score:** 4/5
**Referenced Specs:** ADR-041, ADR-043, ADR-048, frontmatter-schema.md

#### Gaps

1. **[MISSING]** — Same meta-prompt body example gap as T-048

2. **[AMBIGUITY]** — Step name mismatches with manifest
   - `operations-runbook` (task) vs `operations` (manifest)
   - `security-review` (task) vs `security` (manifest)
   - `developer-onboarding` (task) vs `developer-onboarding-guide` (manifest)
   - Impact: Multiple PRESET_INVALID_STEP validation failures
   - Suggested fix: Align all filenames with manifest-yml-schema.md §8.1

3. **[AMBIGUITY]** — apply-fixes-and-freeze step name not in manifest
   - What the spec says: Task creates `pipeline/finalization/apply-fixes-and-freeze.md`; manifest example shows `apply-fixes-and-freeze` in step list
   - What the implementer needs: Confirmation this name is in the manifest — it appears to be
   - Impact: None if confirmed
   - Suggested fix: Verify against canonical step list

---

### T-052: Implement end-to-end integration tests

**Score:** 3/5
**Referenced Specs:** PRD §18, cli-contract.md, all domain models

#### Gaps

1. **[MISSING]** — No test fixture specification
   - What the spec says: "Tests use temporary directories with fixture projects" — no fixture details
   - What the implementer needs: What files/directories each scenario requires
   - Impact: Agent invents fixture structures
   - Suggested fix: Add fixture descriptions per scenario (greenfield: empty dir; brownfield: has package.json + src/)

2. **[AMBIGUITY]** — AI execution boundary in tests
   - What the spec says: "init → run all steps → status shows 100%" — but running steps requires AI
   - What the implementer needs: How to test "run all steps" without AI. Mock execution boundary?
   - Impact: High — test design blocked without clarity on mocking strategy
   - Suggested fix: Specify that e2e tests mock the AI execution boundary and verify state transitions

3. **[MISSING]** — Crash simulation approach
   - What the spec says: "Simulate crash mid-step, verify recovery"
   - What the implementer needs: How to simulate — pre-set state.json with in_progress? Kill process?
   - Impact: Low — inferable
   - Suggested fix: Specify: pre-set state.json with in_progress field

4. **[IMPLICIT]** — Performance budget "30 seconds total"
   - What the spec says: "Tests complete within 30 seconds total"
   - What the implementer needs: Whether this is vitest timeout or CI constraint
   - Impact: Low
   - Suggested fix: Clarify as vitest timeout configuration

---

### T-053: Configure npm packaging and distribution

**Score:** 4/5
**Referenced Specs:** ADR-002

#### Gaps

1. **[AMBIGUITY]** — Package name unconfirmed
   - What the spec says: Task says `@scaffold-cli/scaffold`. ADR-002 says "TBD" with candidates
   - What the implementer needs: Confirmed name
   - Impact: Low — can be changed before publish
   - Suggested fix: Confirm or note as provisional

2. **[MISSING]** — CI system details
   - What the spec says: "CI job validates npm pack --dry-run output"
   - What the implementer needs: CI system (GitHub Actions?), workflow file location
   - Impact: Low — standard setup
   - Suggested fix: Specify CI system

---

### T-054: Write v1 to v2 migration guide

**Score:** 4/5
**Referenced Specs:** Domain 07, ADR-048, config-yml-schema.md

#### Gaps

1. **[VAGUE]** — v1 methodology name mapping unconfirmed
   - What the spec says: "classic (v1) → deep, classic-lite (v1) → mvp"
   - What the implementer needs: Confirmation from v1 source
   - Impact: Low — documentation can be verified
   - Suggested fix: Cross-reference with v1 prompts.md

2. **[MISSING]** — v1 artifact-to-v2 step mapping table
   - What the spec says: "What happens to existing artifacts"
   - What the implementer needs: Mapping table from v1 artifacts to v2 step names
   - Impact: Low-Medium — requires cross-referencing
   - Suggested fix: Add reference to Project Detector domain model

---

### T-055: Validate performance against PRD budgets

**Score:** 4/5
**Referenced Specs:** PRD §18

#### Gaps

1. **[AMBIGUITY]** — "9-step assembly sequence" scope
   - What the spec says: "< 500ms for 9-step assembly sequence"
   - What the implementer needs: Which steps are in scope (7 assembly steps before AI, or all 9?)
   - Impact: Low — benchmark assembly engine's assemble() method
   - Suggested fix: Clarify 500ms covers steps 1-7 (before AI execution)

2. **[MISSING]** — Fixture data source
   - What the spec says: "36 meta-prompts, 37 KB entries, populated state"
   - What the implementer needs: Production content or synthetic stubs
   - Impact: Low — depends on T-044-T-051 completion
   - Suggested fix: Note: use production content or size-realistic stubs

3. **[IMPLICIT]** — vitest benchmark configuration
   - What the spec says: "Use vitest benchmark mode"
   - What the implementer needs: Config entry in vitest.config.ts
   - Impact: Negligible
   - Suggested fix: None needed

---

## Cross-Task Analysis

### Pattern Gaps

1. **No knowledge base entry frontmatter schema exists.** Tasks T-045, T-046, T-047, and T-014 all reference validating KB entry frontmatter against a schema, but no `knowledge-entry-schema.md` exists. This affects 4 tasks across 2 phases.

2. **No complete meta-prompt body example exists.** Tasks T-048, T-049, T-050, and T-051 must author meta-prompt markdown bodies with specific sections (Purpose, Inputs, Expected Outputs, Quality Criteria, Methodology Scaling, Mode Detection) but no spec provides a complete example. This affects 4 tasks.

3. **Error code catalog incomplete.** The error-messages.md catalog is missing entries for PRESET_* codes (T-006), CMD_SECTION_OVER_BUDGET (T-043), and RESET_CONFIRM_REQUIRED (T-031). Multiple tasks reference error codes that don't exist in the catalog.

4. **Return type patterns not standardized.** Several tasks (T-005, T-008, T-010) return success-or-error results but use inconsistent patterns (some throw, some return union types, some return result objects). No project-wide error handling return convention is documented.

### Handoff Gaps

1. **T-006 ↔ T-044: Preset files.** T-006 loads methodology presets; T-044 creates them. T-006 lists T-004+T-005 as dependencies but not T-044. T-006 tests require preset files that don't exist until T-044 runs.

2. **T-002 ↔ T-006: MethodologyPreset type.** T-006 returns a `MethodologyPreset` object not defined in T-002's type files. The type is missing from the handoff.

3. **T-013 ↔ T-015/T-017: reads field.** T-013 acceptance criteria don't mention the `reads` field. T-015 (context gatherer) needs `reads` to load cross-cutting artifacts. The field is specified in frontmatter-schema.md but not in the task that parses frontmatter for the assembly engine.

4. **T-032 ↔ T-033/T-035: DetectionResult type.** T-032 returns a `DetectionResult` type not formally defined. T-033 and T-035 both consume it.

5. **T-029 ↔ T-043: CLAUDE.md section fill.** cli-contract.md specifies CLAUDE.md section fill during post-completion. T-029's task description omits this. T-043 provides the CLAUDE.md manager but the integration point is missing.

### Ordering Risks

1. **Phase 6 content tasks can't be validated without Phase 1 code.** T-044 (presets), T-048-T-051 (meta-prompts) need the frontmatter parser (T-004) and preset loader (T-006) for validation. The dependency graph captures this, but parallel execution plans should note that content validation requires code tooling.

2. **T-052 (e2e tests) depends on both code and content.** E2E tests need working commands (Phase 4), real meta-prompts (Phase 6), and real presets (T-044). The dependency graph shows T-052 depends on T-029, T-033, T-034, T-044, T-048, which covers this.

### Missing Tasks

1. **No CI/CD configuration task.** T-053 mentions "CI job validates npm pack --dry-run" but no task creates the CI workflow file (.github/workflows/).

2. **No knowledge-entry-schema.md creation task.** Multiple content and code tasks reference KB entry validation, but no task creates the schema document.

3. **No system framing/execution instruction content task.** T-017's assembly engine needs template text for sections 1 and 7, but no task creates this content. It could be a sub-item of T-017 or a separate content task.

4. **No meta-prompt body section convention task.** T-013 needs to parse body sections, and T-048-T-051 need to write them, but no task defines the section heading convention that connects parsing to authoring.

---

## Recommendations

### Critical (blocks implementation)

1. **Resolve schema-version value conflict (1 vs 2).** T-002 and T-007 say schema_version is 2; state-json-schema.md says const value is 1. Fix before any state-related task begins. Affects T-002, T-007, and all downstream state consumers.

2. **Reconcile T-031 (reset) with CLI contract.** The task describes single-step reset and `--methodology` flag that don't exist in the contract. One must be updated.

3. **Reconcile T-029 (run) with CLI contract.** Remove phantom `--no-confirm` flag. Add completion gate details (interactive blocking vs auto immediate exit). Add depth downgrade check. T-029 is on the critical path.

4. **Define system framing and execution instruction template text.** T-017 cannot produce correct assembled prompts without content for sections 1 (System framing) and 7 (Execution instruction).

### Major (fix before the affected phase)

5. **Create knowledge base entry frontmatter schema.** Needed by T-014 (code) and T-045/T-046/T-047 (content). Document `name`, `description`, `topics` field types and validation rules.

6. **Define meta-prompt body section convention.** Needed by T-013 (parsing) and T-048-T-051 (authoring). Document heading convention (e.g., `## Purpose`, `## Inputs`, etc.).

7. **Fix T-045 file paths.** Change from flat `knowledge/` to `knowledge/core/` per ADR-042.

8. **Resolve step name mismatches.** T-049 and T-050 use different step names than manifest-yml-schema.md examples. At least 5 step names need alignment.

9. **Add missing state.json fields to T-007.** Task only addresses 4 of 11 required top-level fields.

10. **Add PRESET_* error codes to error-messages.md.** T-006 references 4 error codes not in the catalog.

11. **Add missing CLI contract flags to command tasks.** T-023 (--phase), T-024 (--count), T-025 (project-info mode), T-036 (--fix, --scope).

12. **Reconcile T-035 AdaptationStrategy enum.** Task and domain model define completely different enum values.

### Minor (fix as encountered)

13. **T-004: Add `reads` field parsing and kebab-to-camelCase conversion to acceptance criteria.**

14. **T-005: Add v1 config format example for migration testing.**

15. **T-006: Clarify preset file path resolution (package root vs project root).**

16. **T-008: Define return type with artifact details, not just status string.**

17. **T-010: Add processStartedAt retrieval guidance and ownership verification.**

18. **T-012: Remove ASM_METHODOLOGY_CHANGED from acceptance criteria (delegate to T-018).**

19. **T-026: Change flags from `--methodologies`/`--platforms` to `--section` per contract.**

20. **T-028: Add network check and additional JSON fields per contract.**

21. **T-030: Add newly_eligible computation and in-progress warning.**

22. **T-038: Fix flag names to match contract (`--check-only`, `--skip-build`).**

23. **T-042: Reconcile file generation behavior with adapter-interface.md.**

24. **T-043: Fix error code name to CMD_SECTION_OVER_BUDGET; add to error-messages.md.**

25. **T-044: Cross-reference manifest-yml-schema.md §8.1 for canonical step list.**

---

## Statistics

### Pre-fix
- Tasks ready (5/5): 8
- Tasks with minor gaps (4/5): 31
- Tasks with moderate gaps (3/5): 16
- Tasks with significant gaps (2/5): 0
- Tasks not implementable (1/5): 0
- Total per-task findings: 120
- Critical findings: 4
- Pattern gaps: 4
- Handoff gaps: 5
- Missing tasks identified: 4

### Post-fix
- Tasks ready (5/5): 33
- Tasks with minor gaps (4/5): 22
- Tasks with moderate gaps (3/5): 0
- Total findings resolved: 120
- Pattern gaps resolved: 4
- Handoff gaps resolved: 5
- Missing tasks addressed: 4 (3 folded into existing tasks, 1 new document created)

---

## Resolution Record

| Commit | Scope | Resolved |
|--------|-------|----------|
| 1: Spec fixes + schemas | state-json-schema.md, system-architecture.md, new knowledge-entry-schema.md | Critical #1 (schema-version), Critical #4 (system framing), Pattern Gap #1 (KB schema), Pattern Gap #2 (body convention), Missing Task #2, #4 |
| 2: Error codes | error-messages.md | Pattern Gap #3 (incomplete error catalog): 11 codes added across 4 component groups |
| 3: Task descriptions | task-breakdown.md (T-001–T-055) | All 120 per-task findings, 5 handoff gaps, 4 ordering risks. Key fixes: schema-version refs, CLI contract alignment (T-029, T-031, T-038), adapter reconciliation (T-042), file path corrections (T-045, T-047, T-049, T-050), ownership boundaries (T-012/T-018) |
