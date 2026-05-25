---
name: knowledge-audit-entry
description: Audit one knowledge entry against its declared sources via grounded web retrieval
category: tool
stateless: true
---

# Knowledge Audit (Single Entry)

You are auditing a single Scaffold knowledge entry against its declared authoritative sources. Your output is consumed by an automated pipeline — emit **only** the JSON object specified at the end.

## Inputs

- `{{entry_path}}` — absolute path to the knowledge entry being audited.
- `{{entry_frontmatter}}` — parsed frontmatter object including `name`, `volatility`, `last-reviewed`, `version-pin`, `sources`.
- `{{entry_body}}` — full body of the entry.

## Procedure

1. For each source in `{{entry_frontmatter}}.sources`, call `WebFetch` on `source.url` (with `source.anchor` appended if present).
2. Read the retrieved content carefully. Pay particular attention to:
   - The current edition / version of any taxonomy or standard (compare against `version-pin`).
   - Any normative statements in the entry body ("must", "should", "never") that the retrieved source contradicts or supersedes.
   - New categories, sections, or recommendations in the source that the entry does not mention.
3. Determine a verdict:
   - `current` — sources confirm the entry, no findings.
   - `minor-drift` — wording or examples slightly outdated; no substantive claims wrong.
   - `major-drift` — substantive claims now inaccurate; structural revision needed.
   - `superseded` — the source has shipped a new edition/version that changes the taxonomy; `version-pin` no longer applies.

## CRITICAL: Grounding Rules

- Where retrieved content contradicts the entry, **trust the retrieved content**.
- Where retrieved content contradicts your own prior knowledge, **trust the retrieved content**.
- When you cannot verify a claim against any retrieved source, mark it `preserve_warnings` — do NOT mark it as drift, and do NOT invent corroboration.
- Do not propose changes that introduce new normative claims unless those claims are verbatim or near-verbatim derivable from a retrieved source. Cite the source for every new normative claim.
- Preserve the `## Summary` and `## Deep Guidance` headings exactly — the assembly engine depends on them.

## Output (JSON only — no prose)

```json
{
  "entry_name": "<from frontmatter>",
  "audit_date": "<today's ISO date>",
  "model": "<your model identifier>",
  "verdict": "current | minor-drift | major-drift | superseded",
  "sources_checked": [
    {
      "url": "<source url>",
      "retrieved_at": "<ISO date>",
      "content_hash": "<sha256:... of retrieved body>",
      "summary": "<one sentence summary of what the source currently says>"
    }
  ],
  "findings": [
    {
      "claim_in_entry": "<quoted snippet or paraphrase>",
      "evidence_url": "<url>",
      "evidence_date": "<ISO date>",
      "source_excerpt": "<verbatim excerpt from retrieved source>",
      "severity": "P0 | P1 | P2 | P3",
      "drift_kind": "edition-upgrade | wording | new-category | obsolete-recommendation | factual-error"
    }
  ],
  "proposed_changes": [
    {
      "location": "<exact existing top-level \"## \" heading line, e.g. \"## Deep Guidance\" or \"## OWASP Top 10\" — MUST be a verbatim H2 heading currently present in the entry. Phase 1 does not support targeting H3 or deeper subsections; if a change needs to land inside a subsection, replace or update the enclosing H2 section instead.>",
      "kind": "replace | insert | delete",
      "rationale": "<one sentence pointing at the finding(s) this resolves>",
      "new_text": "<the proposed replacement or insertion text, with markdown link citations to retrieved sources. For `replace`, the new section's heading line (the same \"## \" heading) must be included as the first line. Omit this field for `delete`.>"
    }
  ],
  "preserve_warnings": [
    "<any claim you could not verify but should not change>"
  ]
}
```
