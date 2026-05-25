import net from 'node:net'
import { fetch as undiciFetch, Agent } from 'undici'
import {
  assertSafeSourceUrlWithDns,
  defaultResolver,
  type Resolver,
} from '../source-url-validator.js'

/**
 * Link-check gate: verifies every `sources[*].url` declared in changed
 * knowledge entries resolves to a 2xx (after following 3xx). HEAD is tried
 * first; if the server returns 405/501 or any non-2xx that's still <500, we
 * fall back to a GET with `Range: bytes=0-0` so the body cap from
 * `fetchAndHash` doesn't apply here either.
 *
 * SSRF: every hop is re-validated using the same `assertSafeSourceUrlWithDns`
 * + pinning-agent pattern as `source-hash.ts::fetchAndHash`. This is the only
 * other code path that issues outbound HTTP from this package — keeping the
 * guards identical means a fix to one applies to both.
 */

export type FetchImpl = (input: string, init?: Record<string, unknown>) => Promise<Response>

const MAX_REDIRECT_HOPS = 5
const DEFAULT_TIMEOUT_MS = 15_000

export interface LinkCheckOptions {
  resolver?: Resolver
  timeoutMs?: number
  fetchImpl?: FetchImpl
  /**
   * Hosts (or exact URLs) to skip entirely. Drawn from
   * `.scaffold/observability.yaml` `knowledge_freshness.link_check.skip:` when
   * present. Matching is by exact-URL or by hostname suffix.
   */
  skip?: string[]
}

export interface LinkCheckResult {
  url: string
  ok: boolean
  status: number | null
  reason?: string
  /** True when the URL matched the operator opt-out list and was not fetched. */
  skipped?: boolean
}

function pinningAgent(pinnedIp: string): Agent {
  const family = net.isIP(pinnedIp) === 6 ? 6 : 4
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lookup = (_hostname: string, opts: any, callback: any) => {
    if (opts && opts.all === true) callback(null, [{ address: pinnedIp, family }])
    else callback(null, pinnedIp, family)
  }
  return new Agent({ connect: { lookup } })
}

function urlMatchesSkip(url: string, skip: string[]): boolean {
  if (!skip.length) return false
  let parsed: URL
  try { parsed = new URL(url) } catch { return false }
  for (const entry of skip) {
    if (!entry) continue
    if (entry === url) return true
    // Hostname or hostname-suffix match — same pattern as the allowlist loader.
    if (parsed.hostname === entry || parsed.hostname.endsWith('.' + entry)) return true
  }
  return false
}

/**
 * HEAD-check one URL (with GET-Range fallback). Returns a structured result
 * rather than throwing so the caller can aggregate per-URL outcomes for the
 * CI annotation output. SSRF / DNS-rebinding errors surface as `ok: false`
 * with `status: null` and the validator's message in `reason`.
 */
export async function checkOneUrl(
  url: string,
  opts: LinkCheckOptions = {},
): Promise<LinkCheckResult> {
  const skip = opts.skip ?? []
  if (urlMatchesSkip(url, skip)) {
    return { url, ok: true, status: null, skipped: true }
  }
  const resolver = opts.resolver ?? defaultResolver
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const doFetch: FetchImpl = opts.fetchImpl ?? (undiciFetch as unknown as FetchImpl)

  let current = url
  let lastStatus: number | null = null
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    let validated: { url: URL; ips: string[] }
    try {
      validated = await assertSafeSourceUrlWithDns(current, resolver)
    } catch (e) {
      return { url, ok: false, status: null, reason: e instanceof Error ? e.message : String(e) }
    }
    let host = validated.url.hostname
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
    const pinnedIp = validated.ips[0]
    const dispatcher = net.isIP(host) === 0 && pinnedIp ? pinningAgent(pinnedIp) : undefined

    // Try HEAD first; if the server returns a status that suggests HEAD isn't
    // supported (405 / 501) OR any non-2xx that's not a redirect, fall back
    // to a tiny GET (Range: bytes=0-0) before declaring failure.
    let headRes: Response | undefined
    try {
      try {
        headRes = await doFetch(current, {
          method: 'HEAD',
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          ...(dispatcher ? { dispatcher } : {}),
        })
      } catch (e) {
        // Some servers reset the connection on HEAD. Try GET-Range below.
        const msg = e instanceof Error ? e.message : String(e)
        if (/abort|timeout/i.test(msg)) {
          return { url, ok: false, status: null, reason: msg }
        }
        // Fall through to GET-Range fallback.
        headRes = undefined
      }

      const headStatus = headRes?.status ?? 0
      const shouldFallback = !headRes || headStatus === 405 || headStatus === 501 ||
        (headStatus >= 400 && headStatus < 500)
      let res: Response
      if (shouldFallback) {
        try { await headRes?.body?.cancel() } catch { /* noop */ }
        res = await doFetch(current, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          ...(dispatcher ? { dispatcher } : {}),
        })
      } else {
        res = headRes as Response
      }

      lastStatus = res.status
      // 2xx including 206 Partial Content from the Range request → success.
      if (res.status >= 200 && res.status < 300) {
        try { await res.body?.cancel() } catch { /* noop */ }
        return { url, ok: true, status: res.status }
      }
      // 3xx → re-validate the redirect target and try again.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        try { await res.body?.cancel() } catch { /* noop */ }
        if (!location) {
          return { url, ok: false, status: res.status, reason: `${res.status} with no Location header` }
        }
        current = new URL(location, current).toString()
        continue
      }
      // 4xx / 5xx → fail.
      try { await res.body?.cancel() } catch { /* noop */ }
      return { url, ok: false, status: res.status, reason: `HTTP ${res.status}` }
    } catch (e) {
      return { url, ok: false, status: lastStatus, reason: e instanceof Error ? e.message : String(e) }
    } finally {
      if (dispatcher) await dispatcher.close()
    }
  }
  return { url, ok: false, status: lastStatus, reason: `exceeded ${MAX_REDIRECT_HOPS} redirects` }
}

/**
 * Check every URL across a set of entries. Returns one result per (url, file)
 * pair so the CLI can attribute failures to specific files in the PR.
 */
export interface AggregateLinkCheckResult {
  ok: boolean
  results: Array<LinkCheckResult & { file: string }>
}

export async function checkUrlsForEntries(
  entries: Array<{ file: string; sourceUrls: string[] }>,
  opts: LinkCheckOptions = {},
): Promise<AggregateLinkCheckResult> {
  const out: Array<LinkCheckResult & { file: string }> = []
  let ok = true
  for (const e of entries) {
    for (const url of e.sourceUrls) {
      const r = await checkOneUrl(url, opts)
      out.push({ ...r, file: e.file })
      if (!r.ok) ok = false
    }
  }
  return { ok, results: out }
}
