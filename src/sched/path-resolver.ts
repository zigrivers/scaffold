import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export interface PathProbes {
  home: string
  execPath: string
  exists(p: string): boolean
  /** FUNCTIONAL java test (`/usr/bin/java -version`), not `command -v` —
   *  macOS ships a stub that exists but fails at run time (rumble lesson). */
  javaWorks(): boolean
}

export function defaultProbes(): PathProbes {
  return {
    home: os.homedir(),
    execPath: process.execPath,
    exists: p => fs.existsSync(p),
    javaWorks: () => {
      try {
        execFileSync('/usr/bin/java', ['-version'], { stdio: 'ignore', timeout: 10_000 })
        return true
      } catch {
        return false
      }
    },
  }
}

/** Stable fnm alias bin — survives fnm version switches; launchd/systemd run
 *  no shell init, so the fnm hook never fires (rumble launchd PATH lesson). */
export function fnmAliasBin(p: PathProbes): string | null {
  const candidate = path.join(p.home, '.local', 'share', 'fnm', 'aliases', 'default', 'bin')
  return p.exists(candidate) ? candidate : null
}

/** Keg-only Homebrew openjdk, prepended ONLY when /usr/bin/java is a
 *  non-functional stub (see Task 2 note — per-project need is probed by the
 *  generated gate script itself, not here). */
export function openjdkBin(p: PathProbes): string | null {
  if (p.javaWorks()) return null
  for (const c of ['/opt/homebrew/opt/openjdk/bin', '/usr/local/opt/openjdk/bin']) {
    if (p.exists(c)) return c
  }
  return null
}

export function homebrewBin(p: PathProbes): string | null {
  for (const c of ['/opt/homebrew/bin', '/usr/local/bin']) {
    if (p.exists(c)) return c
  }
  return null
}

/** Absolute node bin dir: fnm stable alias when present, else the running
 *  node's own directory (process.execPath is always absolute). */
export function nodeBinDir(p: PathProbes): string {
  return fnmAliasBin(p) ?? path.dirname(p.execPath)
}

export function buildSchedPath(p: PathProbes): string {
  const parts: string[] = [nodeBinDir(p)]
  const jdk = openjdkBin(p)
  if (jdk !== null) parts.push(jdk)
  const brew = homebrewBin(p)
  if (brew !== null) parts.push(brew)
  parts.push('/usr/bin', '/bin', '/usr/sbin', '/sbin')
  return [...new Set(parts)].join(':')
}
