# ADR-015: Prompt Frontmatter Schema with Section Targeting

**Status**: superseded (by [ADR-045](ADR-045-assembled-prompt-structure.md))
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 08
**Phase**: 2 — Architecture Decision Records

---

## Context

Every prompt file in the scaffold pipeline needs machine-readable metadata to enable the CLI to resolve dependencies, detect completion, load context files, and validate produced artifacts. This metadata must be embedded in the prompt file itself (not in a separate manifest) so that prompts are self-describing — a prompt file contains everything the CLI needs to know about it without consulting external files.

Domain 08 (Prompt Frontmatter Schema & Section Targeting) defines the full frontmatter contract. A key challenge is context window efficiency: some prompts need to read predecessor artifacts that are thousands of tokens long, but only need specific sections (e.g., the "Goals" section of a planning document, not the entire document). Loading full files wastes context window budget and degrades agent performance.

Domain 08 also identifies two ADR CANDIDATES: code-fence awareness during section extraction (preventing false heading matches inside fenced code blocks), and frontmatter field extensibility (how to handle unknown fields without breaking forward compatibility).

## Decision

All prompt files use YAML frontmatter (delimited by `---` on lines 1 and N) with a defined set of fields. The `reads` field supports **section-level targeting** to reduce context window consumption. Frontmatter is validated at build time. Unknown fields produce warnings (not errors) for forward compatibility.

**Required fields** (for built-in prompts):
- `description`: Human-readable description of the prompt's purpose
- `produces`: List of artifact file paths this prompt creates

**Optional fields**:
- `depends-on`: List of prerequisite prompt slugs (union semantics with manifest dependencies — see ADR-011)
- `phase`: Numeric phase assignment
- `argument-hint`: Help text displayed when the prompt expects an argument
- `reads`: File paths or section-targeted references for context loading
- `artifact-schema`: Structural validation rules for produced artifacts
- `requires-capabilities`: Platform capability declarations

**Section targeting in `reads`**:
- Plain string entries load the full file: `reads: ["docs/plan.md"]`
- Object entries target specific sections: `reads: [{ path: "docs/plan.md", sections: ["## Goals", "## Requirements"] }]`
- Section extraction uses case-sensitive exact heading match
- Extracted sections include all content under the heading, including nested sub-headings, until the next heading of equal or higher level
- Missing sections produce warnings at runtime (not errors) — the prompt still executes with whatever sections were found

**Artifact schema DSL**:
- `required-sections`: List of exact heading strings that must exist in the produced artifact
- `id-format`: Regex pattern for identifiable items (e.g., `US-\\d{3}` for user stories)
- `index-table`: Boolean indicating whether the artifact must contain an index/summary table
- `min-count`: Minimum number of items matching `id-format` (defaults to 1)

## Rationale

**Self-describing prompts over manifest-only metadata**: If all metadata lived only in the methodology manifest, prompts would be opaque text files — the CLI couldn't validate a prompt in isolation, custom prompts couldn't declare their own dependencies, and prompt authors would have to update two files (the prompt and the manifest) for every change. Frontmatter makes each prompt a complete, self-contained unit. The manifest supplements frontmatter (union semantics) but frontmatter is the primary metadata source.

**Section targeting for context efficiency**: The implementation-plan prompt reads `docs/plan.md`, but only needs the Goals and Requirements sections — roughly 5,000 tokens out of the full document's 15,000 tokens. Without section targeting, the agent's context window carries 10,000 tokens of irrelevant content, reducing the budget available for the agent's actual work. Across a full pipeline of 20+ prompts, each reading 2-3 predecessor artifacts, the cumulative waste is substantial. Section targeting is the mechanism that makes the pipeline scalable to large context-hungry prompts.

**Build-time validation over runtime validation**: Catching frontmatter errors at build time (`scaffold build`) means the user gets all validation errors at once, before any prompts execute. Runtime validation would mean the pipeline runs several prompts successfully, then fails mid-execution when it encounters a prompt with invalid frontmatter — wasting the work already done and requiring the user to fix the error and restart.

**Warnings for unknown fields**: Forward compatibility is critical for a plugin/methodology ecosystem. A methodology author may add custom frontmatter fields that older CLI versions don't recognize. Treating unknown fields as errors would break backward compatibility on every schema extension. Warnings inform the user without blocking execution.

**Case-sensitive section extraction**: Heading text is authored by the user and may intentionally use specific casing ("## API Design" vs. "## Api Design"). Case-insensitive matching would introduce ambiguity when a document contains headings that differ only in case.

