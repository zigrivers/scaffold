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
  if (isSecretKey(key, { exemptEnvNameKeys: false }) || containsNestedSecretKeyValue(value)) {
    return `${leading}${key}${separator}<redacted>`
  }
  return `${leading}${key}${separator}${value}`
}

function containsNestedSecretKeyValue(input: string): boolean {
  const nestedKeyValueRe = /(?:^|[=:])"?([A-Za-z0-9_.-]+)"?\s*[:=]/g
  for (const match of input.matchAll(nestedKeyValueRe)) {
    if (isSecretKey(match[1], { exemptEnvNameKeys: false })) return true
  }
  return false
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

/**
 * Single redaction boundary for ALL machine-readable config views (D4).
 * Deep-redacts secret-keyed values anywhere in the structure (nested maps,
 * arrays) so any present or future `--json` / effective-config / manifest view
 * inherits redaction by construction rather than re-implementing it. Default
 * redacts; `noRedact: true` returns the value untouched (callers must print a
 * loud stderr warning when they bypass).
 */
function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function isCommandSecretKey(name: string): boolean {
  const normalized = name.replace(/^-+/, '').toLowerCase()
  if (normalized.endsWith('-env') || normalized.endsWith('_env')) return false
  if (['auth-type', 'max-tokens', 'session-dir', 'token-limit', 'token-usage'].includes(normalized)) return false
  return isSecretKey(normalized, { exemptEnvNameKeys: false })
}

/**
 * Heuristically detect a secret embedded in a command/recovery string — a
 * `--api-key sk-…`, `Authorization: Bearer …`, `--header`/`-H` pairs, or
 * `KEY=secret` forms. Shared so every surface that prints a user-supplied
 * command-like string (channels show/list, config test recovery, review result
 * recovery) redacts consistently.
 */
export function commandContainsInlineSecret(command: string): boolean {
  const keyValueRe = /(?:^|[\s'"?&{,=])"?(-{0,2}[A-Za-z0-9_.-]+)"?\s*[:=]/g
  for (const match of command.matchAll(keyValueRe)) {
    if (isCommandSecretKey(match[1])) return true
  }
  const nestedKeyValueRe = /[=:]"?([A-Za-z0-9_.-]+)"?\s*[:=]/g
  for (const match of command.matchAll(nestedKeyValueRe)) {
    if (isCommandSecretKey(match[1])) return true
  }

  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = stripQuotes(tokens[i])
    const next = stripQuotes(tokens[i + 1])
    if (['--header', '-H', '--env', '-e'].includes(token) && commandContainsInlineSecret(next)) return true
    if (!token.startsWith('-') || token.includes('=') || token.includes(':') || next.startsWith('-')) continue
    if (isCommandSecretKey(token)) return true
  }

  return false
}

/**
 * Redact a command/recovery string to `<redacted>` when it embeds an inline
 * secret; pass non-strings and secret-free strings through unchanged.
 */
export function redactCommandString(value: unknown): unknown {
  return typeof value === 'string' && commandContainsInlineSecret(value) ? '<redacted>' : value
}

export { isCommandSecretKey }

export function redactConfigView(value: unknown, opts: { noRedact?: boolean } = {}): unknown {
  if (opts.noRedact) return value
  if (Array.isArray(value)) return redactList(value)
  if (!value || typeof value !== 'object') return value
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'channels' && v && typeof v === 'object' && !Array.isArray(v)) {
      // Redact each channel at its own top level so api_key_env (a NAME) is
      // kept while env/headers secret VALUES are redacted (D4).
      const channels: Record<string, unknown> = {}
      for (const [name, ch] of Object.entries(v as Record<string, unknown>)) {
        channels[name] = ch && typeof ch === 'object' && !Array.isArray(ch)
          ? redactChannel(ch as Record<string, unknown>)
          : ch
      }
      out[k] = channels
    } else if (isSecretKey(k)) {
      out[k] = '<redacted>'
    } else {
      out[k] = redactConfigView(v)
    }
  }
  return out
}
