import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { proposeMapCandidates, CANDIDATE_SOURCES } from './map-candidates.js'

let tmpDir: string
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapcand-')) })
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

const ALL_STEPS = ['coding-standards', 'system-architecture', 'security', 'dev-env-setup', 'tdd']

describe('proposeMapCandidates', () => {
  it('proposes the first existing candidate per step', () => {
    fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# c')
    fs.writeFileSync(path.join(tmpDir, 'SECURITY.md'), '# s')
    const out = proposeMapCandidates({
      projectRoot: tmpDir, resolvedSteps: ALL_STEPS,
      satisfiedSteps: new Set(), existingMap: {},
    })
    expect(out).toEqual([
      { step: 'coding-standards', target: 'CONTRIBUTING.md', evidence: 'CONTRIBUTING.md exists' },
      { step: 'security', target: 'SECURITY.md', evidence: 'SECURITY.md exists' },
    ])
  })

  it('never proposes for satisfied, already-mapped, or unresolved steps', () => {
    fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# c')
    fs.writeFileSync(path.join(tmpDir, 'SECURITY.md'), '# s')
    fs.writeFileSync(path.join(tmpDir, 'ARCHITECTURE.md'), '# a')
    const out = proposeMapCandidates({
      projectRoot: tmpDir,
      resolvedSteps: ['coding-standards', 'security'],      // system-architecture not resolved
      satisfiedSteps: new Set(['security']),                 // security already verified
      existingMap: { 'coding-standards': 'docs/style.md' },  // already mapped
    })
    expect(out).toEqual([])
  })

  it('README.md is never a candidate source', () => {
    for (const { paths } of CANDIDATE_SOURCES) {
      expect(paths).not.toContain('README.md')
      expect(paths).not.toContain('docs/README.md')
    }
  })

  it('README.md never surfaces as a proposed target even if it is the only doc present', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# readme')
    const out = proposeMapCandidates({
      projectRoot: tmpDir, resolvedSteps: ALL_STEPS,
      satisfiedSteps: new Set(), existingMap: {},
    })
    expect(out).toEqual([])
  })

  it('excludes a candidate whose path is a symlink escaping the project root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
    try {
      fs.writeFileSync(path.join(outside, 'secret.md'), '# secret')
      fs.symlinkSync(path.join(outside, 'secret.md'), path.join(tmpDir, 'SECURITY.md'))
      const out = proposeMapCandidates({
        projectRoot: tmpDir, resolvedSteps: ALL_STEPS,
        satisfiedSteps: new Set(), existingMap: {},
      })
      expect(out.find(c => c.step === 'security')).toBeUndefined()
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })
})
