import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveConfigPaths } from '../../src/config/paths.js'

describe('resolveConfigPaths', () => {
  it('reports user and project paths and existence', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-home-'))
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-proj-'))
    fs.mkdirSync(path.join(home, '.mmr'))
    fs.writeFileSync(path.join(home, '.mmr', 'config.yaml'), 'version: 1\n')
    const r = resolveConfigPaths({ projectRoot: proj, userHome: home })
    expect(r.user).toBe(path.join(home, '.mmr', 'config.yaml'))
    expect(r.project).toBe(path.join(proj, '.mmr.yaml'))
    expect(r.userExists).toBe(true)
    expect(r.projectExists).toBe(false)
    fs.rmSync(home, { recursive: true })
    fs.rmSync(proj, { recursive: true })
  })
})
