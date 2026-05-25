import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import yaml from 'js-yaml'

/**
 * Reject URLs that could be used for SSRF from the operator's machine or CI.
 *
 * Knowledge entries (including project-local overrides under
 * `.scaffold/knowledge/`) are author-controlled markdown. Without a guard, a
 * malicious merged source entry could direct `fetchAndHash` (used by both
 * prefilter and audit-apply) or the audit meta-prompt's `WebFetch` at
 * localhost, link-local, private RFC1918, or `file://` URLs and exfiltrate
 * data from internal services.
 *
 * This guard runs at TWO points:
 *   1. inside `fetchAndHash` — covers prefilter and apply on the operator side
 *     (every redirect hop is re-validated; see `fetchAndHash`)
 *   2. inside `runEntryAudit` — covers the meta-prompt's WebFetch call before
 *      the URL ever reaches the `claude -p` subprocess
 *
 * Round-3 F-001; round-4 F-001 hardens the IPv6 and IPv4-mapped paths.
 */

// Named-host blocklist (regexes operate on the lowercased un-bracketed host).
// IPv4 numeric ranges are handled by isBlockedIPv4 below using octet math —
// regex matching can't fully express CGNAT / benchmark / multicast / reserved.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
]

/**
 * Parse a dotted-quad IPv4 string to its four octets. Returns null if it
 * isn't a valid IPv4 literal.
 */
function parseIPv4(addr: string): [number, number, number, number] | null {
  const parts = addr.split('.')
  if (parts.length !== 4) return null
  const out: number[] = []
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const n = Number(p)
    if (n < 0 || n > 255) return null
    out.push(n)
  }
  return [out[0], out[1], out[2], out[3]]
}

/**
 * Return true if a dotted-quad IPv4 string is NOT globally routable
 * (round-9 F-001). Covers every IANA-reserved IPv4 range, not just RFC1918.
 * The validator now allowlists "is public?" rather than blocklisting a
 * named-range set, so future spec additions (e.g. a new reserved block) don't
 * silently slip past until someone notices.
 *
 * Ranges blocked:
 *   0.0.0.0/8         this network / unspecified
 *   10.0.0.0/8        private RFC1918
 *   100.64.0.0/10     CGNAT (RFC6598)
 *   127.0.0.0/8       loopback
 *   169.254.0.0/16    link-local
 *   172.16.0.0/12     private RFC1918
 *   192.0.0.0/24      IETF protocol assignments
 *   192.0.2.0/24      TEST-NET-1
 *   192.88.99.0/24    6to4 relay anycast (deprecated)
 *   192.168.0.0/16    private RFC1918
 *   198.18.0.0/15     benchmark
 *   198.51.100.0/24   TEST-NET-2
 *   203.0.113.0/24    TEST-NET-3
 *   224.0.0.0/4       multicast
 *   240.0.0.0/4       reserved (incl. 255.255.255.255 broadcast)
 */
function isBlockedIPv4(addr: string): boolean {
  const octets = parseIPv4(addr)
  if (!octets) return false
  const [a, b] = octets
  if (a === 0) return true                                     // 0.0.0.0/8
  if (a === 10) return true                                    // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true            // 100.64.0.0/10
  if (a === 127) return true                                   // 127.0.0.0/8
  if (a === 169 && b === 254) return true                      // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true             // 172.16.0.0/12
  if (a === 192 && b === 0 && octets[2] === 0) return true     // 192.0.0.0/24
  if (a === 192 && b === 0 && octets[2] === 2) return true     // 192.0.2.0/24
  if (a === 192 && b === 88 && octets[2] === 99) return true   // 192.88.99.0/24
  if (a === 192 && b === 168) return true                      // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true         // 198.18.0.0/15
  if (a === 198 && b === 51 && octets[2] === 100) return true  // 198.51.100.0/24
  if (a === 203 && b === 0 && octets[2] === 113) return true   // 203.0.113.0/24
  if (a >= 224 && a <= 239) return true                        // 224.0.0.0/4
  if (a >= 240) return true                                    // 240.0.0.0/4 + 255.255.255.255
  return false
}

/**
 * Block IPv6 loopback / link-local / unique-local / IPv4-mapped private.
 * `addr` is the un-bracketed hostname.
 */
