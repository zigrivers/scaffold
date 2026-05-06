import { minimatch } from 'minimatch'
import type {
  Feature, Story, AcceptanceCriterion, PlanTask, PlaybookTask, Test, FileNode, Decision, PullRequest, Edge,
} from '../types.js'
import type { TokenUse } from './token-use-detector.js'
import type { ComponentUse } from './component-use-detector.js'

export interface BuildEdgesInput {
  features: Feature[]
  stories: Story[]
  acs: AcceptanceCriterion[]
  plan_tasks: PlanTask[]
  playbook_tasks: PlaybookTask[]
  tests: Test[]
  files: FileNode[]
  decisions: Decision[]
  pull_requests?: PullRequest[]
  ac_to_test_overrides?: Record<string, string[]>
  pr_to_files?: Record<number, string[]>
  playbook_task_to_pr?: Record<string, number[]>
  token_uses?: TokenUse[]
  component_uses?: ComponentUse[]
}

export interface BuildEdgesResult {
  edges: Edge[]
  unresolved_globs: Array<{ decision_id: string; glob: string }>
}

export function buildEdges(input: BuildEdgesInput): BuildEdgesResult {
  const edges: Edge[] = []
  const unresolvedGlobs: BuildEdgesResult['unresolved_globs'] = []
  const filePaths = input.files.map((f) => f.path)
  const fileIdByPath = new Map(input.files.map((f) => [f.path, f.id]))

  for (const s of input.stories) {
    if (s.feature_id) edges.push({ kind: 'feature_to_story', from: s.feature_id, to: s.id })
  }

  for (const ac of input.acs) {
    edges.push({ kind: 'story_to_ac', from: ac.story_id, to: ac.id })
  }

  if (input.ac_to_test_overrides) {
    for (const [acId, testIds] of Object.entries(input.ac_to_test_overrides)) {
      for (const tId of testIds) edges.push({ kind: 'ac_to_test', from: acId, to: tId })
    }
  }

  for (const t of input.tests) {
    const fileId = fileIdByPath.get(t.file_path) ?? `file:${t.file_path}`
    edges.push({ kind: 'test_to_file', from: t.id, to: fileId })
  }

  for (const p of input.plan_tasks) {
    if (p.story_id) edges.push({ kind: 'story_to_plan_task', from: p.story_id, to: p.id })
  }
  for (const pb of input.playbook_tasks) {
    if (pb.plan_task_id) edges.push({ kind: 'plan_task_to_playbook', from: pb.plan_task_id, to: pb.id })
    if (pb.story_id) edges.push({ kind: 'playbook_task_to_story', from: pb.id, to: pb.story_id })
  }

  if (input.playbook_task_to_pr) {
    for (const [taskId, prNums] of Object.entries(input.playbook_task_to_pr)) {
      for (const pn of prNums) edges.push({ kind: 'playbook_task_to_pr', from: taskId, to: `pr:${pn}` })
    }
  }
  if (input.pr_to_files) {
    for (const [pnStr, paths] of Object.entries(input.pr_to_files)) {
      const pn = Number(pnStr)
      for (const path of paths) {
        const fileId = fileIdByPath.get(path) ?? `file:${path}`
        edges.push({ kind: 'pr_to_file', from: `pr:${pn}`, to: fileId })
      }
    }
  }

  for (const d of input.decisions) {
    for (const glob of d.affects) {
      const matched = filePaths.filter((p) => minimatch(p, glob))
      if (matched.length === 0) {
        unresolvedGlobs.push({ decision_id: d.id, glob })
        continue
      }
      for (const path of matched) {
        const fileId = fileIdByPath.get(path) ?? `file:${path}`
        edges.push({ kind: 'decision_to_file', from: d.id, to: fileId })
      }
    }
    if (d.superseded_by) edges.push({ kind: 'decision_supersedes', from: d.id, to: d.superseded_by })
  }

  for (const use of input.token_uses ?? []) {
    const fileId = fileIdByPath.get(use.file) ?? `file:${use.file}`
    edges.push({ kind: 'file_to_token_use', from: fileId, to: use.token_id as never, property: use.property })
  }

  for (const use of input.component_uses ?? []) {
    const fileId = fileIdByPath.get(use.file) ?? `file:${use.file}`
    const edgeTo = use.component_id === 'unsanctioned' ? `unsanctioned:${use.specifier}` : use.component_id
    edges.push({ kind: 'file_to_component_use', from: fileId, to: edgeTo as never })
  }

  return { edges, unresolved_globs: unresolvedGlobs }
}
