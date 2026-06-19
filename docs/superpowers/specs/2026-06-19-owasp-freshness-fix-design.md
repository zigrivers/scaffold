# Knowledge-Freshness Client-Side-Redirect Defect — Fix Design

**Status:** Draft, rev. 2 (revised after multi-model review — see §12)
**Date:** 2026-06-19
**Author:** Claude (Opus 4.8), at maintainer request
**Related:** memory `security-best-practices-refresh-defect`; PR #623 (prior
structural-guard fix); the v3.35.0 sweep that held + closed #655, #663, #645;
`docs/superpowers/specs/2026-05-24-knowledge-freshness-design.md` (the freshness
pipeline design, incl. §A.4 corroboration).

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
2. **Runner/model has no fail-closed path:** `preserve_warnings` is free text
   (`audit-runner.ts:19-44` schema), not a gating signal, and a fetch failure
   would *crash the entry's run* rather than skip it (the prefetch loop at
   `audit-runner.ts:91-105` has no try/catch, unlike `audit-prefilter.ts:44-56`).
3. **version-pin advances with no corroboration on the nightly path.** The
   stub literally says "Redirecting to OWASP Top 10:2025", so `proposed_version_pin`
   reconciled to "2025" and was applied (`audit-apply.ts:120-136`) over unchanged
   2021 content. Crucially, the multi-model corroboration described in the
   freshness design (`§A.4`) **does not run on the nightly path** — confirmed by
   `.github/workflows/knowledge-freshness-audit.yml:11`: *"MMR corroboration is
   intentionally NOT wired into this Phase 2 workflow."* It runs only in the
   Phase-1 manual flow. So nightly had **no semantic backstop at all** — the cheap
   single-model verdict was applied directly. (The apply-time error text that cites
   "§A.4" is aspirational/Phase-1; it does not reflect a gate that protects the
   nightly cron.)

**This makes the fetch layer the linchpin:** it is the only point that protects the
nightly path, since neither a model-uncertainty gate nor MMR corroboration exists
there today.

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
  entry for that cycle with a recorded reason — never open a PR built on a stub —
  using a skip interface that is compatible with the existing CLI/workflow contract.
- The fix must be **general** (any redirecting/thin source), not an OWASP hardcode.
- Keep the nightly path cheap (no headless browser, no extra LLM calls on the happy
  path).
- Get the two OWASP entries refreshing correctly again (they are currently held),
  **without** sacrificing automatic detection of the *next* OWASP edition.

**Non-Goals**
- Rendering JavaScript-only redirects via a headless browser (out of scope — detect
  and fail closed instead).
- A bespoke OWASP category-list validator (too specific; the generic stub-rejection
  covers it).
- Wiring full MMR corroboration into the nightly Phase-2 path. That was an
  *intentional* deferral (cost + CLI/auth context in cron). It is a reasonable
  future hardening but is **out of scope** here; Layers 1–2 are the nightly fix.
- Re-architecting the freshness pipeline.

## 4. Approaches Considered

**Approach A — Repoint the URL only.** Change the two entries' source to
`https://owasp.org/Top10/2025/`. *Pro:* one-line, immediate. *Con:* doesn't
generalize (the next stub source re-breaks it); **permanently pinning to a
year-specific URL silently disables detection of the next edition** (2029) because
the runner never sees the moving `/Top10/` redirect again; and it leaves the
fetcher able to ingest stubs with no fail-closed path. **Rejected** — even as a
stopgap it must be temporary (see Layer 3).

**Approach B — Fetch-layer fix only.** Make `fetchAndHash` follow client-side
redirects and reject stubs. *Pro:* fixes the root mechanism generally and (since
fetch is the only nightly protection) is sufficient to stop *this* bug. *Con:* no
fail-closed backstop if the stub heuristics ever miss. Good but slightly
incomplete given this entry's eight-recurrence history.

