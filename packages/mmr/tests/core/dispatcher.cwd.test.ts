import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dispatchChannel } from '../../src/core/dispatcher.js'
import { NEUTRAL_HOME_PLACEHOLDER, NEUTRAL_CWD_PLACEHOLDER } from '../../src/core/host-isolation.js'
import { JobStore } from '../../src/core/job-store.js'

describe('dispatcher — neutral posture', () => {
  it('expands {{neutral_*}} and runs the process in an isolated cwd/HOME', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-disp-test-'))
    try {
      const store = new JobStore(root)
      const job = store.createJob({
        fix_threshold: 'P2',
        format: 'json',
        channels: ['grok'],
      })
      const out = path.join(root, 'probe-out.txt')

      await dispatchChannel(store, job.job_id, 'grok', {
        command: 'sh',
        prompt: '',
        flags: ['-c', `printf '%s|%s' "$PWD" "$HOME" > ${out}`],
        env: { HOME: NEUTRAL_HOME_PLACEHOLDER },
        cwd: NEUTRAL_CWD_PLACEHOLDER,
        timeout: 30,
        stderr: 'suppress',
      })

      // dispatchChannel resolves after close — no polling needed
      const [pwdRaw, homeRaw] = fs.readFileSync(out, 'utf8').split('|')
      // Resolve symlinks on the tmpdir root (e.g. macOS /tmp → /private/tmp)
      // then reconstruct each path using the canonical root so comparisons are
      // exact without relying on string substitution. The isolated dirs have
      // already been cleaned up by posture.cleanup() at this point, so we
      // cannot realpathSync the full path — resolving the parent is sufficient.
      const canonicalTmpdir = fs.realpathSync(os.tmpdir())
      const canonicalize = (p: string) => {
        const base = path.basename(p)
        return path.join(canonicalTmpdir, base)
      }
      const pwd = canonicalize(pwdRaw)
      const home = canonicalize(homeRaw)
      expect(pwd).toContain('mmr-grok-')
      expect(home).toBe(pwd)
      expect(pwdRaw).not.toContain('{{')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
