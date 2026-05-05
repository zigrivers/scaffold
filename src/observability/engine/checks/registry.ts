import type { AdapterId } from '../types.js'

export interface LensManifest {
  id: string
  name: string
  profiles: ('fast' | 'full')[]
  required: AdapterId[]
  optional: AdapterId[]
  depends_on?: string[]
}

export const LENS_REGISTRY: LensManifest[] = [
  { id: 'A-tdd',         name: 'TDD violations',          profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: ['tests'] },
  { id: 'B-ac-coverage', name: 'AC completion',           profiles: ['fast', 'full'],
    required: ['pipeline_docs'], optional: ['tests', 'gh'] },
  { id: 'H-cross-doc',   name: 'Cross-doc inconsistency', profiles: ['fast', 'full'],
    required: ['pipeline_docs'], optional: [] },
]

export function getLensManifest(id: string): LensManifest | undefined {
  return LENS_REGISTRY.find((m) => m.id === id)
}
