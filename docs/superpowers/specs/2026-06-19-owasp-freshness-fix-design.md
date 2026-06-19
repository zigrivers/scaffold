# Knowledge-Freshness Client-Side-Redirect Defect — Fix Design

**Status:** Draft, rev. 6 (converged after five multi-model review rounds — see §12)
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

After a `200` response, before hashing, classify the body. **The signal is the
presence of a client-side *redirect mechanism*, not byte count** — so small but
legitimate pages are never rejected, and a large templated stub that still
redirects is still caught.

1. **Decide HTML vs non-HTML by content-type, sniffing when ambiguous.** Parse the
   `Content-Type` header to its **base media type** (lowercase, strip parameters
   such as `; charset=utf-8`). Treat the body as **HTML** when the base type is
   `text/html` or `application/xhtml+xml`, **or** when the content-type is
   missing/ambiguous **and** the body sniffs as HTML (leading `<!doctype html`,
   `<html`, `<head`, or `<meta` in the first bytes). Only **explicitly non-HTML**
   types (`application/json`, `text/plain`, etc.) bypass the HTML heuristics — hash
   and return unchanged (never reject a small JSON/text source). This stops a stub
   served with a missing or mislabeled content-type from sneaking past detection
   (R4-A).
2. **HTML with a meta-refresh → follow different targets; judge self-refresh by
   delay.** Parse the HTML (ReDoS-safe — see below) for `<meta http-equiv="refresh">`
   and extract its `content` delay + `url=TARGET`. Resolve `TARGET` against
   `<base href>` if present (the `<base href>` value is itself first resolved to an
   absolute URL against the final response URL, since it may be relative — R5-B),
   else against the **final response URL** directly (the current hop's URL after any
   HTTP 3xx — so a missing trailing slash like `/Top10` vs `/Top10/` resolves
   correctly); then normalize (`#fragment` stripped).
   - **Different-target refresh → follow it, *regardless of delay*.** Browsers
     navigate there; the target is authoritative (a longer-delay redirect stub must
     not be hashed — R4-D). The followed target re-uses the shared
     `MAX_REDIRECT_HOPS` budget, must pass `assertSafeSourceUrlWithDns` (SSRF/DNS),
     and must use an `http:`/`https:` scheme — `javascript:`, `data:`, `file:`, etc.
     are rejected. A different-target refresh that is **unfollowable**
     (non-`http(s)`/unsafe scheme, or no usable `url=`) fails closed (Layer 1.3).
   - **Self/cyclic refresh** (target resolves to the current URL after fragment
     normalization, so `A → A#x` counts as cyclic): a **near-zero delay** (0 or ≤1s)
     is a reload stub with no onward content → fails closed (Layer 1.3); a
     **long delay** is a legitimate auto-reload page → falls through to Layer 1.4
     and is accepted.
   `<link rel="canonical">` is **not** a redirect (pages self-canonicalize).
3. **HTML with an unfollowable redirect mechanism → fail closed.** If the page has a
   redirect mechanism that cannot be safely followed — an unfollowable different-target
   meta-refresh (non-`http(s)`/unsafe scheme or no usable `url=`), a near-zero
   self/cyclic meta-refresh, or a detectable JS-only redirect near the top of the
   document (`location.replace(`, `location.href=`, `window.location=`) with little
   other content — throw a typed `SourceUnusableError` carrying the URL.
4. **Otherwise → accept.** Any other HTML — a long-delay auto-reload page, or a
   small page with **no** redirect mechanism — is real terminal content: hash and
   return it. (Byte count is **not** a rejection criterion; a suspiciously thin body
   with no redirect mechanism may emit a non-fatal warning but is still accepted,
   since small legitimate sources exist.)

Parsing must be **ReDoS-safe**: use a robust HTML parse (prefer a parser already
vendored in the repo; otherwise a bounded, linear, non-backtracking scan) — never a
catastrophic-backtracking regex on the raw body. Handle attribute order/case
(`HTTP-EQUIV`, `Refresh`), single/double/unquoted values, and whitespace in the
`content` attribute.

Classification operates on the body already in hand (no extra network on the happy
path).

