import { existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'

export type ArtifactKey =
  | 'prd' | 'user_stories' | 'tech_stack' | 'coding_standards'
  | 'tdd_standards' | 'design_system' | 'implementation_plan'
  | 'implementation_playbook' | 'story_tests_map'

// Each role resolves from multiple candidate paths; first match wins.
export const PIPELINE_ARTIFACTS: Record<ArtifactKey, string[]> = {
  prd:                     ['docs/plan.md', 'docs/prd.md'],
  user_stories:            ['docs/user-stories.md'],
  tech_stack:              ['docs/tech-stack.md'],
  coding_standards:        ['docs/coding-standards.md'],
  tdd_standards:           ['docs/tdd-standards.md'],
  design_system:           ['docs/design-system.md'],
  implementation_plan:     ['docs/implementation-plan.md'],
  implementation_playbook: ['docs/implementation-playbook.md'],
  story_tests_map:         ['docs/story-tests-map.md'],
}

export type ArtifactBundle = Record<ArtifactKey, string | null>

const CANONICAL_REQUIRED: ArtifactKey[] = [
  'prd', 'user_stories', 'implementation_plan', 'tech_stack', 'coding_standards',
]

function firstExistingCandidate(cwd: string, candidates: string[]): string | null {
  for (const rel of candidates) {
    const abs = join(cwd, rel)
    if (existsSync(abs)) {
      try { if (statSync(abs).size > 0) return rel } catch { return rel }
    }
  }
  return null
}

export const pipelineDocsAdapter: BaseAdapter & {
  readArtifacts(cwd: string): Promise<ArtifactBundle>
} = {
  id: 'pipeline_docs',

  async probe(cwd: string): Promise<AdapterStatus> {
    const present: string[] = []
    let canonicalCount = 0
    for (const [k, candidates] of Object.entries(PIPELINE_ARTIFACTS) as Array<[ArtifactKey, string[]]>) {
      const found = firstExistingCandidate(cwd, candidates)
      if (found) {
        present.push(found)
        if (CANONICAL_REQUIRED.includes(k)) canonicalCount++
      }
    }
    if (present.length === 0) return { status: 'unavailable', reason: 'no docs/*.md planning artifacts found' }
    if (canonicalCount === CANONICAL_REQUIRED.length) return { status: 'available', evidence_paths: present }
    return {
      status: 'degraded',
      reason: `${canonicalCount}/${CANONICAL_REQUIRED.length} canonical artifacts present`,
      evidence_paths: present,
    }
  },

  async readArtifacts(cwd: string): Promise<ArtifactBundle> {
    const out = {} as ArtifactBundle
    for (const [k, candidates] of Object.entries(PIPELINE_ARTIFACTS) as Array<[ArtifactKey, string[]]>) {
      const found = firstExistingCandidate(cwd, candidates)
      out[k] = found ? readFileSync(join(cwd, found), 'utf8') : null
    }
    return out
  },
}
