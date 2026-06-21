import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildRepoContext } from '../../src/core/critique-context.js'

const tmps: string[] = []
function repo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crit-ctx-'))
  tmps.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
  }
  return dir
}
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

describe('buildRepoContext', () => {
  it('reads explicit paths and lists them in used', () => {
    const cwd = repo({ 'src/app.ts': 'export const x = 1', 'README.md': '# hi' })
    const out = buildRepoContext({ cwd, explicitPaths: ['src/app.ts'], artifact: 'design' })
    expect(out.context).toContain('export const x = 1')
    expect(out.used).toContain('src/app.ts')
  })

  it('refuses to read a path that escapes the repo root', () => {
    const cwd = repo({ 'a.ts': 'inside' })
    const out = buildRepoContext({ cwd, explicitPaths: ['../../../etc/passwd'], artifact: 'd' })
    expect(out.used).not.toContain('../../../etc/passwd')
    expect(out.context).not.toContain('root:')
  })

  it('skeleton pulls in manifests + README', () => {
    const cwd = repo({ 'package.json': '{"name":"demo"}', 'README.md': '# Demo project', 'src/i.ts': 'x' })
    const out = buildRepoContext({ cwd, artifact: 'a generic design with no path references' })
    expect(out.used).toContain('package.json')
    expect(out.used).toContain('README.md')
    expect(out.context).toContain('demo')
  })

  it('pulls in files referenced by the artifact', () => {
    const cwd = repo({ 'src/notify.ts': 'export function notify(){}', 'README.md': '#' })
    const out = buildRepoContext({ cwd, artifact: 'The change touches src/notify.ts and adds a webhook.' })
    expect(out.used).toContain('src/notify.ts')
  })

  it('includes a repo tree that excludes node_modules', () => {
    const cwd = repo({ 'src/a.ts': 'x', 'node_modules/dep/index.js': 'junk', 'README.md': '#' })
    const out = buildRepoContext({ cwd, artifact: 'd' })
    expect(out.context).toMatch(/tree|structure/i)
    expect(out.context).not.toContain('node_modules/dep')
  })

  it('refuses a repo-local symlink that points outside the repo', () => {
    const secret = fs.mkdtempSync(path.join(os.tmpdir(), 'crit-secret-'))
    tmps.push(secret)
    fs.writeFileSync(path.join(secret, 'passwd'), 'SECRET-OUTSIDE-CONTENT')
    const cwd = repo({ 'README.md': '#' })
    fs.symlinkSync(path.join(secret, 'passwd'), path.join(cwd, 'link.txt'))
    const out = buildRepoContext({ cwd, explicitPaths: ['link.txt'], artifact: 'd' })
    expect(out.context).not.toContain('SECRET-OUTSIDE-CONTENT')
    expect(out.used).not.toContain('link.txt')
  })

  it('does not fold in ignored dirs or duplicate paths via explicit paths', () => {
    const cwd = repo({ 'node_modules/dep/i.js': 'junk', 'src/a.ts': 'real' })
    const out = buildRepoContext({ cwd, explicitPaths: ['node_modules/dep/i.js', 'src/a.ts', 'src/a.ts'], artifact: 'd' })
    expect(out.used).not.toContain('node_modules/dep/i.js')
    expect(out.used.filter((u) => u === 'src/a.ts')).toHaveLength(1)
  })

  it('caps total output to the budget', () => {
    const big = 'x'.repeat(5000)
    const cwd = repo({ 'README.md': big, 'package.json': '{"name":"d"}', 'src/a.ts': big })
    const out = buildRepoContext({ cwd, artifact: 'd', budgetChars: 1500 })
    expect(out.context.length).toBeLessThan(3000)
    expect(out.context.toLowerCase()).toContain('truncat')
  })
})