## Alternatives Considered

### No frontmatter (all metadata in manifest)

- **Description**: Prompt files are pure markdown/text with no YAML frontmatter. All metadata (dependencies, produces, reads) lives in the methodology manifest.
- **Pros**: Single source of truth for metadata. Simpler prompt files. No frontmatter parsing needed.
- **Cons**: Prompts aren't self-describing — can't validate independently. Custom prompts must always have a manifest entry. Two-file coupling (prompt + manifest) for every metadata change. Override/extension prompts in methodologies can't declare their own metadata.

### Full-file reads only (no section targeting)

- **Description**: The `reads` field accepts only file paths. No section-level extraction.
- **Pros**: Simpler implementation — no heading parser, no code-fence awareness, no missing-section handling.
- **Cons**: Wastes context window. Large predecessor artifacts (implementation plans, user stories) consume thousands of tokens that the agent doesn't need. For Codex with smaller context windows, this waste can be the difference between a successful prompt execution and a context overflow.

### JSON frontmatter

- **Description**: Use JSON instead of YAML for the frontmatter block (delimited by `---json` and `---`).
- **Pros**: Native to Node.js. No YAML parser dependency for frontmatter. Strict syntax.
- **Cons**: More verbose (mandatory braces, commas, quoted keys). No comments — prompt authors can't annotate their metadata. Inconsistent with config.yml (ADR-014) which uses YAML. Less readable for the dependency lists and artifact schemas that frontmatter contains.

## Consequences

### Positive
- Prompts are self-describing — the CLI can validate, resolve, and execute any prompt file independently
- Section targeting reduces context window consumption by up to 70% for prompts that read large predecessor artifacts
- Build-time validation catches all frontmatter errors before any prompt executes
- Forward compatibility via unknown-field warnings enables methodology authors to extend the schema without breaking older CLIs
- Artifact schema DSL enables automated validation of prompt outputs (required sections, ID formats, minimum counts)

### Negative
- Section extraction adds implementation complexity — must handle heading levels, nested sub-headings, code-fence-aware parsing, and missing sections
- The `reads` field accepting both strings and objects (overloaded type) complicates the schema and validation logic
- Build-time validation means adding a new frontmatter field to the schema is a CLI release event — can't be done by methodology authors alone (though unknown fields produce warnings, not errors)

### Neutral
- The artifact schema DSL is intentionally minimal (4 keys) — more complex validation (e.g., markdown link checking, cross-reference validation) is deferred to future versions
- Code-fence awareness during section extraction is an identified concern (domain 08 ADR CANDIDATE) — the initial implementation should track fence state to prevent false heading matches, even if the edge case is rare

## Constraints and Compliance

- Frontmatter MUST start on line 1 with exactly `---` and end with a matching `---`
- Built-in prompts MUST declare `description` and `produces` fields
- Frontmatter MUST be validated at build time (`scaffold build`), not at prompt load or execution time
- Section extraction MUST be case-sensitive (exact heading match)
- Unknown frontmatter fields MUST produce warnings, not errors
- `artifact-schema` keys SHOULD correspond to entries in the `produces` list
- `depends-on` in frontmatter is merged with manifest dependencies using union semantics (see ADR-011)
- Missing sections in `reads` targets MUST produce runtime warnings, not errors — the prompt still executes
- See domain 08, Section 3 for the complete `PromptFrontmatter` type definition
- Section extraction (`reads` targeting) does NOT parse content inside code fences. A heading inside a fenced code block (` ``` `) will not be matched as a section boundary. This is a known limitation — prompts should not target headings that are only demonstrated in code examples.
- `produces` is required for all built-in prompts (base, override, extension). It is optional for user-created extra prompts, which may be advisory or documentation prompts that produce no artifacts.
- See domain 08, Section 4 for the section extraction algorithm and code-fence awareness specification

## Related Decisions

- [ADR-011](ADR-011-depends-on-union-semantics.md) — Union semantics for merging frontmatter and manifest dependencies
- [ADR-018](ADR-018-completion-detection-crash-recovery.md) — Completion detection uses `produces` field from frontmatter
- [ADR-005](ADR-005-three-layer-prompt-resolution.md) — Prompt resolution merges frontmatter across override layers
- [ADR-014](ADR-014-config-schema-versioning.md) — Config also uses YAML, establishing YAML as the project's human-edited format
- Domain 08 ([08-prompt-frontmatter.md](../domain-models/08-prompt-frontmatter.md)) — Full frontmatter schema and section targeting specification
