import { createHash } from 'node:crypto'

/**
 * GET a URL and sha256 its body. Used by:
 *   - audit-prefilter: to detect upstream changes (compare fresh hash
 *     against the frontmatter's stored hash)
 *   - audit-apply: to compute deterministic hashes for persistence,
 *     preferring them over LLM-emitted content_hash values
 * Throws on network or HTTP-status failures so callers can decide
 * whether to skip (pre-filter) or abort (apply).
 */
export async function fetchAndHash(url: string): Promise<{ hash: string; body: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} returned HTTP ${res.status}`)
  const body = await res.text()
  const hash = `sha256:${createHash('sha256').update(body).digest('hex')}`
  return { hash, body }
}