### Layer 2 — Runner: fail-closed skip (workflow-compatible) + uncertainty signal
**Files:** `src/knowledge-freshness/audit-runner.ts`, the entry CLI command, the
verdict schema, `.github/workflows/knowledge-freshness-audit.yml`,
`content/tools/knowledge-audit-entry.md`

1. **Graceful, workflow-compatible skip — for `SourceUnusableError` ONLY.** Wrap
   the prefetch loop (`audit-runner.ts:91-105`) so a `SourceUnusableError` (the
   structural client-side-redirect/stub signal from Layer 1) **skips the entry for
   this cycle** instead of throwing all the way out. **Transient and infrastructure
   failures — network timeout, HTTP 5xx, DNS resolution failure, socket hangup —
   must NOT be swallowed as skips; they propagate as real failures (non-zero exit)**
   so a genuine outage surfaces as a red run rather than silently masking every
   entry as "skipped." Only the typed `SourceUnusableError` (and not generic
   `Error`) triggers the skip path. The skip must fit the existing CLI/workflow
   contract — `audit-run-entry` writes the **verdict JSON to stdout**, and the
   workflow runs `jq` on `.verdict` under `set -e`. So:
   - On `SourceUnusableError`, the CLI emits a **structured skip envelope as valid
     JSON on stdout**: `{"skipped": true, "reason": "source-unusable", "url": "…",
     "detail": "…"}`, and exits **0**. It must never write partial/zero verdict JSON
     or free-text to stdout; all diagnostics go to **stderr**.
   - On any other (transient/infra) error, the CLI exits **non-zero**.
   - **Workflow change (required) — stop swallowing non-zero exits.** The loop today
     wraps the call as `if ! node … audit-run-entry … > "$verdict_path"; then …
     continue` (`knowledge-freshness-audit.yml:101-104`), which **silently swallows
     a non-zero exit and continues**, masking outages. Change it so a non-zero exit
     records a hard failure (`had_failure=1`) and the job `exit 1`s after the loop
     (remaining entries still process, but the run goes **red**). On a zero exit,
     branch **before** `jq -r '.verdict'`/apply: if `jq -e '.skipped == true'
     "$verdict_path"` succeeds, log the reason and `continue` (no apply, no PR);
     otherwise proceed with the verdict. Net: **only** a valid skip envelope
     (exit 0 + `.skipped==true`) continues silently; a real failure turns the run
     red. Keeps the existing happy-path jq untouched.
   - **Subshell caveat (R4-B / R5-A):** the loop today pipes `jq -c '.[]' … | while
     read …` (`knowledge-freshness-audit.yml:92`) — a pipeline runs the body in a
     *subshell*, so a `had_failure` set inside is lost and the job stays green.
     Process substitution (`done < <(jq …)`) fixes the subshell but is non-POSIX and
     hides `jq`'s own exit code from `set -e`. Instead **materialize first**:
     `jq -c '.[]' /tmp/candidates.json > /tmp/candidate-lines.json` (so a `jq`
     failure trips `set -e`), set `had_failure=0` before the loop, then
     `while read -r candidate; do …; done < /tmp/candidate-lines.json`, and `exit 1`
     after the loop when `had_failure=1`. Without this the R3-A fix is ineffective.
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
  → 3xx? follow Location (existing)                           ─┐ shared hop budget,
  → 200 non-HTML (json/text/…)          → {hash, body}        ─┤ SSRF/DNS guard +
  → 200 HTML, near-zero <meta refresh url=X> (vs <base href>)? ┤ http(s)-scheme
        X http(s) & differs from current → follow X            ┤ check, per hop
        (regardless of visible-text length)                   ─┘
  → 200 HTML, unfollowable redirect (js-only / no http(s) url=) → SourceUnusableError
  → 200 HTML, no redirect mechanism (any size)                 → {hash, body} (accept)
audit-runner: prefetch loop
  → SourceUnusableError → emit {"skipped":true,...} JSON on stdout, exit 0
        workflow sees .skipped==true → log reason, continue (no apply, no PR)
  → transient/infra error (timeout / 5xx / DNS / socket) → exit non-zero
        workflow records hard failure → run goes RED (NOT a silent continue)
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

