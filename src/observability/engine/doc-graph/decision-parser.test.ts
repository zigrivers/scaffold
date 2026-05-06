import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDecisions } from './decision-parser.js'

describe('parseDecisions', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-dec-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('reads decisions.jsonl entries', async () => {
    const line1 = JSON.stringify({
      key: 'use-postgres', summary: 'Use Postgres for primary store',
      affects: ['src/db/**'], recorded_at: '2026-04-29T00:00:00Z',
    })
    const line2 = JSON.stringify({
      key: 'caching-strategy', summary: 'TTL=60s', affects: ['src/cache/**'],
      superseded_by: 'caching-strategy-v2', recorded_at: '2026-04-29T01:00:00Z',
    })
    writeFileSync(join(dir, 'decisions.jsonl'), `${line1}\n${line2}\n`)

    const decs = await parseDecisions(dir)
    expect(decs).toHaveLength(2)
    expect(decs[0]).toMatchObject({
      id: 'decision:use-postgres',
      key: 'use-postgres',
      summary: 'Use Postgres for primary store',
      affects: ['src/db/**'],
      source_anchor: 'decisions.jsonl',
    })
    expect(decs[1].superseded_by).toBe('decision:caching-strategy-v2')
  })

  it('reads decisions from docs/decisions/*.md frontmatter', async () => {
    mkdirSync(join(dir, 'docs/decisions'), { recursive: true })
    writeFileSync(join(dir, 'docs/decisions/use-redis.md'), [
      '---',
      'key: use-redis',
      'summary: Add Redis for hot-path caching',
      'affects: ["src/cache/**", "src/api/handler.ts"]',
      'recorded_at: 2026-04-30T00:00:00Z',
      '---',
      '',
      '## Context',
      'We need a cache.',
      '',
    ].join('\n'))
    const decs = await parseDecisions(dir)
    expect(decs).toHaveLength(1)
    expect(decs[0]).toMatchObject({
      id: 'decision:use-redis',
      summary: 'Add Redis for hot-path caching',
      affects: ['src/cache/**', 'src/api/handler.ts'],
      source_anchor: 'docs/decisions/use-redis.md',
    })
  })

  it('returns empty array when no decision sources exist', async () => {
    expect(await parseDecisions(dir)).toEqual([])
  })

  it('skips malformed JSONL lines without throwing', async () => {
    writeFileSync(join(dir, 'decisions.jsonl'),
      '{"key":"good","summary":"ok","affects":[],"recorded_at":"2026-04-30T00:00:00Z"}\n' +
      'not-json\n' +
      '{"key":"good2","summary":"ok2","affects":[],"recorded_at":"2026-04-30T00:01:00Z"}\n')
    const decs = await parseDecisions(dir)
    expect(decs.map((d) => d.key)).toEqual(['good', 'good2'])
  })
})
