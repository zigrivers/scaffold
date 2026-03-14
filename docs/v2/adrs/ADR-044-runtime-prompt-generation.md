# ADR-044: Runtime Prompt Generation Over Build-Time Resolution

**Status**: accepted
**Date**: 2026-03-14
**Deciders**: v2 spec, meta-prompt architecture design
**Domain(s)**: 01 (retired), 05, 12 (retired)
**Phase**: 2 — Architecture Decision Records
**Supersedes**: ADR-010

---

## Context

ADR-010 established that all prompt resolution, mixin injection, dependency ordering, and platform output generation happens at **build time** (`scaffold build`). Runtime commands (`scaffold resume`, `scaffold next`) read pre-built prompts and manage state transitions only. This design was motivated by determinism — build-time resolution locks in the prompt text so it can be validated before execution, and the same build always produces the same prompts.

The meta-prompt architecture (ADR-041) fundamentally changes this calculus. Meta-prompts are declarations of intent, not executable prompt text. The working prompt that the AI executes is generated at runtime by assembling meta-prompt + knowledge base entries + project context + user instructions. This assembly cannot happen at build time because:

1. **Project context changes between steps.** Each pipeline step produces artifacts that become context for subsequent steps. A build-time assembly would have stale context — it would not include the architecture document produced in phase 3 when assembling the phase 4 prompt.

2. **User instructions are provided at execution time.** Users can pass inline instructions (`scaffold run <step> --instructions "Use hexagonal architecture"`) that are only known when the step is invoked.

3. **Artifacts evolve during update mode.** When a step is re-run on existing artifacts, the assembled prompt must include the current state of those artifacts to enable targeted updates rather than full regeneration.

The build-time approach from ADR-010 was designed for a system with static prompt text, mixin injection, and deterministic composition. The meta-prompt architecture requires a fundamentally different assembly timing.

## Decision

Prompt assembly happens at **runtime** when `scaffold run <step>` is invoked. The CLI performs the following assembly sequence:

1. **Load the meta-prompt** for the requested step (`pipeline/<step>.md`)
2. **Check prerequisites** — verify that all `depends-on` steps are completed in `state.json`, that the step has not already been completed (unless `--force` or update mode), and that no other process holds the step lock
3. **Load knowledge base entries** referenced in the meta-prompt's `knowledge-base` frontmatter field
4. **Gather project context:**
   - Completed artifacts (files listed in `produces` fields of completed steps)
   - `.scaffold/config.yml` (methodology, depth, project metadata)
   - `.scaffold/state.json` (pipeline completion status)
   - `.scaffold/decisions.jsonl` (prior architectural decisions)
5. **Load user instructions** (three layers, in precedence order):
   - `.scaffold/instructions/global.md` (persistent, all steps)
   - `.scaffold/instructions/<step>.md` (persistent, this step only)
   - `--instructions` flag value (inline, this invocation only)
6. **Determine depth level** for this step from methodology preset or custom config
7. **Construct the assembled prompt** in the fixed-order structure defined by ADR-045
8. **AI generates and executes the working prompt** — the assembled prompt is passed to the AI, which generates a working prompt tailored to the project and methodology and executes it in a single turn
9. **Update state** — mark the step as completed in `state.json`, record any architectural decisions to `decisions.jsonl`, and display next available steps to the user

**What remains at "build time":** Dependency ordering (computing which steps are available based on completed prerequisites) and command wrapper generation (producing thin `commands/*.md` files for plugin delivery) can still happen at build time or on-demand — these are structural operations that do not depend on project context.

## Rationale

**Runtime assembly ensures fresh context.** The most important input to prompt generation is the project's current state — what artifacts exist, what decisions have been made, what the configuration says. Build-time assembly would freeze this context at build time, producing prompts that reference stale or nonexistent artifacts. Runtime assembly guarantees that the AI always works with the latest project state.

**User instructions are inherently runtime.** The `--instructions` flag allows users to provide one-off guidance for a specific step invocation. This guidance cannot exist at build time because the user has not provided it yet. Per-step instruction files (`.scaffold/instructions/<step>.md`) could theoretically be loaded at build time, but they may also change between steps, and loading them at runtime keeps all instruction handling consistent.

**Update mode requires current artifact content.** When re-running a step, the assembled prompt must include the existing artifact so the AI can diff against current project state and propose targeted updates. This artifact only exists after the step has been run at least once — it cannot be included in a build-time assembly for the step's first run but must be included for subsequent runs. Runtime assembly handles both cases naturally.

**The assembly engine is deterministic even though generation is not.** Given the same inputs (meta-prompt, knowledge base, project context, user instructions, depth level), the assembly engine always produces the same assembled prompt. The non-determinism introduced by ADR-041 is in the AI's interpretation of the assembled prompt, not in the assembly process itself. This preserves debuggability — users can inspect the assembled prompt to understand exactly what the AI received.

## Alternatives Considered

### Build-Time Resolution (v2 Original, ADR-010)

