import { describe, it, expect } from 'vitest'
import { parsePlanTasks } from './plan-task-parser.js'

describe('parsePlanTasks', () => {
  it('extracts tasks from H2 with story/wave/status tags', () => {
    const md = `# Implementation Plan

## Task T-001: Build login form [story: user-auth-1] [wave: wave-1] [status: done]

Files: src/auth/login.tsx
ACs: 1.1, 1.2

## Task T-002: Server-side validation [story: user-auth-1] [wave: wave-1]

(no status tag → todo)

## Task T-003: Password reset [story: user-auth-2] [wave: wave-2] [status: in_flight]
`
    const tasks = parsePlanTasks(md)
    expect(tasks).toHaveLength(3)
    expect(tasks[0]).toMatchObject({
      id: 'plan_task:T-001',
      title: 'Build login form',
      status: 'done',
      story_id: 'story:user-auth-1',
      wave: 'wave-1',
      source_anchor: 'docs/implementation-plan.md#task-t-001',
    })
    expect(tasks[1].status).toBe('todo')
    expect(tasks[2].status).toBe('in_flight')
  })

  it('also accepts H3 task headings (deep methodology format)', () => {
    const md = '# Implementation Plan\n\n## Wave 1\n\n### Task T-001: Foo [story: s-1]\nBody.\n'
    const tasks = parsePlanTasks(md)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe('plan_task:T-001')
  })
})
