import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const NEUTRAL_HOME_PLACEHOLDER = '{{neutral_home}}'
export const NEUTRAL_CWD_PLACEHOLDER = '{{neutral_cwd}}'
// This helper is grok-specific in practice: the only channel that opts into the
// neutral-posture placeholders is the builtin `grok` channel, and the
// credential-preservation step below knows about grok's `~/.grok/auth.json`.
// Hence the `mmr-grok-` temp-dir prefix. If another agentic CLI ever needs
// isolation, generalize the prefix + credential path together.
const PREFIX = 'mmr-grok-'

export interface NeutralPosture {
  env: Record<string, string>
  cwd?: string
  /** Synchronous, idempotent removal of any dir this call created. */
  cleanup: () => void
}

function needsIsolation(env: Record<string, string>, cwd?: string): boolean {
  if (cwd === NEUTRAL_CWD_PLACEHOLDER) return true
  return Object.values(env).some((v) => v === NEUTRAL_HOME_PLACEHOLDER)
}

/**
 * Expand {{neutral_home}}/{{neutral_cwd}} placeholders into a single fresh
 * per-call temp directory (unique → safe for parallel channel runs; each call
 * owns its dir lifetime). Returns the concrete env/cwd plus a synchronous
 * cleanup fn. When no placeholder is present, returns the inputs unchanged with
 * a no-op cleanup.
 */
export function withNeutralPosture(env: Record<string, string>, cwd?: string): NeutralPosture {
  if (!needsIsolation(env, cwd)) {
    return { env, cwd, cleanup: () => {} }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), PREFIX))
  // mkdtemp already creates 0700, but enforce it explicitly: this dir holds a
  // credential symlink and whatever grok writes to its HOME during a review.
  try { fs.chmodSync(dir, 0o700) } catch { /* best effort */ }

  // Preserve grok's file-backed credentials so an isolated HOME doesn't break
  // auth on non-keychain platforms (Linux/CI store creds at ~/.grok/auth.json).
  // We symlink ONLY auth.json — NOT config.toml/skills/, so host config stays empty.
  try {
    const realHome = process.env.HOME || os.homedir()
    const cred = path.join(realHome, '.grok', 'auth.json')
    if (fs.existsSync(cred)) {
      const grokDir = path.join(dir, '.grok')
      fs.mkdirSync(grokDir, { recursive: true })
      fs.chmodSync(grokDir, 0o700)
      fs.symlinkSync(cred, path.join(grokDir, 'auth.json'))
    }
  } catch { /* best effort — keychain platforms don't need it */ }

  const outEnv: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    outEnv[k] = v === NEUTRAL_HOME_PLACEHOLDER ? dir : v
  }
  const outCwd = cwd === NEUTRAL_CWD_PLACEHOLDER ? dir : cwd
  // When we neutralize the cwd, also override the inherited cwd-pointing env
  // vars. The dispatcher/auth spawn with `cwd: outCwd` (a real chdir), but
  // PWD/OLDPWD/INIT_CWD still flow from process.env and would otherwise point
  // at the original working tree — tools that trust $PWD over getcwd() could
  // then read the repo. Pin them all to the neutral dir.
  if (outCwd === dir) {
    outEnv.PWD = dir
    outEnv.OLDPWD = dir
    outEnv.INIT_CWD = dir
  }
  let removed = false
  return {
    env: outEnv,
    cwd: outCwd,
    cleanup: () => {
      if (removed) return
      removed = true
      try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
    },
  }
}

/**
 * Backstop for dirs orphaned by SIGKILL/crashes: remove stale mmr-grok-* temp
 * dirs older than `maxAgeMs`. Call once at process start. Best-effort/sync.
 * Default is 24h — comfortably longer than any plausible review timeout, so the
 * sweep never reaps the HOME/cwd of a still-running long review.
 */
export function sweepStaleNeutralDirs(maxAgeMs = 24 * 60 * 60 * 1000): void {
  const tmp = os.tmpdir()
  let entries: string[] = []
  try { entries = fs.readdirSync(tmp) } catch { return }
  const now = Date.now()
  for (const name of entries) {
    if (!name.startsWith(PREFIX)) continue
    const full = path.join(tmp, name)
    try {
      const st = fs.statSync(full)
      if (st.isDirectory() && now - st.mtimeMs > maxAgeMs) fs.rmSync(full, { recursive: true, force: true })
    } catch { /* best effort */ }
  }
}
