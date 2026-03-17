import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'

// Mock all external dependencies — vitest hoists vi.mock() calls automatically
vi.mock('../../core/assembly/knowledge-loader.js', () => ({
  buildIndex: vi.fn(),
  buildIndexWithOverrides: vi.fn(),
  loadEntries: vi.fn(),
}))
vi.mock('../../cli/middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
  ROOT_OPTIONAL_COMMANDS: ['init', 'version', 'update'],
}))
vi.mock('../../cli/output/context.js', () => ({
  createOutputContext: vi.fn(),
}))
vi.mock('../../cli/middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(),
}))
vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(),
}))
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))
vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(),
}))

import { findProjectRoot } from '../../cli/middleware/project-root.js'
import { buildIndex } from '../../core/assembly/knowledge-loader.js'
import { createOutputContext } from '../../cli/output/context.js'
import { resolveOutputMode } from '../../cli/middleware/output-mode.js'
import { loadConfig } from '../../config/loader.js'
import { runCli } from '../../cli/index.js'

const PROJECT_ROOT = '/fake/project'

function makeOutputMock() {
  return {
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    result: vi.fn(),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
  }
}

function setupDefaults(output = makeOutputMock()) {
  vi.mocked(findProjectRoot).mockReturnValue(PROJECT_ROOT)
  vi.mocked(resolveOutputMode).mockReturnValue('auto')
  vi.mocked(createOutputContext).mockReturnValue(output as any)
  vi.mocked(loadConfig).mockReturnValue({
    config: { version: 2, methodology: 'deep', platforms: ['claude-code'] },
    errors: [],
  } as any)
  return output
}

describe('scaffold knowledge list', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  it('prints table with global and local entries', async () => {
    const output = setupDefaults()
    const globalEntries = new Map([
      ['api-design', '/fake/project/knowledge/api-design.md'],
      ['testing-strategy', '/fake/project/knowledge/testing-strategy.md'],
    ])
    const localEntries = new Map([
      ['api-design', '/fake/project/.scaffold/knowledge/api-design.md'],
    ])
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
      if (String(p).includes('.scaffold')) return '---\nname: api-design\ndescription: Local override\ntopics: []\n---\n'
      if (String(p).includes('testing-strategy')) return '---\nname: testing-strategy\ndescription: Test strategy\ntopics: []\n---\n'
      return '---\nname: api-design\ndescription: Global\ntopics: []\n---\n'
    })
    vi.mocked(buildIndex)
      .mockReturnValueOnce(globalEntries)
      .mockReturnValueOnce(localEntries)

    await runCli(['knowledge', 'list'])

    const allCalls = [
      ...vi.mocked(output.log).mock.calls.flat(),
      ...vi.mocked(process.stdout.write).mock.calls.flat(),
    ].join(' ')
    expect(allCalls).toContain('api-design')
    expect(allCalls).toContain('testing-strategy')
  })

  it('returns JSON array with --format json', async () => {
    const output = setupDefaults()
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map([['api-design', '/fake/project/knowledge/api-design.md']]))
      .mockReturnValueOnce(new Map())
    vi.spyOn(fs, 'readFileSync').mockReturnValue('---\nname: api-design\ndescription: Global\ntopics: []\n---\n' as any)

    await runCli(['knowledge', 'list', '--format', 'json'])
    expect(vi.mocked(output.result)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'api-design', source: 'global' }),
      ])
    )
  })
})
