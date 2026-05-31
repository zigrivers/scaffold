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
- `{{prefetched_sources}}` — JSON array of `{url, body, hash, truncated}` objects. The Node-side audit runner has already fetched each declared source through an SSRF / DNS / redirect / timeout guard and embedded the response bodies here. **You have no web-fetch tool available — read these bodies instead.** A `truncated: true` flag means the body was capped at 96 KiB; do not infer anything is missing solely from that flag, but mention it in `preserve_warnings` if it materially limits your audit.

## Procedure

1. Read each entry in `{{prefetched_sources}}`. Each `body` is the current content of the corresponding source URL as of dispatch time. Treat these bodies as authoritative — they are what's live, regardless of what your training data says.
2. Read the retrieved content carefully. Pay particular attention to:
   - The current edition / version of any taxonomy or standard (compare against `version-pin`).
   - Any normative statements in the entry body ("must", "should", "never") that the retrieved source contradicts or supersedes.
   - New categories, sections, or recommendations in the source that the entry does not mention.
3. Determine a verdict:
   - `current` — sources confirm the entry, no findings.
   - `minor-drift` — wording or examples slightly outdated; no substantive claims wrong.
   - `major-drift` — substantive claims now inaccurate; structural revision needed.
   - `superseded` — the source has shipped a new edition/version that changes the taxonomy; `version-pin` no longer applies.
4. Populate `proposed_changes` **only** for `major-drift` or `superseded`. For `current` and `minor-drift`, `proposed_changes` **MUST** be an empty array (`[]`) — those verdicts carry no edits. Record any minor observations in `findings` or `preserve_warnings` instead. (A verdict that pairs `current`/`minor-drift` with non-empty `proposed_changes` violates the apply contract; the changes will be dropped to advisory notes.)

## CRITICAL: Grounding Rules

- Where the prefetched source body contradicts the entry, **trust the prefetched body**.
- Where the prefetched body contradicts your own prior knowledge, **trust the prefetched body**.
- When you cannot verify a claim against any prefetched body, mark it `preserve_warnings` — do NOT mark it as drift, and do NOT invent corroboration.
- Do not propose changes that introduce new normative claims unless those claims are verbatim or near-verbatim derivable from a prefetched body. Cite the source URL (from `{{prefetched_sources}}`) for every new normative claim.
- Preserve the `## Summary` and `## Deep Guidance` headings exactly — the assembly engine depends on them.
- You have NO tools available. Do not attempt to call WebFetch, Bash, Read, or any other tool. All evidence must come from `{{prefetched_sources}}` and the entry body.

## Output (JSON only — no prose)

```json
{
  "entry_name": "<from frontmatter>",
  "audit_date": "<today's ISO date>",
  "model": "<your model identifier>",
  "verdict": "current | minor-drift | major-drift | superseded",
  "sources_checked": [
    {
      "url": "<exact url from {{prefetched_sources}}>",
      "retrieved_at": "<today's ISO date>",
      "content_hash": "<exact hash from the matching {{prefetched_sources}} entry — do not recompute or invent>",
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
