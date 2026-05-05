import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'

// Canonical paths produced by scaffold's own pipeline steps in consumer projects.
// The scaffold repo itself does not follow this layout (it is the tool, not a project built by it).
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

async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

export const pipelineDocsAdapter: BaseAdapter & {
  readArtifacts(cwd: string): Promise<ArtifactBundle>
} = {
  id: 'pipeline_docs',

  async probe(cwd: string): Promise<AdapterStatus> {
    const entries = Object.entries(PIPELINE_ARTIFACTS) as Array<[ArtifactKey, string]>
    const exists = await Promise.all(entries.map(([, rel]) => fileExists(join(cwd, rel))))
    const present: string[] = []
    let canonicalCount = 0
    for (let i = 0; i < entries.length; i++) {
      if (exists[i]) {
        const [k, rel] = entries[i]
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
    await Promise.all(
      (Object.entries(PIPELINE_ARTIFACTS) as Array<[ArtifactKey, string]>).map(async ([k, rel]) => {
        const p = join(cwd, rel)
        try { out[k] = await readFile(p, 'utf8') } catch { out[k] = null }
      }),
    )
    return out
  },
}
