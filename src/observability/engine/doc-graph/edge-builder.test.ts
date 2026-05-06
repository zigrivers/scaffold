import { describe, it, expect } from 'vitest'
import { buildEdges } from './edge-builder.js'
import type { Story, AcceptanceCriterion, PlanTask, PlaybookTask, Test, FileNode, Decision, Feature } from '../types.js'

describe('buildEdges', () => {
  const features: Feature[] = [{ id: 'feature:user-auth', title: 'User Auth', priority: 'must', source_anchor: '' }]
  const stories: Story[] = [{
    id: 'story:user-auth-1', title: 'Sign in', priority: 'must', feature_id: 'feature:user-auth', source_anchor: '',
  }]
  const acs: AcceptanceCriterion[] = [
    { id: 'ac:user-auth-1.1', story_id: 'story:user-auth-1', text: 'Login form', source_anchor: '' },
    { id: 'ac:user-auth-1.2', story_id: 'story:user-auth-1', text: 'Reject invalid', source_anchor: '' },
  ]
  const planTasks: PlanTask[] = [{
    id: 'plan_task:T-001', title: 'Login form', status: 'done', story_id: 'story:user-auth-1', source_anchor: '',
  }]
  const playbookTasks: PlaybookTask[] = [{
    id: 'playbook_task:T-001', title: 'Login form', status: 'done',
    story_id: 'story:user-auth-1', plan_task_id: 'plan_task:T-001', source_anchor: '',
  }]
  const tests: Test[] = [
    {
      id: 'test:src/auth/login.test.ts::aaaaaaaaaaaa', name: 'AC 1: signs in',
      file_path: 'src/auth/login.test.ts', framework: 'vitest',
    },
  ]
  const files: FileNode[] = [
    { id: 'file:src/auth/login.ts', path: 'src/auth/login.ts' },
    { id: 'file:src/auth/login.test.ts', path: 'src/auth/login.test.ts' },
    { id: 'file:src/cache/store.ts', path: 'src/cache/store.ts' },
  ]
  const decisions: Decision[] = [
    {
      id: 'decision:use-redis', key: 'use-redis', summary: 'Use Redis',
      affects: ['src/cache/**'], source_anchor: '', recorded_at: '2026-04-30T00:00:00Z',
    },
    {
      id: 'decision:obsolete', key: 'obsolete', summary: 'Old decision',
      affects: ['src/missing/**'], source_anchor: '', recorded_at: '2026-04-29T00:00:00Z',
    },
  ]
  const acToTestMap = { 'ac:user-auth-1.1': ['test:src/auth/login.test.ts::aaaaaaaaaaaa'] }
  const edgeInput = {
    features, stories, acs, plan_tasks: planTasks, playbook_tasks: playbookTasks,
    tests, files, decisions, ac_to_test_overrides: acToTestMap,
  }

  it('builds the expected feature/story/ac/plan_task/playbook_task/file/decision edges', () => {
    const result = buildEdges(edgeInput)

    expect(result.edges).toContainEqual({
      kind: 'feature_to_story', from: 'feature:user-auth', to: 'story:user-auth-1',
    })
    expect(result.edges).toContainEqual({ kind: 'story_to_ac', from: 'story:user-auth-1', to: 'ac:user-auth-1.1' })
    expect(result.edges).toContainEqual({ kind: 'story_to_ac', from: 'story:user-auth-1', to: 'ac:user-auth-1.2' })
    expect(result.edges).toContainEqual({
      kind: 'ac_to_test', from: 'ac:user-auth-1.1', to: 'test:src/auth/login.test.ts::aaaaaaaaaaaa',
    })
    expect(result.edges).toContainEqual({
      kind: 'test_to_file', from: 'test:src/auth/login.test.ts::aaaaaaaaaaaa', to: 'file:src/auth/login.test.ts',
    })
    expect(result.edges).toContainEqual({
      kind: 'story_to_plan_task', from: 'story:user-auth-1', to: 'plan_task:T-001',
    })
    expect(result.edges).toContainEqual({
      kind: 'plan_task_to_playbook', from: 'plan_task:T-001', to: 'playbook_task:T-001',
    })
    expect(result.edges).toContainEqual({
      kind: 'playbook_task_to_story', from: 'playbook_task:T-001', to: 'story:user-auth-1',
    })
    expect(result.edges).toContainEqual({
      kind: 'decision_to_file', from: 'decision:use-redis', to: 'file:src/cache/store.ts',
    })
  })

  it('records unresolved_globs when a glob matches no files', () => {
    const result = buildEdges(edgeInput)
    expect(result.unresolved_globs).toContainEqual({ decision_id: 'decision:obsolete', glob: 'src/missing/**' })
    expect(result.edges.find((e) => e.kind === 'decision_to_file' && e.from === 'decision:obsolete')).toBeUndefined()
  })
})
