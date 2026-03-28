import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import type { OutputContext } from '../../cli/output/context.js'
import type { MetaPromptFile } from '../../types/index.js'

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
vi.mock('../../core/knowledge/knowledge-update-assembler.js', () => ({
  KnowledgeUpdateAssembler: vi.fn().mockImplementation(() => ({
    assemble: vi.fn().mockReturnValue('## Task\nUpdate knowledge for {{name}}'),
  })),
  loadTemplate: vi.fn().mockReturnValue('template'),
}))

import { findProjectRoot } from '../../cli/middleware/project-root.js'
import { buildIndex } from '../../core/assembly/knowledge-loader.js'
import { createOutputContext } from '../../cli/output/context.js'
import { resolveOutputMode } from '../../cli/middleware/output-mode.js'
import { loadConfig } from '../../config/loader.js'
import { runCli } from '../../cli/index.js'
import { execSync } from 'node:child_process'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { KnowledgeUpdateAssembler } from '../../core/knowledge/knowledge-update-assembler.js'

const PROJECT_ROOT = '/fake/project'

function makeOutputMock() {
  return {
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    result: vi.fn(),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
  }
}

function setupDefaults(output = makeOutputMock()) {
  vi.mocked(findProjectRoot).mockReturnValue(PROJECT_ROOT)
  vi.mocked(resolveOutputMode).mockReturnValue('auto')
  vi.mocked(createOutputContext).mockReturnValue(
    output as unknown as OutputContext,
  )
  vi.mocked(loadConfig).mockReturnValue({
    config: {
      version: 2, methodology: 'deep', platforms: ['claude-code'],
    },
    errors: [],
    warnings: [],
  } as unknown as ReturnType<typeof loadConfig>)
  return output
}

describe('scaffold knowledge show', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as () => never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  it('prints local override content with source header when override exists', async () => {
    const output = setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map([['api-design', '/global/api-design.md']]))
      .mockReturnValueOnce(new Map([['api-design', '/local/api-design.md']]))
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '---\nname: api-design\ndescription: Local\ntopics: []\n---\n# Local Body',
    )

    await runCli(['knowledge', 'show', 'api-design'])

    const allOutput = [
      ...vi.mocked(output.info).mock.calls.flat(),
      ...vi.mocked(process.stdout.write).mock.calls.flat(),
    ].join('\n')
    expect(allOutput).toContain('local override')
    expect(allOutput).toContain('# Local Body')
  })

  it('prints global content with source header when no override', async () => {
    const output = setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map([['api-design', '/global/api-design.md']]))
      .mockReturnValueOnce(new Map())  // no local
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '---\nname: api-design\ndescription: Global\ntopics: []\n---\n# Global Body',
    )

    await runCli(['knowledge', 'show', 'api-design'])

    const allOutput = [
      ...vi.mocked(output.info).mock.calls.flat(),
      ...vi.mocked(process.stdout.write).mock.calls.flat(),
    ].join('\n')
    expect(allOutput).toContain('global')
    expect(allOutput).toContain('# Global Body')
  })

  it('exits 1 when entry not found in either location', async () => {
    setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValueOnce(new Map())
      .mockReturnValueOnce(new Map())
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as () => never)

    await runCli(['knowledge', 'show', 'nonexistent'])
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})

describe('scaffold knowledge list', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as () => never)
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
    vi.spyOn(fs, 'readFileSync').mockImplementation((p: unknown) => {
      if (String(p).includes('.scaffold')) {
        return '---\nname: api-design\ndescription: Local override\ntopics: []\n---\n'
      }
      if (String(p).includes('testing-strategy')) {
        return '---\nname: testing-strategy\ndescription: Test strategy\ntopics: []\n---\n'
      }
      return '---\nname: api-design\ndescription: Global\ntopics: []\n---\n'
    })
    vi.mocked(buildIndex)
      .mockReturnValueOnce(globalEntries)
      .mockReturnValueOnce(localEntries)

    await runCli(['knowledge', 'list'])

    const allCalls = [
      ...vi.mocked(output.info).mock.calls.flat(),
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
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '---\nname: api-design\ndescription: Global\ntopics: []\n---\n',
    )

    await runCli(['knowledge', 'list', '--format', 'json'])
    expect(vi.mocked(output.result)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'api-design', source: 'global' }),
      ]),
    )
  })
})

