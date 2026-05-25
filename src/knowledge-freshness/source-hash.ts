import { createHash } from 'node:crypto'
import { assertSafeSourceUrlWithDns, defaultResolver, type Resolver } from './source-url-validator.js'

const MAX_REDIRECT_HOPS = 5
const DEFAULT_FETCH_TIMEOUT_MS = 30_000

/** Test-injectable options. Production callers omit this. */
export interface FetchAndHashOptions {
  resolver?: Resolver
  /** Per-fetch timeout in ms (each hop is bounded separately). Default 30s. */
  timeoutMs?: number
}

/**
 * GET a URL and sha256 its body. Used by:
 *   - audit-prefilter: to detect upstream changes (compare fresh hash
 *     against the frontmatter's stored hash)
 *   - audit-apply: to compute deterministic hashes for persistence,
 *     preferring them over LLM-emitted content_hash values
 *
 * Validates EVERY hop (initial URL + each redirect target) against the SSRF
 * guard. A naive `fetch(url)` follows redirects automatically, so a source
 * pointing at a public URL that 302's to localhost / 169.254.169.254 would
 * bypass the guard (round-4 F-002). We do redirects manually, validate the
 * Location header, and cap at MAX_REDIRECT_HOPS.
 *
 * Throws on guard failure, network failure, non-2xx final responses, or
 * redirect-without-Location so callers can decide whether to skip
 * (pre-filter) or abort (apply).
 */
export async function fetchAndHash(
  url: string,
  opts: FetchAndHashOptions = {},
): Promise<{ hash: string; body: string }> {
  const resolver = opts.resolver ?? defaultResolver
  const timeoutMs = opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    // DNS-rebinding guard: also resolve the hostname and check every returned
    // IP, not just the literal hostname (round-5 F-001).
    await assertSafeSourceUrlWithDns(current, resolver)
    // Per-hop timeout (round-6 F-003): a hanging server would otherwise block
    // the daily cron indefinitely. AbortSignal.timeout is built-in to Node 22+.
    const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })

    // 3xx with a Location header → re-validate and follow.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) {
        throw new Error(`fetch ${current} returned ${res.status} with no Location header`)
      }
      // Resolve relative redirects against the URL we just hit.
      current = new URL(location, current).toString()
      continue
    }

    if (!res.ok) throw new Error(`fetch ${current} returned HTTP ${res.status}`)
    const body = await res.text()
    const hash = `sha256:${createHash('sha256').update(body).digest('hex')}`
    return { hash, body }
  }
  throw new Error(`fetch ${url} exceeded ${MAX_REDIRECT_HOPS} redirects`)
}
