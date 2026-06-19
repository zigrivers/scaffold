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
- **Unusable source.** If any entry in `{{prefetched_sources}}` is a redirect
  stub (its body is a "redirecting…" page or a `<meta http-equiv="refresh">`
  shell rather than the real content), empty, or otherwise not the actual source
  content, you cannot verify the entry. In that case return `verdict: "current"`,
  set `"source_unverifiable": true`, and emit NO `proposed_changes` and NO
  `proposed_version_pin`. Do not advance any edition label from a redirect notice.
- Do not propose changes that introduce new normative claims unless those claims are verbatim or near-verbatim derivable from a prefetched body. Cite the source URL (from `{{prefetched_sources}}`) for every new normative claim.
- Preserve the `## Summary` and `## Deep Guidance` headings exactly — the assembly engine depends on them.
- You have NO tools available. Do not attempt to call WebFetch, Bash, Read, or any other tool. All evidence must come from `{{prefetched_sources}}` and the entry body.

## CRITICAL: How to construct `proposed_changes` (avoid duplication and data loss)

The apply step splices each change into the entry by its `## ` heading. It does
NOT merge intelligently — it does exactly what `kind` says. Follow these rules or
you will silently duplicate or delete content:

- **Update existing content with `replace`, never `insert`.** To change anything
  inside a section that already exists (including any of its `### ` subsections),
  use `kind: replace` on that section's `## ` heading. `insert` KEEPS the existing
  section and adds your text after it — using `insert` to "update" a section
  produces TWO copies of it.
- **`replace` is whole-section and destructive — include EVERYTHING that stays.**
  `new_text` for a `replace` becomes the entire new section. Every paragraph and
  every `### ` subsection you want to keep MUST be present in `new_text`. Anything
  you omit is DELETED. Before emitting a `replace`, re-read the original section
  and confirm `new_text` still contains all subsections that should survive
  (e.g. if a section has `### A01`…`### A10`, all ten must be in `new_text` unless
  a finding explicitly justifies removing one).
- **`insert` is ONLY for a brand-new section.** Use it solely to add a section
  whose `## ` heading does not already appear anywhere in the entry. Never use it
  to revise, expand, or re-state existing content.
- **Never create a parallel or edition-suffixed heading.** When a standard ships a
  new edition (e.g. OWASP Top 10 2021 → 2025), UPDATE the existing section in
  place — keep its exact `## ` heading text and rewrite the body via `replace`. Do
  NOT add a second heading like `## OWASP Top 10:2025` beside the existing
  `## OWASP Top 10`, and do NOT duplicate its subsections. Two identical or
  near-identical headings is always a bug; the apply step will reject a result
  that introduces a duplicate heading.
- **Reconcile `version-pin` on an edition upgrade.** If the source has moved to a
  new edition that changes the taxonomy the entry pins (`version-pin`), set the
  top-level `proposed_version_pin` field to the new value (e.g.
  `"OWASP Top 10:2025"`). Leave it `null` when `version-pin` is unaffected. A
  `superseded`/`edition-upgrade` change whose body now describes the new edition
  but leaves `version-pin` on the old one is internally inconsistent.

## Output (JSON only — no prose)

Emit `audit_date` and every source `retrieved_at` as the exact literal string
`PENDING` — do not guess a date. The harness measures the real run/fetch date
and overwrites both fields after you respond.

```json
{
  "entry_name": "<from frontmatter>",
  "audit_date": "PENDING",
  "model": "<your model identifier>",
  "verdict": "current | minor-drift | major-drift | superseded",
  "sources_checked": [
    {
      "url": "<exact url from {{prefetched_sources}}>",
      "retrieved_at": "PENDING",
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
  "proposed_version_pin": "<new version-pin value when the source shipped a new edition that changes the pinned taxonomy (e.g. \"OWASP Top 10:2025\"); otherwise null>",
  "proposed_changes": [
    {
      "location": "<exact existing top-level \"## \" heading line, e.g. \"## Deep Guidance\" or \"## OWASP Top 10\" — MUST be a verbatim H2 heading currently present in the entry. Phase 1 does not support targeting H3 or deeper subsections; to change content inside a subsection, `replace` the enclosing H2 section with new_text that contains ALL of its subsections (changed and unchanged).>",
      "kind": "replace | insert | delete",
      "rationale": "<one sentence pointing at the finding(s) this resolves>",
      "new_text": "<the proposed replacement or insertion text, with markdown link citations to retrieved sources. For `replace`, the FULL new section — its \"## \" heading line first, then every paragraph/subsection that should remain (omitted content is deleted). For `insert` (brand-new sections only), the new section to add after the target. Omit this field for `delete`.>"
    }
  ],
  "preserve_warnings": [
    "<any claim you could not verify but should not change>"
  ],
  "source_unverifiable": false
}
```

> **`source_unverifiable`** — set to `true` only when every prefetched source body is an unusable redirect stub, empty, or otherwise not the real content (e.g. a `<meta http-equiv="refresh">` shell rather than the actual documentation). When `true`, the verdict must be `"current"` and `proposed_changes` must be empty — the entry cannot be audited. Default is `false`.
