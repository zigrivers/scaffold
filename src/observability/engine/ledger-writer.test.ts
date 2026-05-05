import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeEvent } from './ledger-writer.js'
import { ensureIdentity } from './identity.js'

describe('ledger-writer (basic append)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-lw-'))
    ensureIdentity(dir, 'agent-alice')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('appends a valid task_claimed event as a single JSONL line', async () => {
    await writeEvent(dir, {
      type: 'task_claimed',
      branch: 'alice-feat',
      task_id: 'T-001',
      payload: { task_title: 'Hello' },
    })

    const text = readFileSync(join(dir, '.scaffold/activity.jsonl'), 'utf8')
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(1)
    const obj = JSON.parse(lines[0])
    expect(obj.type).toBe('task_claimed')
    expect(obj.task_id).toBe('T-001')
    expect(obj.event_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/) // ULID
    expect(obj.worktree_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(obj.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects events larger than 4 KiB', async () => {
    // 100 long paths in affects passes schema validation but pushes the JSON line over 4 KiB.
    const manyPaths = Array.from({ length: 100 }, (_, i) => `/src/observability/engine/module-${i}.ts`)
    await expect(writeEvent(dir, {
      type: 'decision_recorded', branch: 'b', task_id: 'T-002',
      payload: { key: 'k', summary: 'ok', affects: manyPaths },
    })).rejects.toThrow(/4 KiB|too large/i)
  })

  it('rejects schema-invalid events', async () => {
    await expect(writeEvent(dir, {
      type: 'task_claimed', branch: 'b', task_id: null,
      payload: { task_title: 'h' }, // missing payload.unplanned=true for null task_id
    })).rejects.toThrow(/unplanned/)
  })
})

describe('ledger-writer (concurrency)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'observe-lw-conc-'))
    ensureIdentity(dir, 'agent-concurrent')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('serializes 10 concurrent writes without data loss or corruption', async () => {
    const N = 10
    const writes = Array.from({ length: N }, (_, i) =>
      writeEvent(dir, {
        type: 'task_claimed',
        branch: `branch-${i}`,
        task_id: `T-${String(i).padStart(3, '0')}`,
        payload: { task_title: `Task ${i}` },
      }),
    )
    await Promise.all(writes)

    const text = readFileSync(join(dir, '.scaffold/activity.jsonl'), 'utf8')
    const lines = text.trim().split('\n')
    expect(lines).toHaveLength(N)
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow()
    }
    const taskIds = new Set(lines.map(l => (JSON.parse(l) as { task_id: string }).task_id))
    expect(taskIds.size).toBe(N)
  })
})
