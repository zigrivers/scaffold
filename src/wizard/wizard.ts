import type { ScaffoldConfig } from '../types/index.js'
import type { ScaffoldError } from '../types/index.js'
import type { PipelineState } from '../types/index.js'
import type { OutputContext } from '../cli/output/context.js'
import { detectProjectMode } from '../project/detector.js'
import { suggestMethodology } from './suggestion.js'
import { askWizardQuestions } from './questions.js'
import { StateManager } from '../state/state-manager.js'
import { migrateState } from '../state/state-migration.js'
import { discoverMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import { atomicWriteFile, ensureDir, getPackagePipelineDir } from '../utils/fs.js'
import { ExistingScaffoldError } from '../utils/user-errors.js'
import yaml from 'js-yaml'
import fs from 'node:fs'
import path from 'node:path'

export type {
  GameFlags,
  WebAppFlags,
  BackendFlags,
  CliFlags,
  LibraryFlags,
  MobileAppFlags,
  DataPipelineFlags,
  MlFlags,
  BrowserExtensionFlags,
  ResearchFlags,
} from './flags.js'

import type {
  GameFlags,
  WebAppFlags,
  BackendFlags,
  CliFlags,
  LibraryFlags,
  MobileAppFlags,
  DataPipelineFlags,
  MlFlags,
  BrowserExtensionFlags,
  ResearchFlags,
} from './flags.js'

export interface WizardOptions {
  projectRoot: string
  idea?: string
  methodology?: string   // --methodology flag pre-sets this
  projectType?: string   // --project-type flag pre-sets this
  force: boolean
  auto: boolean
  output: OutputContext
  depth?: number
  adapters?: string[]
  traits?: string[]

  // Type-specific flag groups
  gameFlags?: GameFlags
  webAppFlags?: WebAppFlags
  backendFlags?: BackendFlags
  cliFlags?: CliFlags
  libraryFlags?: LibraryFlags
  mobileAppFlags?: MobileAppFlags
  dataPipelineFlags?: DataPipelineFlags
  mlFlags?: MlFlags
  browserExtensionFlags?: BrowserExtensionFlags
  researchFlags?: ResearchFlags
}

export interface WizardResult {
  success: boolean
  projectRoot: string
  configPath: string
  methodology: string
  errors: ScaffoldError[]
}

export interface MaterializeOptions {
  projectRoot: string
  force: boolean
  oldState?: PipelineState
  output: OutputContext
}

/**
 * Collect wizard answers and build a ScaffoldConfig. No filesystem writes.
 */
export async function collectWizardAnswers(
  options: WizardOptions,
): Promise<ScaffoldConfig> {
  const {
    projectRoot, idea, methodology: presetMethodology,
    projectType: presetProjectType, auto, output,
    depth, adapters, traits,
    gameFlags, webAppFlags, backendFlags, cliFlags, libraryFlags,
    mobileAppFlags, dataPipelineFlags, mlFlags, browserExtensionFlags,
    researchFlags,
  } = options

  // Detect project
  const detection = detectProjectMode(projectRoot)

  // Compute methodology suggestion
  const suggestion = suggestMethodology({
    idea,
    mode: detection.mode,
    sourceFileCount: detection.sourceFileCount,
  })

  // Ask questions
  const answers = await askWizardQuestions({
    output,
    suggestion,
    methodology: presetMethodology,
    projectType: presetProjectType,
    auto,
    depth,
    adapters,
    traits,
    gameFlags,
    webAppFlags,
    backendFlags,
    cliFlags,
    libraryFlags,
    mobileAppFlags,
    dataPipelineFlags,
    mlFlags,
    browserExtensionFlags,
    researchFlags,
  })

  // Build config — methodology is a top-level string per the real ScaffoldConfig schema
  const config: ScaffoldConfig = {
    version: 2,
    methodology: answers.methodology,
    platforms: answers.platforms,
    project: {
      platforms: answers.traits as Array<'web' | 'mobile' | 'desktop'>,
      ...(answers.projectType && { projectType: answers.projectType }),
      ...(answers.gameConfig && { gameConfig: answers.gameConfig }),
      ...(answers.webAppConfig && { webAppConfig: answers.webAppConfig }),
      ...(answers.backendConfig && { backendConfig: answers.backendConfig }),
      ...(answers.cliConfig && { cliConfig: answers.cliConfig }),
      ...(answers.libraryConfig && { libraryConfig: answers.libraryConfig }),
      ...(answers.mobileAppConfig && { mobileAppConfig: answers.mobileAppConfig }),
      ...(answers.dataPipelineConfig && { dataPipelineConfig: answers.dataPipelineConfig }),
      ...(answers.mlConfig && { mlConfig: answers.mlConfig }),
      ...(answers.browserExtensionConfig && { browserExtensionConfig: answers.browserExtensionConfig }),
      ...(answers.researchConfig && { researchConfig: answers.researchConfig }),
      ...(answers.dataScienceConfig && { dataScienceConfig: answers.dataScienceConfig }),
    },
  }

  // For custom methodology, store depth in custom.default_depth
  if (answers.methodology === 'custom') {
    config.custom = { default_depth: answers.depth }
  }

  return config
}

/**
 * Read old state from .scaffold/state.json if it exists.
 * Applies migrateState() for step-name renames before returning.
 * Returns undefined if the file is missing or corrupt.
 */
export function readOldStateIfExists(projectRoot: string): PipelineState | undefined {
  const statePath = path.join(projectRoot, '.scaffold', 'state.json')
  if (!fs.existsSync(statePath)) return undefined
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8')) as PipelineState
    // Apply step name migrations before merging
    migrateState(raw)
    return raw
  } catch {
    // Couldn't read old state — proceed without preserving
    return undefined
  }
}

