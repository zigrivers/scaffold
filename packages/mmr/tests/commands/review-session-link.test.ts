import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runCli } from '../../src/cli.js'

class ExitError extends Error {}

const originalHome = process.env.HOME
const originalMmrHome = process.env.MMR_HOME

afterEach(() => {
  process.env.HOME = originalHome
  process.env.MMR_HOME = originalMmrHome
  vi.restoreAllMocks()
})

describe('review - auto-link to session', () => {
  it('auto-creates the session and appends the job on first review', async () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-link-'))
    process.env.HOME = tmpHome
    delete process.env.MMR_HOME
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new ExitError(`process.exit(${String(code)})`)
    }) as never)
    try {
      await expect(runCli(['review', '--diff', '/dev/null', '--session', 'feat-foo', '--round', '1']))
        .rejects.toThrow(ExitError)
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
