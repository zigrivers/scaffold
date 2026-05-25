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

// IPv4 hostname blocklist regexes operate on the un-bracketed dotted form.
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127(?:\.\d{1,3}){3}$/,            // 127.0.0.0/8 loopback
  /^0(?:\.\d{1,3}){3}$/,              // 0.0.0.0/8
  /^10(?:\.\d{1,3}){3}$/,             // 10.0.0.0/8 private
  /^192\.168(?:\.\d{1,3}){2}$/,       // 192.168.0.0/16 private
  /^169\.254(?:\.\d{1,3}){2}$/,       // 169.254.0.0/16 link-local
  /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/, // 172.16.0.0/12 private
]

/**
 * Return true if a dotted-quad IPv4 string falls in any private/reserved
 * range we want to block. Reused for raw IPv4 hosts AND for IPv4-mapped
 * IPv6 addresses like `::ffff:127.0.0.1` (round-4 F-001).
 */
function isBlockedIPv4(addr: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((pat) => pat.test(addr))
}

/**
 * Block IPv6 loopback / link-local / unique-local / IPv4-mapped private.
 * `addr` is the un-bracketed hostname.
 */
function isBlockedIPv6(addr: string): boolean {
  const lower = addr.toLowerCase()
  if (lower === '::' || lower === '::1') return true            // loopback / unspecified
  // Block the entire ::ffff:0:0/96 IPv4-mapped range. The URL parser normalizes
  // `[::ffff:127.0.0.1]` → `::ffff:7f00:1` (hex hextets), so a regex matching
  // only the dotted form would miss the normalized version. Legitimate public
  // servers don't expose endpoints exclusively via IPv4-mapped IPv6, so a
  // blanket reject is a safe and simple guard (round-4 F-001 follow-up).
  // Also block ::ffff:0:x.x.x.x (RFC 6052 IPv4-translated, ::ffff:0:0:0:0/96).
  if (/^::ffff:/.test(lower)) return true
  // Link-local: fe80::/10 → leading hextet is fe80..febf.
  if (/^fe[89ab]\w*:/.test(lower)) return true
  // Unique-local: fc00::/7 → leading hextet starts with fc or fd.
  if (/^f[cd]\w*:/.test(lower)) return true
  // Site-local (deprecated but historically valid): fec0::/10.
  if (/^fec[\dabcdef]:/.test(lower)) return true
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
  const dns = await import('node:dns')
  const addrs: string[] = []
  // resolve4 / resolve6 throw on NXDOMAIN. We try both and pool the answers;
  // a missing record family is normal (no AAAA on an IPv4-only host).
  try { addrs.push(...await dns.promises.resolve4(host)) } catch { /* no A records */ }
  try { addrs.push(...await dns.promises.resolve6(host)) } catch { /* no AAAA records */ }
  return addrs
}

/**
 * Same as `assertSafeSourceUrl`, but ALSO resolves the hostname and checks
 * every returned IP against the IPv4/IPv6 blocklists. Prevents DNS-rebinding
 * attacks where a public hostname resolves to a private IP (round-5 F-001).
 *
 * TOCTOU residual risk: a DNS record can change between this check and the
 * actual fetch. Phase 1 accepts the residual risk in exchange for the simpler
 * implementation; pinning the fetch to a validated IP is roadmap (Phase 2).
 */
export async function assertSafeSourceUrlWithDns(raw: string, resolver: Resolver = defaultResolver): Promise<URL> {
  const url = assertSafeSourceUrl(raw)
  let host = url.hostname
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  // Skip DNS for raw IP literals — already validated by the sync guard.
  if (net.isIP(host) !== 0) return url
  const ips = await resolver(host)
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
  return url
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
