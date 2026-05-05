// kv-secret prefix group (key + separator); value group is adjacent in the combined regex.
const KV_PART = String.raw`(?<kvp>\b(?:[A-Za-z0-9_-]*(?:secret|token|password|api[_-]?key)[A-Za-z0-9_-]*)\s*[=:]\s*)`
  + String.raw`(?<kvv>(?:"[^"]*"|\S+))`

// Single-pass combined regex — one replace call instead of four.
// Threshold for high-entropy is 64 chars (SHA-256) to avoid redacting Git SHA-1 hashes (40 chars).
const COMBINED_RE = new RegExp(
  [
    String.raw`(?<awskey>\bAKIA[0-9A-Z]{16}\b)`,
    String.raw`(?<github>\bgh[pousr]_[A-Za-z0-9]{36,}\b)`,
    String.raw`(?<entropy>\b[A-Fa-f0-9]{64,}\b)`,
    KV_PART,
  ].join('|'),
  'gi',
)

export function scrubSecrets(input: string): string {
  COMBINED_RE.lastIndex = 0
  return input.replace(COMBINED_RE, (match, ...args) => {
    // Named groups object is always the last argument for a regex with named groups.
    const groups = args[args.length - 1] as Record<string, string | undefined>
    // kv-secret: prefix (key + separator) is safe to keep; only the value is redacted.
    if (groups.kvp !== undefined) return `${groups.kvp}[REDACTED:kv-secret]`
    if (groups.awskey !== undefined) return '[REDACTED:aws-key]'
    if (groups.github !== undefined) return '[REDACTED:github-token]'
    if (groups.entropy !== undefined) return '[REDACTED:high-entropy]'
    return match
  })
}

export function sanitizePath(s: string): string {
  // Windows first: C:\Users\<name> or C:/Users/<name> (either slash style)
  let out = s.replace(/[A-Za-z]:[/\\]Users[/\\][^/\\]+/g, '~')
  // Unix: /Users/<name> or /home/<name>
  out = out.replace(/\/(?:Users|home)\/[^/]+/g, '~')
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v) as unknown
  return proto === Object.prototype || proto === null
}

function recursivelyTransform(v: unknown, transform: (s: string) => string): unknown {
  if (typeof v === 'string') return transform(v)
  if (Array.isArray(v)) return v.map((x) => recursivelyTransform(x, transform))
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) {
      out[k] = recursivelyTransform(val, transform)
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