**Approach C — Layered defense-in-depth (RECOMMENDED).** Fetch hardening (B) +
fail-closed runner skip with a workflow-compatible interface + a structured model
"source unusable" signal, plus a *temporary* repoint that is reverted once the
fetch fix lands. Each layer independently prevents the bug; together they cover
fetch-time, runner-time, and model-time. *Con:* more surface area and tests.
**Justified** by the recurrence count and the absence of any nightly semantic
backstop.

## 5. Recommended Design (Approach C)

### Layer 1 — Fetch: resolve client-side redirects, reject stubs (the linchpin)
**File:** `src/knowledge-freshness/source-hash.ts` (`fetchAndHash`)

After a `200` response, before hashing, classify the body using **visible text
length as the primary signal** (substantial content always wins — a real page is
never rejected just because it carries a refresh tag):

1. **Substantial content → accept.** Extract visible text (strip `<script>`,
   `<style>`, tags, comments, hidden content). If it exceeds a floor (empirically
   pinned in TDD; the stub is ~60 chars vs ~KBs for a real page — see §7/§11), the
   body is real content: hash and return it **even if** it also contains a
   `<meta refresh>` (legitimate auto-reload pages do this).
2. **Thin content + followable meta-refresh → follow.** If visible text is below
   the floor *and* the body has a `<meta http-equiv="refresh">` whose `content`
   specifies a **near-zero delay** (0 or ≤1s) and a `url=TARGET` that resolves to a
   URL **different** from the current one, treat it as a redirect: resolve `TARGET`
   relative to the current URL and continue the existing hop loop. Each followed
   target is re-validated exactly like a 3xx target: it shares the same
   `MAX_REDIRECT_HOPS` budget, must pass `assertSafeSourceUrlWithDns` (SSRF/DNS),
   **and must use an `http:`/`https:` scheme** — `javascript:`, `data:`, `file:`,
   etc. are rejected outright (do not resolve or fetch them). `<link rel="canonical">`
   is **not** treated as a redirect (legitimate pages self-canonicalize).
3. **Thin content, no followable target → fail closed.** Otherwise (JS-only
   redirect, contentless page, meta-refresh with a non-near-zero delay or no `url=`)
   throw a typed `SourceUnusableError` carrying the URL.

Parsing of the `<meta refresh>` tag must be **ReDoS-safe**: use a robust HTML parse
(prefer a parser already vendored in the repo; otherwise a bounded, linear,
non-backtracking scan) — never a catastrophic-backtracking regex on the raw body.
Handle attribute-order/case variation, single/double/unquoted values, and
whitespace in the `content` attribute.

Classification operates on the body already in hand (no extra network on the happy
path).

### Layer 2 — Runner: fail-closed skip (workflow-compatible) + uncertainty signal
**Files:** `src/knowledge-freshness/audit-runner.ts`, the entry CLI command, the
verdict schema, `.github/workflows/knowledge-freshness-audit.yml`,
`content/tools/knowledge-audit-entry.md`

1. **Graceful, workflow-compatible skip.** Wrap the prefetch loop
   (`audit-runner.ts:91-105`) so a `SourceUnusableError` (or any fetch failure)
   **skips the entry for this cycle** instead of throwing all the way out. The skip
   must fit the existing CLI/workflow contract — `audit-run-entry` writes the
   **verdict JSON to stdout**, and the workflow runs `jq` on `.verdict` under
   `set -e`. So:
   - The CLI emits a **structured skip envelope as valid JSON on stdout**:
     `{"skipped": true, "reason": "source-unusable", "url": "…", "detail": "…"}`,
     and exits **0**. It must never write partial/zero verdict JSON or free-text to
     stdout; all diagnostics go to **stderr**.
   - The workflow branches **before** the `jq .verdict`/apply steps: if
     `.skipped == true`, log the reason to the run output and `continue` to the next
     entry (no apply, no PR). This requires a small workflow edit and keeps the
     existing happy-path jq untouched.
