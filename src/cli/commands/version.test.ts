import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import versionCommand from './version.js'

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
})
