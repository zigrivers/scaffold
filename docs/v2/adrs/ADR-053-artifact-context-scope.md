# ADR-053: Artifact Context Scope

**Status:** proposed
**Date:** 2026-03-14
**Deciders:** TBD
**Domain(s):** 15

---

## Context

The assembly engine gathers "prior artifacts from completed steps" (Domain 15, Section 5, Algorithm 3). But should it include ALL completed artifacts or only the current step's dependency-chain artifacts? This directly affects context window usage. Related to ADR-050 (context window management).

## Options

- **(A)** All completed artifacts (maximum context, maximum size)
- **(B)** Only direct dependency artifacts (lean but may miss cross-cutting context)
- **(C)** Dependency artifacts plus any artifacts the meta-prompt explicitly references via a `reads` frontmatter field
- **(D)** Configurable per step via meta-prompt frontmatter

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

- [ADR-050](ADR-050-context-window-management.md) — Context window management (related constraint)
- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime assembly
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure (context section)
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Section 5, Algorithm 3
