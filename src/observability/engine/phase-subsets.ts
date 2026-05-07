export const PHASE_BOUNDARY_STEPS = [
  'user-stories',
  'tech-stack',
  'coding-standards',
  'design-system',
  'implementation-plan',
  'implementation-playbook',
] as const

export type PhaseBoundaryStep = typeof PHASE_BOUNDARY_STEPS[number]

const PHASE_LABELS: Record<PhaseBoundaryStep, string> = {
  'user-stories': 'after user stories',
  'tech-stack': 'after tech stack',
  'coding-standards': 'after coding standards',
  'design-system': 'after design system',
  'implementation-plan': 'after implementation plan',
  'implementation-playbook': 'after implementation playbook',
}

export function isPhaseBoundary(slug: string): slug is PhaseBoundaryStep {
  return (PHASE_BOUNDARY_STEPS as readonly string[]).includes(slug)
}

export function phaseLabel(slug: PhaseBoundaryStep): string {
  return PHASE_LABELS[slug]
}
