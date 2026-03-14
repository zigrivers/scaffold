# ADR-039: Pipeline Context (context.json) Deferred

**Status**: accepted (deferred — Scope & Deferral)
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 08, 11
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold prompts execute in sequence, and later prompts often need data produced by earlier prompts. For example, the `api-design` prompt may need the database engine chosen during the `tech-stack` prompt, or the `testing-strategy` prompt may need the framework chosen during `tech-stack` to recommend appropriate testing libraries.

A shared context store (`context.json`) was considered as a structured key-value store where each prompt writes its key decisions and later prompts read them. This would provide a clean API for cross-prompt data sharing: the `tech-stack` prompt would write `{ "database": "PostgreSQL", "framework": "Next.js" }`, and the `api-design` prompt would read `context.database` to inform its recommendations.

However, implementing a shared context store raises questions about schema design (what keys does each prompt write?), versioning (what happens when a key's structure changes?), conflict resolution (what if two prompts write to the same key?), and the interaction with re-runs (if `tech-stack` is re-run, are context values updated, and do downstream prompts see the new values?).

Domain 08 (Prompt Frontmatter) defines the `reads` field in prompt frontmatter, which allows a prompt to declare which predecessor output files it reads and which sections within those files it needs. Domain 11 (Decision Log) defines `decisions.jsonl`, which captures key decisions made during prompt execution.

## Decision

Cross-prompt data sharing via a shared context store (`context.json`) is deferred from scaffold v2. No `context.json` file is created, no context API is provided, and no prompt frontmatter field references a context store.

Instead, prompts that need data from predecessor prompts use two existing mechanisms:

1. **Direct file reads via the `reads` field**: The prompt frontmatter's `reads` field declares which predecessor output files the prompt consumes, with optional section targeting. During execution, the scaffold CLI provides the content of the specified files (or sections) to the LLM as context. For example, `api-design` declares `reads: ["tech-stack.md#Database"]` to receive the database section of the tech-stack output.

2. **Decision log (`decisions.jsonl`)**: Key decisions made during prompt execution are appended to `decisions.jsonl` as structured JSON objects. Subsequent prompts can reference the decision log to understand decisions made earlier in the pipeline. The decision log is append-only and does not require schema design per prompt.

These two mechanisms cover the primary use cases for cross-prompt data sharing without introducing a new data store with its own schema, versioning, and conflict resolution requirements.

## Rationale

**The `reads` field already solves the primary use case**: The most common cross-prompt data need is "prompt B needs to see what prompt A produced." The `reads` field handles this directly — prompt B declares that it reads prompt A's output file, and scaffold provides that content to the LLM. Section targeting (via `#SectionName` syntax) allows prompt B to read only the relevant parts of prompt A's output, keeping the context focused. No intermediate data store is needed.

**context.json requires a schema that does not yet exist**: To implement `context.json`, each prompt must declare what keys it writes and what keys it reads. This schema must be designed, documented, and maintained. If the schema is too rigid, adding new prompts or modifying existing ones requires schema changes. If the schema is too loose, context values become unstructured blobs that downstream prompts cannot reliably parse. The `reads` field sidesteps this problem by working with the prompt's output file — which is already a well-structured document — rather than an intermediate schema.

**The decision log covers key decision sharing**: When a prompt needs not the full output of a predecessor but just a specific decision (e.g., "which database was chosen?"), the decision log provides this in a structured, append-only format. Each decision has a prompt slug, a key, and a value. This is lighter weight than a full context store and does not require per-prompt schema design.

**Re-run interaction is complex with context**: If context.json exists and `tech-stack` is re-run (ADR-034), the context values written by `tech-stack` must be updated. But downstream prompts that already executed with the old context values are now operating on stale data — and context.json gives the impression that they are up to date (because the context values are current, even if the downstream outputs are not). The `reads` field avoids this false-consistency problem because it reads the actual output file, which is updated when the prompt is re-run.

**Deferral preserves the option to add context later**: The v2 design does not preclude adding `context.json` in a future version. The `reads` field and decision log can coexist with a context store. If user demand demonstrates that direct file reads are insufficient for cross-prompt data sharing, context.json can be added as an additional mechanism without breaking existing functionality.

## Alternatives Considered

### Implement context.json as Key-Value Store

- **Description**: Create `.scaffold/context.json` as a key-value store. Each prompt's frontmatter declares `writes-context: [keys]` and `reads-context: [keys]`. During execution, the scaffold CLI reads the specified context keys and provides them to the LLM as structured data. After execution, key decisions are extracted and written to the context store.
- **Pros**: Clean API for cross-prompt data sharing. Structured data is easier to parse than section targeting in Markdown files. Enables potential automation (e.g., auto-detecting when downstream prompts need re-running based on changed context keys).
- **Cons**: Requires a schema definition for each prompt's context contributions. Schema versioning becomes a maintenance burden. Conflict resolution for prompts that write to the same key is undefined. Extraction of key decisions from LLM output into structured context values is fragile (the LLM may not produce output in the expected format). The interaction with re-runs (ADR-034) introduces false consistency — context is updated but downstream outputs are not.

### Environment Variables for Cross-Prompt Data

- **Description**: After each prompt executes, key decisions are stored as environment variables (e.g., `SCAFFOLD_TECH_STACK_DATABASE=PostgreSQL`). Subsequent prompts read these variables as part of their context.
- **Pros**: Familiar mechanism for developers. No new file format. Simple implementation — write to a `.env` file, source it before each prompt execution.
- **Cons**: Environment variables are lost between shell sessions — if the user closes their terminal and resumes the pipeline later, the context is gone. Structured data (lists, nested objects) is awkward to represent as environment variables. The `.env` file would need to be gitignored (it contains runtime state), which means it is not available to other team members or CI pipelines. Naming conventions for nested keys become unwieldy.

### Prompt Output Parsing (Structured Extraction)

- **Description**: After each prompt executes, scaffold parses the output document and extracts structured data into a context store automatically, using heuristics or LLM-based extraction.
- **Pros**: No manual declaration of context contributions needed. All decisions are automatically captured.
- **Cons**: Fragile — heuristic parsing of Markdown documents is error-prone, and LLM-based extraction adds cost and latency. The extracted data may not match what downstream prompts actually need. False extractions (misidentified decisions) would pollute the context store. The `reads` field with section targeting is more reliable because it provides the actual source text rather than an extraction of it.

## Consequences

### Positive
- No new data store, schema, or API to design, implement, and maintain — the v2 implementation is simpler
- Cross-prompt data sharing works through well-understood mechanisms (file reads and the decision log) that are already specified and implemented
- No false consistency problem — downstream prompts read the actual output files, which reflect the last execution of each prompt
- The deferral is explicit — future implementers know this was considered and consciously deferred, not overlooked

### Negative
- Prompts that need specific structured data from predecessors must parse it from Markdown output files, which is less clean than reading a structured context store
- Section targeting via `#SectionName` in the `reads` field depends on consistent heading names in output documents — if a prompt's output changes its heading structure, downstream `reads` declarations may break
- There is no single place to see "all decisions made so far" in a structured, query-friendly format — `decisions.jsonl` captures key decisions, but the full context is spread across individual output files

### Neutral
- The `reads` field and decision log serve different granularities — `reads` provides full document/section content for the LLM, while `decisions.jsonl` provides structured key-value pairs for specific decision points
- Adding `context.json` in a future version would be additive — it would not replace the `reads` field or decision log, but supplement them for use cases where structured cross-prompt data is needed

## Constraints and Compliance

- Scaffold v2 MUST NOT create a `context.json` file or provide a context API
- Cross-prompt data sharing MUST use the `reads` field in prompt frontmatter for file/section content and `decisions.jsonl` for structured decision data
- The `reads` field MUST support section targeting via `#SectionName` syntax to allow prompts to read specific sections of predecessor outputs
- `decisions.jsonl` MUST be append-only — decisions are added during prompt execution and are never modified or deleted
- Future implementations of a context store SHOULD be additive — they SHOULD NOT replace or break the `reads` field or decision log mechanisms
- Prompt frontmatter MUST NOT include `writes-context` or `reads-context` fields — these are reserved for a potential future context store implementation

## Related Decisions

- [ADR-013](ADR-013-decision-log-jsonl-format.md) — Decision log format; covers structured decision sharing between prompts
- [ADR-015](ADR-015-prompt-frontmatter-schema.md) — Frontmatter schema includes the `reads` field for declaring predecessor file dependencies
- [ADR-034](ADR-034-rerun-no-cascade.md) — Re-runs do not cascade; context.json would have complicated re-run semantics
- Domain 08 ([08-prompt-frontmatter.md](../domain-models/08-prompt-frontmatter.md)) — Frontmatter schema including the `reads` field and section targeting syntax
- Domain 11 ([11-decision-log.md](../domain-models/11-decision-log.md)) — Decision log specification including append-only semantics and entry format
