import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { scanIncumbents } from './incumbents.js'

let tmpDir: string
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'incumbents-')) })
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

describe('scanIncumbents', () => {
  it('returns empty inventory for an empty project', () => {
    const inv = scanIncumbents(tmpDir)
    expect(inv).toEqual({
      lintConfigs: [], testConfigs: [], ciWorkflows: [], composeFiles: [], docs: [],
    })
  })

  it('finds lint, test, compose, workflow, and doc incumbents', () => {
    fs.writeFileSync(path.join(tmpDir, 'biome.json'), '{}')
    fs.writeFileSync(path.join(tmpDir, 'vitest.config.ts'), 'export default {}')
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), 'services: {}')
    fs.mkdirSync(path.join(tmpDir, '.github/workflows'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.github/workflows/test.yml'), 'on: push')
    fs.mkdirSync(path.join(tmpDir, 'docs'))
    fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# c')
    fs.writeFileSync(path.join(tmpDir, 'docs/ARCHITECTURE.md'), '# a')
    const inv = scanIncumbents(tmpDir)
    expect(inv.lintConfigs).toEqual(['biome.json'])
    expect(inv.testConfigs).toEqual(['vitest.config.ts'])
    expect(inv.composeFiles).toEqual(['docker-compose.yml'])
    expect(inv.ciWorkflows).toEqual([path.join('.github', 'workflows', 'test.yml')])
    expect(inv.docs).toContain('CONTRIBUTING.md')
    expect(inv.docs).toContain(path.join('docs', 'ARCHITECTURE.md'))
  })

  it('excludes an incumbent whose path is a symlink escaping the project root', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
    try {
      fs.writeFileSync(path.join(outside, 'real.json'), '{}')
      fs.symlinkSync(path.join(outside, 'real.json'), path.join(tmpDir, 'biome.json'))
      const inv = scanIncumbents(tmpDir)
      expect(inv.lintConfigs).toEqual([])
    } finally {
      fs.rmSync(outside, { recursive: true, force: true })
    }
  })
})
