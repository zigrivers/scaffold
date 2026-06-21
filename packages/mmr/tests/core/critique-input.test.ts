import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveCritiqueInput } from '../../src/core/critique-input.js'

const tmp: string[] = []
afterEach(() => { for (const f of tmp.splice(0)) fs.rmSync(f, { force: true }) })

describe('resolveCritiqueInput', () => {
  it('reads a file path and reports the source', () => {
    const file = path.join(os.tmpdir(), `crit-${process.pid}-${Date.now()}.md`)
    fs.writeFileSync(file, '# my design\npoll every 30s')
    tmp.push(file)
    const { artifact, source } = resolveCritiqueInput(file)
    expect(artifact).toContain('poll every 30s')
    expect(source).toBe(file)
  })

  it('throws a usage error when no input is given', () => {
    expect(() => resolveCritiqueInput(undefined)).toThrow(/input/i)
  })

  it('throws when the artifact is empty/whitespace', () => {
    const file = path.join(os.tmpdir(), `crit-empty-${process.pid}-${Date.now()}.md`)
    fs.writeFileSync(file, '   \n  ')
    tmp.push(file)
    expect(() => resolveCritiqueInput(file)).toThrow(/empty/i)
  })
})
