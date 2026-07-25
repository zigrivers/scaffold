import { describe, it, expect } from 'vitest'
import { loadAdoptionPreamble } from './mode-loader.js'

describe('loadAdoptionPreamble', () => {
  it('loads the bundled adoption preamble', () => {
    const { content, warnings } = loadAdoptionPreamble()
    expect(warnings).toHaveLength(0)
    expect(content).toBeTruthy()
    expect(content).toContain('adoption mode')
    expect(content).toContain('Read the repository first')
    expect(content).toContain('provenance')
  })
})
