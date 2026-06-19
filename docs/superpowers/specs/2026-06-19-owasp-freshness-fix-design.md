# Knowledge-Freshness Client-Side-Redirect Defect — Fix Design

**Status:** Draft (pending multi-model review)
**Date:** 2026-06-19
**Author:** Claude (Opus 4.8), at maintainer request
**Related:** `tasks`/memory `security-best-practices-refresh-defect`; PR #623 (prior
structural-guard fix); the v3.35.0 sweep that held + closed #655, #663, #645.

## 1. Problem

The nightly knowledge-freshness automation refreshes knowledge entries against
their declared upstream `sources[].url`. For the two entries whose source is the
OWASP Top 10 — `content/knowledge/core/security-best-practices.md` and
`content/knowledge/review/review-security.md` (both sourced from
`https://owasp.org/Top10/`) — the refresh produces an entry that is **structurally
clean but semantically wrong**: `version-pin` advances to `OWASP Top 10:2025`
while the body still carries the **2021** category taxonomy (e.g. "A03 Injection",
"A06 Vulnerable & Outdated Components", "A10 SSRF" — none of which match the real
2025 edition).

This is the eighth-plus consecutive defective refresh of this entry. PR #623 fixed
the earlier *structural* failure modes (duplicate headings, deletions,
cross-section dumps). The failure then mutated into a *semantic* one and spread to
a second entry.

## 2. Root Cause (confirmed)

`https://owasp.org/Top10/` returns **HTTP 200** with a 326-byte body that is a
**client-side redirect stub** — not an HTTP 3xx redirect:

```html
<meta http-equiv="refresh" content="0; url=./2025/en/">
<link rel="canonical" href="./2025/en/">
<p>Redirecting to OWASP Top 10:2025. If not redirected, <a href="./2025/en/">click here</a>.</p>
```

