import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import {
  NEUTRAL_HOME_PLACEHOLDER,
  NEUTRAL_CWD_PLACEHOLDER,
  withNeutralPosture,
} from '../../src/core/host-isolation.js'

describe('withNeutralPosture', () => {
  const made: string[] = []
  afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

  it('passes env/cwd through unchanged when no placeholder is present', () => {
    const r = withNeutralPosture({ FOO: 'bar' }, '/some/dir')
    expect(r.env).toEqual({ FOO: 'bar' })
    expect(r.cwd).toBe('/some/dir')
    r.cleanup()
  })

  it('creates a real, unique dir and substitutes both placeholders', () => {
    const a = withNeutralPosture(
      { HOME: NEUTRAL_HOME_PLACEHOLDER, XDG_CONFIG_HOME: NEUTRAL_HOME_PLACEHOLDER },
      NEUTRAL_CWD_PLACEHOLDER,
    )
    made.push(a.cwd!)
    expect(a.env.HOME).toBe(a.cwd)                 // same per-call dir reused
    expect(a.env.XDG_CONFIG_HOME).toBe(a.cwd)
    expect(fs.existsSync(a.cwd!)).toBe(true)
    expect(a.cwd!).toContain('mmr-grok-')

    const b = withNeutralPosture({ HOME: NEUTRAL_HOME_PLACEHOLDER }, undefined)
    made.push(b.env.HOME!)
    expect(b.env.HOME).not.toBe(a.env.HOME)        // unique per call
    a.cleanup(); b.cleanup()
  })

  it('cleanup removes the created dir', () => {
    const r = withNeutralPosture({ HOME: NEUTRAL_HOME_PLACEHOLDER }, NEUTRAL_CWD_PLACEHOLDER)
    const dir = r.cwd!
    expect(fs.existsSync(dir)).toBe(true)
    r.cleanup()
    expect(fs.existsSync(dir)).toBe(false)
  })
})
