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

  it('accepts a valid task_completed event', () => {
    const r = validateEvent({
      ...base, type: 'task_completed', payload: { outcome: 'dropped' },
    })
    expect(r.ok).toBe(true)
  })

  it('accepts a valid decision_recorded event', () => {
    const r = validateEvent({
      ...base, type: 'decision_recorded',
      payload: { key: 'use-postgres', summary: 'chose postgres', affects: ['src/db/**'] },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects decision_recorded with non-string-array affects', () => {
    const r = validateEvent({
      ...base, type: 'decision_recorded',
      payload: { key: 'k', summary: 's', affects: 'not-an-array' } as never,
    })
    expect(r.ok).toBe(false)
  })

  it('accepts a valid blocker_hit event', () => {
    const r = validateEvent({
      ...base, type: 'blocker_hit', payload: { kind: 'dependency', summary: 'waiting on API' },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects blocker_hit with invalid kind', () => {
    const r = validateEvent({
      ...base, type: 'blocker_hit', payload: { kind: 'unknown', summary: 's' } as never,
    })
    expect(r.ok).toBe(false)
  })

  it('accepts a valid blocker_resolved event', () => {
    const r = validateEvent({
      ...base, type: 'blocker_resolved', payload: { summary: 'resolved', references: ['ev-1'] },
    })
    expect(r.ok).toBe(true)
  })

  it('accepts a valid pr_opened event', () => {
    const r = validateEvent({
      ...base, type: 'pr_opened', payload: { pr_number: 42 },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects pr_opened with non-positive-integer pr_number', () => {
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      const r = validateEvent({ ...base, type: 'pr_opened', payload: { pr_number: bad } })
      expect(r.ok, `should reject pr_number=${bad}`).toBe(false)
    }
  })

  it('rejects task_completed pr_submitted with invalid pr_number', () => {
    for (const bad of [0, -1, 1.5, NaN]) {
      const r = validateEvent({
        ...base, type: 'task_completed', payload: { outcome: 'pr_submitted', pr_number: bad },
      })
      expect(r.ok, `should reject pr_number=${bad}`).toBe(false)
    }
  })

  it('rejects task_completed dropped with invalid pr_number when present', () => {
    const r = validateEvent({
      ...base, type: 'task_completed', payload: { outcome: 'dropped', pr_number: -5 } as never,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects type=toString (prototype pollution guard)', () => {
    const r = validateEvent({ ...base, type: 'toString', payload: {} })
    expect(r.ok).toBe(false)
  })

  it('rejects decision_recorded summary over 500 chars', () => {
    const r = validateEvent({
      ...base, type: 'decision_recorded',
      payload: { key: 'k', summary: 'x'.repeat(501), affects: [] },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/500/)
  })

  it('rejects progress_heartbeat note over 200 chars', () => {
    const r = validateEvent({
      ...base, type: 'progress_heartbeat',
      payload: { note: 'x'.repeat(201) },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/200/)
  })

  it('accepts a valid progress_heartbeat event', () => {
    const r = validateEvent({
      ...base, type: 'progress_heartbeat', payload: { note: 'still going' },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects malformed ts', () => {
    const r = validateEvent({
      ...base, ts: 'not-a-date', type: 'task_claimed', payload: { task_title: 'x' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/ISO/)
  })

  it('rejects ts without timezone', () => {
    const r = validateEvent({
      ...base, ts: '2026-04-30T12:00:00', type: 'task_claimed', payload: { task_title: 'x' },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects ts with invalid calendar values', () => {
    const r = validateEvent({
      ...base, ts: '2026-99-99T12:00:00Z', type: 'task_claimed', payload: { task_title: 'x' },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects ts with trailing junk', () => {
    const r = validateEvent({
      ...base, ts: '2026-04-30T12:00:00Zjunk', type: 'task_claimed', payload: { task_title: 'x' },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects ts with overflowed calendar day (Feb 30)', () => {
    const r = validateEvent({
      ...base, ts: '2026-02-30T12:00:00Z', type: 'task_claimed', payload: { task_title: 'x' },
    })
    expect(r.ok).toBe(false)
  })

  it('accepts valid offset timestamp', () => {
    const r = validateEvent({
      ...base, ts: '2026-04-01T02:00:00+05:30', type: 'task_claimed', payload: { task_title: 'x' },
    })
    expect(r.ok).toBe(true)
  })

  it('does not include extra top-level fields in the returned event', () => {
    const r = validateEvent({
      ...base, type: 'task_claimed', payload: { task_title: 'x' }, extra: 'should-not-appear',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.event as unknown as Record<string, unknown>).extra).toBeUndefined()
  })
})

function baseEvent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    event_id: '01HXXXXXXXXXXXXXXXXXXXXXX',
    worktree_id: '00000000-0000-4000-8000-000000000000',
    actor_label: 'test-agent',
    branch: 'feat/test',
    task_id: null,
    ts: '2026-05-26T12:00:00Z',
    ...overrides,
  }
}

const VALID_HEX = 'a'.repeat(64)

describe('validateEvent — knowledge_gap_signal', () => {
  it('accepts a fully-populated event', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: {
        topic: 'agent-eval-harnesses',
        source: 'agent_search',
        project_id: VALID_HEX,
        step_name: 'tech-stack',
        agent_excerpt: 'I was looking for harness patterns and found nothing.',
      },
    }))
    expect(result.ok).toBe(true)
  })

  it('accepts a minimal event (only required payload fields)', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'agent-eval-harnesses', source: 'agent_search', project_id: VALID_HEX },
    }))
    expect(result.ok).toBe(true)
  })

  it('rejects an invalid source enum', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'foo', source: 'bogus', project_id: VALID_HEX },
    }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.some(e => /source/.test(e))).toBe(true)
  })

  it('rejects a non-kebab-case topic', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'Agent Eval Harnesses', source: 'agent_search', project_id: VALID_HEX },
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects a topic >80 chars', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'a-' + 'b'.repeat(80), source: 'agent_search', project_id: VALID_HEX },
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects a project_id that is neither 64-char hex nor "lessons"', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'foo', source: 'agent_search', project_id: 'too-short' },
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects project_id="lessons" when source != "lessons" (reserved-literal cross-field rule)', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'foo', source: 'agent_search', project_id: 'lessons' },
    }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.some(e => /reserved.*lessons|project_id/.test(e))).toBe(true)
  })

  it('accepts project_id="lessons" when source="lessons" (synthetic scanner round-trip safety)', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: { topic: 'foo', source: 'lessons', project_id: 'lessons' },
    }))
    expect(result.ok).toBe(true)
  })

  it('rejects agent_excerpt over 200 chars', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: {
        topic: 'foo', source: 'agent_search', project_id: VALID_HEX,
        agent_excerpt: 'a'.repeat(201),
      },
    }))
    expect(result.ok).toBe(false)
  })

  it('filters unknown payload keys silently (matches existing data-driven shape)', () => {
    const result = validateEvent(baseEvent({
      type: 'knowledge_gap_signal',
      payload: {
        topic: 'foo', source: 'agent_search', project_id: VALID_HEX,
        unknown_extra: 'should be dropped',
      },
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.dropped_fields).toContain('unknown_extra')
  })
})
