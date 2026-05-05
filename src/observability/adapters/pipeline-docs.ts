import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'

export const PIPELINE_ARTIFACTS = {
  prd:                     'docs/prd.md',
  user_stories:            'docs/user-stories.md',
  tech_stack:              'docs/tech-stack.md',
  coding_standards:        'docs/coding-standards.md',
  tdd_standards:           'docs/tdd-standards.md',
  design_system:           'docs/design-system.md',
  implementation_plan:     'docs/implementation-plan.md',
  implementation_playbook: 'docs/implementation-playbook.md',
  story_tests_map:         'docs/story-tests-map.md',
} as const

export type ArtifactKey = keyof typeof PIPELINE_ARTIFACTS
export type ArtifactBundle = Record<ArtifactKey, string | null>

const CANONICAL_REQUIRED: ArtifactKey[] = [
  'prd', 'user_stories', 'implementation_plan', 'tech_stack', 'coding_standards',
]

export const pipelineDocsAdapter: BaseAdapter & {
  readArtifacts(cwd: string): Promise<ArtifactBundle>
} = {
  id: 'pipeline_docs',

  async probe(cwd: string): Promise<AdapterStatus> {
    const present: string[] = []
    let canonicalCount = 0
    for (const [k, rel] of Object.entries(PIPELINE_ARTIFACTS) as Array<[ArtifactKey, string]>) {
      if (existsSync(join(cwd, rel))) {
        present.push(rel)
        if (CANONICAL_REQUIRED.includes(k)) canonicalCount++
      }
    }
    if (present.length === 0) {
      return { status: 'unavailable', reason: 'no docs/*.md planning artifacts found' }
    }
    if (canonicalCount === CANONICAL_REQUIRED.length) {
      return { status: 'available', evidence_paths: present }
    }
    return {
      status: 'degraded',
      reason: `${canonicalCount}/${CANONICAL_REQUIRED.length} canonical artifacts present`,
      evidence_paths: present,
    }
  },

  async readArtifacts(cwd: string): Promise<ArtifactBundle> {
    const out = {} as ArtifactBundle
    for (const [k, rel] of Object.entries(PIPELINE_ARTIFACTS) as Array<[ArtifactKey, string]>) {
      const p = join(cwd, rel)
      out[k] = existsSync(p) ? readFileSync(p, 'utf8') : null
    }
    return out
  },
}
