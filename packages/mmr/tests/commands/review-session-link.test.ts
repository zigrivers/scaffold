import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const mmrBin = path.resolve(__dirname, '../../dist/index.js')

describe('review - auto-link to session', () => {
  it('auto-creates the session and appends the job on first review', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-link-'))
    try {
      try {
        execFileSync('node', [mmrBin, 'review', '--diff', '/dev/null', '--session', 'feat-foo', '--round', '1'], {
          encoding: 'utf-8',
          env: { ...process.env, HOME: tmpHome, MMR_HOME: undefined },
        })
      } catch {
        // expected - empty diff
      }
      const sessionFile = path.join(tmpHome, '.mmr', 'sessions', 'feat-foo.json')
      expect(fs.existsSync(sessionFile)).toBe(true)
      const session = JSON.parse(fs.readFileSync(sessionFile, 'utf-8')) as { session_id: string; jobs: string[] }
      expect(session.session_id).toBe('feat-foo')
      expect(session).toHaveProperty('jobs')
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
    }
  })
})
