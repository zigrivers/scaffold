/**
 * Regex for keys whose VALUE should be redacted in any introspection output.
 * Deliberately broad: matches token / key / secret / password / auth (incl.
 * authorization). Case-insensitive. The *name* `api_key_env` is intentionally
 * non-secret (it stores the env-var name, not its value) - but if a user puts
 * `api_key` under `env:` or `headers:` they're storing the value, which this
 * regex must catch.
 */
const SECRET_KEY_RE = /(token|key|secret|password|auth(?:orization)?)/i

export function isSecretKey(name: string): boolean {
  return SECRET_KEY_RE.test(name)
}

/**
 * Return a new record with secret-keyed values replaced by `<redacted>`.
 * Non-secret keys pass through unchanged.
 */
export function redactRecord(input: Record<string, string> | undefined): Record<string, string> {
  if (!input) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = isSecretKey(k) ? '<redacted>' : v
  }
  return out
}

/**
 * Return a shallow copy of `channel` with `env` and `headers` redacted via
 * `redactRecord`. `api_key_env` (the env-var NAME, not its value) is preserved
 * as-is because the name is non-secret and useful for debugging.
 */
export function redactChannel<T extends Record<string, unknown>>(channel: T): T {
  const copy: Record<string, unknown> = { ...channel }
  if (copy.env && typeof copy.env === 'object') {
    copy.env = redactRecord(copy.env as Record<string, string>)
  }
  if (copy.headers && typeof copy.headers === 'object') {
    copy.headers = redactRecord(copy.headers as Record<string, string>)
  }
  return copy as T
}
