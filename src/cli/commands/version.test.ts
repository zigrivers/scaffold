import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { EventEmitter } from 'node:events'

// Mock https for testing the real fetchLatestVersion
const mockHttpsGet = vi.fn()
vi.mock('node:https', () => ({
  default: { get: (...args: unknown[]) => mockHttpsGet(...args) },
  get: (...args: unknown[]) => mockHttpsGet(...args),
}))

import versionCommand, { fetchLatestVersion } from './version.js'

type HandlerFn = (argv: Record<string, unknown>) => Promise<void>

const nullFetch = async () => null

describe('version command', () => {
  let stdoutWrite: MockInstance<typeof process.stdout.write>
  let stderrWrite: MockInstance<typeof process.stderr.write>
  let exitSpy: MockInstance

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads version from package.json and includes it in output', async () => {
    const handler = versionCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, _fetchLatestVersion: nullFetch }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toMatch(/\d+\.\d+\.\d+/)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('interactive output starts with "scaffold v"', async () => {
    const handler = versionCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, _fetchLatestVersion: nullFetch }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('scaffold v')
  })

  it('JSON output has version, node_version, and platform fields', async () => {
    const handler = versionCommand.handler as HandlerFn
    await expect(
      handler({ format: 'json', auto: undefined, _fetchLatestVersion: nullFetch }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: {
        version: string
        node_version: string
        platform: string
        latest_version: string | null
        update_available: boolean | null
      }
    }
    expect(parsed.success).toBe(true)
    expect(typeof parsed.data.version).toBe('string')
    expect(parsed.data.version).toMatch(/\d+\.\d+\.\d+/)
    expect(typeof parsed.data.node_version).toBe('string')
    expect(typeof parsed.data.platform).toBe('string')
  })

  it('latest_version is null when network check fails', async () => {
    const handler = versionCommand.handler as HandlerFn
    await expect(
      handler({ format: 'json', auto: undefined, _fetchLatestVersion: nullFetch }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: { latest_version: string | null; update_available: boolean | null }
    }
    expect(parsed.data.latest_version).toBeNull()
  })

  it('update_available is null when latest_version is null', async () => {
    const handler = versionCommand.handler as HandlerFn
    await expect(
      handler({ format: 'json', auto: undefined, _fetchLatestVersion: nullFetch }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: { update_available: boolean | null }
    }
    expect(parsed.data.update_available).toBeNull()
  })

  it('JSON output includes latest_version and update_available when update is available', async () => {
    const handler = versionCommand.handler as HandlerFn
    const fetchWithUpdate = async () => '99.99.99'
    await expect(
      handler({ format: 'json', auto: undefined, _fetchLatestVersion: fetchWithUpdate }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: {
        version: string
        latest_version: string | null
        update_available: boolean | null
      }
    }
    expect(parsed.data.latest_version).toBe('99.99.99')
    expect(parsed.data.update_available).toBe(true)
  })

  it('JSON output shows update_available false when versions match', async () => {
    const handler = versionCommand.handler as HandlerFn
    // Read current version from package.json to match
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    let currentVersion = 'unknown'
    const candidates = [
      path.resolve(__dirname, '../../package.json'),
      path.resolve(__dirname, '../../../package.json'),
    ]
    for (const pkgPath of candidates) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }
        if (pkg.version) { currentVersion = pkg.version; break }
      } catch { /* try next */ }
    }

    const fetchSameVersion = async () => currentVersion
    await expect(
      handler({ format: 'json', auto: undefined, _fetchLatestVersion: fetchSameVersion }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: { update_available: boolean | null }
    }
    expect(parsed.data.update_available).toBe(false)
  })

  it('interactive output shows update available message', async () => {
    const handler = versionCommand.handler as HandlerFn
    const fetchWithUpdate = async () => '99.99.99'
    await expect(
      handler({ format: undefined, auto: undefined, _fetchLatestVersion: fetchWithUpdate }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('99.99.99')
    expect(allOutput).toContain('update available')
  })

  it('update_available is false when installed version is ahead of npm latest', async () => {
    const handler = versionCommand.handler as HandlerFn
    const fetchOlderVersion = async () => '0.0.1'
    await expect(
      handler({ format: 'json', auto: undefined, _fetchLatestVersion: fetchOlderVersion }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: { update_available: boolean | null }
    }
    expect(parsed.data.update_available).toBe(false)
  })

  it('interactive output shows "ahead of registry" when installed version is ahead of registry', async () => {
    const handler = versionCommand.handler as HandlerFn
    const fetchOlderVersion = async () => '0.0.1'
    await expect(
      handler({ format: undefined, auto: undefined, _fetchLatestVersion: fetchOlderVersion }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).not.toContain('update available')
    expect(allOutput).toContain('ahead of registry')
  })

  it('interactive output shows up-to-date message when versions match', async () => {
    const handler = versionCommand.handler as HandlerFn
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { fileURLToPath } = await import('node:url')
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    let currentVersion = 'unknown'
    const candidates = [
      path.resolve(__dirname, '../../package.json'),
      path.resolve(__dirname, '../../../package.json'),
    ]
    for (const pkgPath of candidates) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }
        if (pkg.version) { currentVersion = pkg.version; break }
      } catch { /* try next */ }
    }

    const fetchSameVersion = async () => currentVersion
    await expect(
      handler({ format: undefined, auto: undefined, _fetchLatestVersion: fetchSameVersion }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('up to date')
  })

  it('interactive output includes Node.js version and platform', async () => {
    const handler = versionCommand.handler as HandlerFn
    await expect(
      handler({ format: undefined, auto: undefined, _fetchLatestVersion: nullFetch }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('Node.js')
    expect(allOutput).toContain(process.platform)
  })

  it('handles _fetchLatestVersion that throws', async () => {
    const handler = versionCommand.handler as HandlerFn
    const fetchThatThrows = async () => { throw new Error('network error') }
    await expect(
      handler({ format: 'json', auto: undefined, _fetchLatestVersion: fetchThatThrows }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: { latest_version: string | null; update_available: boolean | null }
    }
    // When fetch throws, .catch(() => null) makes latestVersion null
    expect(parsed.data.latest_version).toBeNull()
    expect(parsed.data.update_available).toBeNull()
  })

  it('builder returns yargs unchanged', () => {
    const yargsMock = { option: vi.fn().mockReturnThis() }
    const builder = versionCommand.builder as (y: unknown) => unknown
    const result = builder(yargsMock)
    expect(result).toBe(yargsMock)
  })

  it('checks @zigrivers/scaffold package name on npm registry', async () => {
    const handler = versionCommand.handler as HandlerFn
    let capturedName: string | undefined
    const captureSpy = async (name: string) => { capturedName = name; return null }
    await expect(
      handler({ format: undefined, auto: undefined, _fetchLatestVersion: captureSpy }),
    ).rejects.toThrow('process.exit(0)')
    expect(capturedName).toBe('@zigrivers/scaffold')
  })
})

// --- Tests for exported fetchLatestVersion function ---

describe('fetchLatestVersion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mockHttpsGet.mockReset()
  })

  it('resolves with version from npm registry on success', async () => {
    const mockRes = new EventEmitter()
    const mockReq = new EventEmitter()
    mockHttpsGet.mockImplementation((_url: string, cb: (res: EventEmitter) => void) => {
      cb(mockRes)
      process.nextTick(() => {
        mockRes.emit('data', Buffer.from('{"version":"3.2.1"}'))
        mockRes.emit('end')
      })
      return mockReq
    })

    const result = await fetchLatestVersion('scaffold')
    expect(result).toBe('3.2.1')
  })

  it('URL-encodes scoped package names for the registry request', async () => {
    const mockRes = new EventEmitter()
    const mockReq = new EventEmitter()
    let capturedUrl = ''
    mockHttpsGet.mockImplementation((url: string, cb: (res: EventEmitter) => void) => {
      capturedUrl = url
      cb(mockRes)
      process.nextTick(() => {
        mockRes.emit('data', Buffer.from('{"version":"2.0.0"}'))
        mockRes.emit('end')
      })
      return mockReq
    })

    await fetchLatestVersion('@zigrivers/scaffold')
    expect(capturedUrl).toBe('https://registry.npmjs.org/%40zigrivers%2Fscaffold/latest')
  })

  it('resolves null on network error', async () => {
    const mockReq = new EventEmitter()
    mockHttpsGet.mockImplementation((_url: string, _cb: (res: EventEmitter) => void) => {
      process.nextTick(() => {
        mockReq.emit('error', new Error('ECONNREFUSED'))
      })
      return mockReq
    })

    const result = await fetchLatestVersion('scaffold')
    expect(result).toBeNull()
  })

  it('resolves null on invalid JSON response', async () => {
    const mockRes = new EventEmitter()
    const mockReq = new EventEmitter()
    mockHttpsGet.mockImplementation((_url: string, cb: (res: EventEmitter) => void) => {
      cb(mockRes)
      process.nextTick(() => {
        mockRes.emit('data', Buffer.from('not json'))
        mockRes.emit('end')
      })
      return mockReq
    })

    const result = await fetchLatestVersion('scaffold')
    expect(result).toBeNull()
  })

  it('resolves null when response lacks version field', async () => {
    const mockRes = new EventEmitter()
    const mockReq = new EventEmitter()
    mockHttpsGet.mockImplementation((_url: string, cb: (res: EventEmitter) => void) => {
      cb(mockRes)
      process.nextTick(() => {
        mockRes.emit('data', Buffer.from('{"name":"scaffold"}'))
        mockRes.emit('end')
      })
      return mockReq
    })

    const result = await fetchLatestVersion('scaffold')
    expect(result).toBeNull()
  })
})