2. **Structured `source_unverifiable` verdict field (defense-in-depth).** Add a
   boolean to the verdict schema (`audit-runner.ts:19-44`). Update
   `knowledge-audit-entry.md` to instruct: if any prefetched `body` is a redirect
   stub, empty, or otherwise not the real source content, return
   `verdict: "current"`, `source_unverifiable: true`, and **no**
   `proposed_changes`/`proposed_version_pin`. `audit-apply` treats
   `source_unverifiable: true` as a hard no-op (no edits, no pin change). This is
   the backstop for any stub that slips Layer 1's heuristics (e.g. a JS-only stub
   padded with enough filler text to clear the visible-text floor).

### Layer 3 — Temporary stopgap: repoint the OWASP source URLs, then revert
**Files:** `content/knowledge/core/security-best-practices.md`,
`content/knowledge/review/review-security.md`

The durable end-state keeps the **generic, moving** `https://owasp.org/Top10/` URL
and relies on Layer 1 to follow its meta-refresh to whatever the current edition is
— so the *next* edition is detected automatically. Permanently pinning to
`/Top10/2025/` would silently break that (multi-model-review finding, §12-D).

Therefore the repoint is **optional and temporary**: *if* we want the two entries
refreshing again before Layer 1 ships, repoint to `https://owasp.org/Top10/2025/`
as a stopgap, then **revert to `https://owasp.org/Top10/` in the same change-set
that lands Layer 1**. The simpler path — recommended unless there's urgency — is to
**skip the repoint entirely**: leave the entries held (their bad PRs are already
closed), land Layer 1, and un-hold them so the next nightly cycle fetches the real
content through `/Top10/`. Either way the committed end-state is `/Top10/` + Layer 1.

### Note — nightly has no MMR/semantic backstop (do not assume one)
Confirmed: MMR corroboration (§A.4) is intentionally absent from the nightly
Phase-2 cron (`knowledge-freshness-audit.yml:11`). This design therefore does **not**
rely on it. Layers 1–2 are the complete nightly fix. Wiring MMR corroboration (or a
cheaper second-model check) into nightly is a sensible future hardening but is out
of scope; if pursued later it would slot in as an apply gate for
`major-drift`/`superseded` verdicts.

## 6. Data Flow (after fix)

```
source-hash.fetchAndHash(url)
  → GET url (manual redirect)
  → 3xx? follow Location (existing)                      ─┐ shared hop budget,
  → 200 + thin body + near-zero <meta refresh url=X>?     ─┤ SSRF/DNS guard +
        X is http(s) & differs → follow X                 ─┤ http(s)-scheme check
  → 200 terminal:
        substantial visible text → {hash, body}  (accept, even w/ refresh tag)
        thin & no followable target → throw SourceUnusableError
audit-runner: prefetch loop
  → fetchAndHash throws → catch → emit {"skipped":true,...} JSON on stdout, exit 0
        workflow sees .skipped==true → log reason, continue (no apply, no PR)
  → success → inject real body into prompt → model
model verdict
  → source_unverifiable:true → audit-apply no-op (no edits, no pin change)
  → else → existing structural guards + version-pin reconciliation
           (now grounded in REAL content, not a stub)
```

## 7. Testing (TDD; all offline via injected `fetchImpl`/`resolver`)

Existing tests already inject a fake `fetchImpl` (queued `Response`s) and
`resolver` (`source-hash.test.ts`, `audit-runner.test.ts`, `audit-apply.test.ts`).
Add fixtures from the real captured bytes: the **326-byte OWASP meta-refresh stub**
and a **real-content body** containing 2025 category names.

- **source-hash — follow & accept:** meta-refresh stub → follows to the
  real-content fixture and returns its hash/body; *chained* stubs → followed within
  the hop budget; a real page that *also* contains a `<meta refresh>` auto-reload
  tag → **accepted, not rejected** (false-positive guard); a small-but-legitimate
  real source → **accepted** (visible-text floor must not reject it).
