# ADR-006: Mixin Injection over Templating

**Status**: superseded (by [ADR-041](ADR-041-meta-prompt-architecture.md))
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 12, 01
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 prompts need to produce different content depending on which mixin values are configured for each axis (task-tracking, tdd, git-workflow, agent-mode, interaction-style). For example, a prompt that instructs an agent to "create a task" must emit `bd create "Title" -p 1` for the Beads mixin, `gh issue create --title "Title" --label P1` for GitHub Issues, or multi-line prose instructions for editing TODO.md when using the `none` mixin.

Two fundamental approaches exist: **templating** (embedding conditional logic within prompts, like ERB, Handlebars, or Jinja) and **injection** (using markers that are replaced with content from separate mixin files at build time). A secondary question is whether injection should be recursive — can injected content itself contain markers that trigger further injection?

The choice affects prompt readability, debugging complexity, the build pipeline's determinism, and the mental model prompt authors must hold when writing prompts.

## Decision

Use HTML comment markers (`<!-- mixin:<axis> -->` and `<!-- scaffold:task-<verb> [args] -->`) for axis content injection and task verb replacement, performed at build time by a 6-stage injection pipeline. Injection is NOT recursive — the system performs exactly two ordered passes:

1. **Stage 3**: Replace axis markers with mixin file content
2. **Stage 4**: Replace task verb markers with concrete commands

If injected mixin content contains axis markers, they are detected as unresolved errors in Stage 5 (not recursively resolved). The `--allow-unresolved-markers` flag downgrades unresolved marker errors to warnings during development.

The `scaffold:` prefix on markers makes them identifiable as scaffold system markers. HTML comments are universally ignored by execution engines, shells, and AI agent parsers, so an unresolved marker degrades gracefully (is silently skipped) rather than causing a runtime error.

## Rationale