- **source-hash — follow & accept:** the 326-byte meta-refresh stub → follows to
  the real-content fixture and returns its hash/body; *chained* stubs → followed
  within the hop budget; a **long templated stub** (site chrome/footer text well
  above any floor) with a near-zero meta-refresh → **followed, not hashed**
  (R2-A regression); a real page with a **long-delay** `<meta refresh content="300">`
  auto-reload tag → **accepted** (false-positive guard); a **small-but-legitimate
  HTML page with no redirect mechanism** → **accepted** (byte count is not a
  rejection criterion); a **different-target** meta-refresh with a *long* delay (5s)
  → **followed, not hashed** (R4-D — delay gates only self-refresh).
- **source-hash — content-type handling:** a small `application/json` / `text/plain`
  source → **accepted unchanged** (heuristics skipped on explicit non-HTML — R2-B);
  `text/html; charset=utf-8` → base media type parsed, treated as HTML (R4-A); a stub
  with a **missing or mislabeled** content-type but an HTML-looking body
  (`<meta refresh>`) → still classified HTML and followed/failed, **not hashed** (R4-A).
- **source-hash — reject (fail closed):** a JS-only redirect stub
  (`location.replace(`/`window.location=`) with little content → throws
  `SourceUnusableError`; a near-zero meta-refresh with no usable `http(s)` `url=`
  → throws.
- **source-hash — `<base href>` resolution:** a stub with `<base href>` + a
  relative meta-refresh `url=` → target resolved against the base, not the document
  URL (R2-D).
- **source-hash — parser variants:** attribute order/case (`HTTP-EQUIV`,
  `Refresh`), single vs double vs unquoted `url=`, extra whitespace, `;url=` vs
  `; url =`, delay `0`/`0.0`/`1` (near-zero) vs `5` (long) — long delay gates only a
  *self*-refresh (accept as auto-reload); a different-target 5s refresh is still
  followed (R4-D); a **near-zero self/cyclic** refresh (target == current) → `SourceUnusableError`
  (R3-B); a target differing from current only by `#fragment` → recognized as
  cyclic after normalization (R3-C). Include a malicious-input case to assert no
  catastrophic backtracking (bounded time).
- **source-hash — security:** a meta-refresh `url=` pointing at a private IP →
  rejected by the SSRF/DNS guard (not followed); `url=javascript:…`/`data:…`/`file:…`
  → rejected by the scheme check (not resolved/fetched).
- **audit-runner — fail-closed skip vs hard failure:** a `fetchImpl` raising
  `SourceUnusableError` → CLI emits a valid `{"skipped":true,...}` JSON envelope on
  stdout and exits 0 (assert stdout parses as JSON, `.skipped===true`, and
  diagnostics are on stderr not stdout). A `fetchImpl` raising a **transient/infra
  error** (timeout / HTTP 5xx / DNS failure) → CLI exits **non-zero** and does NOT
  emit a skip envelope (R2-E: outages stay visible). `source_unverifiable`
  round-trips through the schema.
- **workflow:** a check (bats, matching existing workflow tests) that the
  `.skipped==true` branch skips apply/PR and continues, **and** that a non-zero
  `audit-run-entry` exit is NOT swallowed — it records a hard failure and the job
  exits non-zero (R3-A), including that `had_failure` **persists across the loop**
  (process substitution, not a pipeline subshell — R4-B).
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

- **Heuristic stub detection** could false-reject a real page. Mitigated: rejection
  keys on a *redirect mechanism*, not byte count (so small legit pages pass); HTML
  heuristics are gated on a `text/html` content-type (so JSON/text sources pass);
  the regression suite includes a small-but-legit HTML page and a small non-HTML
  source that must both pass.
- **JS-only redirect detection is heuristic** and may miss an obscure redirect
  pattern. Mitigated: the model-side `source_unverifiable` backstop (Layer 2.2)
  catches a stub that reaches the model, and an undetected JS redirect is no worse
  than today's behavior (accept) — never a *new* failure.
- **Following meta-refresh expands the fetch's trust surface.** Mitigated: the
  SSRF/DNS guard runs on every hop (including meta-refresh targets), the scheme is
  restricted to http(s), `<base href>` is honored for resolution, and the hop budget
  is shared — no new unbounded following.
