import type { EngineOutput } from './types.js'

// Shared keyword group: both the string-scrubber (KV_PART) and object-key sensor use this.
// Lookahead ensures keyword ends a segment: 'tokenization_method' does not match ('token'
// followed by 'i'), but camelCase keys like 'myToken' and 'updateToken' do match.
const KEYWORDS = String.raw`(?:secret|token|password|api[_-]?key)(?![A-Za-z])`

// kv-secret: prefix (key+sep) in <kvp>, value in <kvv>.
// Unquoted values stop at delimiters and strip trailing sentence punctuation.
const KV_PART = String.raw`(?<kvp>\b(?:[A-Za-z0-9_-]*` + KEYWORDS + String.raw`[A-Za-z0-9_-]*)\s*[=:]\s*)`
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

// Same keyword group as KEYWORDS — compiled separately for use as a RegExp test.
const SENSITIVE_KEY_RE = new RegExp(KEYWORDS, 'i')

function recursivelyTransform(
  v: unknown,
  transform: (s: string) => string,
  sensitiveKey = false,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (typeof v === 'string') return sensitiveKey ? '[REDACTED:kv-secret]' : transform(v)
  if (sensitiveKey && (typeof v === 'number' || typeof v === 'boolean')) return '[REDACTED:kv-secret]'
  if (Array.isArray(v)) {
    if (seen.has(v)) return seen.get(v)
    const out: unknown[] = []
    seen.set(v, out)
    for (const x of v) { out.push(recursivelyTransform(x, transform, sensitiveKey, seen)) }
    return out
  }
  if (v instanceof Map) {
    if (seen.has(v)) return seen.get(v)
    const out = new Map()
    seen.set(v, out)
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
    if (seen.has(v)) return seen.get(v)
    const out = new Set()
    seen.set(v, out)
    for (const item of v) { out.add(recursivelyTransform(item, transform, sensitiveKey, seen)) }
    return out
  }
  if (v instanceof Error) {
    if (seen.has(v)) return seen.get(v)
    const out = new Error(transform(v.message))
    if (v.stack) out.stack = transform(v.stack)
    seen.set(v, out)
    for (const [k, val] of Object.entries(v)) {
      (out as unknown as Record<string, unknown>)[k] = recursivelyTransform(
        val, transform, sensitiveKey || SENSITIVE_KEY_RE.test(k), seen,
      )
    }
    return out
  }
  if (typeof v === 'object' && v !== null) {
    // Only traverse plain objects; Buffers, TypedArrays, and custom class instances pass through.
    const proto = Object.getPrototypeOf(v) as unknown
    if (proto !== Object.prototype && proto !== null) return v
    if (seen.has(v)) return seen.get(v)
    const out: Record<string, unknown> = {}
    seen.set(v, out)
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
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

/** Render-time redaction of a structured EngineOutput. Recurses through every string field. */
export function redactEngineOutput(out: EngineOutput): EngineOutput {
  return recursivelyTransform(out, (s) => sanitizePath(scrubSecrets(s))) as EngineOutput
}