- **source-hash — reject (fail closed):** JS-only / no-`url=` / non-near-zero-delay
  stub → throws `SourceUnusableError`; contentless thin body → throws.
- **source-hash — parser variants:** attribute order/case (`HTTP-EQUIV`,
  `Refresh`), single vs double vs unquoted `url=`, extra whitespace, `;url=` vs
  `; url =`, delay `0` vs `0.0` vs `1` vs `5`; self/cyclic refresh (target == current)
  → not followed (treated as terminal); visible-text extraction ignores
  `<script>`/`<style>`/comments/hidden content. Include a malicious-input case to
  assert no catastrophic backtracking (bounded time).
- **source-hash — security:** a meta-refresh `url=` pointing at a private IP →
  rejected by the SSRF/DNS guard (not followed); `url=javascript:…`/`data:…`/`file:…`
  → rejected by the scheme check (not resolved/fetched).
- **audit-runner — fail-closed skip:** a throwing `fetchImpl` → CLI emits a valid
  `{"skipped":true,...}` JSON envelope on stdout and exits 0 (assert stdout parses
  as JSON and `.skipped===true`; assert diagnostics are on stderr, not stdout);
  `source_unverifiable` round-trips through the schema.
- **workflow:** a unit/integration check (or bats, matching existing workflow
  tests) that the `.skipped==true` branch skips apply/PR and continues.
- **audit-apply:** `source_unverifiable: true` + non-empty `proposed_changes`/pin
  → no-op (file unchanged); normal verdict still applies.
- **Regression (the bug):** feed the OWASP stub fixture end-to-end (mocked fetch) →
  assert the entry is followed to real content OR skipped, and that **no 2025-label /
  2021-content write occurs**.

## 8. Rollout / Sequencing

1. **Layer 1** fetch hardening + tests (the linchpin; ship first).
2. **Layer 2** runner fail-closed skip envelope + workflow branch + schema field +
   prompt update + tests.
3. **(Optional) Layer 3** temporary repoint — only if the entries must refresh
   before steps 1–2 merge; revert to `/Top10/` in the same change-set that lands
   Layer 1.
4. **Un-hold** the two OWASP entries (let the cadence resume) once steps 1–2 land,
   with the source URL back at the generic `/Top10/`.
5. **(Future, out of scope)** consider a nightly semantic/second-model backstop.

## 9. Files Touched (summary)

| File | Change |
|------|--------|
| `src/knowledge-freshness/source-hash.ts` | Layer 1: meta-refresh follow (scheme + SSRF guarded, ReDoS-safe parse) + thin/stub rejection (`SourceUnusableError`) |
| `src/knowledge-freshness/audit-runner.ts` | Layer 2: catch fetch failure → skip; `source_unverifiable` schema field |
| `src/cli/commands/knowledge-freshness-audit-run-entry.ts` (entry CLI) | Layer 2: emit `{"skipped":true,...}` JSON envelope on stdout, exit 0; diagnostics to stderr |
| `.github/workflows/knowledge-freshness-audit.yml` | Layer 2: branch on `.skipped==true` before jq/apply; log + continue |
| `content/tools/knowledge-audit-entry.md` | Layer 2: instruct model to set `source_unverifiable` when a prefetched body is unusable |
| `src/knowledge-freshness/audit-apply.ts` | Layer 2: treat `source_unverifiable` as no-op |
| `content/knowledge/core/security-best-practices.md`, `…/review/review-security.md` | Layer 3 (optional/temporary) repoint, reverted with Layer 1; final state `/Top10/` |
| `*.test.ts` (source-hash, audit-runner, audit-apply) + workflow test | Tests per §7 |

## 10. Risks & Tradeoffs

- **Heuristic stub detection** could false-reject a real page. Mitigated:
  substantial visible text is accepted unconditionally (primary signal); the floor
  sits far below any real source; the regression suite includes a small-but-legit
  page that must pass.
