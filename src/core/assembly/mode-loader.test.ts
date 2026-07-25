import { describe, it, expect, vi } from 'vitest'
import { loadAdoptionPreamble } from './mode-loader.js'
import fs from 'node:fs'

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    default: {
      ...actual,
      readFileSync: vi.fn(actual.readFileSync),
    },
  }
})

describe('loadAdoptionPreamble', () => {
  it('loads the bundled adoption preamble', () => {
    const { content, warnings } = loadAdoptionPreamble()
    expect(warnings).toHaveLength(0)
    expect(content).toBeTruthy()
    expect(content).toContain('adoption mode')
    expect(content).toContain('Read the repository first')
    expect(content).toContain('provenance')
  })

  it('returns null content and ASM_ADOPTION_PREAMBLE_MISSING warning when the file cannot be read', () => {
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw new Error('ENOENT: no such file or directory')
    })

    const { content, warnings } = loadAdoptionPreamble()

    expect(content).toBeNull()
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('ASM_ADOPTION_PREAMBLE_MISSING')
    expect(warnings[0].message).toContain('Adoption-mode preamble not found at')
    expect(warnings[0].message).toContain('adoption.md')
  })
})
