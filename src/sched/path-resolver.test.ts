import { describe, expect, it } from 'vitest'
import {
  buildSchedPath, fnmAliasBin, homebrewBin, nodeBinDir, openjdkBin, type PathProbes,
} from './path-resolver.js'

function probes(overrides: Partial<PathProbes> & { existing?: string[] }): PathProbes {
  const existing = new Set(overrides.existing ?? [])
  return {
    home: overrides.home ?? '/Users/ken',
    execPath: overrides.execPath ?? '/usr/local/nodes/v22/bin/node',
    exists: p => existing.has(p),
    javaWorks: overrides.javaWorks ?? (() => true),
  }
}

describe('path-resolver', () => {
  it('prefers the stable fnm alias dir over process.execPath', () => {
    const p = probes({ existing: ['/Users/ken/.local/share/fnm/aliases/default/bin'] })
    expect(fnmAliasBin(p)).toBe('/Users/ken/.local/share/fnm/aliases/default/bin')
    expect(nodeBinDir(p)).toBe('/Users/ken/.local/share/fnm/aliases/default/bin')
  })
  it('falls back to the execPath dir when no fnm alias exists', () => {
    const p = probes({ existing: [] })
    expect(fnmAliasBin(p)).toBeNull()
    expect(nodeBinDir(p)).toBe('/usr/local/nodes/v22/bin')
  })
  it('prepends Homebrew openjdk ONLY when /usr/bin/java is a stub', () => {
    const stub = probes({ existing: ['/opt/homebrew/opt/openjdk/bin'], javaWorks: () => false })
    expect(openjdkBin(stub)).toBe('/opt/homebrew/opt/openjdk/bin')
    const working = probes({ existing: ['/opt/homebrew/opt/openjdk/bin'], javaWorks: () => true })
    expect(openjdkBin(working)).toBeNull()
  })
  it('builds the rumble-shaped PATH: fnm alias, openjdk, brew, then system dirs', () => {
    const p = probes({
      existing: [
        '/Users/ken/.local/share/fnm/aliases/default/bin',
        '/opt/homebrew/opt/openjdk/bin',
        '/opt/homebrew/bin',
      ],
      javaWorks: () => false,
    })
    expect(homebrewBin(p)).toBe('/opt/homebrew/bin')
    expect(buildSchedPath(p)).toBe(
      // eslint-disable-next-line max-len
      '/Users/ken/.local/share/fnm/aliases/default/bin:/opt/homebrew/opt/openjdk/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    )
  })
  it('omits absent optional dirs and never duplicates entries', () => {
    const p = probes({ existing: [], execPath: '/usr/bin/node' })
    expect(buildSchedPath(p)).toBe('/usr/bin:/bin:/usr/sbin:/sbin')
  })
})
