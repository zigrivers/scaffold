# ADR-052: Decision Recording Interface

**Status:** proposed
**Date:** 2026-03-14
**Deciders:** TBD
**Domain(s):** 11, 15

---

## Context

The assembly engine instructs the AI to record architectural decisions in `decisions.jsonl`. But how does the AI communicate decisions back to the CLI? Domain 15, Section 10, Open Question 2.

## Options

- **(A)** AI writes directly to `decisions.jsonl` using file tools
- **(B)** CLI parses AI output for a structured decisions block
- **(C)** AI outputs decisions in a known format; CLI extracts and persists post-execution
- **(D)** AI is instructed to call a scaffold CLI subcommand (`scaffold decisions add "..."`) during execution

## Decision

TBD

## Rationale

TBD

## Alternatives Considered

TBD — see Options above for candidates.

## Consequences

TBD

## Constraints and Compliance

TBD

## Related Decisions

- [ADR-013](ADR-013-decision-log-jsonl-format.md) — Decision log format
- Domain 11 ([11-decision-log.md](../domain-models/11-decision-log.md)) — Decision log lifecycle
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Section 10, Open Question 2

---

## Resolution Recommendation (added by traceability gap analysis)

**Recommended decision:** Option (A) — AI writes directly to `decisions.jsonl` using file tools.

**Rationale:** This keeps the assembly engine simple — it doesn't need to parse AI output or extract structured blocks. The assembled prompt already instructs the AI on the `decisions.jsonl` format (ADR-013). AI tools (Claude Code's file tools, Codex's sandbox) can write files directly. Option (D) adds a CLI subcommand but requires the AI to shell out mid-execution, which is fragile. Options (B) and (C) require post-execution parsing of AI output, coupling the CLI to AI output format — this is a brittle interface. Direct file writes are the simplest approach and consistent with how the AI writes other artifacts.

**Impact if unresolved:** The decision logger (T-009) needs to know if it's the sole writer or if the AI also writes. The assembly engine's execution instruction section (T-017) needs to tell the AI how to record decisions. Without this, the decision recording workflow is undefined.

**Blocking tasks:** T-009 (decision logger), T-017 (assembly engine orchestrator)

**Recommended resolution timing:** Before starting T-009 (Phase 1). Low risk — Option (A) is the simplest and can be revised later if needed.
