import { createHash } from 'node:crypto'
import net from 'node:net'
import { Agent } from 'undici'
import { assertSafeSourceUrlWithDns, defaultResolver, type Resolver } from './source-url-validator.js'

const MAX_REDIRECT_HOPS = 5
const DEFAULT_FETCH_TIMEOUT_MS = 30_000
/**
 * Cap on the response body. 5 MiB is comfortably larger than any real spec
 * page (OWASP Top 10 is ~50 KiB) and small enough that even a malicious
 * 100 MB response can't exhaust memory (round-7 F-003).
 */
const MAX_RESPONSE_BODY_BYTES = 5 * 1024 * 1024

/** Test-injectable options. Production callers omit this. */
export interface FetchAndHashOptions {
  resolver?: Resolver
  /** Per-fetch timeout in ms (each hop is bounded separately). Default 30s. */
  timeoutMs?: number
  /** Body size ceiling in bytes. Default 5 MiB. */
  maxBodyBytes?: number
}

/**
 * Build an undici Agent whose connection lookup is pinned to a specific IP.
 * Used to close the DNS-rebinding TOCTOU gap: the validator already resolved
 * the hostname and approved every IP. Pinning fetch to one of those IPs
 * prevents a second DNS lookup at fetch time from returning a private/
 * loopback target (round-7 F-002).
 *
 * The undici lookup callback follows Node's `dns.lookup` signature, so we
 * return the pinned IP directly without re-resolving.
 */
function pinningAgent(pinnedIp: string): Agent {
  return new Agent({
    connect: {
      // The Agent's `connect.lookup` is invoked once per connection. Returning
      // the pre-validated IP means the kernel-level resolve is bypassed.
      lookup: (_hostname, _opts, callback) => {
        callback(null, pinnedIp, net.isIP(pinnedIp) === 6 ? 6 : 4)
      },
    },
  })
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
  const maxBodyBytes = opts.maxBodyBytes ?? MAX_RESPONSE_BODY_BYTES
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    // DNS-rebinding guard: also resolve the hostname and check every returned
    // IP, not just the literal hostname (round-5 F-001). Round-7 F-002 pins
    // the fetch to the first validated IP. Round-8 F-001/F-002 closes the
    // residual TOCTOU by having the validator RETURN the validated IP list
    // — we don't resolve again here.
    const { url: validated, ips } = await assertSafeSourceUrlWithDns(current, resolver)
    let host = validated.hostname
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
    const pinnedIp = ips[0]
    // Pin only when the host is a hostname, not when the URL already used an
    // IP literal — that case has no rebinding window. `ips` from the
    // validator already contains the literal itself in that case.
    const dispatcher = net.isIP(host) === 0 && pinnedIp ? pinningAgent(pinnedIp) : undefined

    // Per-hop timeout (round-6 F-003): a hanging server would otherwise block
    // the daily cron indefinitely. AbortSignal.timeout is built-in to Node 22+.
    //
    // The dispatcher must stay alive until the response body is fully read
    // (round-9 F-002). Earlier rounds closed it right after fetch() returned
    // headers, but res.body is a stream — closing the agent mid-stream
    // would stall or truncate reads. Wrap the entire per-hop handling in
    // try/finally so the close only happens after body consumption (or after
    // we decide to follow a redirect, in which case the body is discarded).
    let res: Response | undefined
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        // `dispatcher` is supported by Node's built-in fetch (undici under the
        // hood) but not part of the WHATWG fetch standard, so we cast.
        ...(dispatcher ? { dispatcher } as RequestInit & { dispatcher: Agent } : {}),
      } as RequestInit)

      // 3xx with a Location header → re-validate and follow.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location')
        if (!location) {
          throw new Error(`fetch ${current} returned ${res.status} with no Location header`)
        }
        // Drain/cancel the redirect response so the underlying connection is
        // free before we close the agent. Without this, agent.close() can
        // race the still-open response body.
        try { await res.body?.cancel() } catch { /* noop */ }
        // Resolve relative redirects against the URL we just hit.
        current = new URL(location, current).toString()
        continue
      }

      if (!res.ok) throw new Error(`fetch ${current} returned HTTP ${res.status}`)

      // Read body with a size cap so a malicious or massive response can't
      // exhaust memory (round-7 F-003).
      const body = await readBodyWithLimit(res, maxBodyBytes, current)
      const hash = `sha256:${createHash('sha256').update(body).digest('hex')}`
      return { hash, body }
    } finally {
      // Close the agent only AFTER the body has been consumed (or the
      // redirect response cancelled). Each hop builds a fresh agent because
      // the hostname can change between hops, so we never reuse one.
      if (dispatcher) await dispatcher.close()
    }
  }
  throw new Error(`fetch ${url} exceeded ${MAX_REDIRECT_HOPS} redirects`)
}

async function readBodyWithLimit(res: Response, max: number, url: string): Promise<string> {
  if (!res.body) return await res.text()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > max) {
          throw new Error(`fetch ${url} response exceeded ${max} bytes (DoS guard)`)
        }
        chunks.push(value)
      }
    }
  } finally {
    reader.releaseLock?.()
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks))
}