/**
 * Write .scaffold/ directory: backup, config.yml, state.json, decisions.jsonl, instructions/.
 * Throws ExistingScaffoldError if .scaffold/ exists and force is false.
 */
export async function materializeScaffoldProject(
  config: ScaffoldConfig,
  options: MaterializeOptions,
): Promise<void> {
  const { projectRoot, force, oldState, output } = options
  const scaffoldDir = path.join(projectRoot, '.scaffold')

  // Guard: if .scaffold/ exists and !force, throw ExistingScaffoldError
  if (fs.existsSync(scaffoldDir) && !force) {
    throw new ExistingScaffoldError(projectRoot)
  }

  // Backup existing .scaffold/ if force is set
  if (fs.existsSync(scaffoldDir) && force) {
    const backupPath = path.join(projectRoot, '.scaffold.backup')
    const finalBackup = fs.existsSync(backupPath)
      ? `${backupPath}.${Date.now()}`
      : backupPath
    fs.renameSync(scaffoldDir, finalBackup)
    output.info(`Backed up existing .scaffold/ to ${path.basename(finalBackup)}`)
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

  const detection = detectProjectMode(projectRoot)
  const stateManager = new StateManager(
    projectRoot,
    () => [],
    () => config,
    undefined, // pathResolver
    undefined, // globalSteps
    undefined, // pipelineHash — legacy-safe (see plan Task 12)
  )
  stateManager.initializeState({
    enabledSteps: allSteps,
    scaffoldVersion: '2.0.0',
    methodology: config.methodology,
    initMode: detection.mode === 'v1-migration'
      ? 'v1-migration'
      : detection.mode === 'brownfield'
        ? 'brownfield'
        : 'greenfield',
    config,
  })

  // Merge completed/skipped steps from old state (--force re-init)
  if (oldState) {
    const newState = stateManager.loadState()
    let preserved = 0
    for (const [slug, entry] of Object.entries(oldState.steps)) {
      if (entry.status === 'completed' || entry.status === 'skipped') {
        if (newState.steps[slug]) {
          // Step exists in new pipeline — preserve its completion status
          newState.steps[slug] = entry
          preserved++
        }
        // Step doesn't exist in new pipeline — skip (it was removed or renamed)
      }
    }
    if (preserved > 0) {
      stateManager.saveState(newState)
      output.info(`Preserved ${preserved} completed/skipped step(s) from previous state`)
    }
  }

  // Write empty decisions.jsonl
  const decisionsPath = path.join(scaffoldDir, 'decisions.jsonl')
  if (!fs.existsSync(decisionsPath)) {
    fs.writeFileSync(decisionsPath, '', 'utf8')
  }

  output.success(`Initialized scaffold project (${config.methodology}, depth ${config.custom?.default_depth ?? 3})`)
}

export async function runWizard(options: WizardOptions): Promise<WizardResult> {
  const { projectRoot, force, output } = options
  const scaffoldDir = path.join(projectRoot, '.scaffold')

  // PREFLIGHT — check for existing .scaffold/ BEFORE prompting
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

  // Read old state before backup (to preserve completed steps)
  const oldState = readOldStateIfExists(projectRoot)

  const config = await collectWizardAnswers(options)

  await materializeScaffoldProject(config, {
    projectRoot,
    force,
    oldState,
    output,
  })

  return {
    success: true,
    projectRoot,
    configPath: path.join(projectRoot, '.scaffold', 'config.yml'),
    methodology: config.methodology,
    errors: [],
  }
}
