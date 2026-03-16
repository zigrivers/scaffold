import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { findProjectRoot, createProjectRootMiddleware, ROOT_OPTIONAL_COMMANDS } from './project-root.js'

describe('findProjectRoot', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env['TMPDIR'] ?? '/tmp', 'scaffold-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    vi.restoreAllMocks()
  })

  it('finds .scaffold/ in the same directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.scaffold'))
    const result = findProjectRoot(tmpDir)
    expect(result).toBe(tmpDir)
  })

  it('finds .scaffold/ in a parent directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.scaffold'))
    const nested = path.join(tmpDir, 'sub', 'nested')
    fs.mkdirSync(nested, { recursive: true })
    const result = findProjectRoot(nested)
    expect(result).toBe(tmpDir)
  })

  it('returns null when no .scaffold/ found up to filesystem root', () => {
    // tmpDir has no .scaffold/ directory
    // We can't walk all the way to root since CI may have .scaffold/ somewhere,
    // so mock fs.existsSync to always return false
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const result = findProjectRoot(tmpDir)
    expect(result).toBeNull()
  })
})

describe('createProjectRootMiddleware', () => {
  let tmpDir: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: MockInstance<any>
  let stderrSpy: MockInstance<typeof process.stderr.write>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.env['TMPDIR'] ?? '/tmp', 'scaffold-test-'))
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called')
    }) as never)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
    vi.restoreAllMocks()
  })

  it('sets detectedRoot when .scaffold/ is found', () => {
    fs.mkdirSync(path.join(tmpDir, '.scaffold'))
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir)

    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['run'] }
    middleware(argv)

    expect(argv['detectedRoot']).toBe(tmpDir)
  })

  it('uses argv.root when provided, skips auto-detection', () => {
    const cwdSpy = vi.spyOn(process, 'cwd')
    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['run'], root: '/some/explicit/root' }
    middleware(argv)

    expect(argv['detectedRoot']).toBe('/some/explicit/root')
    expect(cwdSpy).not.toHaveBeenCalled()
  })

  it('calls process.exit(1) for non-optional commands when .scaffold/ not found', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['run'] }

    expect(() => middleware(argv)).toThrow('process.exit called')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('does NOT call process.exit(1) for "init" command when .scaffold/ not found', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['init'] }

    expect(() => middleware(argv)).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('does NOT call process.exit(1) for "version" command when .scaffold/ not found', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['version'] }

    expect(() => middleware(argv)).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('does NOT call process.exit(1) for "update" command when .scaffold/ not found', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['update'] }

    expect(() => middleware(argv)).not.toThrow()
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('writes error message to stderr when project not initialized', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    const middleware = createProjectRootMiddleware()
    const argv: Record<string, unknown> = { _: ['run'] }

    expect(() => middleware(argv)).toThrow('process.exit called')

    const allStderr = stderrSpy.mock.calls.map(c => String(c[0])).join('')
    expect(allStderr).toContain('PROJECT_NOT_INITIALIZED')
    expect(allStderr).toContain('scaffold init')
  })
})

describe('ROOT_OPTIONAL_COMMANDS', () => {
  it('contains init, version, and update', () => {
    expect(ROOT_OPTIONAL_COMMANDS).toContain('init')
    expect(ROOT_OPTIONAL_COMMANDS).toContain('version')
    expect(ROOT_OPTIONAL_COMMANDS).toContain('update')
  })
})
