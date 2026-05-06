import type { AdapterId, DocGraph, Event, AvailabilityMap, Finding } from '../types.js'
import { lensATdd } from '../../checks/lens-a-tdd.js'
import { lensBAcCoverage } from '../../checks/lens-b-ac-coverage.js'
import { lensCStandards } from '../../checks/lens-c-standards.js'
import { lensDStack } from '../../checks/lens-d-stack.js'
import { lensEDesign } from '../../checks/lens-e-design.js'
import { lensFScope } from '../../checks/lens-f-scope.js'
import { lensGDecisions, makeLensGDecisions } from '../../checks/lens-g-decisions.js'
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
  { id: 'C-standards',   name: 'Coding-standards drift',  profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: ['tests'] },
  { id: 'D-stack',       name: 'Tech-stack drift',        profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: [] },
  { id: 'E-design',      name: 'Design-system drift',     profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: [] },
  { id: 'F-scope',       name: 'Missing scope',           profiles: ['fast', 'full'],
    required: ['pipeline_docs'], optional: ['tests', 'gh', 'state'] },
  { id: 'G-decisions',   name: 'Undocumented decisions',  profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: [], depends_on: ['D-stack'] },
  { id: 'H-cross-doc',   name: 'Cross-doc inconsistency', profiles: ['fast', 'full'],
    required: ['pipeline_docs'], optional: [] },
]

export function getLensManifest(id: string): LensManifest | undefined {
  return LENS_REGISTRY.find((m) => m.id === id)
}

export const LENS_IMPLEMENTATIONS: Record<string, LensFn> = {
  'A-tdd':         lensATdd,
  'B-ac-coverage': lensBAcCoverage,
  'C-standards':   lensCStandards,
  'D-stack':       lensDStack,
  'E-design':      lensEDesign,
  'F-scope':       lensFScope,
  'G-decisions':   lensGDecisions,
  'H-cross-doc':   lensHCrossDoc,
}

export { makeLensGDecisions }

export function makeLensImplementations(projectRoot: string): Record<string, LensFn> {
  return { ...LENS_IMPLEMENTATIONS, 'G-decisions': makeLensGDecisions(projectRoot) }
}
