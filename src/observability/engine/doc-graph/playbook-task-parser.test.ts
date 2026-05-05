import { describe, it, expect } from 'vitest'
import { parsePlaybookTasks } from './playbook-task-parser.js'

describe('parsePlaybookTasks', () => {
  it('extracts playbook tasks linking back to plan tasks via [plan_task: ID]', () => {
    const md = `# Playbook

## Task T-001: Build login form [plan_task: T-001] [story: user-auth-1] [status: done]

Files modified: src/auth/login.tsx

## Task TB-001: Hotfix for login crash [story: user-auth-1] [status: done] [unplanned: true]

Triaged from prod incident.
`
    const tasks = parsePlaybookTasks(md)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toMatchObject({
      id: 'playbook_task:T-001',
      title: 'Build login form',
      status: 'done',
      story_id: 'story:user-auth-1',
      plan_task_id: 'plan_task:T-001',
    })
    expect(tasks[1]).toMatchObject({
      id: 'playbook_task:TB-001',
      plan_task_id: undefined,
      story_id: 'story:user-auth-1',
    })
  })
})