- **Prompt readability**: With injection, a base prompt reads as clean markdown with occasional `<!-- mixin:task-tracking -->` markers that clearly communicate "axis-specific content goes here." With templating, the same prompt would contain `{{#if mixin.taskTracking === 'beads'}}...{{else if mixin.taskTracking === 'github-issues'}}...{{/if}}` blocks that obscure the prompt's structure and make it impossible to read without mentally evaluating the conditionals. Domain 12, Section 1 identifies this as the "central design challenge" — keeping prompts simple enough that authors can reason about what their output will look like.
- **Non-recursive prevents infinite loops**: Recursive injection creates the possibility of infinite loops (mixin A injects content with a marker for axis B, which injects content with a marker for axis A). The two-pass architecture is bounded by construction — axis markers are replaced in pass 1, verb markers in pass 2, and the pipeline terminates. No depth limiting or cycle detection is needed (domain 12, Section 8, MQ6).
- **Two-pass ordering is sufficient**: Axis markers are replaced before task verb markers because mixin content may contain task verb markers (e.g., a task-tracking mixin's setup instructions include `<!-- scaffold:task-create "Setup tracking" priority=0 -->`). Task verb replacements produce short concrete commands that never contain axis markers. This one-directional dependency means two passes cover all valid compositions (domain 12, Section 4, Stage Ordering Rationale).
- **HTML comments are universally safe**: HTML comments are ignored by markdown renderers, shell interpreters, and AI agent tool-use parsers. An unresolved marker is invisible to the execution environment rather than causing a syntax error (v2 spec, Mixin System section). This is strictly better than template syntax residue, which would produce visible noise or errors.

## Alternatives Considered

### Template Syntax (ERB, Handlebars, Jinja)
- **Description**: Embed conditional logic directly in prompts. Each prompt would contain template directives that evaluate against mixin configuration at build time.
- **Pros**: Full conditional logic (if/else/loops). Content and conditions live in one file, no separate mixin files needed. Well-known syntax for web developers.
- **Cons**: Prompts become unreadable when multiple axes interact — a prompt with 3 axes and 3 values each would contain 9+ conditional branches interleaved with the prompt text. Template parsing errors are cryptic (line numbers reference the template, not the output). Debugging requires understanding both the template language and the prompt content simultaneously. Template engines add a runtime dependency to the build system.

### Recursive Injection
- **Description**: Same marker-based approach, but injected content is itself scanned for markers and recursively resolved until no markers remain.
- **Pros**: More composable — mixin files could reference other axes, enabling layered composition patterns.
- **Cons**: Risk of infinite loops requires depth limiting or cycle detection, adding complexity. Prompt authors must reason about transitive injection chains ("mixin A injects content that triggers mixin B that triggers..."), making the system harder to predict. The two-pass system covers all identified use cases without recursion — axis content may contain verb markers (handled), but no real-world case requires axis content to contain other axis markers.

### Runtime Injection (at Prompt Execution Time)
- **Description**: Store markers in the built prompts and resolve them when `scaffold resume` presents a prompt to the agent.
- **Pros**: Dynamic content — could adapt to runtime conditions. No build step needed for mixin changes.
- **Cons**: Non-deterministic — the same prompt could produce different content between runs if mixin files change. Validation cannot be performed at build time. The `scaffold validate` command could not verify that all markers resolve correctly. Contradicts the build-time resolution principle (ADR-010) and prevents idempotent builds.

## Consequences

### Positive
- Prompts remain readable — base prompts are clean markdown with a few injection markers
- The build pipeline is deterministic — same inputs always produce the same injected output
- Two-pass architecture is simple to implement, test, and reason about
- `scaffold validate` can verify at build time that all markers will resolve, catching errors before runtime
- Mixin files are standalone markdown documents, testable and reviewable independently of prompts

### Negative
- Prompt authors must understand two marker syntaxes (axis markers and task verb markers) and the two-pass ordering
- Mixin content cannot conditionally vary based on context — the same mixin file content is injected everywhere it is referenced. Fine-grained variation requires sub-section targeting (ADR-007), not inline conditionals
- Non-recursive injection means a mixin file cannot delegate to another mixin. If mixin A needs content from mixin B, the prompt must explicitly include markers for both axes
- The `--allow-unresolved-markers` development flag is necessary because prompt authors may add markers before writing the corresponding mixin files, creating a two-phase development workflow

### Neutral
- Mixin content must not add new `##`+ headings to preserve artifact-schema stability (domain 12, Section 7 cross-domain contract with domain 08). This is enforced by convention and `scaffold validate`, not by the injection engine itself.

## Constraints and Compliance

- Prompts MUST use `<!-- mixin:<axis> -->` or `<!-- mixin:<axis>:<sub-section> -->` syntax for axis injection markers (domain 12, Section 8, MQ2)
- Prompts MUST use `<!-- scaffold:task-<verb> [args] -->` syntax for task verb markers (domain 04, Section 3)
- The injection pipeline MUST process axis markers before task verb markers (domain 12, Section 4, Stage Ordering Rationale)
- The injection pipeline MUST NOT recursively resolve markers — exactly two passes, then an unresolved check (domain 12, Section 8, MQ6)
- Unresolved markers after injection MUST produce errors by default. The `--allow-unresolved-markers` flag MAY downgrade `INJ_UNRESOLVED_AXIS_MARKER` and `INJ_UNRESOLVED_VERB_MARKER` to warnings. All other error codes (`INJ_SECTION_NOT_FOUND`, `INJ_MIXIN_FILE_NOT_FOUND`) remain fatal regardless (domain 12, Section 6, Error-to-Warning Downgrade)
- Mixin files MUST NOT contain `##` or higher-level headings, to preserve artifact-schema stability (domain 12, Section 7, Domain 08 cross-domain contract)
- Implementers MUST process markers in reverse document order within each pass to preserve character offsets during replacement (domain 12, Section 4, Stage 3)

## Related Decisions

- [ADR-007](ADR-007-mixin-markers-subsection-targeting.md) — Sub-section targeting for fine-grained mixin content selection
- [ADR-008](ADR-008-abstract-task-verbs.md) — Abstract task verbs as the second marker family
- [ADR-010](ADR-010-build-time-resolution.md) — Build-time resolution ensures injection happens before runtime
- Domain 12 ([12-mixin-injection.md](../domain-models/12-mixin-injection.md)) — Full injection pipeline specification
- Domain 04 ([04-abstract-task-verbs.md](../domain-models/04-abstract-task-verbs.md)) — Task verb vocabulary and replacement grammar
