import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { redactEvent, redactRendered, scrubSecrets, sanitizePath } from './redact.js'

const corpus = readFileSync(
  join(fileURLToPath(new URL('.', import.meta.url)), '../../../tests/observability/fixtures/secret-corpus.txt'),
  'utf8',
)

describe('scrubSecrets', () => {
  it('replaces matched secrets with [REDACTED:*]', () => {
    const out = scrubSecrets(corpus)
    for (const line of corpus.split('\n')) {
      if (line.startsWith('REDACT ')) {
        const value = line.replace(/^REDACT\s+/, '')
        expect(out, `should redact: ${value}`).not.toContain(value)
      }
      if (line.startsWith('KEEP ')) {
        const value = line.replace(/^KEEP\s+/, '')
        expect(out, `must NOT redact: ${value}`).toContain(value)
      }
    }
  })

  it('returns the input unchanged when no secrets present', () => {
    expect(scrubSecrets('hello world\nno secrets here')).toBe('hello world\nno secrets here')
  })

  it('redacts compound env-style key names (SECRET_TOKEN, ACCESS_TOKEN, CLIENT_SECRET)', () => {
    const out = scrubSecrets('SECRET_TOKEN=abc ACCESS_TOKEN: xyz CLIENT_SECRET=qrs')
    expect(out).not.toContain('abc')
    expect(out).not.toContain('xyz')
    expect(out).not.toContain('qrs')
    expect(out).toContain('[REDACTED:kv-secret]')
  })

  it('redacts double-quoted values that contain spaces', () => {
    const out = scrubSecrets('api_key="value with spaces"')
    expect(out).not.toContain('value with spaces')
    expect(out).toContain('[REDACTED:kv-secret]')
  })

  it('redacts single-quoted values that contain spaces', () => {
    const out = scrubSecrets('api_key=\'value with spaces\'')
    expect(out).not.toContain('value with spaces')
    expect(out).toContain('[REDACTED:kv-secret]')
  })

  it('redacts value correctly when value text also appears in the key name', () => {
    expect(scrubSecrets('my_password=password')).toBe('my_password=[REDACTED:kv-secret]')
  })

  it('preserves trailing punctuation outside the secret value', () => {
    expect(scrubSecrets('Set password=hunter2.')).toBe('Set password=[REDACTED:kv-secret].')
    expect(scrubSecrets('Keys: token=abc123, other=xyz')).toBe('Keys: token=[REDACTED:kv-secret], other=xyz')
  })

  it('does not redact 40-char hex strings (Git SHA-1 length)', () => {
    const sha1 = 'da39a3ee5e6b4b0d3255bfef95601890afd80709'
    expect(scrubSecrets(`commit ${sha1}`)).toContain(sha1)
  })

  it('does not redact bare hex strings without key=value context', () => {
    const sha256 = 'a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4'
    expect(scrubSecrets(`file-sha256 ${sha256}`)).toContain(sha256)
  })

  it('does not swallow adjacent kv pairs when comma-delimited without spaces', () => {
    const out = scrubSecrets('api_key=abc,user=alice')
    expect(out).not.toContain('abc')
    expect(out).toContain('user=alice')
  })

  it('redacts quoted values containing embedded escaped quotes', () => {
    expect(scrubSecrets('api_key="my\\"secret"')).toBe('api_key=[REDACTED:kv-secret]')
  })
})

describe('sanitizePath', () => {
  it('rewrites macOS user paths to ~', () => {
    expect(sanitizePath('/Users/alice/Documents/repo/file.ts'))
      .toBe('~/Documents/repo/file.ts')
  })
  it('rewrites Linux user paths to ~', () => {
    expect(sanitizePath('/home/bob/src/file.go'))
      .toBe('~/src/file.go')
  })
  it('leaves repo-relative paths unchanged', () => {
    expect(sanitizePath('src/auth/login.ts')).toBe('src/auth/login.ts')
  })
  it('rewrites Windows backslash user paths to ~, preserving drive letter', () => {
    expect(sanitizePath('C:\\Users\\alice\\repo\\file.ts'))
      .toBe('C:\\~\\repo\\file.ts')
  })
  it('rewrites Windows forward-slash user paths to ~, preserving drive letter', () => {
    expect(sanitizePath('C:/Users/alice/repo/file.ts'))
      .toBe('C:/~/repo/file.ts')
  })
  it('rewrites macOS user paths with spaces in username to ~', () => {
    expect(sanitizePath('/Users/John Doe/Documents/repo/file.ts'))
      .toBe('~/Documents/repo/file.ts')
  })
  it('rewrites Windows backslash paths with spaces in username to ~, preserving drive letter', () => {
    expect(sanitizePath('C:\\Users\\John Doe\\repo\\file.ts'))
      .toBe('C:\\~\\repo\\file.ts')
  })
  it('does not rewrite home-like paths that are not root-level home dirs', () => {
    expect(sanitizePath('/mnt/home/alice/file.ts')).toBe('/mnt/home/alice/file.ts')
    expect(sanitizePath('/var/Users/shared/file.ts')).toBe('/var/Users/shared/file.ts')
  })
})

