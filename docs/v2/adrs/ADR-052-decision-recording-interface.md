# ADR-052: Decision Recording Interface

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 11, 15

---

## Context

The assembly engine instructs the AI to record architectural decisions in `decisions.jsonl`. But how does the AI communicate decisions back to the CLI? Domain 15, Section 10, Open Question 2.

## Decision

AI writes directly to `decisions.jsonl` using file tools.

The assembled prompt's execution instruction section tells the AI the JSONL format (per ADR-013) and the file path. The AI appends decision entries using its native file tools (Claude Code's `Write`/`Edit`, Codex's sandbox `fs`, etc.). The CLI's decision logger (T-009) reads and queries the file but does not write to it during prompt execution.

## Rationale

Direct file writes keep the assembly engine simple — it doesn't need to parse AI output or extract structured blocks. The assembled prompt already instructs the AI on the `decisions.jsonl` format (ADR-013), so the AI has the schema at execution time. AI tools across all supported platforms (Claude Code, Codex, Universal) can write files directly. This approach is consistent with how the AI writes other artifacts (documents, code) and avoids introducing a new communication channel between the AI and CLI.

## Alternatives Considered

1. **CLI parses AI output for structured decisions block** — Requires the CLI to parse free-form AI output for a known delimiter or JSON block. Couples the CLI to the AI's output format, which is inherently non-deterministic. Fragile — formatting changes or AI model updates could break extraction.
2. **AI outputs decisions in a known format; CLI extracts and persists post-execution** — Similar to Option B but with a more explicit contract (e.g., a fenced code block tagged `decisions`). Still requires output parsing and introduces a two-phase write (AI outputs, CLI persists). Adds latency and a failure mode if the CLI crashes between extraction and persistence.
3. **AI calls a scaffold CLI subcommand** (`scaffold decisions add "..."`) — Requires the AI to shell out mid-execution, which is fragile across platforms. Codex sandboxes may not allow subprocess execution. Adds a CLI subcommand that exists solely for AI-to-CLI communication, not for human use.

## Consequences

### Positive

- Simple assembly engine — no output parsing, no structured block extraction
- Consistent with existing artifact writing pattern (AI writes files, CLI reads them)
- Format is self-documenting — ADR-013's JSONL schema is the contract
- Works across all platform adapters (file writes are universally supported)

### Negative

- AI must correctly produce valid JSONL (format errors possible)
- No CLI-side validation at write time — malformed entries are detected on read
- Potential for concurrent write conflicts if multiple AI sessions write simultaneously (mitigated by advisory locking, ADR-019)

## Reversibility

Easily reversible. Switching to CLI-mediated writing (Options B/C/D) would require changes to the assembly engine's execution instructions and adding a CLI extraction/subcommand layer. The JSONL file format (ADR-013) is unchanged regardless of who writes it.

## Constraints and Compliance

- The assembly engine's execution instruction section (ADR-045, section 7) MUST instruct the AI on the `decisions.jsonl` path, format, and append-only semantics
- The AI MUST append entries (not overwrite) to preserve existing decisions
- The decision logger (T-009) MUST validate JSONL format on read and emit warnings for malformed entries
- Platform adapters (ADR-022) MUST include file-write capability instructions appropriate to each platform

## Related Decisions

- [ADR-013](ADR-013-decision-log-jsonl-format.md) — Decision log format (JSONL schema)
- [ADR-019](ADR-019-advisory-locking.md) — Advisory locking for concurrent access
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure; execution instruction section
- Domain 11 ([11-decision-log.md](../domain-models/11-decision-log.md)) — Decision log lifecycle
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Section 10, Open Question 2
