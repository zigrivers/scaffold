import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
}))

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
}))

vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))

vi.mock('../../utils/levenshtein.js', () => ({
  findClosestMatch: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import checkCommand from './check.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFindProjectRoot = vi.mocked(findProjectRoot)
const mockResolveOutputMode = vi.mocked(resolveOutputMode)
const mockDiscoverMetaPrompts = vi.mocked(discoverMetaPrompts)
const mockFindClosestMatch = vi.mocked(findClosestMatch)

function makeMetaPrompt(name: string, conditional: string | null = null) {
  return {
    stepName: name,
    filePath: `/fake/${name}.md`,
    frontmatter: {
      name,
      description: `Description of ${name}`,
      phase: 'integration',
      order: 60,
      dependencies: ['git-workflow'],
      outputs: [],
      conditional,
      knowledgeBase: [],
      reads: [],
      stateless: false,
      category: 'pipeline' as const,
    },
    body: '',
    sections: {},
  }
}

function makeTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-check-'))
  fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
  return dir
}

function defaultArgv(overrides: Record<string, unknown> = {}) {
  return {
    step: 'add-e2e-testing',
    format: undefined,
    auto: undefined,
    verbose: undefined,
    root: undefined,
    force: undefined,
    ...overrides,
  } as Parameters<typeof checkCommand.handler>[0]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('check command', () => {
  let exitSpy: MockInstance
  let writtenLines: string[]
  const tmpDirs: string[] = []

  beforeEach(() => {
    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })

    mockResolveOutputMode.mockReturnValue('interactive')
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockFindClosestMatch.mockReturnValue(null)
    mockDiscoverMetaPrompts.mockReturnValue(new Map())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true })
    }
    tmpDirs.length = 0
  })

  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)
    await checkCommand.handler(defaultArgv())
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('exits 2 when step not found', async () => {
    type MetaPromptValue =
      ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['some-step', makeMetaPrompt('some-step') as MetaPromptValue],
    ]))
    await checkCommand.handler(defaultArgv({ step: 'nonexistent' }))
    expect(exitSpy).toHaveBeenCalledWith(2)
  })

  it('shows fuzzy suggestion when step not found', async () => {
    mockFindClosestMatch.mockReturnValue('add-e2e-testing')
    type MetaPromptVal =
      ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MetaPromptVal],
    ]))
    await checkCommand.handler(defaultArgv({ step: 'add-e2e-testin' }))
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('add-e2e-testing')
  })

  it('detects web platform when next is in package.json', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { next: '14.0.0', react: '18.0.0', 'react-dom': '18.0.0' },
    }))

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.applicable).toBe(true)
    expect(data.platform).toBe('web')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('detects mobile platform when expo is in package.json', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { expo: '51.0.0', 'react-native': '0.74.0' },
    }))

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.applicable).toBe(true)
    expect(data.platform).toBe('mobile')
  })

  it('detects both platforms when web and mobile deps present', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { next: '14.0.0', 'react-dom': '18.0.0', expo: '51.0.0', 'react-native': '0.74.0' },
    }))

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.applicable).toBe(true)
    expect(data.platform).toBe('both')
  })

  it('returns not applicable for backend-only project', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { express: '4.18.0', pg: '8.0.0' },
    }))

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.applicable).toBe(false)
    expect(data.platform).toBe('none')
  })

  it('detects Playwright brownfield when config exists', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { next: '14.0.0', 'react-dom': '18.0.0' },
      devDependencies: { '@playwright/test': '1.40.0' },
    }))
    fs.writeFileSync(path.join(dir, 'playwright.config.ts'), 'export default {}')

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.brownfield).toBe(true)
    expect(data.brownfieldSignals).toContain('playwright.config.ts')
    expect(data.mode).toBe('update')
  })

  it('detects Maestro brownfield when maestro/ directory has flows', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { expo: '51.0.0', 'react-native': '0.74.0' },
    }))
    fs.mkdirSync(path.join(dir, 'maestro', 'flows'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'maestro', 'flows', 'login.yaml'), 'appId: com.test')

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.brownfield).toBe(true)
    expect(data.brownfieldSignals).toContain('maestro/')
    expect(data.mode).toBe('update')
  })

  it('returns mode=fresh when applicable and no brownfield', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { next: '14.0.0', 'react-dom': '18.0.0' },
    }))

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.brownfield).toBe(false)
    expect(data.mode).toBe('fresh')
  })

  it('returns mode=skip when not applicable', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
      dependencies: { express: '4.18.0' },
    }))

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['add-e2e-testing', makeMetaPrompt('add-e2e-testing', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.mode).toBe('skip')
  })

  it('detects automated-pr-review as applicable when GitHub remote exists', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    // Init a git repo with a GitHub remote (stdio: 'pipe' prevents git hint messages from polluting the spy)
    const { execSync } = await import('node:child_process')
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git remote add origin https://github.com/test/repo.git', { cwd: dir, stdio: 'pipe' })
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true })

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['automated-pr-review', makeMetaPrompt('automated-pr-review', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ step: 'automated-pr-review', root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.applicable).toBe(true)
    expect(data.hasGithubRemote).toBe(true)
    expect(data.hasCi).toBe(true)
    expect(data.mode).toBe('fresh')
    expect(data).toHaveProperty('availableClis')
    expect(data).toHaveProperty('recommendedReviewMode')
  })

  it('detects automated-pr-review as not applicable without GitHub remote', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    // Init a git repo with NO GitHub remote (stdio: 'pipe' prevents git hint messages from polluting the spy)
    const { execSync } = await import('node:child_process')
    execSync('git init', { cwd: dir, stdio: 'pipe' })

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['automated-pr-review', makeMetaPrompt('automated-pr-review', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ step: 'automated-pr-review', root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.applicable).toBe(false)
    expect(data.hasGithubRemote).toBe(false)
    expect(data.mode).toBe('skip')
  })

  it('detects automated-pr-review update mode when AGENTS.md exists', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    const { execSync } = await import('node:child_process')
    execSync('git init', { cwd: dir, stdio: 'pipe' })
    execSync('git remote add origin https://github.com/test/repo.git', { cwd: dir, stdio: 'pipe' })
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Code Review Instructions')

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['automated-pr-review', makeMetaPrompt('automated-pr-review', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ step: 'automated-pr-review', root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.brownfield).toBe(true)
    expect(data.mode).toBe('update')
  })

  it('detects ai-memory-setup as fresh when nothing configured', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['ai-memory-setup', makeMetaPrompt('ai-memory-setup') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ step: 'ai-memory-setup', root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.applicable).toBe(true)
    expect(data.hasRules).toBe(false)
    expect(data.hasMcpServer).toBe(false)
    expect(data.hasHooks).toBe(false)
    expect(data.mode).toBe('fresh')
  })

  it('detects ai-memory-setup as update when rules exist', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude', 'rules', 'code-style.md'), '---\ndescription: test\n---\n- rule')
    fs.writeFileSync(path.join(dir, '.claude', 'rules', 'testing.md'), '---\ndescription: test\n---\n- rule')

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['ai-memory-setup', makeMetaPrompt('ai-memory-setup') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ step: 'ai-memory-setup', root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.hasRules).toBe(true)
    expect(data.ruleCount).toBe(2)
    expect(data.mode).toBe('update')
  })

  it('detects ai-memory-setup MCP server and hooks', async () => {
    const dir = makeTmpProject()
    tmpDirs.push(dir)
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({
      mcpServers: {
        memory: { command: 'engram', args: ['mcp'] },
      },
      hooks: {
        PreCompact: [{ type: 'command', command: 'echo test' }],
        Stop: [{ type: 'command', command: 'echo stop' }],
      },
    }))

    mockFindProjectRoot.mockReturnValue(dir)
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['ai-memory-setup', makeMetaPrompt('ai-memory-setup') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ step: 'ai-memory-setup', root: dir, format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.hasMcpServer).toBe(true)
    expect(data.mcpServerName).toBe('memory')
    expect(data.hasHooks).toBe(true)
    expect(data.hookNames).toContain('PreCompact')
    expect(data.hookNames).toContain('Stop')
    expect(data.mode).toBe('update')
  })

  it('handles non-e2e conditional step with generic response', async () => {
    type MP = ReturnType<typeof discoverMetaPrompts> extends Map<string, infer V> ? V : never
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['design-system', makeMetaPrompt('design-system', 'if-needed') as MP],
    ]))

    mockResolveOutputMode.mockReturnValue('json')
    await checkCommand.handler(defaultArgv({ step: 'design-system', format: 'json' }))

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data.step).toBe('design-system')
    expect(data.reason).toContain('conditional')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })
})
