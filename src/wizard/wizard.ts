import type { ScaffoldConfig } from '../types/index.js'
import type { ScaffoldError } from '../types/index.js'
import type { OutputContext } from '../cli/output/context.js'
import { detectProjectMode } from '../project/detector.js'
import { suggestMethodology } from './suggestion.js'
import { askWizardQuestions } from './questions.js'
import { StateManager } from '../state/state-manager.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { atomicWriteFile, ensureDir, getPackagePipelineDir } from '../utils/fs.js'
import yaml from 'js-yaml'
import fs from 'node:fs'
import path from 'node:path'

export interface WizardOptions {
  projectRoot: string
  idea?: string
  methodology?: string   // --methodology flag pre-sets this
  force: boolean
  auto: boolean
  output: OutputContext
}

export interface WizardResult {
  success: boolean
  projectRoot: string
  configPath: string
  methodology: string
  errors: ScaffoldError[]
}

export async function runWizard(options: WizardOptions): Promise<WizardResult> {
  const { projectRoot, idea, methodology: presetMethodology, force, auto, output } = options
  const scaffoldDir = path.join(projectRoot, '.scaffold')

  // Check for existing .scaffold/
  if (fs.existsSync(scaffoldDir) && !force) {
    return {
      success: false,
      projectRoot,
      configPath: path.join(scaffoldDir, 'config.yml'),
      methodology: 'unknown',
      errors: [
        {
          code: 'INIT_SCAFFOLD_EXISTS',
          message: '.scaffold/ directory already exists',
          exitCode: 1,
          recovery: 'Use --force to back up and reinitialize',
        },
      ],
    }
  }

  // Backup existing .scaffold/ if --force
  if (fs.existsSync(scaffoldDir) && force) {
    const backupPath = path.join(projectRoot, '.scaffold.backup')
    const finalBackup = fs.existsSync(backupPath)
      ? `${backupPath}.${Date.now()}`
      : backupPath
    fs.renameSync(scaffoldDir, finalBackup)
    output.info(`Backed up existing .scaffold/ to ${path.basename(finalBackup)}`)
  }

  // Detect project
  const detection = detectProjectMode(projectRoot)

  // Compute methodology suggestion
  const suggestion = suggestMethodology({
    idea,
    mode: detection.mode,
  })

  // Ask questions
  const answers = await askWizardQuestions({
    output,
    suggestion,
    methodology: presetMethodology,
    auto,
  })

  // Build config — methodology is a top-level string per the real ScaffoldConfig schema
  const config: ScaffoldConfig = {
    version: 2,
    methodology: answers.methodology,
    platforms: answers.platforms as Array<'claude-code' | 'codex'>,
    project: {
      traits: answers.traits,
    },
  }

  // For custom methodology, store depth in custom.default_depth
  if (answers.methodology === 'custom') {
    config.custom = { default_depth: answers.depth }
  }

  // Write .scaffold/ directory structure
  ensureDir(scaffoldDir)
  ensureDir(path.join(scaffoldDir, 'instructions'))

  // Write config.yml
  const configPath = path.join(scaffoldDir, 'config.yml')
  atomicWriteFile(configPath, yaml.dump(config))

  // Initialize state.json via StateManager
  const pipelineDir = getPackagePipelineDir(projectRoot)
  const metaPrompts = discoverMetaPrompts(pipelineDir)
  const allSteps = [...metaPrompts.entries()].map(([slug, mp]) => ({
    slug,
    produces: mp.frontmatter.outputs ?? [],
  }))

  const stateManager = new StateManager(projectRoot, () => [])
  stateManager.initializeState({
    enabledSteps: allSteps,
    scaffoldVersion: '2.0.0',
    methodology: answers.methodology,
    initMode: detection.mode === 'v1-migration'
      ? 'v1-migration'
      : detection.mode === 'brownfield'
        ? 'brownfield'
        : 'greenfield',
  })

  // Write empty decisions.jsonl
  const decisionsPath = path.join(scaffoldDir, 'decisions.jsonl')
  if (!fs.existsSync(decisionsPath)) {
    fs.writeFileSync(decisionsPath, '', 'utf8')
  }

  output.success(`Initialized scaffold project (${answers.methodology}, depth ${answers.depth})`)

  return {
    success: true,
    projectRoot,
    configPath,
    methodology: answers.methodology,
    errors: [],
  }
}
