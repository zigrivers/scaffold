import type { ScaffoldConfig } from './config.js'
import type { MetaPromptFrontmatter } from './frontmatter.js'

export interface AdapterContext {
  config: ScaffoldConfig
  projectRoot: string
  outputDir: string
}

export interface AdapterStepInput {
  frontmatter: MetaPromptFrontmatter
  assembledPrompt: string
  stepIndex: number
  totalSteps: number
}

export interface AdapterStepOutput {
  filePath: string
  content: string
}

export interface PlatformAdapter {
  name: string
  initialize(context: AdapterContext): void
  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput
  finalize(): void
}
