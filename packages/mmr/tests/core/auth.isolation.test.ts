import { describe, it, expect } from 'vitest'
import { checkAuth } from '../../src/core/auth.js'
import { NEUTRAL_HOME_PLACEHOLDER } from '../../src/core/host-isolation.js'

describe('auth probe — neutral posture', () => {
  it('runs the auth check under an expanded isolated HOME (no literal placeholder)', async () => {
    const res = await checkAuth({
      kind: 'subprocess',
      command: 'true',
      env: { HOME: NEUTRAL_HOME_PLACEHOLDER },
      flags: [], prompt_wrapper: '{{prompt}}', output_parser: 'default',
      stderr: 'capture', abstract: false, enabled: true,
      auth: {
        check: 'case "$HOME" in *mmr-grok-*) exit 0;; *) exit 1;; esac',
        timeout: 10, failure_exit_codes: [1], recovery: 'n/a',
      },
    } as never)
    expect(res.status).toBe('ok')
  })
})
