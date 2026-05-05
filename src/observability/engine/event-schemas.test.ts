import { describe, it, expect } from 'vitest'
import { validateEvent, EVENT_PAYLOAD_KEYS } from './event-schemas.js'

describe('event-schemas', () => {
  const base = {
    event_id: '01HF5ZABCDEFGHJKMNPQRSTVWX',
    worktree_id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    actor_label: 'agent-alice',
    branch: 'alice-feat',
    task_id: 'T-001',
    ts: '2026-04-30T12:00:00Z',
  }

  it('accepts a valid task_claimed event', () => {
    const r = validateEvent({ ...base, type: 'task_claimed', payload: { task_title: 'Hello' } })
    expect(r.ok).toBe(true)
  })

  it('drops payload fields that are not in the allowlist', () => {
    const r = validateEvent({
      ...base,
      type: 'task_claimed',
      payload: { task_title: 'Hello', secret: 'xxx', wave: 'wave-2' } as never,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.event.payload).toEqual({ task_title: 'Hello', wave: 'wave-2' })
      expect(r.dropped_fields).toEqual(['secret'])
    }
  })

  it('rejects task_claimed with task_id null unless payload.unplanned === true', () => {
    const bad = validateEvent({
      ...base, task_id: null, type: 'task_claimed', payload: { task_title: 'Hello' },
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors[0]).toMatch(/unplanned/)

    const ok = validateEvent({
      ...base, task_id: null, type: 'task_claimed', payload: { task_title: 'Hello', unplanned: true },
    })
    expect(ok.ok).toBe(true)
  })

  it('rejects finding_acknowledged when task_id is non-null', () => {
    const r = validateEvent({
      ...base,
      type: 'finding_acknowledged',
      task_id: 'T-001',
      payload: { finding_id: 'abc12345', status: 'acknowledged' },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects task_completed pr_submitted without pr_number', () => {
    const r = validateEvent({
      ...base, type: 'task_completed',
      payload: { outcome: 'pr_submitted' } as never,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/pr_number/)
  })

  it('exposes the per-type payload key allowlist for ledger-writer use', () => {
    expect(EVENT_PAYLOAD_KEYS.task_claimed).toEqual(['task_title', 'story_id', 'wave', 'unplanned'])
  })
})
