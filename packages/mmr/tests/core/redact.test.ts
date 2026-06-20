import { describe, it, expect } from 'vitest'
import { isSecretKey, redactRecord, redactChannel, redactConfigView } from '../../src/core/redact.js'

describe('redactConfigView (D4 — single boundary)', () => {
  it('deep-redacts secret-keyed values in nested config structures', () => {
    const out = redactConfigView({
      channels: { http: { headers: { Authorization: 'Bearer sk-live' }, api_key_env: 'OPENAI_API_KEY' } },
    }) as { channels: { http: { headers: { Authorization: string }; api_key_env: string } } }
    expect(out.channels.http.headers.Authorization).toBe('<redacted>')
    // api_key_env is a NAME, not a value — kept.
    expect(out.channels.http.api_key_env).toBe('OPENAI_API_KEY')
  })

  it('returns the value untouched when noRedact is set', () => {
    const input = { headers: { Authorization: 'Bearer sk-live' } }
    expect(redactConfigView(input, { noRedact: true })).toBe(input)
  })

  it('redacts arrays of KEY value token pairs', () => {
    expect(redactConfigView(['Authorization', 'Bearer sk-live'])).toEqual(['Authorization', '<redacted>'])
  })
})

describe('isSecretKey (T1-E)', () => {
  it('matches token / key / secret / password / auth / authorization (case-insensitive)', () => {
    for (const k of [
      'token',
      'TOKEN',
      'API_KEY',
      'OPENAI_API_KEY',
      'secret',
      'PASSWORD',
      'auth',
      'Authorization',
      'X-API-Key',
      'credential',
      'passphrase',
      'cookie',
      'signature',
      'session',
      'apiKey',
      '"API_KEY"',
      'authToken',
      '"session_id"',
      'clientSecret',
      'privateKey',
      'sessionId',
      'DB_PASS',
      'MYSQL_PASSWD',
      'AWS_CREDENTIALS',
      'creds',
      'apikey',
    ]) {
      expect(isSecretKey(k)).toBe(true)
    }
  })

  it('does not match harmless keys', () => {
    for (const k of [
      'model',
      'endpoint',
      'NO_BROWSER',
      'TIMEOUT',
      'flag',
      'tokenizer',
      'author',
      'monkey',
      'publicKey',
      'primaryKey',
      'cacheKey',
    ]) {
      expect(isSecretKey(k)).toBe(false)
    }
  })

  it('does not match api_key_env (env-var name is non-secret)', () => {
    // api_key_env is matched at the channel level, not via this regex -
    // it lives in a different field and stores the *name* of an env var.
    // The regex itself catches `api_key` because the user could put it
    // under `env:` or `headers:`, where it would carry the actual value.
    expect(isSecretKey('api_key_env')).toBe(false)
    expect(isSecretKey('api_key')).toBe(true)
  })
})

describe('redactRecord (T1-E)', () => {
  it('replaces values for secret-like keys with <redacted>', () => {
    const input = { OPENAI_API_KEY: 'sk-xxxx', NO_BROWSER: 'true', PASSWORD: 'hunter2' }
    expect(redactRecord(input)).toEqual({
      OPENAI_API_KEY: '<redacted>',
      NO_BROWSER: 'true',
      PASSWORD: '<redacted>',
    })
  })

  it('preserves api_key_env by default but can redact it in value-bearing records', () => {
    expect(redactRecord({ api_key_env: 'OPENAI_API_KEY' })).toEqual({ api_key_env: 'OPENAI_API_KEY' })
    expect(redactRecord({ api_key_env: 'sk-actual' }, { exemptEnvNameKeys: false })).toEqual({
      api_key_env: '<redacted>',
    })
    expect(redactRecord({ env: { api_key_env: 'sk-actual' } })).toEqual({ env: { api_key_env: '<redacted>' } })
  })

  it('passes through non-secret values unchanged', () => {
    const input = { model: 'qwen', endpoint: 'http://localhost:11434', timeout: 30 }
    expect(redactRecord(input)).toEqual(input)
  })

  it('recursively redacts nested objects under non-secret keys', () => {
    expect(redactRecord({ config: { api_token: 'x', nested: { clientSecret: 'y' } } })).toEqual({
      config: { api_token: '<redacted>', nested: { clientSecret: '<redacted>' } },
    })
  })
})

describe('redactChannel (T1-E)', () => {
  it('redacts secrets in env and headers but preserves api_key_env name', () => {
    const channel = {
      command: 'curl',
      api_token: 'plain-secret',
      env: { OPENAI_API_KEY: 'sk-xxx', NO_BROWSER: 'true' },
      headers: { Authorization: 'Bearer abc', 'X-Trace': 'true' },
      api_key_env: 'OPENAI_API_KEY',
    }
    const redacted = redactChannel(channel)
    expect(redacted.api_token).toBe('<redacted>')
    expect(redacted.env).toEqual({ OPENAI_API_KEY: '<redacted>', NO_BROWSER: 'true' })
    expect(redacted.headers).toEqual({ Authorization: '<redacted>', 'X-Trace': 'true' })
    expect(redacted.api_key_env).toBe('OPENAI_API_KEY')
  })

  it('returns a new object - does not mutate input', () => {
    const channel = { env: { TOKEN: 'x' } }
    const redacted = redactChannel(channel)
    expect(channel.env.TOKEN).toBe('x')
    expect(redacted.env).toEqual({ TOKEN: '<redacted>' })
  })

  it('redacts array-valued env and headers without coercing them into records', () => {
    const channel = {
      env: [
        'TOKEN=x',
        '  authToken = abc',
        'NO_BROWSER=true',
        { name: 'OPENAI_API_KEY', value: 'sk-xxx' },
      ],
      headers: [
        'Authorization: Bearer abc',
        '  X-Trace: true',
        { key: 'Authorization', value: 'Bearer abc' },
        { key: 'X-Trace', value: 'true' },
        ['TOKEN=nested'],
        ['Authorization: Bearer nested'],
        ['Authorization', 'Bearer abc'],
        ['TOKEN', 'x'],
        'X-Trace',
        '1',
        'Authorization',
        'Bearer later',
      ],
    }
    expect(redactChannel(channel)).toEqual({
      env: [
        'TOKEN=<redacted>',
        '  authToken = <redacted>',
        'NO_BROWSER=true',
        { name: 'OPENAI_API_KEY', value: '<redacted>' },
      ],
      headers: [
        'Authorization: <redacted>',
        '  X-Trace: true',
        { key: 'Authorization', value: '<redacted>' },
        { key: 'X-Trace', value: 'true' },
        ['TOKEN=<redacted>'],
        ['Authorization: <redacted>'],
        ['Authorization', '<redacted>'],
        ['TOKEN', '<redacted>'],
        'X-Trace',
        '1',
        'Authorization',
        '<redacted>',
      ],
    })
  })

  it('redacts standalone secret-like strings in list-shaped config', () => {
    expect(redactChannel({ env: ['TOKEN'] })).toEqual({
      env: ['<redacted>'],
    })
  })

  it('redacts nested key/value secrets inside list strings', () => {
    expect(redactChannel({ flags: ['--env=OPENAI_API_KEY=sk-live'] })).toEqual({
      flags: ['--env=<redacted>'],
    })
  })
})
