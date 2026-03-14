# ADR-008: Abstract Task Verbs as HTML Comments

**Status**: superseded (by [ADR-041](ADR-041-meta-prompt-architecture.md))
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 04, 12
**Phase**: 2 — Architecture Decision Records

---

## Context

Base prompts in Scaffold v2 reference task-tracking operations throughout: "create a task for each user story," "close the task when done," "check for ready tasks." In v1, these instructions were hardcoded to Beads (`bd create`, `bd close`, `bd ready`). v2 supports multiple task-tracking backends — Beads, GitHub Issues, and a manual TODO.md format — which means base prompts cannot reference any specific tool.

The system needs an abstraction layer that decouples prompt content from the task-tracking tool. This abstraction must handle the fundamental tension identified in domain 04: task-tracking tools have radically different data models. Beads has structured priorities, dependency graphs, and atomic claim operations. GitHub Issues has labels, assignees, and cross-reference syntax. TODO.md has none of these natively. The abstraction must provide a useful common denominator without crippling rich backends or producing incoherent instructions for weaker ones.

A secondary design question is whether compound operations like "create a task and immediately claim it" should be a single verb or composed from atomic verbs.

## Decision

Use `<!-- scaffold:task-<verb> [args] -->` HTML comment markers for task operations, replaced at build time by mixin-specific concrete commands. The core vocabulary contains 13 verbs:

| Verb | Purpose |
|------|---------|
| `create` | Create a new task |
| `list` | List all tasks |
| `ready` | Show unblocked tasks ready for work |
| `claim` | Claim/assign a task to current agent |
| `close` | Mark a task complete |
| `dep-add` | Add a dependency between tasks |
| `dep-tree` | Visualize dependency graph |
| `dep-remove` | Remove a dependency between tasks |
| `dep-cycles` | Check for circular dependencies |
| `show` | Show details of a single task |
| `sync` | Force sync/persist task state |
| `update` | Update task fields (status, description) |
| `create-and-claim` | Atomic create + claim (common pattern) |

Verb arguments use a simple grammar: positional strings in double quotes, named parameters as `key=value`. Example: `<!-- scaffold:task-create "Fix login bug" priority=1 -->`.

Each task-tracking mixin provides a verb registry (YAML) mapping verbs to replacement templates with argument placeholders (`$TITLE`, `$ID`, `$PRIORITY`). Verbs unsupported by a mixin use one of three behaviors: `omit` (remove marker entirely), `comment` (replace with prose explanation), or `degrade` (replace with alternative approach).

The `create-and-claim` compound verb is included as a dedicated verb for discoverability, with status `proposed` pending a future ADR on orthogonality. The alternative — an optional `claim=true` argument on `create` — is noted but deferred.

For the `none` (TODO.md) mixin, verb replacements produce multi-line prose instructions referencing a structured TODO.md file with T-NNN IDs, P0-P3 priority tags, checkbox status markers, and `blocked-by: T-NNN` dependency notation.

## Rationale

