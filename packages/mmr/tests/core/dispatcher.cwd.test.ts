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
      // Normalize symlinks at path level (no stat needed): macOS /tmp → /private/tmp.
      // Resolve via os.tmpdir() which gives the same canonical base both sides use.
      const tmp = os.tmpdir()
      const normalizeTmpPath = (p: string) => {
        // Replace both /tmp/... and /private/tmp/... variants with a common base
        return p.replace(/^\/private\/tmp\//, '/tmp/')
      }
      const pwd = normalizeTmpPath(pwdRaw)
      const home = normalizeTmpPath(homeRaw)
      void tmp // used indirectly for documentation
      expect(pwd).toContain('mmr-grok-')
      expect(home).toBe(pwd)
      expect(pwdRaw).not.toContain('{{')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