/**
 * Comprehensive IPv6 non-global classifier (round-9 F-001 expansion).
 *
 * Blocks:
 *   ::             unspecified
 *   ::1            loopback
 *   ::ffff:0:0/96  IPv4-mapped (covers both dotted and hex forms; legitimate
 *                  public servers don't expose endpoints via this range)
 *   100::/64       discard prefix
 *   2001::/23      IETF protocol assignments (Teredo, ORCHIDv2)
 *   2001:db8::/32  documentation
 *   2002::/16      6to4 anycast (deprecated)
 *   fc00::/7       unique local (fc.. and fd..)
 *   fe80::/10      link-local
 *   fec0::/10      site-local (deprecated)
 *   ff00::/8       multicast
 */
function isBlockedIPv6(addr: string): boolean {
  const lower = addr.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (/^::ffff:/.test(lower)) return true                          // IPv4-mapped
  if (/^100:0?:0?:0?:/.test(lower) || lower.startsWith('100::')) return true  // discard 100::/64
  // 2001::/23 — first 23 bits are 0010 0000 0000 0001 0000 000 → "2001:0" .. "2001:1"
  if (/^2001:[01]\w{0,2}:/.test(lower)) return true
  if (/^2001:0?db8:/.test(lower) || lower.startsWith('2001:db8:')) return true // documentation
  if (/^2002:/.test(lower)) return true                            // 6to4 anycast
  if (/^f[cd]\w*:/.test(lower)) return true                        // fc00::/7 ULA
  if (/^fe[89ab]\w*:/.test(lower)) return true                     // fe80::/10 link-local
  if (/^fec[0-9a-f]:/.test(lower)) return true                     // fec0::/10 site-local
  if (/^ff/.test(lower)) return true                               // ff00::/8 multicast
  return false
}

export type ValidationResult = { ok: true; url: URL } | { ok: false; reason: string }

export function validateSourceUrl(raw: string): ValidationResult {
  let url: URL
  try { url = new URL(raw) }
  catch {
    return { ok: false, reason: `not a parseable URL: "${raw}"` }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `disallowed protocol "${url.protocol}" — only http(s) is permitted` }
  }

  // The URL parser may return an IPv6 host either bracketed ("[fd00::1]") or
  // unbracketed depending on the Node/WHATWG version. Normalize before
  // classifying so the same value paths both old and new behavior.
  let host = url.hostname
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  host = host.toLowerCase()

  const ipKind = net.isIP(host) // 0 = not an IP literal, 4 = IPv4, 6 = IPv6
  if (ipKind === 4) {
    if (isBlockedIPv4(host)) {
      return { ok: false, reason: `blocked IPv4 host "${host}" (private/loopback/link-local)` }
    }
    return { ok: true, url }
  }
  if (ipKind === 6) {
    if (isBlockedIPv6(host)) {
      return { ok: false, reason: `blocked IPv6 host "${host}" (loopback/link-local/ULA/v4-mapped private)` }
    }
    return { ok: true, url }
  }

  // Non-IP hostname: match the named-pattern blocklist (e.g. "localhost").
  // The IPv4 regex set also runs here so a hostname that happens to look
  // like a dotted quad (unusual but legal) is caught.
  for (const pat of BLOCKED_HOST_PATTERNS) {
    if (pat.test(host)) {
      return { ok: false, reason: `blocked host "${host}" (matches SSRF guard pattern)` }
    }
  }
  return { ok: true, url }
}

/**
 * Resolve a hostname to its A/AAAA records. Pulled out as an injectable type
 * so tests can stub DNS without hitting the network. The real resolver uses
 * Node's `dns.promises`.
 */
export type Resolver = (host: string) => Promise<string[]>

export const defaultResolver: Resolver = async (host) => {
  // Use `dns.lookup(..., { all: true })` rather than `resolve4`/`resolve6`
  // (round-6 F-002). `lookup()` consults the SAME path that `fetch()` will
  // use — system resolver, /etc/hosts, NSS — so a hostname that routes via
  // /etc/hosts to 127.0.0.1 surfaces here, not just in true DNS.
  const dns = await import('node:dns')
  try {
    const results = await dns.promises.lookup(host, { all: true })
    return results.map((r) => r.address)
  } catch {
    return []
  }
}

/**
 * Same as `assertSafeSourceUrl`, but ALSO resolves the hostname and checks
 * every returned IP against the IPv4/IPv6 blocklists. Prevents DNS-rebinding
 * attacks where a public hostname resolves to a private IP (round-5 F-001).
 *
 * Returns BOTH the URL and the validated IPs so callers can pin the fetch
 * to one of those IPs without resolving again (round-8 F-001/F-002).
 * Performing a second DNS lookup at fetch time would re-open the TOCTOU
 * window the validator was supposed to close.
 *
 * For raw IP literals, `ips` contains the literal itself (no DNS lookup).
 */
export interface DnsValidatedUrl { url: URL; ips: string[] }

