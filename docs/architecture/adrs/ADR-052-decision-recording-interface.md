# ADR-052: Decision Recording Interface

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 11, 15

---

## Context

The assembly engine instructs the AI to record architectural decisions in `decisions.jsonl`. But how does the AI communicate decisions back to the CLI? Domain 15, Section 10, Open Question 2.

## Decision

The CLI's Decision Logger component writes decisions to `decisions.jsonl` as part of post-completion processing:

1. During AI execution, the AI identifies key decisions and includes them in the step's output artifact (e.g., "Decision: Using PostgreSQL for primary storage" within the generated document).
2. After the user confirms step completion, the CLI extracts decision entries from the assembled prompt's execution context and appends them to `decisions.jsonl` via the Decision Logger component.
3. The CLI assigns sequential D-NNN IDs atomically, validates schema compliance, and handles append-only writes with crash safety (entries < 4KB for POSIX atomic write).

This is consistent with the architecture's post-completion flow (system-architecture.md §4b step 9) and the Decision Logger component specification (domain 11).

## Rationale

The CLI-mediated approach provides guarantees that direct AI writing cannot: atomic sequential ID assignment (no collisions across agents), schema validation before write, crash-safe append semantics, and consistent `prompt_completed` status tracking. The AI's role is to produce decisions in artifact content; the CLI's role is to record them in the structured log. This keeps the decision recording pipeline consistent with the architecture's post-completion flow, where the Decision Logger writes alongside state updates and CLAUDE.md fills.

## Alternatives Considered

1. **AI writes directly to `decisions.jsonl` using file tools** — The AI appends JSONL entries directly using its native file tools (Claude Code's `Write`/`Edit`, Codex's sandbox `fs`, etc.). Simple for the assembly engine (no output parsing), but risks ID collisions when multiple agents write simultaneously, bypasses schema validation, and creates a split responsibility where the CLI reads and validates a file it doesn't control. Inconsistent with the architecture's post-completion flow where the Decision Logger is a CLI component.
2. **CLI parses AI output for structured decisions block** — Requires the CLI to parse free-form AI output for a known delimiter or JSON block. Couples the CLI to the AI's output format, which is inherently non-deterministic. Fragile — formatting changes or AI model updates could break extraction.
3. **AI calls a scaffold CLI subcommand** (`scaffold decisions add "..."`) — Requires the AI to shell out mid-execution, which is fragile across platforms. Codex sandboxes may not allow subprocess execution. Adds a CLI subcommand that exists solely for AI-to-CLI communication, not for human use.

## Consequences

### Positive

- Atomic sequential ID assignment — no collisions across concurrent agents
- Schema validation at write time — malformed entries are rejected before persistence
- Consistent with post-completion flow — Decision Logger writes alongside state updates
- Crash-safe append semantics — entries < 4KB for POSIX atomic write guarantees

### Negative

- CLI must extract decisions from artifact content — requires a parsing/extraction step during post-completion
- AI must include decisions in a recognizable format within artifacts for the CLI to extract
- Slightly more complex post-completion flow (extraction + validation + write)

## Reversibility

Easily reversible. Switching to CLI-mediated writing (Options B/C/D) would require changes to the assembly engine's execution instructions and adding a CLI extraction/subcommand layer. The JSONL file format (ADR-013) is unchanged regardless of who writes it.

## Constraints and Compliance

- The assembly engine's execution instruction section (ADR-045, section 7) MUST instruct the AI to include key decisions in its output artifact content
- The Decision Logger (T-009) MUST extract decision entries from artifact content during post-completion processing
- The Decision Logger MUST assign sequential D-NNN IDs atomically (no gaps, no collisions)
- The Decision Logger MUST validate entries against the JSONL schema (ADR-013) before writing
- The Decision Logger MUST use append-only writes to preserve existing decisions
- Platform adapters (ADR-022) do NOT need file-write capability for decisions — the CLI handles all writes

## Related Decisions

- [ADR-013](ADR-013-decision-log-jsonl-format.md) — Decision log format (JSONL schema)
- [ADR-019](ADR-019-advisory-locking.md) — Advisory locking for concurrent access
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure; execution instruction section
- Domain 11 ([11-decision-log.md](../domain-models/11-decision-log.md)) — Decision log lifecycle
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Section 10, Open Question 2