- **Description**: All prompt resolution and composition at build time. Runtime reads pre-built prompts.
- **Pros**: Deterministic — same build always produces same prompts. Prompts can be validated and inspected before execution. No runtime assembly latency.
- **Cons**: Cannot include fresh project context — artifacts produced by earlier steps are not available at build time for later steps. Cannot include runtime user instructions. Build must be re-run after every step to update context for the next step, which defeats the purpose of build-time assembly. Designed for static prompt text composition, not for meta-prompt + knowledge base assembly.

### Hybrid: Build-Time Assembly with Runtime Context Injection

- **Description**: Assemble most of the prompt at build time (meta-prompt + knowledge base + depth settings), then inject fresh project context and user instructions at runtime.
- **Pros**: Knowledge base and meta-prompt loading happens once at build time, reducing per-step runtime work. Partial determinism — the non-context portions of the assembled prompt are stable.
- **Cons**: Adds complexity — two assembly phases instead of one. The boundary between "build-time content" and "runtime content" is fragile (e.g., should user per-step instructions be build-time or runtime? They could change between steps). The runtime injection step is essentially the same as full runtime assembly but with artificial constraints on what can change. Optimization without demonstrated need.

### On-Demand Assembly with Caching

- **Description**: Runtime assembly with aggressive caching — cache assembled prompts and invalidate when inputs change (meta-prompt modified, knowledge base updated, new artifacts produced, instructions changed).
- **Pros**: First assembly is fresh; subsequent identical assemblies are fast. Could skip re-loading unchanged knowledge base entries.
- **Cons**: Cache invalidation is the hard problem. Determining whether "inputs changed" requires checking file modification times on meta-prompts, knowledge base entries, all project artifacts, instruction files, and config — essentially doing most of the assembly work to determine if assembly is needed. For a CLI tool that runs steps sequentially with human interaction between steps, the per-step assembly latency is negligible compared to AI generation time. Caching adds complexity for unmeasurable benefit.

## Consequences

### Positive
- Assembled prompts always reflect the latest project state — no stale context
- User instructions (inline, per-step, global) are naturally incorporated at the time they are relevant
- Update mode works seamlessly — existing artifacts are included as context when available
- Assembly engine is deterministic — same inputs produce same assembled prompt, enabling inspection and debugging
- Eliminates the `scaffold build` step as a prerequisite for running pipeline steps

### Negative
- Each step invocation incurs assembly latency (loading meta-prompt, knowledge base, artifacts, instructions) — though this is negligible compared to AI generation time
- No pre-built prompt to inspect before execution — users must use a CLI flag (e.g., `scaffold run <step> --dry-run`) to see the assembled prompt without executing
- Assembly errors (missing knowledge base entry, unreadable artifact) surface at runtime rather than at build time
- Cannot validate all prompts at once — validation must either simulate assembly or validate components individually

### Neutral
- Dependency ordering can still happen eagerly (computing available steps from state) — it does not require runtime assembly
- Command wrapper generation (`commands/*.md` for plugin delivery) is a separate concern from prompt assembly and can happen at any time
- The `scaffold build` command's role changes from "resolve and compose all prompts" to "generate command wrappers and validate pipeline structure"
- ADR-010's idempotency guarantee ("same build always produces same output") is preserved at the assembly level — same inputs produce same assembled prompt — but the AI's output from that prompt is non-deterministic (bounded by quality criteria, per ADR-041)

## Reversibility

Reversible with significant effort. Would require reintroducing a build step, accepting stale context in assembled prompts, and redesigning user instructions to be build-time only. The meta-prompt architecture (ADR-041) assumes runtime assembly, so reversal here would cascade to ADR-045 and domain 15.

## Constraints and Compliance

- Prompt assembly MUST happen at runtime when `scaffold run <step>` is invoked — not at build time
- The assembly engine MUST produce a deterministic assembled prompt given the same inputs (meta-prompt, knowledge base entries, project context, user instructions, depth level)
- The CLI MUST support a dry-run mode (`--dry-run` or equivalent) that outputs the assembled prompt without executing it
- Project context gathering MUST include all completed artifacts listed in `produces` fields of completed steps
- User instructions MUST be loaded in precedence order: global < per-step < inline, with later layers overriding earlier on conflict
- Assembly errors (missing meta-prompt, missing knowledge base entry, unreadable artifacts) MUST produce clear error messages with suggested fixes
- ADR-010 (build-time resolution) is superseded by this decision

## Related Decisions

- [ADR-010](ADR-010-build-time-resolution.md) — Superseded; build-time resolution replaced by runtime assembly
- [ADR-041](ADR-041-meta-prompt-architecture.md) — Meta-prompt architecture that requires runtime assembly
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Structure of the assembled prompt produced by runtime assembly
- [ADR-012](ADR-012-state-file-design.md) — State file that tracks step completion, used to determine available context
- [ADR-018](ADR-018-completion-detection-crash-recovery.md) — Completion detection used to identify available artifacts for context gathering
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine domain model defining the full 9-step execution sequence