export async function assertSafeSourceUrlWithDns(
  raw: string,
  resolver: Resolver = defaultResolver,
): Promise<DnsValidatedUrl> {
  const url = assertSafeSourceUrl(raw)
  let host = url.hostname
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  // For raw IP literals the sync guard already validated; return it as the
  // only "resolved" IP so the caller pinning logic still has one address.
  if (net.isIP(host) !== 0) return { url, ips: [host] }
  const ips = await resolver(host)
  if (ips.length === 0) {
    throw new Error(
      `[knowledge-freshness] DNS-rebinding guard: "${host}" has no resolvable address. ` +
      'Refusing to fetch hosts with no A/AAAA records — silent passes would let typos or ' +
      'placeholder URLs through CI gates.',
    )
  }
  for (const ip of ips) {
    const kind = net.isIP(ip)
    if (kind === 4 && isBlockedIPv4(ip)) {
      throw new Error(
        `[knowledge-freshness] DNS-rebinding guard: "${host}" resolves to blocked IPv4 ${ip}. ` +
        'Source URLs that route to private networks are rejected even if the hostname looks public.',
      )
    }
    if (kind === 6 && isBlockedIPv6(ip)) {
      throw new Error(
        `[knowledge-freshness] DNS-rebinding guard: "${host}" resolves to blocked IPv6 ${ip}. ` +
        'Source URLs that route to private networks are rejected even if the hostname looks public.',
      )
    }
  }
  return { url, ips }
}

/**
 * Throws if the URL would route to a restricted target. Use at every external
 * fetch boundary; the helper is intentionally identical for prefilter, apply,
 * and meta-prompt dispatch so one guard covers all three callsites.
 */
export function assertSafeSourceUrl(raw: string): URL {
  const result = validateSourceUrl(raw)
  if (!result.ok) {
    throw new Error(
      `[knowledge-freshness] refusing to fetch source URL — ${result.reason}. ` +
      'Source URLs in knowledge entries are author-controlled; the SSRF guard prevents ' +
      'redirecting fetches at localhost / private / link-local / file targets.',
    )
  }
  return result.url
}

/**
 * Load the allowlist from `docs/knowledge-freshness/authoritative-sources.yaml`
 * (relative to `projectRoot`). Used by the operations / CI gate to flag
 * out-of-list sources as warnings (not hard blocks per resolved decision #4).
 * Returns an empty Set when the file is missing so the caller treats every
 * host as out-of-list and warns — the safer default than "silently allow".
 */
interface Allowlist { hosts: string[]; github_repos: string[] }

export function loadAuthoritativeAllowlist(projectRoot: string): Allowlist {
  const file = path.join(projectRoot, 'docs', 'knowledge-freshness', 'authoritative-sources.yaml')
  if (!fs.existsSync(file)) return { hosts: [], github_repos: [] }
  try {
    const parsed = yaml.load(fs.readFileSync(file, 'utf8'), { schema: yaml.JSON_SCHEMA }) as
      Partial<Allowlist> | null
    if (!parsed || typeof parsed !== 'object') return { hosts: [], github_repos: [] }
    return {
      hosts: Array.isArray(parsed.hosts)
        ? parsed.hosts.filter((s): s is string => typeof s === 'string')
        : [],
      github_repos: Array.isArray(parsed.github_repos)
        ? parsed.github_repos.filter((s): s is string => typeof s === 'string')
        : [],
    }
  } catch {
    return { hosts: [], github_repos: [] }
  }
}

/**
 * Returns true if `url`'s host (or github repo path) appears in the allowlist.
 * Decision #4 (locked): off-allowlist sources warn, not block.
 */
export function isAllowlistedSource(url: URL, allowlist: Allowlist): boolean {
  const host = url.hostname
  for (const entry of allowlist.hosts) {
    // Hosts can be a bare hostname ("owasp.org") or a host+path prefix
    // ("ietf.org/rfc"). Match the host strictly; if a path prefix is given,
    // require the URL pathname to begin with that prefix.
    const slash = entry.indexOf('/')
    if (slash === -1) {
      if (host === entry || host.endsWith('.' + entry)) return true
    } else {
      const h = entry.slice(0, slash)
      const p = '/' + entry.slice(slash + 1)
      if ((host === h || host.endsWith('.' + h)) && url.pathname.startsWith(p)) return true
    }
  }
  if (host === 'github.com' || host.endsWith('.github.com')) {
    // GitHub allowlist matches by `<owner>/<repo>` path prefix.
    for (const repo of allowlist.github_repos) {
      if (url.pathname.startsWith('/' + repo)) return true
    }
  }
  return false
}
