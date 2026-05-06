import type { AdapterId, DocGraph, Event, AvailabilityMap, Finding } from '../types.js'
import { lensATdd } from '../../checks/lens-a-tdd.js'
import { lensBAcCoverage } from '../../checks/lens-b-ac-coverage.js'
import { lensHCrossDoc } from '../../checks/lens-h-cross-doc.js'

export type LensFn = (
  graph: DocGraph, ledger: { events: Event[] }, availability: AvailabilityMap,
  upstream: Finding[], enabledIds: Set<string>,
) => Promise<Finding[]>

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

export const LENS_IMPLEMENTATIONS: Record<string, LensFn> = {
  'A-tdd':         lensATdd,
  'B-ac-coverage': lensBAcCoverage,
  'H-cross-doc':   lensHCrossDoc,
}
