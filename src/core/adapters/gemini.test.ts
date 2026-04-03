import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { GeminiAdapter } from './gemini.js'
import * as fsUtils from '../../utils/fs.js'
import type { AdapterContext, AdapterStepInput, AdapterFinalizeInput } from './adapter.js'

const tmpDirs: string[] = []

const makeContext = (overrides?: Partial<AdapterContext>): AdapterContext => ({
  projectRoot: overrides?.projectRoot ?? makeTmpDir(),
  methodology: overrides?.methodology ?? 'standard',
  allSteps: overrides?.allSteps ?? ['create-prd', 'status', 'next'],
})

const makeStepInput = (overrides?: Partial<AdapterStepInput>): AdapterStepInput => ({
  slug: overrides?.slug ?? 'create-prd',
  description: overrides?.description ?? 'Create a PRD',
  phase: overrides?.phase ?? 'planning',
  dependsOn: overrides?.dependsOn ?? [],
  produces: overrides?.produces ?? ['docs/prd.md'],
  pipelineIndex: overrides?.pipelineIndex ?? 0,
  body: overrides?.body ?? '## Purpose\nCreate the PRD.',
  sections: overrides?.sections ?? { Purpose: 'Create the PRD.' },
  knowledgeEntries: overrides?.knowledgeEntries ?? [],
  conditional: overrides?.conditional ?? null,
  longDescription: overrides?.longDescription ?? 'Create the PRD.',
})

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-gemini-adapter-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
  tmpDirs.length = 0
})

describe('GeminiAdapter', () => {
  it('generateStepWrapper creates a .gemini command TOML file for the step slug', () => {
    const adapter = new GeminiAdapter()
    adapter.initialize(makeContext())

    const result = adapter.generateStepWrapper(
      makeStepInput({
        slug: 'create-prd',
        description: 'Create a PRD',
        longDescription: 'Capture the project requirements in detail.',
      }),
    )

    expect(result.files).toHaveLength(1)
    expect(result.files[0].relativePath).toBe('.gemini/commands/scaffold/create-prd.toml')
    expect(result.files[0].writeMode).toBe('create')
    expect(result.files[0].content).toContain(
      'description = "Run scaffold create-prd through the Scaffold runner workflow."',
    )
    expect(result.files[0].content).toContain('Step description: Create a PRD')
    expect(result.files[0].content).toContain('Purpose: Capture the project requirements in detail.')
    expect(result.files[0].content).toContain('User request: scaffold create-prd')
  })

  it('finalize emits shared skills, GEMINI.md, and status/next commands', () => {
    const adapter = new GeminiAdapter()
    const context = makeContext()
    adapter.initialize(context)

    const step = makeStepInput({ slug: 'create-prd' })
    const stepOutput = adapter.generateStepWrapper(step)
    const finalizeInput: AdapterFinalizeInput = { results: [stepOutput] }
    const result = adapter.finalize(finalizeInput)

    expect(result.files.map((file) => file.relativePath)).toEqual(
      expect.arrayContaining([
        '.agents/skills/scaffold-runner/SKILL.md',
        '.agents/skills/scaffold-pipeline/SKILL.md',
        'GEMINI.md',
        '.gemini/commands/scaffold/status.toml',
        '.gemini/commands/scaffold/next.toml',
      ]),
    )
    expect(
      result.files.find((file) => file.relativePath === 'GEMINI.md')?.content,
    ).toContain('@./.agents/skills/scaffold-runner/SKILL.md')
    expect(
      result.files.find((file) => file.relativePath === 'GEMINI.md')?.content,
    ).toContain('@./.agents/skills/scaffold-pipeline/SKILL.md')
    expect(fs.existsSync(path.join(context.projectRoot, 'GEMINI.md'))).toBe(false)
  })

  it('returns a controlled error when packaged skill files are missing', () => {
    const adapter = new GeminiAdapter()
    const context = makeContext()
    adapter.initialize(context)

    const missingSkillDir = path.join(makeTmpDir(), 'missing-agent-skills')
    vi.spyOn(fsUtils, 'getPackageSkillsDir').mockReturnValue(missingSkillDir)

    const result = adapter.finalize({ results: [] })

    expect(result.files).toEqual([])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('GEMINI_SKILL_FILES_MISSING')
  })
})
