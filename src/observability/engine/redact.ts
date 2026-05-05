// Secret-detector regex pack. Order matters: longer patterns first.
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'aws-key',      re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { name: 'high-entropy', re: /\b[A-Fa-f0-9]{40,}\b/g },
  { name: 'kv-secret',    re: /\b(?:secret|token|password|api[_-]?key)\s*[=:]\s*"?([^\s",]+)"?/gi },
]

export function scrubSecrets(input: string): string {
  let out = input
  for (const { name, re } of SECRET_PATTERNS) {
    re.lastIndex = 0  // reset stateful global regex before each call
    out = out.replace(re, (match, ...args) => {
      // When capture groups exist, args[0] is the captured string; otherwise args[0] is the offset.
      const captured = typeof args[0] === 'string' ? args[0] : undefined
      if (captured !== undefined) {
        return match.replace(captured, `[REDACTED:${name}]`)
      }
      return `[REDACTED:${name}]`
    })
  }
  return out
}

export function sanitizePath(s: string): string {
  return s.replace(/\/(?:Users|home)\/[^/\s]+/g, '~')
}

function recursivelyTransform(v: unknown, transform: (s: string) => string): unknown {
  if (typeof v === 'string') return transform(v)
  if (Array.isArray(v)) return v.map((x) => recursivelyTransform(x, transform))
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
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
