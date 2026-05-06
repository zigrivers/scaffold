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

import type { TokenUse } from './token-use-detector.js'
import type { ComponentUse } from './component-use-detector.js'

describe('buildEdges (with token + component uses)', () => {
  const minimalInput = {
    features: [], stories: [], acs: [], plan_tasks: [], playbook_tasks: [],
    tests: [], decisions: [],
    files: [
      { id: 'file:src/styles/btn.css',      path: 'src/styles/btn.css' },
      { id: 'file:src/components/Btn.tsx',  path: 'src/components/Btn.tsx' },
      { id: 'file:src/lib/auth.ts',         path: 'src/lib/auth.ts' },
    ],
  }

  it('emits file_to_token_use edges for each detected use', () => {
    const tokenUses: TokenUse[] = [
      { file: 'src/styles/btn.css', property: 'color',      value: '#4f46e5', token_id: 'token:--color-primary' },
      { file: 'src/styles/btn.css', property: 'background', value: '#abcdef', token_id: 'ad_hoc' },
    ]
    const result = buildEdges({ ...minimalInput, token_uses: tokenUses })
    const edges = result.edges.filter((e) => e.kind === 'file_to_token_use')
    expect(edges).toHaveLength(2)
    expect(edges[0]).toEqual({
      kind: 'file_to_token_use', from: 'file:src/styles/btn.css', to: 'token:--color-primary', property: 'color',
    })
    expect(edges[1]).toEqual({
      kind: 'file_to_token_use', from: 'file:src/styles/btn.css', to: 'ad_hoc', property: 'background',
    })
  })

  it('preserves the `property` field on file_to_token_use edges when provided by the detector', () => {
    const tokenUses = [
      { file: 'src/styles/btn.css', property: 'color',   value: '#4f46e5', token_id: 'token:--color-primary' },
      { file: 'src/styles/btn.css', property: 'padding', value: '8px',     token_id: 'ad_hoc' },
    ]
    const result = buildEdges({ ...minimalInput, token_uses: tokenUses } as never)
    type TokenEdge = { kind: 'file_to_token_use'; from: string; to: string; property?: string }
    const edges = result.edges.filter((e) => e.kind === 'file_to_token_use') as Array<TokenEdge>
    expect(edges[0].property).toBe('color')
    expect(edges[1].property).toBe('padding')
  })

  it('emits file_to_component_use edges for each detected import', () => {
    const componentUses: ComponentUse[] = [
      { file: 'src/lib/auth.ts', specifier: 'react',  component_id: 'component:react' },
      { file: 'src/lib/auth.ts', specifier: 'lodash', component_id: 'unsanctioned' },
    ]
    const result = buildEdges({ ...minimalInput, component_uses: componentUses })
    const edges = result.edges.filter((e) => e.kind === 'file_to_component_use')
    expect(edges).toHaveLength(2)
    expect(edges[0]).toEqual({ kind: 'file_to_component_use', from: 'file:src/lib/auth.ts', to: 'component:react' })
    expect(edges[1]).toEqual({ kind: 'file_to_component_use', from: 'file:src/lib/auth.ts', to: 'unsanctioned:lodash' })
  })
})
