import { describe, it, expect } from 'vitest'
import { PHASE_BOUNDARY_STEPS, isPhaseBoundary, phaseLabel } from './phase-subsets.js'

describe('phase-subsets', () => {
  it('isPhaseBoundary returns true for spec §3.9 boundary steps', () => {
    const boundarySlugs = [
      'user-stories', 'tech-stack', 'coding-standards',
      'design-system', 'implementation-plan', 'implementation-playbook',
    ]
    for (const slug of boundarySlugs) {
      expect(isPhaseBoundary(slug), `slug: ${slug}`).toBe(true)
    }
  })

  it('isPhaseBoundary returns false for non-boundary steps', () => {
    expect(isPhaseBoundary('create-prd')).toBe(false)
    expect(isPhaseBoundary('arbitrary-step')).toBe(false)
  })

  it('PHASE_BOUNDARY_STEPS includes a label for each entry', () => {
    for (const slug of PHASE_BOUNDARY_STEPS) {
      expect(typeof phaseLabel(slug)).toBe('string')
      expect(phaseLabel(slug).length).toBeGreaterThan(0)
    }
  })
})
