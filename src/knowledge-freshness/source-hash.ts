import { createHash } from 'node:crypto'
import { assertSafeSourceUrl } from './source-url-validator.js'

const MAX_REDIRECT_HOPS = 5

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
export async function fetchAndHash(url: string): Promise<{ hash: string; body: string }> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    assertSafeSourceUrl(current)
    const res = await fetch(current, { redirect: 'manual' })

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
