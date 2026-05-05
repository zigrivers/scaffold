import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { redactEvent, redactRendered, scrubSecrets, sanitizePath } from './redact.js'

const corpus = readFileSync(
  join(new URL('.', import.meta.url).pathname, '../../../tests/observability/fixtures/secret-corpus.txt'),
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
