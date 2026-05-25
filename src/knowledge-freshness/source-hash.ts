import { createHash } from 'node:crypto'
import { assertSafeSourceUrl } from './source-url-validator.js'

/**
 * GET a URL and sha256 its body. Used by:
 *   - audit-prefilter: to detect upstream changes (compare fresh hash
 *     against the frontmatter's stored hash)
 *   - audit-apply: to compute deterministic hashes for persistence,
 *     preferring them over LLM-emitted content_hash values
 *
 * Validates the URL against the SSRF guard before fetching — source URLs
 * come from author-controlled frontmatter, so the guard prevents a malicious
 * entry from redirecting fetches at localhost / private networks (round-3
 * F-001). Throws on guard failure, network failure, and non-2xx responses
 * so callers can decide whether to skip (pre-filter) or abort (apply).
 */
export async function fetchAndHash(url: string): Promise<{ hash: string; body: string }> {
  assertSafeSourceUrl(url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} returned HTTP ${res.status}`)
  const body = await res.text()
  const hash = `sha256:${createHash('sha256').update(body).digest('hex')}`
  return { hash, body }
}