describe('redactEvent (write-time)', () => {
  it('scrubs secrets from string fields and drops paths through sanitizePath', () => {
    const e = {
      event_id: '01H', worktree_id: 'wid', actor_label: 'alice',
      branch: 'feat/api_key="abc-123-def"', task_id: 'T-1',
      type: 'decision_recorded', ts: '2026-04-30T00:00:00Z',
      payload: { key: 'k', summary: 'token=ghp_1234567890abcdefABCDEF1234567890abcdef',
        affects: ['/Users/alice/Documents/repo/src/file.ts'] },
    } as never
    const out = redactEvent(e) as { branch: string; payload: { summary: string; affects: string[] } }
    expect(out.payload.summary).toContain('[REDACTED:')
    expect(out.payload.affects[0]).toBe('~/Documents/repo/src/file.ts')
    expect(out.branch).toContain('[REDACTED:')
  })

  it('redacts string values whose object key matches a sensitive pattern', () => {
    const result = redactEvent({ password: 'abc123', msg: 'hello' } as never) as Record<string, string>
    expect(result.password).toBe('[REDACTED:kv-secret]')
    expect(result.msg).toBe('hello')
  })

  it('redacts leaf values nested under a sensitive key even when child key is not sensitive', () => {
    const result = redactEvent({ password: { value: 'hunter2', extra: 'note' } } as never)
    const inner = (result as { password: Record<string, string> }).password
    expect(inner.value).toBe('[REDACTED:kv-secret]')
    expect(inner.extra).toBe('[REDACTED:kv-secret]')
  })

  it('preserves non-plain-object values (e.g. Date instances) unchanged', () => {
    const d = new Date('2026-01-01T00:00:00Z')
    const result = redactEvent({ ts: d, label: 'test' } as never) as { ts: unknown }
    expect(result.ts).toBeInstanceOf(Date)
    expect(result.ts).toBe(d)
  })

  it('does not redact values under keys where sensitive word is embedded in a larger word', () => {
    const result = redactEvent({ tokenization_method: 'bpe', token: 'secret-val' } as never)
    const cast = result as Record<string, string>
    expect(cast.tokenization_method).toBe('bpe')
    expect(cast.token).toBe('[REDACTED:kv-secret]')
  })

  it('recurses into Maps, applying key-sensitive detection for Map keys', () => {
    const m = new Map<string, unknown>([
      ['password', 'hunter2'],
      ['user', 'alice'],
      ['count', 42],
    ])
    const res = redactEvent({ data: m } as never) as { data: Map<string, unknown> }
    expect(res.data).toBeInstanceOf(Map)
    expect(res.data.get('password')).toBe('[REDACTED:kv-secret]')
    expect(res.data.get('user')).toBe('alice')
    expect(res.data.get('count')).toBe(42)
  })

  it('redacts numeric and boolean values under sensitive object keys', () => {
    const result = redactEvent({ api_key: 12345, count: 7 } as never) as Record<string, unknown>
    expect(result.api_key).toBe('[REDACTED:kv-secret]')
    expect(result.count).toBe(7)
  })

  it('handles circular references without stack overflow', () => {
    const obj: Record<string, unknown> = { label: 'test' }
    obj.self = obj
    expect(() => redactEvent(obj as never)).not.toThrow()
    const result = redactEvent(obj as never) as Record<string, unknown>
    expect(result.label).toBe('test')
    expect(result).not.toBe(obj)
    expect(result.self).toBe(result) // cycle resolves to the sanitized clone, not the original
  })

  it('sanitizes Error message and stack, returning a new Error instance', () => {
    const err = new Error('/Users/alice/src/file.ts threw')
    const result = redactEvent(err as never) as Error
    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('~/src/file.ts threw')
    expect(result.message).not.toContain('/Users/alice')
  })

  it('redacts enumerable properties on Error instances', () => {
    const err = Object.assign(new Error('oops'), { token: 'secret-val', code: 'E_TOKEN' })
    const result = redactEvent(err as never) as Error & Record<string, unknown>
    expect(result).toBeInstanceOf(Error)
    expect(result.token).toBe('[REDACTED:kv-secret]')
    expect(result.code).toBe('E_TOKEN')
  })

  it('preserves Buffer and non-plain-object values unchanged', () => {
    const buf = Buffer.from('hello')
    const result = redactEvent({ data: buf } as never) as { data: Buffer }
    expect(result.data).toBeInstanceOf(Buffer)
    expect(result.data).toBe(buf)
  })
})

describe('redactRendered (render-time)', () => {
  it('runs both secret-scrubbing and path-sanitization on a markdown blob', () => {
    const md = 'See /Users/alice/repo/file.ts and token=hunter2'
    const out = redactRendered(md)
    expect(out).toContain('~/repo/file.ts')
    expect(out).not.toContain('hunter2')
    expect(out).toContain('[REDACTED:')
  })
})