The real taxonomy lives at `https://owasp.org/Top10/2025/` (HTTP 200, ~23.8 KB,
contains "Software Supply Chain Failures", "Mishandling of Exceptional
Conditions", etc.).

The fetcher `fetchAndHash` (`src/knowledge-freshness/source-hash.ts:83-162`)
follows only **HTTP 3xx** redirects (`redirect: 'manual'`, up to
`MAX_REDIRECT_HOPS = 5`). Because `/Top10/` answers `200`, the fetcher captures
the **stub** as authoritative source content, hashes it, and the runner
(`audit-runner.ts:91-105`) injects it into the model prompt as
`{{prefetched_sources}}`. The model has no fetch tool (by design, to prevent
prompt-injection SSRF), so it cannot see the real page.

The model *correctly recognized the problem* — the real audit run (commit
`c2019e8f`, 2026-06-19) recorded in `preserve_warnings`:

> "The prefetched source body is a redirect page to the 2025 edition; the actual
> 2025 category definitions and taxonomy were not retrieved. The proposed changes
> retain the 2021 category structure as a placeholder…"

But nothing acted on that warning. **Three independent failure points let the bad
refresh through; any one of them, fixed, would have prevented it:**

1. **Fetch** ingests a client-side-redirect stub as if it were content
   (`source-hash.ts`).
2. **Runner/model** has no fail-closed path: `preserve_warnings` is free text
   (`audit-runner.ts:19-44` schema), not a gating signal, and a fetch failure
   would *crash the run* rather than skip the entry (the prefetch loop at
   `audit-runner.ts:91-105` has no try/catch, unlike `audit-prefilter.ts:44-56`).
3. **version-pin advances off the stub:** `proposed_version_pin` was reconciled to
   "2025" (the stub literally says "Redirecting to OWASP Top 10:2025") and applied
   (`audit-apply.ts:120-136`) with no corroboration that the body actually
   contained the 2025 taxonomy. The apply contract references an existing
   "MMR corroboration per spec §A.4" for `major-drift`/`superseded` edits — but it
   was **also blinded by the stub** (every model saw the same garbage input), which
   is exactly why the fetch layer is the linchpin.

**Generalization:** this is not OWASP-specific. *Any* source that serves a
client-side redirect (meta-refresh, JS, or a thin "moved" page) at HTTP 200 will
feed a contentless stub to the model. OWASP merely made the failure dangerous
because the stub coincided with a real edition rename, so the stale output is
plausible rather than obviously broken.

## 3. Goals / Non-Goals

**Goals**
- The fetcher must never treat a client-side-redirect stub (or other contentless
  response) as authoritative source content.
- When real content cannot be obtained, the pipeline must **fail closed**: skip the
  entry for that cycle with a recorded reason — never open a PR built on a stub.
- The fix must be **general** (any redirecting/thin source), not an OWASP hardcode.
- Keep the nightly path cheap (no headless browser, no extra LLM calls on the happy
  path).
- Get the two OWASP entries refreshing correctly again (they are currently held).

**Non-Goals**
- Rendering JavaScript-only redirects via a headless browser (out of scope — detect
  and fail closed instead).
- A bespoke OWASP category-list validator (too specific; the generic stub-rejection
  + existing MMR corroboration cover it).
- Re-architecting the freshness pipeline. This is a targeted, layered hardening.

## 4. Approaches Considered

**Approach A — Repoint the URL only.** Change the two entries' source to
`https://owasp.org/Top10/2025/`. *Pro:* one-line, immediate. *Con:* doesn't
generalize (the next stub source, or the 2029 edition rename, re-breaks it); leaves
the fetcher able to ingest stubs and the pipeline unable to fail closed. **Rejected
as the sole fix; adopted as an immediate stopgap layer.**

**Approach B — Fetch-layer fix only.** Make `fetchAndHash` follow client-side
redirects and reject stubs. *Pro:* fixes the root mechanism generally. *Con:* if a
stub ever slips the heuristics, there's still no fail-closed backstop or model
uncertainty signal. Good but incomplete given this entry's eight-recurrence
history.

**Approach C — Layered defense-in-depth (RECOMMENDED).** Fetch hardening (B) +
fail-closed runner + a structured model "source unusable" signal + the stopgap
repoint (A), while *reusing* (and verifying) the existing §A.4 MMR corroboration
rather than adding a new heuristic. Each layer independently prevents the bug;
together they cover fetch-time, model-time, and apply-time. *Con:* more surface
area and tests. **Justified by the recurrence count and the fact that all three
existing failure points fired at once.**

## 5. Recommended Design (Approach C)

### Layer 1 — Fetch: resolve client-side redirects, reject stubs (the linchpin)
**File:** `src/knowledge-freshness/source-hash.ts` (`fetchAndHash`)

After a `200` response, before hashing, classify the body:

1. **Follow meta-refresh redirects.** If the body contains
   `<meta http-equiv="refresh" content="...; url=TARGET">` whose resolved `TARGET`
   differs from the current URL, treat it like a redirect: resolve `TARGET`
   relative to the current URL and continue the existing hop loop (reusing the same
   `MAX_REDIRECT_HOPS` budget and re-running `assertSafeSourceUrlWithDns` per hop,
   exactly as the 3xx path does). This recovers the OWASP case automatically and
   generalizes to any meta-refresh source. (Only meta-refresh is *followed* —
   `<link rel="canonical">` is **not** treated as a redirect, since legitimate
   pages self-canonicalize.)
2. **Reject contentless/stub bodies (fail closed).** If, after redirect resolution,
   the terminal body still looks like a stub — a meta-refresh tag is still present,
   **or** the extracted visible text is below a small floor (the OWASP stub is ~60
   chars of visible text vs ~KBs for a real page) — throw a typed
   `SourceUnusableError`. This catches JS-only redirects and thin "moved" pages that
   cannot be followed without a browser.

Classification operates on the raw body already in hand (no extra network on the
happy path). The visible-text floor is a secondary net; meta-refresh presence is
the primary signal. Exact threshold to be pinned during TDD against the real
fixtures (§7), but must be comfortably below any genuine knowledge source.

### Layer 2 — Runner: fail-closed skip + structured uncertainty signal
**File:** `src/knowledge-freshness/audit-runner.ts` (+ verdict schema, +
`content/tools/knowledge-audit-entry.md`)

1. **Graceful per-entry skip.** Wrap the prefetch loop (`audit-runner.ts:91-105`)
   in try/catch so a `SourceUnusableError` (or any fetch failure) **skips the entry
   for this cycle** with a recorded, surfaced reason — mirroring the tolerant
   pattern already in `audit-prefilter.ts:44-56`. A skipped entry produces **no
   verdict and no PR** (fail closed), and the skip reason is logged in the run
   output so it is visible, not silent.
2. **Structured `source_unverifiable` verdict field (defense-in-depth).** Add a
   boolean to the verdict schema (`audit-runner.ts:19-44`). Update
   `knowledge-audit-entry.md` to instruct: if any prefetched `body` is a redirect
   stub, empty, or otherwise not the real source content, return
   `verdict: "current"`, `source_unverifiable: true`, and **no**
   `proposed_changes`/`proposed_version_pin`. `audit-apply` treats
   `source_unverifiable: true` as a hard no-op (no edits, no pin change). This is
   the backstop for any stub that slips Layer 1's heuristics.

### Layer 3 — Stopgap data fix: repoint the OWASP source URLs
**Files:** `content/knowledge/core/security-best-practices.md`,
`content/knowledge/review/review-security.md`

Change the source URL from `https://owasp.org/Top10/` to
`https://owasp.org/Top10/2025/` (terminal real-content URL, HTTP 200, no redirect).
This is immediate, zero-code-risk, more correct, and lets the pipeline self-heal
these entries on the next cycle even before/independent of the code layers. It is a
belt, not load-bearing: Layer 1 makes `/Top10/` work via meta-refresh-follow, so a
future edition rename does not silently re-break. (Known minor tradeoff: a
year-pinned URL must be revisited at the next edition; acceptable, and Layer 1 is
the safety net.)

### Verify-don't-rebuild — the existing §A.4 MMR corroboration
The apply contract (`audit-apply.ts` error text) cites "MMR corroboration per spec
§A.4" gating `major-drift`/`superseded` edits. The implementation plan must
**verify whether that corroboration runs on the nightly path** and confirm it was
defeated only by the stub (garbage-in). If it is active, Layer 1 restores its
inputs and no new corroboration heuristic is needed (avoid a fragile token-match
that would false-reject legitimate edits). If it is *not* wired into the nightly
path, wiring it in is higher-value than any new heuristic — captured as an
investigation task in the plan, not a code change assumed here.

## 6. Data Flow (after fix)

```
source-hash.fetchAndHash(url)
  → GET url (manual redirect)
  → 3xx? follow Location (existing)            ─┐ same hop budget,
  → 200 + <meta refresh>? follow target         ─┤ same SSRF/DNS guard
  → 200 terminal:
       stub/thin?  → throw SourceUnusableError  ─┘
       real        → {hash, body}
audit-runner: prefetch loop
  → fetchAndHash throws → catch → SKIP entry (reason logged), no verdict, no PR
  → success → inject real body into prompt → model
model verdict
  → source_unverifiable:true → apply = no-op
  → major-drift/superseded → existing §A.4 MMR corroboration (now sees REAL body)
audit-apply
  → existing structural guards + version-pin reconciliation (now grounded in real content)
```

## 7. Testing (TDD; all offline via injected `fetchImpl`/`resolver`)

Existing tests already inject a fake `fetchImpl` (queued `Response`s) and
`resolver` (`source-hash.test.ts`, `audit-runner.test.ts`, `audit-apply.test.ts`).
Add fixtures from the real captured bytes: the **326-byte OWASP meta-refresh stub**
and a **real-content body** containing 2025 category names.

- **source-hash:** meta-refresh stub → follows to the real-content fixture and
  returns its hash/body; *chained* stubs → followed within the hop budget;
  stub with no followable target / JS-only → throws `SourceUnusableError`; thin
  body → throws; normal page → returns unchanged (regression guard that the new
  classification doesn't reject real pages); meta-refresh target re-validated by the
  SSRF guard (a stub pointing at a private IP must be rejected, not followed).
- **audit-runner:** a throwing `fetchImpl` → entry skipped gracefully (no
  unhandled throw), skip reason present in output; `source_unverifiable` round-trips
  through the schema.
- **audit-apply:** `source_unverifiable: true` + non-empty `proposed_changes`/pin
  → no-op (file unchanged); normal verdict still applies.
- **Regression (the bug):** feed the OWASP stub fixture end-to-end (mocked fetch) →
  assert no edit and no version-pin advance occur (entry skipped or no-op).

## 8. Rollout / Sequencing

1. **Layer 3 repoint** (immediate stopgap; independently shippable).
2. **Layer 1** fetch hardening + tests.
3. **Layer 2** runner fail-closed + schema field + prompt update + tests.
4. **Verify §A.4** corroboration on the nightly path (investigation; wire in only if
   missing).
5. **Un-hold** the two OWASP entries (let the cadence resume) once 1–3 land.

## 9. Files Touched (summary)

| File | Change |
|------|--------|
| `src/knowledge-freshness/source-hash.ts` | Layer 1: meta-refresh follow + stub/thin rejection (`SourceUnusableError`) |
| `src/knowledge-freshness/audit-runner.ts` | Layer 2: try/catch graceful skip; `source_unverifiable` schema field |
| `content/tools/knowledge-audit-entry.md` | Layer 2: instruct model to set `source_unverifiable`; edition-bump-from-source rule |
| `src/knowledge-freshness/audit-apply.ts` | Layer 2: treat `source_unverifiable` as no-op |
| `content/knowledge/core/security-best-practices.md` | Layer 3: repoint source URL |
| `content/knowledge/review/review-security.md` | Layer 3: repoint source URL |
| `*.test.ts` (source-hash, audit-runner, audit-apply) | Tests per §7 |

## 10. Risks & Tradeoffs

- **Heuristic stub detection** could in principle false-reject a real but tiny page.
  Mitigated: knowledge sources are substantial doc pages; the floor sits far below
  any real source; meta-refresh presence (not size) is the primary signal; the
  regression test asserts a real page passes.
- **Following meta-refresh expands the fetch's trust surface.** Mitigated: the
  existing SSRF/DNS guard runs on every hop (including meta-refresh targets), and the
  hop budget is shared — no new unbounded following.
- **`source_unverifiable` depends on the model** to set it. That's why it is the
  *backstop*, not the primary fix; Layer 1 prevents the stub from reaching the model
  at all.
- **Year-pinned OWASP URL** (Layer 3) will need revisiting at the next edition;
  Layer 1 ensures a missed update degrades to a clean skip, not a bad refresh.

## 11. Open Questions (for the implementation plan to resolve)

1. Is the §A.4 MMR corroboration actually invoked on the nightly
   `knowledge-freshness-audit.yml` path, or only in a different flow? (Determines
   whether step 4 is verification-only or a real wiring task.)
2. Exact visible-text floor for stub detection — pin empirically against the real
   fixtures so it rejects the 326-byte stub with margin and never a real page.
3. Should a fail-closed skip emit a lightweight signal (log line / run-summary
   entry) the maintainer can notice, so repeated skips of one entry surface rather
   than silently persisting? (Recommended: yes, reuse existing run logging.)
