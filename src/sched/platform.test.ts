import { describe, it, expect, afterEach } from 'vitest'
import { pickSchedBackend } from './platform.js'

const realPlatform = process.platform

function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

describe('pickSchedBackend', () => {
  afterEach(() => setPlatform(realPlatform))

  it('returns the launchd backend on darwin', () => {
    setPlatform('darwin')
    expect(pickSchedBackend().platform).toBe('launchd')
  })

  it('returns the systemd backend on linux', () => {
    setPlatform('linux')
    expect(pickSchedBackend().platform).toBe('systemd')
  })

  it('throws a clear error naming both platforms on an unsupported OS', () => {
    setPlatform('win32')
    expect(() => pickSchedBackend()).toThrow(/unsupported platform "win32"/)
    expect(() => pickSchedBackend()).toThrow(/launchd on macOS, systemd on Linux/)
  })
})
