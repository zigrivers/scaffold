# Knowledge-Freshness Client-Side-Redirect Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the knowledge-freshness audit from ingesting HTTP-200 client-side-redirect stubs as authoritative source content (the OWASP "2025 label on 2021 taxonomy" defect), generally and fail-closed.

**Architecture:** A pure `classifyRedirect()` helper detects client-side redirect mechanisms in a fetched body; `fetchAndHash` follows safe meta-refresh redirects (reusing the existing SSRF/DNS/hop guards) and throws a typed `SourceUnusableError` on unfollowable stubs. The entry CLI converts that error into a fail-closed `{"skipped":true}` JSON envelope; the nightly workflow branches on it and stops swallowing real failures. A `source_unverifiable` verdict field is the model-side backstop.

**Tech Stack:** TypeScript (Node 22+, undici `fetch`), Zod, Vitest, GitHub Actions bash + `jq`, bats.

**Design doc:** `docs/superpowers/specs/2026-06-19-owasp-freshness-fix-design.md` (rev. 6, converged after 5 multi-model review rounds).

## Global Constraints

- Reuse the existing per-hop guards in `fetchAndHash`: `assertSafeSourceUrlWithDns` (SSRF/DNS), the shared `MAX_REDIRECT_HOPS = 5` budget, per-hop `AbortSignal.timeout`, and `MAX_RESPONSE_BODY_BYTES`. A followed meta-refresh is just another hop — never a separate, unguarded fetch.
- Followed redirect targets must use an `http:`/`https:` scheme. `javascript:`, `data:`, `file:`, etc. are rejected.
- Parsing of HTML must be **ReDoS-safe**: bounded linear regex scans on the first 64 KiB only; no nested quantifiers on unbounded input. **No new dependency** (resolves spec §11 Q2).
- Rejection keys on a *redirect mechanism*, not byte count. Small legitimate pages and non-`text/html` sources (JSON, plain text) are never rejected.
- Only a `SourceUnusableError` causes a fail-closed skip (exit 0 + envelope). Transient/infra errors (timeout, 5xx, DNS, socket) propagate as a non-zero exit so outages stay visible.
- The two OWASP entries keep their generic `https://owasp.org/Top10/` source URL (no repoint); Layer 1 follows its meta-refresh to the current edition.
- TDD throughout: failing test first, minimal code, green, commit. All fetch tests are offline (injected `fetchImpl`/`resolver`).

---

### Task 1: `SourceUnusableError` + pure `classifyRedirect()` helper

**Files:**
- Create: `src/knowledge-freshness/redirect-classifier.ts`
- Test: `src/knowledge-freshness/redirect-classifier.test.ts`

**Interfaces:**
- Consumes: nothing (pure function over strings; uses the global `URL`).
- Produces:
  - `class SourceUnusableError extends Error` with `readonly url: string`, `readonly detail: string`, `name = 'SourceUnusableError'`.
  - `type RedirectClassification = { kind: 'accept' } | { kind: 'follow'; target: string } | { kind: 'unusable'; detail: string }`
  - `function classifyRedirect(body: string, contentType: string | null, finalUrl: string): RedirectClassification`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/knowledge-freshness/redirect-classifier.test.ts
import { describe, it, expect } from 'vitest'
import { classifyRedirect, SourceUnusableError } from './redirect-classifier.js'

const OWASP_STUB =
  '<!doctype html><html><head>' +
  '<meta http-equiv="refresh" content="0; url=./2025/en/">' +
  '<link rel="canonical" href="./2025/en/">' +
  '</head><body><p>Redirecting to OWASP Top 10:2025. ' +
  '<a href="./2025/en/">click here</a>.</p></body></html>'

