import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import { EventEmitter } from 'node:events'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
}))

// Mock https for testing the real fetchLatestVersion code path
const mockHttpsGet = vi.fn()
vi.mock('node:https', () => ({
  default: { get: (...args: unknown[]) => mockHttpsGet(...args) },
  get: (...args: unknown[]) => mockHttpsGet(...args),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { resolveOutputMode } from '../middleware/output-mode.js'
import updateCommand from './update.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchLatestVersion = (packageName: string) => Promise<string | null>

function makeArgv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'check-only': false,
    'skip-build': false,
    format: undefined,
    auto: undefined,
    verbose: undefined,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('update command', () => {
  let exitSpy: MockInstance
  let stdoutSpy: MockInstance
  let writtenLines: string[]

  const mockResolveOutputMode = vi.mocked(resolveOutputMode)

  beforeEach(() => {
    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    mockResolveOutputMode.mockReturnValue('interactive')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Test 1: --check-only shows current and latest version
  it('--check-only shows current version and latest version info', async () => {
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue('9.9.9')

    const argv = makeArgv({
      'check-only': true,
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    // Should mention current version or latest
    expect(allOutput).toMatch(/scaffold v|Up to date|Update available|update/)
  })

  // Test 2: Network failure returns null latest_version in JSON mode
  it('network failure resolves gracefully with null latest_version in JSON', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue(null)

    const argv = makeArgv({
      'check-only': true,
      format: 'json',
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.latest_version).toBeNull()
  })

  // Test 3: JSON output has correct shape
  it('JSON output has correct shape with required fields', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue('2.0.0')

    const argv = makeArgv({
      format: 'json',
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data).toHaveProperty('updated')
    expect(data).toHaveProperty('previous_version')
    expect(data).toHaveProperty('new_version')
    expect(data).toHaveProperty('changelog')
    expect(data).toHaveProperty('rebuild_result')
    expect(Array.isArray(data.changelog)).toBe(true)
  })

  // Test 4: Shows "up to date" when versions match (network returns null, no update)
  it('shows informational output when network returns null', async () => {
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue(null)

    const argv = makeArgv({
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    // Either "up to date" or "could not check" — both are valid when no network
    const allOutput = writtenLines.join('')
    expect(allOutput.length).toBeGreaterThan(0)
  })

  // Test 5: Shows upgrade command when update available
  it('shows upgrade command when an update is available', async () => {
    // Returning a version that is different from installed → update available
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue('99.99.99')

    const argv = makeArgv({
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    // Should show upgrade command or update info
    expect(allOutput).toMatch(/Update available|Run:|99\.99\.99/)
  })

  // Test 6: --check-only JSON output has correct shape
  it('--check-only JSON output has current_version, latest_version, update_available, channel', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue('3.0.0')

    const argv = makeArgv({
      'check-only': true,
      format: 'json',
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data).toHaveProperty('current_version')
    expect(data).toHaveProperty('latest_version', '3.0.0')
    expect(data).toHaveProperty('update_available')
    expect(data).toHaveProperty('channel')

    // Silence unused variable warnings
    void stdoutSpy
  })

  // Test 7: --check-only interactive shows "Up to date" when versions match
  it('--check-only interactive shows up-to-date when latest matches current', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    // We need to return the same version as the installed version
    // readInstalledVersion reads from package.json, so we read it to match
    const fs = await import('node:fs')
    let currentVersion = '0.0.0'
    try {
      const pkg = JSON.parse(
        fs.readFileSync(new URL('../../../package.json', import.meta.url).pathname, 'utf8'),
      ) as { version?: string }
      currentVersion = pkg.version ?? '0.0.0'
    } catch { /* use fallback */ }

    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue(currentVersion)

    const argv = makeArgv({
      'check-only': true,
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('Up to date')
  })

  // Test 8: --check-only interactive shows update available when versions differ
  it('--check-only interactive shows update info when versions differ', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue('99.0.0')

    const argv = makeArgv({
      'check-only': true,
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('Update available')
    expect(allOutput).toContain('99.0.0')
  })

  // Test 9: --check-only interactive shows network unavailable message
  it('--check-only interactive shows network unavailable when fetch returns null', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue(null)

    const argv = makeArgv({
      'check-only': true,
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('Could not check for updates')
  })

  // Test 10: Default mode (no --check-only) shows "up to date" when versions match
  it('default mode shows up-to-date when latest matches current', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    const fs = await import('node:fs')
    let currentVersion = '0.0.0'
    try {
      const pkg = JSON.parse(
        fs.readFileSync(new URL('../../../package.json', import.meta.url).pathname, 'utf8'),
      ) as { version?: string }
      currentVersion = pkg.version ?? '0.0.0'
    } catch { /* use fallback */ }

    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue(currentVersion)

    const argv = makeArgv({
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('up to date')
  })

  // Test 11: Default mode shows "could not check" when fetch returns null
  it('default mode shows could-not-check message when latest is null', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue(null)

    const argv = makeArgv({
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('Could not check for updates')
  })

  // Test 12: _fetchLatestVersion that throws is caught gracefully
  it('handles _fetchLatestVersion that throws an exception', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')
    const mockFetch: FetchLatestVersion = vi.fn().mockRejectedValue(new Error('network error'))

    const argv = makeArgv({
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    // Should still exit gracefully with some output
    const allOutput = writtenLines.join('')
    expect(allOutput.length).toBeGreaterThan(0)
  })

  // Test 13: builder configures check-only and skip-build options
  it('builder configures check-only and skip-build options', () => {
    const yargsMock = {
      option: vi.fn().mockReturnThis(),
    }
    const builder = updateCommand.builder as (y: unknown) => unknown
    builder(yargsMock)

    expect(yargsMock.option).toHaveBeenCalledWith('check-only', expect.objectContaining({
      type: 'boolean',
      default: false,
    }))
    expect(yargsMock.option).toHaveBeenCalledWith('skip-build', expect.objectContaining({
      type: 'boolean',
      default: false,
    }))
  })

  // Test 14: Default mode with update available and JSON output
  it('default mode with update available emits JSON result', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue('99.0.0')

    const argv = makeArgv({
      format: 'json',
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.updated).toBe(false)
    expect(data.new_version).toBe('99.0.0')
    expect(data.rebuild_result).toBeNull()
  })

  // Test 15: --check-only JSON with matching versions shows update_available false
  it('--check-only JSON shows update_available false when versions match', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const fs = await import('node:fs')
    let currentVersion = '0.0.0'
    try {
      const pkg = JSON.parse(
        fs.readFileSync(new URL('../../../package.json', import.meta.url).pathname, 'utf8'),
      ) as { version?: string }
      currentVersion = pkg.version ?? '0.0.0'
    } catch { /* use fallback */ }

    const mockFetch: FetchLatestVersion = vi.fn().mockResolvedValue(currentVersion)

    const argv = makeArgv({
      'check-only': true,
      format: 'json',
      _fetchLatestVersion: mockFetch,
    })
    await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.update_available).toBe(false)
  })

  // --- Tests that exercise the real fetchLatestVersion (no DI override) ---

  describe('real fetchLatestVersion via https mock', () => {
    it('handler uses real fetchLatestVersion when no DI override: success path', async () => {
      mockResolveOutputMode.mockReturnValue('json')

      // Simulate a successful HTTPS response
      const mockRes = new EventEmitter()
      const mockReq = new EventEmitter()
      mockHttpsGet.mockImplementation((_url: string, cb: (res: EventEmitter) => void) => {
        cb(mockRes)
        // Emit data and end asynchronously
        process.nextTick(() => {
          mockRes.emit('data', Buffer.from('{"version":"5.0.0"}'))
          mockRes.emit('end')
        })
        return mockReq
      })

      const argv = makeArgv({
        'check-only': true,
        format: 'json',
        // No _fetchLatestVersion → uses real fetchLatestVersion
      })
      await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(0)
      const allOutput = writtenLines.join('')
      const parsed = JSON.parse(allOutput)
      const data = parsed.data ?? parsed
      expect(data.latest_version).toBe('5.0.0')
    })

    it('handler uses real fetchLatestVersion: network error path', async () => {
      mockResolveOutputMode.mockReturnValue('json')

      const mockReq = new EventEmitter()
      mockHttpsGet.mockImplementation((_url: string, _cb: (res: EventEmitter) => void) => {
        // Trigger error on next tick
        process.nextTick(() => {
          mockReq.emit('error', new Error('ECONNREFUSED'))
        })
        return mockReq
      })

      const argv = makeArgv({
        'check-only': true,
        format: 'json',
      })
      await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(0)
      const allOutput = writtenLines.join('')
      const parsed = JSON.parse(allOutput)
      const data = parsed.data ?? parsed
      expect(data.latest_version).toBeNull()
    })

    it('handler uses real fetchLatestVersion: invalid JSON response', async () => {
      mockResolveOutputMode.mockReturnValue('json')

      const mockRes = new EventEmitter()
      const mockReq = new EventEmitter()
      mockHttpsGet.mockImplementation((_url: string, cb: (res: EventEmitter) => void) => {
        cb(mockRes)
        process.nextTick(() => {
          mockRes.emit('data', Buffer.from('not valid json'))
          mockRes.emit('end')
        })
        return mockReq
      })

      const argv = makeArgv({
        'check-only': true,
        format: 'json',
      })
      await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(0)
      const allOutput = writtenLines.join('')
      const parsed = JSON.parse(allOutput)
      const data = parsed.data ?? parsed
      expect(data.latest_version).toBeNull()
    })

    it('handler uses real fetchLatestVersion: response without version field', async () => {
      mockResolveOutputMode.mockReturnValue('json')

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

      const argv = makeArgv({
        'check-only': true,
        format: 'json',
      })
      await updateCommand.handler(argv as Parameters<typeof updateCommand.handler>[0])

      expect(exitSpy).toHaveBeenCalledWith(0)
      const allOutput = writtenLines.join('')
      const parsed = JSON.parse(allOutput)
      const data = parsed.data ?? parsed
      expect(data.latest_version).toBeNull()
    })
  })
})
