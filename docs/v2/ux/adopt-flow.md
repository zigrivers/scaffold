# Scaffold v2 — Adopt Flow UX

**Phase**: 6 — UX Specification
**Depends on**: CLI contract (`scaffold adopt`), Domain model 07 (brownfield adopt), [ADR-039](../adrs/ADR-039-brownfield-adopt-artifact-mapping.md) (artifact mapping)
**Last updated**: 2026-03-15
**Status**: draft

---

## Overview

`scaffold adopt` is the brownfield entry point — used when a project already has existing documentation artifacts that should map to scaffold pipeline steps. The flow scans the project, identifies existing artifacts, maps them to pipeline steps, and lets the user confirm before creating pipeline state.

---

## Section 1: Brownfield Detection Output

When the user runs `scaffold adopt`, the CLI scans for existing artifacts before any interactive prompt.

**Terminal output:**

```
Scanning project for existing artifacts...

Found 4 existing artifacts:
  ✓ docs/prd.md                    → create-prd
  ✓ docs/architecture.md           → system-architecture
  ✓ docs/api-spec.md               → api-contracts
  ? docs/notes/decisions.md        → adrs (partial match, 62% confidence)

Detection complete. 3 confident matches, 1 partial match.
```

**Detection rules:**
- File name and path patterns (e.g., `prd.md`, `architecture.md`)
- Content analysis for section structure matching step outputs
- Confidence threshold: ≥ 80% = confident match (✓), 50-79% = partial match (?), < 50% = not shown

---

## Section 2: Mapping Display

After detection, the user sees the full mapping table with proposed step states.

```
Artifact Mapping:

  Step                    Status      Artifact
  ─────────────────────── ─────────── ──────────────────────────
  create-prd              completed   docs/prd.md
  review-prd              pending     (no artifact found)
  user-stories            pending     (no artifact found)
  system-architecture     completed   docs/architecture.md
  adrs                    review      docs/notes/decisions.md (partial)
  api-contracts           completed   docs/api-spec.md

  3 steps marked completed, 1 needs review, 2 pending
```

Steps mapped to a confident match are proposed as `completed`. Partial matches are proposed as `review` — the user should verify before the step is considered done.

---

## Section 3: Confirmation Prompt

```
? Accept this mapping? (Use arrow keys)
  > Yes, adopt as shown
    Edit mapping (opens step-by-step confirmation)
    Cancel
```

**Edit mapping flow** — each proposed match is confirmed individually:

```
  create-prd → docs/prd.md [completed]
  ? Accept? (Y/n) y

  adrs → docs/notes/decisions.md [review]
  ? Accept? (Y/n/skip) n
  ? New status for adrs: (pending/completed/skip) skip
```

---

## Section 4: Success / Partial Success Output

**Full success:**

```
✓ Adopted 4 artifacts into pipeline
✓ Config written to .scaffold/config.yml
✓ State written to .scaffold/state.json

  3 steps completed, 1 skipped, 32 pending

Next: Run `scaffold next` to see what to work on.
```

**Partial success (some steps need review):**

```
✓ Adopted 3 artifacts into pipeline
⚠ 1 step needs manual review:
    adrs — docs/notes/decisions.md (partial match)
    Run `scaffold run adrs` to complete this step

✓ Config written to .scaffold/config.yml
✓ State written to .scaffold/state.json

  3 steps completed, 1 needs review, 32 pending

Next: Review flagged steps, then run `scaffold next`.
```

**Error (no artifacts found):**

```
No existing artifacts detected.

This project appears to be greenfield. Use `scaffold init` instead.
```
