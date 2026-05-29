import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { listGuides, resolveGuide } from '../cli/commands/guides.js'

const FM = '---\ntitle: MMR\ntopic: mmr\ndescription: review\ncategory: tools\norder: 10\n---\n# x\n'

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-'))
  const dir = path.join(root, 'content', 'guides', 'mmr')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.md'), FM)
  fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>')
  return root
}

describe('--no-open flag (yargs strict regression)', () => {
  it('accepts --no-open without a strict-mode rejection', () => {
    const cli = path.resolve('dist/index.js')
    const out = execFileSync('node', [cli, 'guides', '--no-open', '--list', '--format', 'json'], { encoding: 'utf8' })
    const parsed = JSON.parse(out) as { success: boolean }
    expect(parsed.success).toBe(true)
  })
})

describe('listGuides', () => {
  it('returns guide summaries sorted by order', () => {
    const list = listGuides(fixture())
    expect(list).toEqual([{ topic: 'mmr', title: 'MMR', description: 'review', category: 'tools' }])
  })
})

describe('resolveGuide', () => {
  it('returns md and html paths for a topic', () => {
    const root = fixture()
    const g = resolveGuide(root, 'mmr')!
    expect(g.mdPath.endsWith(path.join('mmr', 'index.md'))).toBe(true)
    expect(g.htmlPath.endsWith(path.join('mmr', 'index.html'))).toBe(true)
  })

  it('returns null for an unknown topic', () => {
    expect(resolveGuide(fixture(), 'nope')).toBeNull()
  })
})