- **Masking outages as skips.** Mitigated: only the typed `SourceUnusableError`
  triggers a skip; transient/infra errors (timeout/5xx/DNS/socket) propagate as a
  non-zero exit so a real outage shows up as a red run, not silent skips.
- **`source_unverifiable` depends on the model.** That's why it is the *backstop*,
  not the primary fix; Layer 1 prevents the stub from reaching the model at all.
- **Skip envelope is a CLI contract change.** The workflow must branch on it;
  covered by a workflow test so a missed branch can't silently re-introduce the bug.
- **No nightly MMR backstop** remains by design; accepted, with future hardening
  noted. Layer 1 is the protection.

## 11. Open Questions (for the implementation plan to resolve)

1. **Optional thin-content warning threshold** — rejection now keys on a redirect
   *mechanism*, not byte count, so no hard floor is required. If a non-fatal
   "suspiciously thin, no redirect mechanism" warning is wanted (§5 Layer 1.4),
   pick a conservative threshold empirically (the stub is ~60 chars vs ~KBs for a
   real page); it must never gate acceptance.
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

### Round 2 (rev. 3)

Re-reviewed via `mmr review` (codex ✓, antigravity ✓, claude ✓ clean,
compensating-gemini ✓ clean; gemini/grok still failing on tier/credits) plus the
local Qwen2.5 reviewer (0 blocking, "SAFE TO MERGE"). Round-1 findings confirmed
resolved. New findings — all reframing Layer 1 around redirect-*mechanism* detection
rather than byte count — resolved:

- **R2-A (codex P1) — a templated stub with chrome text above the floor still
  redirects.** §5 Layer 1 reordered: a near-zero, differing-target meta-refresh is
  followed **regardless of visible-text length**; text length is no longer the
  primary signal. Added a long-templated-stub test (§7).
- **R2-B (antigravity P1) — content-type-blind heuristics reject small non-HTML
  sources.** §5 Layer 1.1 gates all HTML heuristics on a `text/html` /
  `application/xhtml+xml` content-type; JSON/text sources are accepted unchanged.
  Added a non-HTML test (§7).
- **R2-C (antigravity P1) — thin HTML with no redirect mechanism falsely rejected.**
  §5 Layer 1.4: byte count is not a rejection criterion; only an *unfollowable
  redirect mechanism* fails closed. A small page with no redirect mechanism is
  accepted. §11 Q1 demoted the floor to an optional warning.
- **R2-D (antigravity P2) — `<base href>` ignored when resolving relative target.**
  §5 Layer 1.2 resolves the meta-refresh `url=` against `<base href>` when present.
  Added a `<base href>` test (§7).
- **R2-E (antigravity P2) — catching all fetch errors as skips masks outages.**
  §5 Layer 2.1: only the typed `SourceUnusableError` skips (exit 0 + envelope);
  transient/infra errors (timeout/5xx/DNS/socket) propagate as a non-zero exit.
  Added a transient-error test (§7) and a risk note (§10).

Channel-health note for the maintainer (not a design finding): the `gemini` MMR
channel now fails with `IneligibleTierError` (Gemini Code Assist for individuals is
discontinued; the Antigravity `agy` channel is its replacement and is healthy), and
`grok` fails with a 403 spending-limit/credits error. Both were covered by
compensating claude-based passes; consider replacing the gemini channel with `agy`
and topping up grok credits, or disabling grok in `.mmr.yaml`.

### Round 3 (rev. 4)

Re-reviewed via `mmr review` (codex ✓, antigravity ✓, claude ✓ clean,
compensating-gemini ✓ clean, compensating-grok ✓ clean; gemini/grok still
tier/credit-blocked) plus the local Qwen2.5 reviewer (0 blocking, "SAFE TO MERGE").
Round-1/2 findings confirmed resolved. New (narrower) findings resolved:

- **R3-A (codex P1) — the workflow swallows non-zero exits.** Confirmed: the loop
  wraps the call as `if ! node … audit-run-entry …; then … continue`
  (`knowledge-freshness-audit.yml:101-104`), so a transient-error non-zero exit
  would be masked. §5 Layer 2.1 now requires changing the workflow so only a valid
  skip envelope (exit 0 + `.skipped==true`) continues; any non-zero exit records a
  hard failure and the job exits non-zero. §6/§7 updated.
