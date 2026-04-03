# Knowledge Base Entry Schema

**Phase**: 4 — Data Schemas
**Depends on**: [adrs/ADR-042-knowledge-base-domain-expertise.md](../adrs/ADR-042-knowledge-base-domain-expertise.md), [adrs/ADR-033-forward-compatibility-unknown-fields.md](../adrs/ADR-033-forward-compatibility-unknown-fields.md)
**Last updated**: 2026-03-15
**Status**: draft

---

## Section 1: Overview

Knowledge base entries are shipped expert knowledge consumed by the assembly engine at runtime. Each entry is a markdown file with YAML frontmatter located in a category subdirectory under `knowledge/`. The assembly engine loads entries referenced by a meta-prompt's `knowledge-base` frontmatter field.

| Property | Value |
|----------|-------|
| **File location** | `knowledge/<category>/<name>.md` |
| **Created by** | Content authoring (shipped with CLI package) |
| **Read by** | Assembly Engine (knowledge loader), Validator |
| **Git status** | Committed (part of npm package) |

---

## Section 2: Formal Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "scaffold-knowledge-entry-frontmatter",
  "title": "Knowledge Base Entry Frontmatter",
  "type": "object",
  "required": ["name", "description", "topics"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "Kebab-case identifier; must match filename stem"
    },
    "description": {
      "type": "string",
      "maxLength": 200,
      "description": "One-line summary of the expertise this entry provides"
    },
    "topics": {
      "type": "array",
      "items": { "type": "string" },
      "minItems": 1,
      "description": "Free-form topic labels for discoverability"
    }
  },
  "additionalProperties": true
}
```

`additionalProperties: true` per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md) — unknown fields produce a warning, not an error.

---

## Section 3: Field Reference

| Field | Type | Required | Pattern / Constraint | Used By | Error Code |
|-------|------|----------|---------------------|---------|------------|
| `name` | string | Yes | `^[a-z][a-z0-9-]*$` (kebab-case, must match filename stem) | Knowledge loader (index key) | `KB_NAME_MISSING`, `KB_NAME_INVALID` |
| `description` | string | Yes | Max 200 characters | Assembly engine (KB section headers) | `KB_DESCRIPTION_MISSING` |
| `topics` | string[] | Yes | At least 1 item | Validator, future search | `KB_TOPICS_EMPTY` |

---

## Section 4: Directory Structure

Knowledge base entries are organized by category per [ADR-042](../adrs/ADR-042-knowledge-base-domain-expertise.md):

```
knowledge/
├── core/              # Domain expertise (architecture, API design, etc.)
├── review/            # Phase-specific review criteria and failure modes
├── validation/        # Cross-cutting validation techniques
├── product/           # PRD craft, gap analysis, onboarding, playbook
└── finalization/      # Developer onboarding, implementation playbook
```

The knowledge loader recursively scans all subdirectories. Category directories are a convention for human organization — the loader treats all entries as a flat namespace keyed by `name`.

---

## Section 5: Validation Rules

| Rule | Error Code | Severity | Exit |
|------|-----------|----------|------|
| `name` field missing | `KB_NAME_MISSING` | error | 1 |
| `name` field does not match `^[a-z][a-z0-9-]*$` | `KB_NAME_INVALID` | error | 1 |
| `name` field does not match filename stem | `KB_NAME_INVALID` | error | 1 |
| `description` field missing | `KB_DESCRIPTION_MISSING` | error | 1 |
| `topics` field missing or empty array | `KB_TOPICS_EMPTY` | error | 1 |
| Unrecognized frontmatter field | `KB_UNKNOWN_FIELD` | warning | 0 |

---

## Section 6: Example

```yaml
---
name: system-architecture
description: Expert knowledge for designing modular system architectures with clear component boundaries
topics:
  - architecture
  - component design
  - modularity
  - separation of concerns
---
```

```markdown
## Domain Expertise

System architecture defines the high-level structure of a software system...

## Quality Patterns

...
```
