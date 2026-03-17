import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

const DIST = path.resolve(process.cwd(), 'dist/index.js')
const KNOWLEDGE_SRC = path.resolve(process.cwd(), 'knowledge')
const PIPELINE_SRC = path.resolve(process.cwd(), 'pipeline')

function scaffold(args: string, cwd: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const result = execSync(`node ${DIST} ${args}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout: result, stderr: '', exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    }
  }
}

function setupProject(dir: string) {
  const scaffoldDir = path.join(dir, '.scaffold')
  fs.mkdirSync(scaffoldDir, { recursive: true })
  fs.writeFileSync(
    path.join(scaffoldDir, 'config.yml'),
    'version: 2\nmethodology: deep\nplatforms:\n  - claude-code\n'
  )
  fs.writeFileSync(
    path.join(scaffoldDir, 'state.json'),
    JSON.stringify({
      'schema-version': 1,
      'scaffold-version': '2.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: new Date().toISOString(),
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    })
  )
  // Symlink knowledge and pipeline from source (read-only)
  fs.symlinkSync(KNOWLEDGE_SRC, path.join(dir, 'knowledge'))
  fs.symlinkSync(PIPELINE_SRC, path.join(dir, 'pipeline'))
}

describe('scaffold knowledge (E2E)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-e2e-knowledge-'))
    setupProject(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('list: exits 0 and prints global entries', () => {
    const { stdout, exitCode } = scaffold('knowledge list', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/api-design|testing-strategy|prd-craft/)
  })

  it('list: shows local override as "local override" when one exists', () => {
    const localKbDir = path.join(tmpDir, '.scaffold', 'knowledge')
    fs.mkdirSync(localKbDir, { recursive: true })
    fs.writeFileSync(
      path.join(localKbDir, 'api-design.md'),
      '---\nname: api-design\ndescription: Custom GraphQL API design\ntopics: [api, graphql]\n---\n# Custom'
    )
    const { stdout, exitCode } = scaffold('knowledge list', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('local override')
    expect(stdout).toContain('api-design')
  })

  it('show: exits 0 and prints content for a known entry', () => {
    const { stdout, exitCode } = scaffold('knowledge show api-design', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout.length).toBeGreaterThan(50)
  })

  it('show: exits 1 for unknown entry', () => {
    const { exitCode } = scaffold('knowledge show totally-unknown-entry-xyz', tmpDir)
    expect(exitCode).toBe(1)
  })

  it('reset: exits 0 with "Nothing to reset" when no local override', () => {
    const { stdout, exitCode } = scaffold('knowledge reset api-design', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Nothing to reset')
  })

  it('reset: removes local override file', () => {
    const localKbDir = path.join(tmpDir, '.scaffold', 'knowledge')
    fs.mkdirSync(localKbDir, { recursive: true })
    const overridePath = path.join(localKbDir, 'api-design.md')
    fs.writeFileSync(
      overridePath,
      '---\nname: api-design\ndescription: Custom\ntopics: []\n---\n# Custom'
    )
    const { exitCode } = scaffold('knowledge reset api-design --auto', tmpDir)
    expect(exitCode).toBe(0)
    expect(fs.existsSync(overridePath)).toBe(false)
  })

  it('update: exits 0 and writes assembled prompt to stdout', () => {
    const { stdout, exitCode } = scaffold('knowledge update api-design', tmpDir)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('api-design')
    expect(stdout.length).toBeGreaterThan(100)
  })

  it('update: exits 1 for unknown target', () => {
    const { exitCode } = scaffold('knowledge update totally-unknown-target-xyz', tmpDir)
    expect(exitCode).toBe(1)
  })
})
