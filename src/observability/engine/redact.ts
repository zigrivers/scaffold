// Lookahead ensures keyword ends a segment: 'tokenization_method' does not match ('token'
// followed by 'i'), but camelCase keys like 'myToken' and 'updateToken' do match.
const KV_KEY = String.raw`(?:secret|token|password|api[_-]?key)(?![A-Za-z])`

// kv-secret: prefix (key+sep) in <kvp>, value in <kvv>.
// Unquoted values stop at delimiters and strip trailing sentence punctuation.
const KV_PART = String.raw`(?<kvp>\b(?:[A-Za-z0-9_-]*` + KV_KEY + String.raw`[A-Za-z0-9_-]*)\s*[=:]\s*)`
  + String.raw`(?<kvv>(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^'"\s,;]+(?<![,.!;])))`

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
  // Windows: preserve drive letter; replace \Users\<name> with \~ to keep drive context.
  let out = s.replace(/([A-Za-z]:[/\\])Users[/\\][^/\\]+/g, '$1~')
  // Unix: /Users/<name> or /home/<name> — negative lookbehind avoids mid-path matches like /mnt/home/alice
  out = out.replace(/(?<![/a-zA-Z0-9])\/(?:Users|home)\/[^/]+/g, '~')
  return out
}

// Matches object keys indicating a sensitive value; lookahead ensures 'tokenization_method'
// does not trigger on 'token', while camelCase keys like 'myToken' are correctly matched.
const SENSITIVE_KEY_RE = /(?:secret|token|password|api[_-]?key)(?![A-Za-z])/i

function recursivelyTransform(
  v: unknown,
  transform: (s: string) => string,
  sensitiveKey = false,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof v === 'string') return sensitiveKey ? '[REDACTED:kv-secret]' : transform(v)
  if (sensitiveKey && (typeof v === 'number' || typeof v === 'boolean')) return '[REDACTED:kv-secret]'
  if (Array.isArray(v)) {
    if (seen.has(v)) return v
    seen.add(v)
    return v.map((x) => recursivelyTransform(x, transform, sensitiveKey, seen))
  }
  if (v instanceof Map) {
    if (seen.has(v)) return v
    seen.add(v)
    const out = new Map()
    for (const [k, val] of v) {
      const keyIsSensitive = typeof k === 'string' && SENSITIVE_KEY_RE.test(k)
      out.set(
        recursivelyTransform(k, transform, false, seen),
        recursivelyTransform(val, transform, sensitiveKey || keyIsSensitive, seen),
      )
    }
    return out
  }
  if (v instanceof Set) {
    if (seen.has(v)) return v
    seen.add(v)
    const out = new Set()
    for (const item of v) { out.add(recursivelyTransform(item, transform, sensitiveKey, seen)) }
    return out
  }
  if (typeof v === 'object' && v !== null) {
    if (seen.has(v)) return v
    seen.add(v)
    const entries = Object.entries(v as Record<string, unknown>)
    if (entries.length === 0) return v // No enumerable props: Date, Error, etc. pass through.
    const out: Record<string, unknown> = {}
    for (const [k, val] of entries) {
      out[k] = recursivelyTransform(val, transform, sensitiveKey || SENSITIVE_KEY_RE.test(k), seen)
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
