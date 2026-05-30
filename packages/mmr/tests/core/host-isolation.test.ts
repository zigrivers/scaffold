import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  NEUTRAL_HOME_PLACEHOLDER,
  NEUTRAL_CWD_PLACEHOLDER,
  withNeutralPosture,
  sweepStaleNeutralDirs,
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

describe('sweepStaleNeutralDirs', () => {
  const created: string[] = []
  afterEach(() => {
    for (const d of created.splice(0)) {
      try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* best effort */ }
    }
  })

  it('removes stale mmr-grok-* dirs and keeps fresh and non-matching dirs', () => {
    const tmp = os.tmpdir()

    // Create a stale mmr-grok-* dir
    const staleDir = fs.mkdtempSync(path.join(tmp, 'mmr-grok-'))
    created.push(staleDir)
    // Set mtime to 2 hours in the past
    const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000)
    fs.utimesSync(staleDir, oldTime, oldTime)

    // Create a fresh mmr-grok-* dir (mtime = now)
    const freshDir = fs.mkdtempSync(path.join(tmp, 'mmr-grok-'))
    created.push(freshDir)

    // Create a non-matching dir — should never be touched
    const otherDir = fs.mkdtempSync(path.join(tmp, 'not-mmr-'))
    created.push(otherDir)

    // Sweep with 1-hour max age — stale (2h) should be removed, fresh should survive
    sweepStaleNeutralDirs(60 * 60 * 1000)

    expect(fs.existsSync(staleDir)).toBe(false)
    expect(fs.existsSync(freshDir)).toBe(true)
    expect(fs.existsSync(otherDir)).toBe(true)
  })
})
