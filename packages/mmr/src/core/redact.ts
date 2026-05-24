/**
 * Key parts whose VALUE should be redacted in any introspection output.
 * Deliberately broad, but separator-aware: `api_key` is secret-like while
 * harmless words such as `tokenizer`, `monkey`, or `author` are not.
 * The *name* `api_key_env` is intentionally non-secret (it stores the env-var
 * name, not its value).
 */
const SECRET_KEY_PARTS = new Set(['token', 'key', 'secret', 'password', 'auth', 'authorization'])
const NON_SECRET_ENV_NAME_KEYS = new Set(['api_key_env'])

export function isSecretKey(name: string): boolean {
  const normalized = name.toLowerCase()
  if (NON_SECRET_ENV_NAME_KEYS.has(normalized)) return false
  return normalized.split(/[_.-]+/).some((part) => SECRET_KEY_PARTS.has(part))
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
export function redactChannel(channel: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...channel }
  if (copy.env && typeof copy.env === 'object' && !Array.isArray(copy.env)) {
    copy.env = redactRecord(copy.env as Record<string, string>)
  }
  if (copy.headers && typeof copy.headers === 'object' && !Array.isArray(copy.headers)) {
    copy.headers = redactRecord(copy.headers as Record<string, string>)
  }
  return copy
}
