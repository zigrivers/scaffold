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

  it('redacts quoted values that contain spaces', () => {
    const out = scrubSecrets('api_key="value with spaces"')
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

  it('redacts 64-char hex strings (SHA-256 length secrets)', () => {
    const sha256 = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    const out = scrubSecrets(`raw hash ${sha256}`)
    expect(out).not.toContain(sha256)
    expect(out).toContain('[REDACTED:high-entropy]')
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
  it('rewrites Windows backslash user paths to ~', () => {
    expect(sanitizePath('C:\\Users\\alice\\repo\\file.ts'))
      .toBe('~\\repo\\file.ts')
  })
  it('rewrites Windows forward-slash user paths to ~', () => {
    expect(sanitizePath('C:/Users/alice/repo/file.ts'))
      .toBe('~/repo/file.ts')
  })
  it('rewrites macOS user paths with spaces in username to ~', () => {
    expect(sanitizePath('/Users/John Doe/Documents/repo/file.ts'))
      .toBe('~/Documents/repo/file.ts')
  })
  it('rewrites Windows backslash paths with spaces in username to ~', () => {
    expect(sanitizePath('C:\\Users\\John Doe\\repo\\file.ts'))
      .toBe('~\\repo\\file.ts')
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

  it('preserves non-plain-object values (e.g. Date instances) unchanged', () => {
    const d = new Date('2026-01-01T00:00:00Z')
    const result = redactEvent({ ts: d, label: 'test' } as never) as { ts: unknown }
    expect(result.ts).toBeInstanceOf(Date)
    expect(result.ts).toBe(d)
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