- **HTML comments are invisible to execution environments**: An unresolved verb marker is silently skipped by any agent, shell, or markdown renderer — it never produces a runtime error. This is the same safety property that axis markers benefit from (v2 spec, Mixin System section). Template syntax residue like `{{task-create ...}}` would produce visible noise or confuse agents.
- **13 verbs cover real workflow needs**: The 8 spec-defined verbs plus 5 additional verbs identified from v1 prompt analysis cover the task-tracking operations that actually appear in pipeline prompts. Specifically, `dep-tree`, `dep-remove`, `dep-cycles`, and `update` appear in v1's Git Workflow and Implementation Loop prompts. `create-and-claim` captures the most common two-step pattern in v1 (domain 04, Section 1, Central Design Challenge). A smaller set would force prompts to use prose workarounds for missing operations; a larger set would include verbs with no real usage.
- **Verb registry separation from prose**: Storing verb-to-command mappings in YAML (separate from the mixin's prose content) keeps the replacement logic structured and validatable. The injection system can verify that all 13 verbs have defined behavior for a mixin, detect missing templates, and report coverage. Embedding replacements in prose markdown would make validation impossible (domain 12, recommended architecture for verb registries).
- **Three unsupported-verb behaviors handle backend asymmetry**: Beads supports all 13 verbs. GitHub Issues lacks native dependency tracking (`dep-add`, `dep-tree`, `dep-cycles`, `dep-remove`). TODO.md lacks atomic claim operations. Rather than forcing all backends to support all verbs (lowest common denominator) or silently dropping instructions (omit everything), the three behaviors — omit, comment, degrade — let each mixin author choose the most appropriate response per verb (domain 04, Section 5, Algorithm 3).

## Alternatives Considered

### Direct Tool References in Prompts
- **Description**: Base prompts reference specific tools directly (`bd create`, `gh issue create`, etc.). Different tool configurations use different methodology overrides.
- **Pros**: No abstraction layer to learn. Prompts contain the exact commands agents will run.
- **Cons**: Tight coupling makes base prompts single-methodology only. Supporting a new task-tracking tool requires duplicating every prompt that contains task operations. This is the v1 approach, and its inability to scale to multiple backends is a primary motivation for v2's mixin system.

### Template Conditionals for Tool Selection
- **Description**: Use template syntax within prompts to select the right command: `{{#if beads}}bd create{{else}}gh issue create{{/if}}`.
- **Pros**: Inline logic keeps everything in one file. Full conditional expressiveness.
- **Cons**: Prompts become unreadable when 13 verbs each have 3 tool variants interleaved throughout the document. Template errors are hard to debug. This is the same readability concern that led to rejecting templating for axis injection (ADR-006), but amplified because verb markers are more numerous and more deeply embedded in prose.

### Smaller Verb Set (Only create/list/close)
- **Description**: Define only 3 core verbs. All other operations use prose instructions or are left to methodology overrides.
- **Pros**: Simpler verb registry. Less surface area to implement and test.
- **Cons**: Does not cover real workflow needs. v1 prompts use dependency operations (`dep-add`, `dep-tree`) extensively in the Git Workflow prompt and `update` in the Implementation Loop. Removing these verbs would force prompt authors to write backend-specific prose for common operations, defeating the abstraction.

### Named Argument on `create` Instead of `create-and-claim`
- **Description**: Instead of a dedicated `create-and-claim` verb, add `claim=true` as an optional named argument on `create`. Mixins handle the compound behavior internally.
- **Pros**: More composable — keeps the verb set orthogonal. One fewer verb to define in each mixin's registry.
- **Cons**: Less discoverable — prompt authors must know that `claim=true` exists on `create`. The two-step "create then claim" pattern is the most common task operation in v1 prompts, and a dedicated verb makes the common case a single marker. This tradeoff is noted as status `proposed` for a future orthogonality ADR (domain 04, Section 10, Recommendation 7).

## Consequences

### Positive
- Base prompts are tool-agnostic — the same prompt works with Beads, GitHub Issues, or TODO.md without modification
- Adding a new task-tracking backend requires only writing a verb registry and mixin content file, not modifying any prompts
- `scaffold validate` can verify verb coverage per mixin at build time — ensuring no verbs are missing templates
- The `degrade` behavior produces helpful prose for agents on weaker backends rather than silent omissions

### Negative
- Prompt authors must learn the 13-verb vocabulary and argument grammar
- Verb registries must be maintained for each task-tracking mixin — 13 verbs times N backends
- The `create-and-claim` orthogonality question is deferred, creating a known design debt
- Complex replacements (especially for the `none` mixin's TODO.md format) produce multi-line prose that is harder to validate than single-command replacements

### Neutral
- The verb marker syntax (`<!-- scaffold:task-<verb> -->`) uses the `scaffold:` prefix to distinguish from axis markers (`<!-- mixin:<axis> -->`). Both are HTML comments, but the prefix prevents ambiguity in the parser.

## Constraints and Compliance

- Base prompts MUST use `<!-- scaffold:task-<verb> [args] -->` markers for all task-tracking operations. Raw tool-specific commands (`bd create`, `gh issue`, etc.) MUST NOT appear in base prompts (domain 04, Section 10, Recommendation 9 — lint rule).
- Each task-tracking mixin MUST define a `MixinVerbRegistry` with entries for all 13 verbs. Missing entries MUST specify an `unsupportedBehavior` (omit, comment, or degrade) (domain 04, Section 3, `VerbReplacementTemplate`).
- Verb names MUST match the `VerbName` type exactly — unknown verbs produce error `INJ_VERB_UNSUPPORTED` (domain 12, Section 6).
- Positional arguments MUST be enclosed in double quotes. Named arguments MUST use `key=value` syntax (domain 04, Section 5, Algorithm 1).
- The TODO.md format for the `none` mixin MUST use T-NNN IDs, P0-P3 priority tags, checkbox status, and `blocked-by: T-NNN` dependency notation (domain 04, Section 3, `TodoMdFormat`).
- Task verb markers MUST be single-line — no multi-line markers. Each `<!-- scaffold:task-<verb> [args] -->` marker occupies exactly one line in the prompt source.
- If a mixin does not support a verb used in a prompt, the build MUST emit a warning and insert a degraded replacement (an HTML comment explaining the unsupported operation), not produce a build error. This ensures prompts remain functional even when a backend lacks certain capabilities.
- Every mixin file MUST declare a replacement for every verb in the vocabulary. Missing verb mappings in a mixin file are build-time errors — the mixin is considered incomplete and cannot be used.
- Implementers MUST NOT add verbs beyond the 13 defined without updating the `VerbName` type and all existing mixin registries.

## Related Decisions

- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Mixin injection mechanism that performs verb replacement in Stage 4
- [ADR-007](ADR-007-mixin-markers-subsection-targeting.md) — Sub-section targeting for axis markers (complementary marker family)
- Domain 04 ([04-abstract-task-verbs.md](../domain-models/04-abstract-task-verbs.md)) — Full verb vocabulary, argument grammar, and replacement algorithms
- Domain 12 ([12-mixin-injection.md](../domain-models/12-mixin-injection.md)) — Injection pipeline that executes verb replacement in Stage 4