- **Following meta-refresh expands the fetch's trust surface.** Mitigated: the
  SSRF/DNS guard runs on every hop (including meta-refresh targets), the scheme is
  restricted to http(s), and the hop budget is shared — no new unbounded following.
- **`source_unverifiable` depends on the model.** That's why it is the *backstop*,
  not the primary fix; Layer 1 prevents the stub from reaching the model at all.
- **Skip envelope is a CLI contract change.** The workflow must branch on it;
  covered by a workflow test so a missed branch can't silently re-introduce the bug.
- **No nightly MMR backstop** remains by design; accepted, with future hardening
  noted. Layer 1 is the protection.

## 11. Open Questions (for the implementation plan to resolve)

1. **Exact visible-text floor** for stub detection — pin empirically against the
   real fixtures so it rejects the 326-byte stub with margin and never a real page.
2. **HTML parser choice** — does the repo already vendor an HTML/DOM parser usable
   for ReDoS-safe meta-tag extraction, or should the fetch use a small bounded
   linear scan? (Prefer reuse; avoid adding a heavy dependency for one tag.)
3. **Skip visibility** — confirmed yes: the fail-closed skip should emit a run-log
   line / run-summary entry (reusing existing logging) so repeated skips of one
   entry surface to the maintainer rather than persisting silently.

## 12. Multi-Model Review Resolutions (rev. 2)

Reviewed via `mmr review` (codex ✓, antigravity ✓; claude timed out; gemini failed —
individual tier discontinued; grok failed — out of credits; compensating
claude-based passes ran for gemini+grok with no new findings) plus the local
Qwen2.5 reviewer (0 blocking). Resolutions:

- **A (codex P1) — §A.4 MMR corroboration isn't a nightly backstop.** Confirmed via
  `knowledge-freshness-audit.yml:11`. §2.3 rewritten to state nightly has *no*
  semantic backstop; removed the "verify-don't-rebuild §A.4" reliance; Layers 1–2
  are the complete nightly fix; nightly MMR is explicit future/out-of-scope work.
- **B (codex P1) — skip must fit the CLI/workflow (stdout=verdict JSON, jq, set -e).**
  §5 Layer 2 now specifies a `{"skipped":true,…}` JSON envelope on stdout (exit 0,
  diagnostics to stderr) and a workflow branch before jq/apply; added a workflow
  test (§7) and the CLI + workflow files (§9).
- **C (codex P1 + antigravity P1) — meta-refresh heuristic too broad.** §5 Layer 1
  rewritten: visible-text length is the primary signal; substantial pages are
  accepted even with a refresh tag (no false positive on auto-reload); only thin
  bodies with a near-zero-delay differing `url=` are followed.
- **D (codex P1 + antigravity P1) — permanent repoint breaks future-edition detection.**
  §4 Approach A rejected; §5 Layer 3 changed to optional + temporary, reverted with
  Layer 1; durable end-state keeps the moving `/Top10/`.
- **E (antigravity P1, security) — unsafe-scheme redirect targets.** §5 Layer 1 now
  requires the meta-refresh target to be `http(s)` (rejects `javascript:`/`data:`/
  `file:`); §7 adds a test.
- **F (antigravity P2) — ReDoS / fragile regex parsing.** §5 Layer 1 mandates
  ReDoS-safe parsing (robust parser or bounded linear scan); §7 adds a
  no-catastrophic-backtracking test; §11 Q2 tracks the parser choice.
- **G (codex P2) — test plan missing parser/classifier variants.** §7 expanded with
  attribute/quote/whitespace/delay variants, self/cyclic refresh, visible-text
  extraction, and a small-legit-page-not-rejected case.
- **Local AI (non-blocking) — source_unverifiable wiring, empirical floor, skip
  visibility.** Folded into §5 Layer 2, §11 Q1, and §11 Q3 (skip visibility resolved
  to "yes").
