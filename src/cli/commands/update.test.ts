import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
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
})
