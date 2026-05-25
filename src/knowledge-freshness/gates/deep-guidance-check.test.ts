import { describe, it, expect } from 'vitest'
import { checkDeepGuidance } from './deep-guidance-check.js'

describe('checkDeepGuidance', () => {
  it('passes entries that contain the literal heading', () => {
    const content = '---\nname: x\n---\n## Deep Guidance\nstuff'
    expect(checkDeepGuidance([{ file: 'a.md', content }])[0].ok).toBe(true)
  })

  it('fails when the heading is missing entirely', () => {
    const content = '---\nname: x\n---\n## Guidance\nstuff'
    const r = checkDeepGuidance([{ file: 'a.md', content }])[0]
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Deep Guidance/)
  })

  it('fails on case-different variants', () => {
    const content = '---\nname: x\n---\n## deep guidance\n'
    expect(checkDeepGuidance([{ file: 'a.md', content }])[0].ok).toBe(false)
  })

  it('fails when the heading is demoted to ###', () => {
    const content = '---\nname: x\n---\n### Deep Guidance\n'
    expect(checkDeepGuidance([{ file: 'a.md', content }])[0].ok).toBe(false)
  })
})
