/**
 * Key parts whose VALUE should be redacted in any introspection output.
 * Deliberately broad, but separator-aware: `api_key` is secret-like while
 * harmless words such as `tokenizer`, `monkey`, or `author` are not.
 * The top-level channel field `api_key_env` is intentionally non-secret (it
 * stores the env-var name, not its value), but the same key inside env/headers
 * records still carries a value and is redacted there.
 */
const SECRET_KEY_PARTS = new Set([
  'auth',
  'authorization',
  'cookie',
  'cred',
  'credential',
  'key',
  'passphrase',
  'password',
  'secret',
  'session',
  'sid',
  'signature',
  'token',
])
const NON_SECRET_ENV_NAME_KEYS = new Set(['api_key_env'])

export function isSecretKey(name: string, options: { exemptEnvNameKeys?: boolean } = {}): boolean {
  const normalized = name.toLowerCase()
  if (options.exemptEnvNameKeys !== false && NON_SECRET_ENV_NAME_KEYS.has(normalized)) return false
  return name
    .split(/[_.-]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)
    .some((part) => SECRET_KEY_PARTS.has(part.toLowerCase()))
}

/**
 * Return a new record with secret-keyed values replaced by `<redacted>`.
 * Non-secret keys pass through unchanged.
 */
export function redactRecord(input: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!input) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = isSecretKey(k, { exemptEnvNameKeys: false }) ? '<redacted>' : v
  }
  return out
}

function redactKeyValueString(input: string): string {
  const match = /^(\s*)([^:=\s]+)(\s*[:=]\s*)(.*)$/.exec(input)
  if (!match) return input
  const [, leading, key, separator, value] = match
  return isSecretKey(key, { exemptEnvNameKeys: false })
    ? `${leading}${key}${separator}<redacted>`
    : `${leading}${key}${separator}${value}`
}

function redactList(input: unknown[]): unknown[] {
  return input.map((value) => (typeof value === 'string' ? redactKeyValueString(value) : value))
}

/**
 * Return a shallow copy of `channel` with `env` and `headers` redacted via
 * `redactRecord`. `api_key_env` (the env-var NAME, not its value) is preserved
 * as-is because the name is non-secret and useful for debugging.
 */
export function redactChannel(channel: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...channel }
  if (Array.isArray(copy.env)) {
    copy.env = redactList(copy.env)
  } else if (copy.env && typeof copy.env === 'object') {
    copy.env = redactRecord(copy.env as Record<string, unknown>)
  }
  if (Array.isArray(copy.headers)) {
    copy.headers = redactList(copy.headers)
  } else if (copy.headers && typeof copy.headers === 'object') {
    copy.headers = redactRecord(copy.headers as Record<string, unknown>)
  }
  return copy
}
