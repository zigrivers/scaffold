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
  'credentials',
  'creds',
  'credential',
  'apikey',
  'pass',
  'passphrase',
  'passwd',
  'password',
  'secret',
  'session',
  'sid',
  'signature',
  'token',
])
const NON_SECRET_ENV_NAME_KEYS = new Set(['api_key_env'])
const KEY_PART_RE = /[_.-]+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/
const SENSITIVE_KEY_CONTEXT_PARTS = new Set(['api', 'openai', 'private', 'access'])

export function isSecretKey(name: string, options: { exemptEnvNameKeys?: boolean } = {}): boolean {
  const cleanName = name.replace(/^['"]|['"]$/g, '')
  const normalized = cleanName.toLowerCase()
  if (options.exemptEnvNameKeys !== false && NON_SECRET_ENV_NAME_KEYS.has(normalized)) return false
  const parts = cleanName.split(KEY_PART_RE).map((part) => part.toLowerCase())
  if (parts.some((part) => SECRET_KEY_PARTS.has(part))) return true
  if (!parts.includes('key')) return false
  if (parts.length === 1) return true
  return parts.some((part) => SENSITIVE_KEY_CONTEXT_PARTS.has(part))
}

function redactValue(value: unknown, options: { exemptEnvNameKeys?: boolean }): unknown {
  if (Array.isArray(value)) return redactList(value, options)
  if (value && typeof value === 'object') return redactRecord(value as Record<string, unknown>, options)
  return value
}

/**
 * Return a new record with secret-keyed values replaced by `<redacted>`.
 * Non-secret keys pass through unchanged.
 */
export function redactRecord(
  input: Record<string, unknown> | undefined,
  options: { exemptEnvNameKeys?: boolean } = {},
): Record<string, unknown> {
  if (!input) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    out[k] = isSecretKey(k, options) ? '<redacted>' : redactValue(v, { ...options, exemptEnvNameKeys: false })
  }
  return out
}

function redactKeyValueString(input: string): string {
  const match = /^(\s*)([^:=\s]+)(\s*[:=]\s*)(.*)$/.exec(input)
  if (!match) return isSecretKey(input.trim(), { exemptEnvNameKeys: false }) ? '<redacted>' : input
  const [, leading, key, separator, value] = match
  return isSecretKey(key, { exemptEnvNameKeys: false })
    ? `${leading}${key}${separator}<redacted>`
    : `${leading}${key}${separator}${value}`
}

function redactList(
  input: unknown[],
  options: { exemptEnvNameKeys?: boolean } = { exemptEnvNameKeys: false },
): unknown[] {
  const out: unknown[] = []
  for (let i = 0; i < input.length; i += 1) {
    const value = input[i]
    if (
      typeof value === 'string' &&
      typeof input[i + 1] === 'string' &&
      isSecretKey(value, { exemptEnvNameKeys: false })
    ) {
      out.push(value, '<redacted>')
      i += 1
      continue
    }
    if (typeof value === 'string') {
      out.push(redactKeyValueString(value))
      continue
    }
    if (Array.isArray(value)) {
      const key = value[0]
      const rest = value.slice(2)
      if (typeof key === 'string' && value.length === 1) {
        out.push([redactKeyValueString(key)])
        continue
      }
      if (typeof key === 'string' && isSecretKey(key, { exemptEnvNameKeys: false }) && value.length >= 2) {
        out.push([key, '<redacted>', ...redactList(rest, options)])
      } else {
        out.push(redactList(value, options))
      }
      continue
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const original = value as Record<string, unknown>
      const secretLabel =
        (typeof original.name === 'string' && isSecretKey(original.name, { exemptEnvNameKeys: false })) ||
        (typeof original.key === 'string' && isSecretKey(original.key, { exemptEnvNameKeys: false }))
      const redacted = redactRecord(value as Record<string, unknown>, options)
      if (typeof original.name === 'string') redacted.name = original.name
      if (typeof original.key === 'string') redacted.key = original.key
      if (secretLabel && 'value' in redacted) {
        redacted.value = '<redacted>'
      }
      out.push(redacted)
      continue
    }
    out.push(value)
  }
  return out
}

/**
 * Return a shallow copy of `channel` with `env` and `headers` redacted via
 * `redactRecord`. `api_key_env` (the env-var NAME, not its value) is preserved
 * as-is because the name is non-secret and useful for debugging.
 */
export function redactChannel(channel: Record<string, unknown>): Record<string, unknown> {
  return redactRecord(channel)
}