describe('scaffold knowledge reset', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as () => never)
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined)
  })

  it('prints "nothing to reset" and exits 0 when no local override exists', async () => {
    const output = setupDefaults()
    vi.mocked(buildIndex).mockReturnValueOnce(new Map())  // no local override

    await runCli(['knowledge', 'reset', 'api-design'])
    expect(vi.mocked(output.info)).toHaveBeenCalledWith(expect.stringContaining('Nothing to reset'))
  })

  it('deletes the local override file when no uncommitted changes', async () => {
    const output = setupDefaults()
    const localPath = '/fake/project/.scaffold/knowledge/api-design.md'
    vi.mocked(buildIndex).mockReturnValueOnce(new Map([['api-design', localPath]]))
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))  // empty = no changes

    await runCli(['knowledge', 'reset', 'api-design'])
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(localPath)
    expect(vi.mocked(output.success)).toHaveBeenCalled()
  })

  it('exits 1 with warning when uncommitted changes and --auto not set', async () => {
    setupDefaults()
    const localPath = '/fake/project/.scaffold/knowledge/api-design.md'
    vi.mocked(buildIndex).mockReturnValueOnce(new Map([['api-design', localPath]]))
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (String(cmd).includes('status')) return Buffer.from(' M .scaffold/knowledge/api-design.md')
      return Buffer.from('')
    })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as () => never)

    await runCli(['knowledge', 'reset', 'api-design'])
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(vi.mocked(fs.unlinkSync)).not.toHaveBeenCalled()
  })

  it('deletes with uncommitted changes when --auto is set', async () => {
    setupDefaults()
    const localPath = '/fake/project/.scaffold/knowledge/api-design.md'
    vi.mocked(buildIndex).mockReturnValueOnce(new Map([['api-design', localPath]]))
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (String(cmd).includes('status')) return Buffer.from(' M .scaffold/knowledge/api-design.md')
      return Buffer.from('')
    })

    await runCli(['knowledge', 'reset', 'api-design', '--auto'])
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(localPath)
  })

  it('skips git check and deletes when not a git repo', async () => {
    setupDefaults()
    const localPath = '/fake/project/.scaffold/knowledge/api-design.md'
    vi.mocked(buildIndex).mockReturnValueOnce(new Map([['api-design', localPath]]))
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (String(cmd).includes('rev-parse')) throw new Error('not a git repo')
      return Buffer.from('')
    })

    await runCli(['knowledge', 'reset', 'api-design'])
    expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(localPath)
  })
})

describe('scaffold knowledge update — target resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as () => never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    // Re-setup assembler mock after resetAllMocks clears mockImplementation
    vi.mocked(KnowledgeUpdateAssembler).mockImplementation(
      () => ({
        assemble: vi.fn().mockReturnValue(
          '## Task\nUpdate knowledge for {{name}}',
        ),
      }) as unknown as InstanceType<typeof KnowledgeUpdateAssembler>,
    )
    // Set up default mocks that tests can override
    vi.mocked(discoverMetaPrompts).mockReturnValue(
      new Map() as Map<string, MetaPromptFile>,
    )
  })

  it('resolves entry name directly and writes prompt to stdout', async () => {
    setupDefaults()
    vi.mocked(buildIndex)
      .mockReturnValue(new Map([['api-design', '/fake/project/knowledge/api-design.md']]))
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '---\nname: api-design\ndescription: desc\ntopics: []\n---\n# Body',
    )
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    await runCli(['knowledge', 'update', 'api-design'])

    const stdoutCalls = vi.mocked(process.stdout.write).mock.calls.flat().join('')
    expect(stdoutCalls.length).toBeGreaterThan(0)
  })

  it('resolves step name to its knowledge-base entries with --step flag', async () => {
    setupDefaults()
    const metaPromptMap = new Map([
      ['create-prd', {
        stepName: 'create-prd',
        filePath: '/fake/pipeline/create-prd.md',
        frontmatter: { knowledgeBase: ['prd-craft'] },
        body: '',
        sections: {},
      }],
    ])
    vi.mocked(discoverMetaPrompts).mockReturnValue(
      metaPromptMap as unknown as Map<string, MetaPromptFile>,
    )
    vi.mocked(buildIndex)
      .mockReturnValue(new Map([['prd-craft', '/fake/project/knowledge/prd-craft.md']]))
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '---\nname: prd-craft\ndescription: desc\ntopics: []\n---\n# PRD Body',
    )
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    await runCli(['knowledge', 'update', 'create-prd', '--step'])

    const stdoutCalls = vi.mocked(process.stdout.write).mock.calls.flat().join('')
    expect(stdoutCalls.length).toBeGreaterThan(0)
  })

  it('exits 1 with error when target not found', async () => {
    setupDefaults()
    vi.mocked(buildIndex).mockReturnValue(new Map())
    vi.mocked(discoverMetaPrompts).mockReturnValue(
      new Map() as Map<string, MetaPromptFile>,
    )
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as () => never)

    await runCli(['knowledge', 'update', 'nonexistent'])
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits 1 when --step target is not a valid step name', async () => {
    setupDefaults()
    vi.mocked(buildIndex).mockReturnValue(new Map())
    vi.mocked(discoverMetaPrompts).mockReturnValue(
      new Map() as Map<string, MetaPromptFile>,
    )
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as () => never)

    await runCli(['knowledge', 'update', 'not-a-step', '--step'])
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('prefers entry name over step name when both match (without --step)', async () => {
    setupDefaults()
    const metaPromptMap = new Map([
      ['testing-strategy', {
        stepName: 'testing-strategy',
        frontmatter: { knowledgeBase: ['testing-strategy'] },
        body: '', sections: {}, filePath: '',
      }],
    ])
    vi.mocked(discoverMetaPrompts).mockReturnValue(
      metaPromptMap as unknown as Map<string, MetaPromptFile>,
    )
    vi.mocked(buildIndex)
      .mockReturnValue(new Map([['testing-strategy', '/fake/project/knowledge/testing-strategy.md']]))
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      '---\nname: testing-strategy\ndescription: desc\ntopics: []\n---\n# Body',
    )
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)

    await runCli(['knowledge', 'update', 'testing-strategy'])

    const stderrOutput = vi.mocked(process.stderr.write).mock.calls.flat().join('')
    expect(stderrOutput).toContain('also a step')
  })
})