describe('classifyRedirect', () => {
  it('follows a near-zero meta-refresh to a different URL', () => {
    const c = classifyRedirect(OWASP_STUB, 'text/html; charset=utf-8', 'https://owasp.org/Top10/')
    expect(c).toEqual({ kind: 'follow', target: 'https://owasp.org/Top10/2025/en/' })
  })

  it('follows a different-target meta-refresh regardless of a long delay', () => {
    const html = '<html><head><meta http-equiv="refresh" content="5; url=https://x.test/real"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/old')
    expect(c).toEqual({ kind: 'follow', target: 'https://x.test/real' })
  })

  it('rejects a near-zero self/cyclic refresh as unusable', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=/here"></head><body>x</body></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/here')
    expect(c.kind).toBe('unusable')
  })

  it('treats a target differing only by #fragment as cyclic', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=/here#a"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/here')
    expect(c.kind).toBe('unusable')
  })

  it('accepts a long-delay self-refresh (auto-reload) with content', () => {
    const html = '<html><head><meta http-equiv="refresh" content="300"></head><body>real dashboard content here</body></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/dash')
    expect(c).toEqual({ kind: 'accept' })
  })

  it('rejects a meta-refresh to a non-http(s) scheme', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=javascript:alert(1)"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/p')
    expect(c.kind).toBe('unusable')
  })

  it('resolves the target against <base href> (itself resolved to absolute)', () => {
    const html = '<html><head><base href="/v2/"><meta http-equiv="refresh" content="0; url=real"></head></html>'
    const c = classifyRedirect(html, 'text/html', 'https://x.test/section/page')
    expect(c).toEqual({ kind: 'follow', target: 'https://x.test/v2/real' })
  })

  it('accepts a real page that also carries a long auto-reload tag', () => {
    const html = '<html><head><meta http-equiv="refresh" content="600"></head><body>' + 'lots of real content '.repeat(50) + '</body></html>'
    expect(classifyRedirect(html, 'text/html', 'https://x.test/p')).toEqual({ kind: 'accept' })
  })

  it('accepts a small legitimate HTML page with no redirect mechanism', () => {
    expect(classifyRedirect('<html><body>v3.2.1</body></html>', 'text/html', 'https://x.test/v')).toEqual({ kind: 'accept' })
  })

  it('accepts non-HTML sources unchanged (explicit content-type)', () => {
    expect(classifyRedirect('{"version":"1"}', 'application/json', 'https://x.test/v.json')).toEqual({ kind: 'accept' })
    expect(classifyRedirect('1.2.3', 'text/plain', 'https://x.test/VERSION')).toEqual({ kind: 'accept' })
  })

  it('classifies a missing/mislabeled content-type by sniffing an HTML-looking body', () => {
    const c = classifyRedirect(OWASP_STUB, null, 'https://owasp.org/Top10/')
    expect(c.kind).toBe('follow')
    const c2 = classifyRedirect(OWASP_STUB, 'text/plain', 'https://owasp.org/Top10/')
    expect(c2.kind).toBe('follow')
  })

  it('rejects a JS-only redirect with little content', () => {
    const html = '<html><head><script>window.location.replace("/elsewhere")</script></head><body></body></html>'
    expect(classifyRedirect(html, 'text/html', 'https://x.test/p').kind).toBe('unusable')
  })

  it('does not catastrophically backtrack on a pathological body (bounded time)', () => {
    const evil = '<html><head>' + '<meta '.repeat(20000) + '</head>'
    const start = Date.now()
    classifyRedirect(evil, 'text/html', 'https://x.test/p')
    expect(Date.now() - start).toBeLessThan(1000)
  })

  it('SourceUnusableError carries url and detail', () => {
    const e = new SourceUnusableError('https://x.test/p', 'because')
    expect(e.url).toBe('https://x.test/p')
    expect(e.detail).toBe('because')
    expect(e.name).toBe('SourceUnusableError')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/knowledge-freshness/redirect-classifier.test.ts`
Expected: FAIL — `Cannot find module './redirect-classifier.js'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/knowledge-freshness/redirect-classifier.ts
/**
 * Detects client-side redirect stubs — HTTP-200 pages that redirect via
 * <meta http-equiv="refresh"> (+ <base href>) or a top-of-document JS
 * location assignment — so the freshness fetcher never hashes a contentless
 * stub as authoritative source content.
 * See docs/superpowers/specs/2026-06-19-owasp-freshness-fix-design.md.
 */

/** Thrown by the fetcher when a source is a client-side redirect stub that
 *  cannot be safely followed. The CLI converts this into a fail-closed skip. */
export class SourceUnusableError extends Error {
  constructor(
    public readonly url: string,
    public readonly detail: string,
  ) {
    super(`source unusable: ${url} — ${detail}`)
    this.name = 'SourceUnusableError'
  }
}

export type RedirectClassification =
  | { kind: 'accept' }
  | { kind: 'follow'; target: string }
  | { kind: 'unusable'; detail: string }

// Bounded scan window keeps every regex linear (ReDoS-safe) regardless of body size.
const SCAN_LIMIT = 65_536
const NEAR_ZERO_DELAY_MAX_SEC = 1
const JS_REDIRECT_TEXT_FLOOR = 200 // visible chars; JS redirect only flagged below this

const HTML_BASE_TYPES = new Set(['text/html', 'application/xhtml+xml'])

function baseMediaType(contentType: string | null): string {
  if (!contentType) return ''
  return contentType.split(';', 1)[0].trim().toLowerCase()
}

function looksLikeHtml(body: string): boolean {
  const head = body.slice(0, 2048).toLowerCase()
  return /<!doctype html|<html[\s>]|<head[\s>]|<meta[\s>]/.test(head)
}

function isHtml(contentType: string | null, body: string): boolean {
  const base = baseMediaType(contentType)
  if (HTML_BASE_TYPES.has(base)) return true
  if (base === '') return looksLikeHtml(body) // missing/ambiguous → sniff
  return false // explicit non-HTML (application/json, text/plain, …)
}

function attrValue(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s">]+))`, 'i'))
  if (!m) return null
  return (m[2] ?? m[3] ?? m[4] ?? '').trim() || null
}

function extractBaseHref(head: string): string | null {
  const tag = head.match(/<base\b[^>]*>/i)
  return tag ? attrValue(tag[0], 'href') : null
}

function extractMetaRefresh(head: string): { delaySec: number; url: string | null } | null {
  // The http-equiv attribute must equal "refresh" (case-insensitive).
  const tags = head.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const equiv = attrValue(tag, 'http-equiv')
    if (!equiv || equiv.toLowerCase() !== 'refresh') continue
    const content = attrValue(tag, 'content') ?? ''
    const delayM = content.match(/^\s*([\d.]+)/)
    const delaySec = delayM ? Number.parseFloat(delayM[1]) : 0
    const urlM = content.match(/;\s*url\s*=\s*(.*)$/i)
    let url: string | null = urlM ? urlM[1].trim().replace(/^["']|["']$/g, '') : null
    if (url === '') url = null
    return { delaySec, url }
  }
  return null
}

function hasJsRedirect(head: string): boolean {
  return /(?:window\.)?location\s*(?:\.href)?\s*=|location\.replace\s*\(|location\.assign\s*\(/i.test(head)
}

function visibleTextLength(head: string): number {
  return head
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim().length
}

function stripFragment(u: string): string {
  const x = new URL(u)
  x.hash = ''
  return x.toString()
}

export function classifyRedirect(
  body: string,
  contentType: string | null,
  finalUrl: string,
): RedirectClassification {
  if (!isHtml(contentType, body)) return { kind: 'accept' }
  const head = body.slice(0, SCAN_LIMIT)

  // Base for resolving relative targets: <base href> (itself made absolute
  // against finalUrl) if present, else finalUrl.
  let base = finalUrl
  const baseHref = extractBaseHref(head)
  if (baseHref) {
    try { base = new URL(baseHref, finalUrl).toString() } catch { /* malformed base → ignore */ }
  }

  const currentNorm = stripFragment(finalUrl)
  const meta = extractMetaRefresh(head)
  if (meta && meta.url) {
    let target: URL
    try { target = new URL(meta.url, base) } catch {
      return { kind: 'unusable', detail: `meta-refresh target unparseable: ${meta.url}` }
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return { kind: 'unusable', detail: `meta-refresh to unsafe scheme ${target.protocol}` }
    }
    target.hash = ''
    if (target.toString() !== currentNorm) {
      return { kind: 'follow', target: target.toString() } // different target → follow, any delay
    }
    // self/cyclic refresh
    if (meta.delaySec <= NEAR_ZERO_DELAY_MAX_SEC) {
      return { kind: 'unusable', detail: 'near-zero self/cyclic refresh (reload stub)' }
    }
    return { kind: 'accept' } // long-delay auto-reload
  }

  if (hasJsRedirect(head) && visibleTextLength(head) < JS_REDIRECT_TEXT_FLOOR) {
    return { kind: 'unusable', detail: 'javascript-only redirect with no content' }
  }
  return { kind: 'accept' }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/knowledge-freshness/redirect-classifier.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/knowledge-freshness/redirect-classifier.ts src/knowledge-freshness/redirect-classifier.test.ts
git commit -m "feat(knowledge-freshness): add client-side-redirect classifier"
```

---

### Task 2: Wire `classifyRedirect` into `fetchAndHash`

**Files:**
- Modify: `src/knowledge-freshness/source-hash.ts` (the success branch of the hop loop — currently `const body = await readBodyWithLimit(...)` → `return { hash, body }`)
- Test: `src/knowledge-freshness/source-hash.test.ts`

**Interfaces:**
- Consumes: `classifyRedirect`, `SourceUnusableError` from `./redirect-classifier.js`.
- Produces: `fetchAndHash` now (a) follows a `follow` classification as an additional hop, (b) throws `SourceUnusableError` on `unusable`, (c) returns `{hash, body}` on `accept` (unchanged signature).

- [ ] **Step 1: Write the failing tests** (append to `source-hash.test.ts`)

```typescript
import { SourceUnusableError } from './redirect-classifier.js'

describe('fetchAndHash — client-side redirects', () => {
  const html = (s: string) => new Response(s, { status: 200, headers: { 'content-type': 'text/html' } })

  it('follows a meta-refresh stub to the real page and hashes the real body', async () => {
    const fetchImpl = mockFetch(
      html('<html><head><meta http-equiv="refresh" content="0; url=https://example.org/real"></head></html>'),
      new Response('hello world', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    const { hash, body } = await fetchAndHash('https://example.org/stub', { resolver: publicResolver, fetchImpl })
    expect(body).toBe('hello world')
    expect(hash).toBe('sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })

  it('throws SourceUnusableError on a near-zero self-refresh stub', async () => {
    const fetchImpl = mockFetch(
      new Response('<html><head><meta http-equiv="refresh" content="0; url=/self"></head><body>x</body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    await expect(
      fetchAndHash('https://example.org/self', { resolver: publicResolver, fetchImpl }),
    ).rejects.toBeInstanceOf(SourceUnusableError)
  })

  it('re-validates a meta-refresh target against the SSRF guard', async () => {
    const fetchImpl = mockFetch(
      html('<html><head><meta http-equiv="refresh" content="0; url=http://169.254.169.254/meta"></head></html>'),
    )
    await expect(
      fetchAndHash('https://example.org/start', { resolver: publicResolver, fetchImpl }),
    ).rejects.toThrow() // SSRF/DNS guard rejects the private-IP target on the next hop
  })

  it('still accepts a normal HTML page (regression)', async () => {
    const fetchImpl = mockFetch(html('hello world'))
    const { body } = await fetchAndHash('https://example.org/p', { resolver: publicResolver, fetchImpl })
    expect(body).toBe('hello world')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/knowledge-freshness/source-hash.test.ts`
Expected: FAIL — the stub is currently hashed as-is (no follow / no throw).

- [ ] **Step 3: Modify the success branch of `fetchAndHash`**

In `src/knowledge-freshness/source-hash.ts`, add the import at the top:

```typescript
import { classifyRedirect, SourceUnusableError } from './redirect-classifier.js'
```

Replace the success branch (the two lines that read the body and return) with:

```typescript
      // Read body with a size cap (round-7 F-003).
      const body = await readBodyWithLimit(res, maxBodyBytes, current)
      // Classify for client-side redirects before trusting this as content.
      const classification = classifyRedirect(body, res.headers.get('content-type'), current)
      if (classification.kind === 'follow') {
        // Treat like a 3xx: follow as another guarded hop (the finally below
        // closes this hop's dispatcher; the next iteration builds a fresh one).
        current = classification.target
        continue
      }
      if (classification.kind === 'unusable') {
        throw new SourceUnusableError(current, classification.detail)
      }
      const hash = `sha256:${createHash('sha256').update(body).digest('hex')}`
      return { hash, body }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/knowledge-freshness/source-hash.test.ts`
Expected: PASS (new cases + all existing fetchAndHash tests).

- [ ] **Step 5: Commit**

```bash
git add src/knowledge-freshness/source-hash.ts src/knowledge-freshness/source-hash.test.ts
git commit -m "feat(knowledge-freshness): follow/reject client-side redirects in fetchAndHash"
```

---

### Task 3: `source_unverifiable` verdict field + apply no-op + prompt instruction

**Files:**
- Modify: `src/knowledge-freshness/audit-runner.ts` (the `verdictSchema`, lines 19-44)
- Modify: `src/knowledge-freshness/audit-apply.ts` (`applyVerdictToEntry`, top of function)
- Modify: `content/tools/knowledge-audit-entry.md` (model instruction)
- Test: `src/knowledge-freshness/audit-apply.test.ts`

**Interfaces:**
- Consumes: the existing `AuditVerdict` type and `applyVerdictToEntry(original, verdict, opts)`.
- Produces: `AuditVerdict` gains `source_unverifiable?: boolean`; `applyVerdictToEntry` returns `original` unchanged when `verdict.source_unverifiable === true`.

- [ ] **Step 1: Write the failing test** (append to `audit-apply.test.ts`)

```typescript
it('is a no-op when source_unverifiable is true, even with proposed edits', () => {
  const verdict = {
    entry_name: 'x', audit_date: '2026-06-19', model: 'm',
    verdict: 'current' as const,
    sources_checked: baseEntryChecked, // existing helper in this test file
    findings: [], proposed_changes: [], preserve_warnings: [],
    source_unverifiable: true,
  }
  expect(applyVerdictToEntry(baseEntry, verdict)).toBe(baseEntry)
})
```

(If `baseEntryChecked` does not already exist in the test file, build `sources_checked` to match `baseEntry`'s declared source exactly as the other tests in this file do.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/knowledge-freshness/audit-apply.test.ts`
Expected: FAIL — `source_unverifiable` is not in the schema type and apply mutates the entry.

- [ ] **Step 3: Add the schema field and the apply no-op**

In `src/knowledge-freshness/audit-runner.ts`, add to `verdictSchema` (after `preserve_warnings`):

```typescript
  // True when the model could not verify the entry against the prefetched
  // source bodies (e.g. a body was a redirect stub). Apply treats this as a
  // hard no-op. Backstop for any stub that slips the fetch-layer detection.
  source_unverifiable: z.boolean().optional(),
```

In `src/knowledge-freshness/audit-apply.ts`, at the very top of `applyVerdictToEntry` (before the existing verdict-type contract check):

```typescript
  // Source-unusable backstop: if the model flagged that it could not verify
  // against the prefetched source, make no changes at all.
  if (verdict.source_unverifiable === true) return original
```

- [ ] **Step 4: Add the model instruction to the meta-prompt**

In `content/tools/knowledge-audit-entry.md`, add a rule near the existing "cannot verify" guidance (the file already tells the model to use `preserve_warnings` when it can't verify a claim):

```markdown
- **Unusable source.** If any entry in `{{prefetched_sources}}` is a redirect
  stub (its body is a "redirecting…" page or a `<meta http-equiv="refresh">`
  shell rather than the real content), empty, or otherwise not the actual source
  content, you cannot verify the entry. In that case return `verdict: "current"`,
  set `"source_unverifiable": true`, and emit NO `proposed_changes` and NO
  `proposed_version_pin`. Do not advance any edition label from a redirect notice.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/knowledge-freshness/audit-apply.test.ts src/knowledge-freshness/audit-runner.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/knowledge-freshness/audit-runner.ts src/knowledge-freshness/audit-apply.ts content/tools/knowledge-audit-entry.md src/knowledge-freshness/audit-apply.test.ts
git commit -m "feat(knowledge-freshness): source_unverifiable verdict backstop + apply no-op"
```

---

### Task 4: CLI fail-closed skip envelope

**Files:**
- Modify: `src/cli/commands/knowledge-freshness-audit-run-entry.ts` (the `handler`)
- Test: `src/cli/commands/knowledge-freshness-audit-run-entry.test.ts` (create if absent; follow the nearest existing command-test pattern)

**Interfaces:**
- Consumes: `SourceUnusableError` from `../../knowledge-freshness/redirect-classifier.js`; `runEntryAudit`.
- Produces: on `SourceUnusableError`, stdout is a single JSON object `{ skipped: true, reason: 'source-unusable', url, detail }` and the process exits 0; on any other error the handler rethrows (non-zero exit, unchanged from today).

- [ ] **Step 1: Write the failing test**

```typescript
// src/cli/commands/knowledge-freshness-audit-run-entry.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SourceUnusableError } from '../../knowledge-freshness/redirect-classifier.js'

// runEntryAudit is what the handler awaits; stub it per-test.
vi.mock('../../knowledge-freshness/audit-runner.js', () => ({
  runEntryAudit: vi.fn(),
}))
vi.mock('../../knowledge-freshness/providers/index.js', () => ({
  resolveProvider: () => 'anthropic',
  buildDispatcher: () => async () => '',
}))
import { runEntryAudit } from '../../knowledge-freshness/audit-runner.js'
import cmd from './knowledge-freshness-audit-run-entry.js'

describe('audit-run-entry handler', () => {
  let out = ''
  beforeEach(() => { out = ''; vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out += s; return true }) })
  afterEach(() => { vi.restoreAllMocks() })

  it('emits a skip envelope and does not throw on SourceUnusableError', async () => {
    vi.mocked(runEntryAudit).mockRejectedValue(new SourceUnusableError('https://owasp.org/Top10/', 'stub'))
    await (cmd.handler as any)({ entryPath: 'e.md', timeout: 600 })
    const parsed = JSON.parse(out)
    expect(parsed).toMatchObject({ skipped: true, reason: 'source-unusable', url: 'https://owasp.org/Top10/' })
  })

  it('rethrows other errors (non-zero exit)', async () => {
    vi.mocked(runEntryAudit).mockRejectedValue(new Error('network timeout'))
    await expect((cmd.handler as any)({ entryPath: 'e.md', timeout: 600 })).rejects.toThrow(/timeout/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/cli/commands/knowledge-freshness-audit-run-entry.test.ts`
Expected: FAIL — the handler has no try/catch; `SourceUnusableError` rejects instead of producing an envelope.

- [ ] **Step 3: Modify the handler**

Add the import and wrap the run in try/catch:

```typescript
import { SourceUnusableError } from '../../knowledge-freshness/redirect-classifier.js'
// …
  handler: async (argv) => {
    const provider: Provider = resolveProvider({
      env: process.env,
      args: { provider: argv.provider },
      claudeOnPath: probeClaudeOnPath(),
    })
    const dispatcher = buildDispatcher(provider, { timeoutSec: argv.timeout, env: process.env })
    try {
      const verdict = await runEntryAudit(argv.entryPath, dispatcher)
      process.stdout.write(JSON.stringify(verdict, null, 2) + '\n')
    } catch (err) {
      if (err instanceof SourceUnusableError) {
        // Fail closed: emit a skip envelope on stdout (valid JSON, exit 0).
        // Diagnostics go to stderr so stdout stays jq-parseable.
        process.stderr.write(`[skip] source unusable for ${argv.entryPath}: ${err.detail}\n`)
        process.stdout.write(JSON.stringify({ skipped: true, reason: 'source-unusable', url: err.url, detail: err.detail }) + '\n')
        return
      }
      throw err // transient/infra → non-zero exit (workflow surfaces it)
    }
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/cli/commands/knowledge-freshness-audit-run-entry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/knowledge-freshness-audit-run-entry.ts src/cli/commands/knowledge-freshness-audit-run-entry.test.ts
git commit -m "feat(knowledge-freshness): emit fail-closed skip envelope on SourceUnusableError"
```

---

### Task 5: Workflow — branch on skip envelope; stop swallowing failures

**Files:**
- Modify: `.github/workflows/knowledge-freshness-audit.yml` (the audit loop, ~lines 90-160)
- Test: `tests/knowledge-freshness-audit-loop.bats` (create; follow the existing bats workflow-test conventions if present)

**Interfaces:**
- Consumes: the CLI skip envelope (`{"skipped":true}`) from Task 4 and the non-zero exit on transient errors.
- Produces: the nightly job continues only on a valid skip envelope; a non-zero `audit-run-entry` exit records a hard failure and fails the job.

- [ ] **Step 1: Write the failing bats test**

```bash
# tests/knowledge-freshness-audit-loop.bats
# Tests the audit-loop fragment with a stubbed `node`. The fragment is
# extracted to scripts/knowledge-freshness-audit-loop.sh in Step 3 so it is
# testable; the workflow `run:` block calls that script.
setup() {
  TMP="$(mktemp -d)"
  mkdir -p "$TMP/bin"
  export PATH="$TMP/bin:$PATH"
  export CANDIDATES_FILE="$TMP/candidates.json"
}
teardown() { rm -rf "$TMP"; }

@test "a skip envelope continues without failing the job" {
  printf '[{"name":"a","path":"a.md"}]\n' > "$CANDIDATES_FILE"
  cat > "$TMP/bin/node" <<'EOF'
#!/usr/bin/env bash
echo '{"skipped":true,"reason":"source-unusable","url":"u","detail":"stub"}'
EOF
  chmod +x "$TMP/bin/node"
  run bash scripts/knowledge-freshness-audit-loop.sh "$CANDIDATES_FILE"
  [ "$status" -eq 0 ]
  [[ "$output" == *"skip a"* ]]
}

@test "a non-zero audit exit fails the job (not swallowed)" {
  printf '[{"name":"a","path":"a.md"}]\n' > "$CANDIDATES_FILE"
  cat > "$TMP/bin/node" <<'EOF'
#!/usr/bin/env bash
echo "boom" >&2
exit 1
EOF
  chmod +x "$TMP/bin/node"
  run bash scripts/knowledge-freshness-audit-loop.sh "$CANDIDATES_FILE"
  [ "$status" -ne 0 ]
}
```

- [ ] **Step 2: Run the bats test to verify it fails**

Run: `npx bats tests/knowledge-freshness-audit-loop.bats`
Expected: FAIL — `scripts/knowledge-freshness-audit-loop.sh` does not exist.

- [ ] **Step 3: Extract the loop to a script and fix the subshell + branching**

Create `scripts/knowledge-freshness-audit-loop.sh` containing the audit loop currently inlined in the workflow, rewritten so (a) the loop is not a pipeline subshell, (b) a skip envelope continues, (c) a non-zero `audit-run-entry` exit records a hard failure:

```bash
#!/usr/bin/env bash
set -euo pipefail
candidates_file="${1:-/tmp/candidates.json}"

# Materialize candidates so a jq failure trips set -e (not hidden in a pipe),
# and so the while loop runs in the main shell (had_failure must persist).
jq -c '.[]' "$candidates_file" > /tmp/candidate-lines.json
had_failure=0
while read -r candidate; do
  name=$(printf '%s' "$candidate" | jq -r '.name')
  path=$(printf '%s' "$candidate" | jq -r '.path')
  [ "$path" = "null" ] || [ -z "$path" ] && { echo "skip $name: no path"; continue; }
  echo "::group::audit $name"
  verdict_path="/tmp/verdict-${name}.json"
  if ! node dist/index.js knowledge-freshness audit-run-entry "$path" > "$verdict_path"; then
    echo "::error::audit-run-entry failed for $name (transient/infra error)"
    had_failure=1
    echo "::endgroup::"
    continue
  fi
  # Fail-closed skip: a source-unusable stub yields a skip envelope, not a verdict.
  if jq -e '.skipped == true' "$verdict_path" >/dev/null 2>&1; then
    echo "skip $name: $(jq -r '.reason // "skipped"' "$verdict_path") — $(jq -r '.detail // ""' "$verdict_path")"
    echo "::endgroup::"
    continue
  fi
  verdict=$(jq -r '.verdict' "$verdict_path")
  echo "verdict: $verdict"
  # … (existing per-verdict apply/gate/PR logic, moved verbatim from the workflow) …
  echo "::endgroup::"
done < /tmp/candidate-lines.json

if [ "$had_failure" != "0" ]; then
  echo "::error::one or more entries failed with a transient/infra error"
  exit 1
fi
```

Then change the workflow `run:` block to call `bash scripts/knowledge-freshness-audit-loop.sh /tmp/candidates.json` instead of the inline loop, preserving the existing per-verdict apply/gate/PR logic inside the script.

- [ ] **Step 4: Run the bats test to verify it passes**

Run: `npx bats tests/knowledge-freshness-audit-loop.bats`
Expected: PASS (both cases).

- [ ] **Step 5: Lint the script and commit**

```bash
shellcheck scripts/knowledge-freshness-audit-loop.sh
git add scripts/knowledge-freshness-audit-loop.sh .github/workflows/knowledge-freshness-audit.yml tests/knowledge-freshness-audit-loop.bats
git commit -m "fix(knowledge-freshness): workflow branches on skip envelope, fails on real errors"
```

---

## Final verification (after all tasks)

- [ ] Run the full gate: `make check-all` (TypeScript build + vitest + bats + lint) — expect green.
- [ ] Regression confirmation: the new `source-hash` and `redirect-classifier` tests prove the OWASP stub is followed to real content (or skipped), never hashed as the 2021 stub.
- [ ] No source-URL change to the two OWASP entries is required (they keep `https://owasp.org/Top10/`); once merged, un-hold them by letting the nightly cadence resume.

## Self-Review

- **Spec coverage:** Layer 1 → Tasks 1+2; Layer 2 fail-closed skip → Tasks 4+5; Layer 2 `source_unverifiable` backstop → Task 3; the "no permanent repoint, keep /Top10/" decision → Final verification note; nightly-MMR-out-of-scope → unchanged (no task). All §5 layers and §7 test cases map to a task.
- **Placeholder scan:** none — every code step carries complete code; the one "existing per-verdict apply/gate/PR logic … moved verbatim" reference in Task 5 is an instruction to relocate existing workflow lines unchanged, not new logic to invent.
- **Type consistency:** `classifyRedirect` / `RedirectClassification` / `SourceUnusableError` are defined in Task 1 and consumed with identical signatures in Tasks 2 and 4; `source_unverifiable` is added to the schema in Task 3 and read in the same task's apply gate.
