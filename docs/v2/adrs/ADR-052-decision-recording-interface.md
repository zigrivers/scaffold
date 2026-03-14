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
