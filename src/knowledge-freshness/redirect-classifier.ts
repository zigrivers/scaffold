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
// Visible-text measurement is bounded to avoid O(n²) ReDoS on the lazy [\s\S]*? patterns.
const VISIBLE_TEXT_SCAN_LIMIT = 16_384
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

/**
 * Returns true if the body should be treated as HTML.
 * Always sniffs the body: if it looks like HTML it is treated as HTML
 * regardless of the declared content-type (catches mislabeled stubs).
 * Falls back to the declared HTML types when body sniffing is negative.
 */
function isHtml(contentType: string | null, body: string): boolean {
  const base = baseMediaType(contentType)
  return HTML_BASE_TYPES.has(base) || looksLikeHtml(body)
}

/** Regex-escape a string so it is safe to embed in a RegExp. */
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function attrValue(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`\\b${reEscape(attr)}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s">]+))`, 'i'))
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
  // Strip HTML comments first so commented-out JS doesn't trigger a false positive.
  const stripped = head.replace(/<!--[\s\S]*?-->/g, '')
  return /(?:window\.)?location\s*(?:\.href)?\s*=|location\.replace\s*\(|location\.assign\s*\(/i.test(stripped)
}

function visibleTextLength(head: string): number {
  // Bound input to avoid O(n²)/ReDoS from lazy [\s\S]*? patterns on large heads.
  const bounded = head.slice(0, VISIBLE_TEXT_SCAN_LIMIT)
  return bounded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim().length
}

/**
 * Strip the URL fragment from an absolute URL.
 * `finalUrl` must be an absolute URL; a malformed value falls back to the raw string.
 */
function stripFragment(u: string): string {
  try {
    const x = new URL(u)
    x.hash = ''
    return x.toString()
  } catch {
    return u
  }
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

  let currentNorm: string
  try {
    currentNorm = stripFragment(finalUrl)
  } catch {
    currentNorm = finalUrl
  }

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
