// Sensitive keyword must appear as a whole segment (bounded by non-letters) so that
// 'tokenization_method' does not match on 'token'. Security still errs toward over-redaction.
const KV_KEY = String.raw`(?<![A-Za-z])(?:secret|token|password|api[_-]?key)(?![A-Za-z])`

// kv-secret: prefix (key+sep) in <kvp>, value in <kvv>.
// Unquoted values stop at delimiters and strip trailing sentence punctuation.
const KV_PART = String.raw`(?<kvp>\b(?:[A-Za-z0-9_-]*` + KV_KEY + String.raw`[A-Za-z0-9_-]*)\s*[=:]\s*)`
  + String.raw`(?<kvv>(?:"[^"]*"|'[^']*'|[^'"\s,;]+(?<![,.!;])))`

// Single-pass combined regex — one replace call instead of four.
// Raw high-entropy hex is intentionally omitted: it false-positives on file hashes and misses non-hex
// secrets (e.g. AWS SAKs). The kv-secret pattern catches structured secrets by key name.
const COMBINED_RE = new RegExp(
  [
    String.raw`(?<awskey>\bAKIA[0-9A-Z]{16}\b)`,
    String.raw`(?<github>\bgh[pousr]_[A-Za-z0-9]{36,}\b)`,
    KV_PART,
  ].join('|'),
  'gi',
)

export function scrubSecrets(input: string): string {
  return input.replace(COMBINED_RE, (match, ...args) => {
    // Named groups object is always the last argument for a regex with named groups.
    const groups = args[args.length - 1] as Record<string, string | undefined>
    // kv-secret: prefix (key + separator) is safe to keep; only the value is redacted.
    if (groups.kvp !== undefined) return `${groups.kvp}[REDACTED:kv-secret]`
    if (groups.awskey !== undefined) return '[REDACTED:aws-key]'
    if (groups.github !== undefined) return '[REDACTED:github-token]'
    return match
  })
}

export function sanitizePath(s: string): string {
  // Windows first: C:\Users\<name> or C:/Users/<name> (either slash style)
  let out = s.replace(/[A-Za-z]:[/\\]Users[/\\][^/\\]+/g, '~')
  // Unix: /Users/<name> or /home/<name> — negative lookbehind avoids mid-path matches like /mnt/home/alice
  out = out.replace(/(?<![/a-zA-Z0-9])\/(?:Users|home)\/[^/]+/g, '~')
  return out
}

// Matches object keys whose names indicate a sensitive value (e.g. { password: 'abc' }).
// Uses non-letter boundaries so 'tokenization_method' does not trigger on 'token'.
const SENSITIVE_KEY_RE = /(?<![A-Za-z])(?:secret|token|password|api[_-]?key)(?![A-Za-z])/i

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v) as unknown
  return proto === Object.prototype || proto === null
}

function recursivelyTransform(v: unknown, transform: (s: string) => string, sensitiveKey = false): unknown {
  if (typeof v === 'string') return sensitiveKey ? '[REDACTED:kv-secret]' : transform(v)
  if (Array.isArray(v)) return v.map((x) => recursivelyTransform(x, transform, sensitiveKey))
  // Deep redaction applies to plain objects and arrays only; Map/Set/class instances pass through
  // unchanged — event payloads do not embed raw secrets in Map/Set entries.
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = recursivelyTransform(val, transform, sensitiveKey || SENSITIVE_KEY_RE.test(k))
    }
    return out
  }
  return v
}

export function redactEvent<T>(event: T): T {
  return recursivelyTransform(event, (s) => sanitizePath(scrubSecrets(s))) as T
}

export function redactRendered(blob: string): string {
  return sanitizePath(scrubSecrets(blob))
}
