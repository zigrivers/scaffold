import fs from 'node:fs'
import path from 'node:path'
import {
  type PlatformAdapter,
  type AdapterContext,
  type AdapterInitResult,
  type AdapterStepInput,
  type AdapterStepOutput,
  type AdapterFinalizeInput,
  type AdapterFinalizeResult,
  type OutputFile,
} from './adapter.js'
import { renderManagedContent } from '../../project/gemini-md.js'
import { getPackageSkillsDir } from '../../utils/fs.js'
import type { ScaffoldError } from '../../types/index.js'

const SKILL_FILES = [
  'scaffold-runner',
  'scaffold-pipeline',
] as const

export class GeminiAdapter implements PlatformAdapter {
  readonly platformId = 'gemini'

  private context: AdapterContext | null = null
  private collectedSteps: AdapterStepInput[] = []

  initialize(context: AdapterContext): AdapterInitResult {
    this.context = context
    this.collectedSteps = []
    return { success: true, errors: [] }
  }

  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput {
    this.collectedSteps.push(input)

    return {
      slug: input.slug,
      platformId: this.platformId,
      files: [{
        relativePath: `.gemini/commands/scaffold/${input.slug}.toml`,
        content: buildStepCommandToml(input),
        writeMode: 'create',
      }],
      success: true,
    }
  }

  finalize(_input: AdapterFinalizeInput): AdapterFinalizeResult {
    const projectRoot = this.context?.projectRoot
    if (!projectRoot) {
      return { files: [], errors: [] }
    }

    const skillDir = getPackageSkillsDir(projectRoot)
    const skillFiles = readAgentSkillFiles(skillDir)
    if ('error' in skillFiles) {
      return { files: [], errors: [skillFiles.error] }
    }

    const geminiMdPath = path.join(projectRoot, 'GEMINI.md')
    const currentGeminiMd = fs.existsSync(geminiMdPath)
      ? fs.readFileSync(geminiMdPath, 'utf8')
      : ''

    return {
      files: [
        ...skillFiles.files,
        {
          relativePath: 'GEMINI.md',
          content: renderManagedContent(currentGeminiMd),
          writeMode: 'create',
        },
        {
          relativePath: '.gemini/commands/scaffold/status.toml',
          content: buildCommandToml('scaffold status'),
          writeMode: 'create',
        },
        {
          relativePath: '.gemini/commands/scaffold/next.toml',
          content: buildCommandToml('scaffold next'),
          writeMode: 'create',
        },
      ],
      errors: [],
    }
  }
}

function readAgentSkillFiles(skillDir: string): { files: OutputFile[] } | { error: ScaffoldError } {
  const files: OutputFile[] = []

  for (const skillName of SKILL_FILES) {
    const sourcePath = path.join(skillDir, skillName, 'SKILL.md')
    try {
      const content = fs.readFileSync(sourcePath, 'utf8')
      files.push({
        relativePath: `.agents/skills/${skillName}/SKILL.md`,
        content,
        writeMode: 'create',
      })
    } catch (error) {
      return { error: missingSkillError(sourcePath, error) }
    }
  }

  return { files }
}

function missingSkillError(sourcePath: string, error: unknown): ScaffoldError {
  const detail = error instanceof Error ? error.message : 'unknown error'
  return {
    code: 'GEMINI_SKILL_FILES_MISSING',
    message: `Missing packaged Gemini skill file: ${sourcePath}`,
    exitCode: 1,
    recovery: 'Reinstall the packaged agent-skills source or restore the missing file.',
    context: { file: sourcePath, detail },
  }
}

function buildStepCommandToml(input: AdapterStepInput): string {
  const description = input.description
  const promptParts = [
    'Use the Scaffold runner workflow already loaded from GEMINI.md.',
    '',
    `Step description: ${description}`,
  ]

  if (input.longDescription && input.longDescription !== description) {
    promptParts.push(`Purpose: ${input.longDescription}`)
  }

  promptParts.push('', `User request: scaffold ${input.slug}`)

  return [
    `description = ${JSON.stringify(`Run scaffold ${input.slug} through the Scaffold runner workflow.`)}`,
    'prompt = """',
    ...promptParts,
    '"""',
    '',
  ].join('\n')
}

function buildCommandToml(userRequest: string): string {
  return [
    `description = ${JSON.stringify(`Run ${userRequest} through the Scaffold runner workflow.`)}`,
    'prompt = """',
    'Use the Scaffold runner workflow already loaded from GEMINI.md.',
    '',
    `User request: ${userRequest}`,
    '"""',
    '',
  ].join('\n')
}
