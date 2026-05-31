import { describe, it, expect, afterEach, beforeEach } from 'vitest'
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

  it('pins cwd-pointing env vars (PWD/OLDPWD/INIT_CWD) to the neutral dir when cwd is neutralized', () => {
    const r = withNeutralPosture({ HOME: NEUTRAL_HOME_PLACEHOLDER }, NEUTRAL_CWD_PLACEHOLDER)
    made.push(r.cwd!)
    expect(r.env.PWD).toBe(r.cwd)
    expect(r.env.OLDPWD).toBe(r.cwd)
    expect(r.env.INIT_CWD).toBe(r.cwd)
    r.cleanup()
  })

  it('does NOT inject PWD when cwd is not neutralized (HOME-only isolation)', () => {
    const r = withNeutralPosture({ HOME: NEUTRAL_HOME_PLACEHOLDER }, undefined)
    made.push(r.env.HOME!)
    expect(r.env.PWD).toBeUndefined()
    r.cleanup()
  })

  describe('grok credential preservation', () => {
    let fakeHome: string
    let origHome: string | undefined

    beforeEach(() => {
      origHome = process.env.HOME
      fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-test-home-'))
      // Create a .grok dir with auth.json AND config.toml AND skills/
      fs.mkdirSync(path.join(fakeHome, '.grok', 'skills'), { recursive: true })
      fs.writeFileSync(path.join(fakeHome, '.grok', 'auth.json'), '{"token":"test"}')
      fs.writeFileSync(path.join(fakeHome, '.grok', 'config.toml'), '[settings]')
      fs.writeFileSync(path.join(fakeHome, '.grok', 'skills', 'x'), 'skill-x')
      process.env.HOME = fakeHome
    })

    afterEach(() => {
      if (origHome === undefined) {
        delete process.env.HOME
      } else {
        process.env.HOME = origHome
      }
      try { fs.rmSync(fakeHome, { recursive: true, force: true }) } catch { /* best effort */ }
    })

    it('symlinks only auth.json into the neutral dir — not config.toml or skills/', () => {
      const r = withNeutralPosture({ HOME: NEUTRAL_HOME_PLACEHOLDER }, NEUTRAL_CWD_PLACEHOLDER)
      const neutralDir = r.cwd!
      made.push(neutralDir)

      // auth.json must be present (symlinked)
      expect(fs.existsSync(path.join(neutralDir, '.grok', 'auth.json'))).toBe(true)
      // config.toml must NOT be present
      expect(fs.existsSync(path.join(neutralDir, '.grok', 'config.toml'))).toBe(false)
      // skills/ must NOT be present
      expect(fs.existsSync(path.join(neutralDir, '.grok', 'skills'))).toBe(false)

      r.cleanup()
      // cleanup removes the symlink, NOT the original credential file
      expect(fs.existsSync(path.join(fakeHome, '.grok', 'auth.json'))).toBe(true)
    })

    it('is a no-op when no placeholder is present (non-isolated channels unaffected)', () => {
      const r = withNeutralPosture({ HOME: fakeHome }, '/some/cwd')
      // Non-isolated: returned env unchanged, no neutral dir created
      expect(r.env.HOME).toBe(fakeHome)
      r.cleanup()
    })

    it('does NOT symlink grok creds for a cwd-only neutral posture (no HOME neutralization)', () => {
      // antigravity's posture: neutral cwd, real HOME (env has no HOME placeholder).
      const r = withNeutralPosture({}, NEUTRAL_CWD_PLACEHOLDER)
      const neutralDir = r.cwd!
      made.push(neutralDir)

      // The neutral cwd must be genuinely empty — no .grok dir at all.
      expect(fs.existsSync(path.join(neutralDir, '.grok'))).toBe(false)
      // PWD pinning still applies for cwd neutralization.
      expect(r.env.PWD).toBe(neutralDir)

      r.cleanup()
      // Original credential untouched.
      expect(fs.existsSync(path.join(fakeHome, '.grok', 'auth.json'))).toBe(true)
    })

    it('still symlinks grok creds when HOME is neutralized (grok-style posture unaffected)', () => {
      const r = withNeutralPosture(
        { HOME: NEUTRAL_HOME_PLACEHOLDER, XDG_CONFIG_HOME: NEUTRAL_HOME_PLACEHOLDER },
        NEUTRAL_CWD_PLACEHOLDER,
      )
      made.push(r.cwd!)
      expect(fs.existsSync(path.join(r.cwd!, '.grok', 'auth.json'))).toBe(true)
      r.cleanup()
    })

    it('does NOT symlink grok creds when only XDG_CONFIG_HOME is neutralized (HOME left real)', () => {
      // Locks the documented invariant: the gate keys on the HOME env var, so an
      // isolation that neutralizes only XDG_CONFIG_HOME must not inherit grok's creds.
      const r = withNeutralPosture({ XDG_CONFIG_HOME: NEUTRAL_HOME_PLACEHOLDER }, undefined)
      made.push(r.env.XDG_CONFIG_HOME!)
      expect(fs.existsSync(path.join(r.env.XDG_CONFIG_HOME!, '.grok'))).toBe(false)
      r.cleanup()
    })
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

  it('does NOT remove a stale FILE named mmr-grok-something (only dirs are swept)', () => {
    const tmp = os.tmpdir()

    // Create a file (not a directory) with an mmr-grok-* name
    const staleFile = path.join(tmp, 'mmr-grok-stale-file-test')
    fs.writeFileSync(staleFile, 'not a dir')
    created.push(staleFile)
    // Set mtime to 2 hours in the past
    const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000)
    fs.utimesSync(staleFile, oldTime, oldTime)

    // Sweep with 1-hour max age — file should survive because it's not a directory
    sweepStaleNeutralDirs(60 * 60 * 1000)

    expect(fs.existsSync(staleFile)).toBe(true)
  })
})
