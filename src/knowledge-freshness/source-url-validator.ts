import fs from 'node:fs'
import path from 'node:path'
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
 *   2. inside `runEntryAudit` — covers the meta-prompt's WebFetch call before
 *      the URL ever reaches the `claude -p` subprocess
 *
 * Round-3 F-001.
 */
const BLOCKED_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127(?:\.\d{1,3}){3}$/,            // 127.0.0.0/8 loopback
  /^0(?:\.\d{1,3}){3}$/,              // 0.0.0.0/8
  /^10(?:\.\d{1,3}){3}$/,             // 10.0.0.0/8 private
  /^192\.168(?:\.\d{1,3}){2}$/,       // 192.168.0.0/16 private
  /^169\.254(?:\.\d{1,3}){2}$/,       // 169.254.0.0/16 link-local
  /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/, // 172.16.0.0/12 private
  /^::1$/,                            // IPv6 loopback
  /^\[::1\]$/,                        // IPv6 loopback bracketed
  /^fe80:/i,                          // IPv6 link-local
  /^fc00:/i, /^fd00:/i,               // IPv6 unique local
]

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
  const host = url.hostname
  for (const pat of BLOCKED_HOST_PATTERNS) {
    if (pat.test(host)) {
      return { ok: false, reason: `blocked host "${host}" (matches SSRF guard pattern)` }
    }
  }
  return { ok: true, url }
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