- **R3-B (antigravity P1) — a near-zero self/cyclic refresh accepted as terminal
  ingests a reload stub.** §5 Layer 1.2 now fails closed on a near-zero self/cyclic
  refresh (only a long-delay self-refresh with real content is accepted). §7 test
  updated.
- **R3-C (antigravity P2) — fragment bypass of the cyclic check.** §5 Layer 1.2 now
  normalizes URLs (strips `#fragment`) before the same-URL comparison. §7 test added.

Local AI (non-blocking): re-confirmed the empirical thin-content threshold, parser
choice, and `<base href>` edge-case coverage — already tracked in §11 and §7.

### Round 4 (rev. 5)

Re-reviewed via `mmr review` (codex ✓, antigravity ✓, claude ✓ clean,
compensating-gemini ✓ clean, compensating-grok ✓ clean; gemini/grok still
tier/credit-blocked) plus the local Qwen2.5 reviewer (0 blocking, "SAFE TO MERGE").
Findings — all refinements of the round-2/3 additions, now resolved:

- **R4-A (codex P1 + antigravity P1) — content-type bypass.** §5 Layer 1.1 now parses
  the base media type (lowercase, strips `; charset=…`), classifies missing/ambiguous
  + HTML-looking bodies as HTML, and bypasses heuristics only for *explicit* non-HTML
  — so a stub with a missing/mislabeled content-type can't sneak past. §7 tests added.
- **R4-B (codex P1) — workflow `had_failure` lost in a pipeline subshell.** Confirmed
  `knowledge-freshness-audit.yml:92` pipes `jq … | while read`. §5 Layer 2.1 now
  requires process substitution (`done < <(jq …)`) with `had_failure` initialized
  outside and `exit 1` after the loop. §7 test added.
- **R4-C (antigravity P2) — relative-target base URL.** §5 Layer 1.2 resolves the
  meta-refresh target against the **final response URL** (current hop, post-3xx) and
  `<base href>`, fixing trailing-slash cases like `/Top10` vs `/Top10/`.
- **R4-D (antigravity P2) — longer-delay redirect ingested.** §5 Layer 1.2 now follows
  a **different-target** refresh *regardless of delay*; the near-zero-vs-long delay
  test applies only to *self*-refreshes. §7 tests updated.

Convergence note: rounds 2–4 progressively hardened the Layer-1 fetch heuristic
(each round narrower and all on the same subsystem). The remaining concerns are
implementation mechanics that the plan's TDD pins down with the real captured
fixtures; the design intent and invariants are stable.

### Round 5 (rev. 6) — converged

Re-reviewed via `mmr review` (**codex ✓ 0 findings**, claude ✓ clean,
compensating-gemini ✓ clean, compensating-grok ✓ clean; gemini/grok still
tier/credit-blocked) plus the local Qwen2.5 reviewer (0 blocking, "SAFE TO MERGE").
Codex — the strictest channel across all rounds — reached zero findings. Only
antigravity raised two mechanics items, now resolved:

- **R5-A (antigravity P1) — workflow loop portability/exit-code.** §5 Layer 2.1 now
  materializes `jq` output to a temp file and loops `done < /tmp/candidate-lines.json`
  (POSIX-safe; a `jq` failure trips `set -e`) instead of process substitution.
- **R5-B (antigravity P2) — relative `<base href>`.** §5 Layer 1.2 now resolves
  `<base href>` to an absolute URL (against the final response URL) before using it
  as the base for the target.

**Convergence reached:** codex/claude/local-AI are all clean; antigravity's two
mechanics findings are incorporated. Per the round-limit discipline (the same
Layer-1/workflow subsystem has been the focus since round 2), the design intent and
invariants are stable and remaining nuances are TDD-level.

**Round 6 (confirmation) — fully clean.** A final `mmr review` returned **zero
findings from every functioning channel** (codex, claude, antigravity, and both
compensating passes), and the local Qwen2.5 reviewer returned "SAFE TO MERGE" with
no blocking issues. The spec is converged and ready for the implementation plan.
(Channel health unchanged: gemini blocked by tier discontinuation, grok by credits;
both covered by clean compensating claude-based passes.)
