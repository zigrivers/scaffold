import { describe, it, expect } from 'vitest'
import { isSecretKey, redactRecord, redactChannel } from '../../src/core/redact.js'

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
      'authToken',
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
        'TOKEN',
        { name: 'OPENAI_API_KEY', value: 'sk-xxx' },
      ],
      headers: [
        'Authorization: Bearer abc',
        '  X-Trace: true',
        { key: 'Authorization', value: 'Bearer abc' },
        { key: 'X-Trace', value: 'true' },
        ['TOKEN=nested'],
      ],
    }
    expect(redactChannel(channel)).toEqual({
      env: [
        'TOKEN=<redacted>',
        '  authToken = <redacted>',
        'NO_BROWSER=true',
        '<redacted>',
        { name: 'OPENAI_API_KEY', value: '<redacted>' },
      ],
      headers: [
        'Authorization: <redacted>',
        '  X-Trace: true',
        { key: 'Authorization', value: '<redacted>' },
        { key: 'X-Trace', value: 'true' },
        ['TOKEN=<redacted>'],
      ],
    })
  })
})
