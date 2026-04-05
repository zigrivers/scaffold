import type { OutputContext } from '../cli/output/context.js'
import type { ProjectType, GameConfig } from '../types/index.js'
import { GameConfigSchema } from '../config/schema.js'

export interface WizardAnswers {
  methodology: 'deep' | 'mvp' | 'custom'
  depth: 1 | 2 | 3 | 4 | 5
  platforms: Array<'claude-code' | 'codex' | 'gemini'>
  traits: string[]
  projectType?: ProjectType
  gameConfig?: GameConfig
}

/**
 * Ask user the wizard questions interactively.
 * In auto mode, use defaults immediately.
 */
export async function askWizardQuestions(options: {
  output: OutputContext
  suggestion: 'deep' | 'mvp'
  methodology?: string  // pre-set via --methodology flag
  projectType?: string  // pre-set via --project-type flag
  auto: boolean
}): Promise<WizardAnswers> {
  const { output, suggestion, auto } = options

  // Methodology question (skip if --methodology was provided)
  let methodology: 'deep' | 'mvp' | 'custom' = suggestion as 'deep' | 'mvp'
  if (options.methodology) {
    methodology = options.methodology as 'deep' | 'mvp' | 'custom'
  } else if (!auto) {
    // In interactive mode, ask via OutputContext.prompt
    const answer = await output.prompt<string>(
      `Select methodology (deep/mvp/custom) [${suggestion}]:`,
      suggestion,
    )
    if (['deep', 'mvp', 'custom'].includes(answer)) {
      methodology = answer as 'deep' | 'mvp' | 'custom'
    }
  }

  // Depth question (only for custom methodology)
  let depth: 1 | 2 | 3 | 4 | 5 = methodology === 'mvp' ? 1 : methodology === 'deep' ? 5 : 3
  if (methodology === 'custom' && !auto) {
    const depthStr = await output.prompt<string>('Depth (1-5) [3]:', '3')
    const parsed = parseInt(depthStr)
    if (parsed >= 1 && parsed <= 5) depth = parsed as 1 | 2 | 3 | 4 | 5
  }

  // Platform selection (simplified — claude-code always included)
  const platforms: Array<'claude-code' | 'codex' | 'gemini'> = ['claude-code']
  if (!auto) {
    const addCodex = await output.confirm('Include Codex adapter?', false)
    if (addCodex) platforms.push('codex')
    const addGemini = await output.confirm('Include Gemini adapter?', false)
    if (addGemini) platforms.push('gemini')
  }

  // Traits (web/mobile/desktop)
  const traits: string[] = []
  if (!auto) {
    const isWeb = await output.confirm('Is this a web application?', false)
    if (isWeb) traits.push('web')
    const isMobile = await output.confirm('Is this a mobile application?', false)
    if (isMobile) traits.push('mobile')
  }

  // Project type question (skip if --project-type was provided)
  let projectType: ProjectType | undefined
  if (options.projectType) {
    projectType = options.projectType as ProjectType
  } else if (!auto) {
    const selected = await output.select(
      'What type of project is this?',
      ['web-app', 'mobile-app', 'backend', 'cli', 'library', 'game'],
      'web-app',
    )
    projectType = selected as ProjectType
  }

  // Game config questions (only when projectType === 'game')
  let gameConfig: GameConfig | undefined
  if (projectType === 'game' && auto) {
    // --project-type game --auto: use Zod defaults
    const defaults = GameConfigSchema.parse({ engine: 'custom' })
    gameConfig = defaults
  } else if (projectType === 'game' && !auto) {
    // Core questions — always asked for games
    const engine = await output.select(
      'Game engine:',
      ['unity', 'unreal', 'godot', 'custom'],
    ) as GameConfig['engine']

    const multiplayerMode = await output.select(
      'Multiplayer mode:',
      ['none', 'local', 'online', 'hybrid'],
      'none',
    ) as GameConfig['multiplayerMode']

    const targetPlatforms = await output.multiSelect(
      'Target platforms:',
      ['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar'],
      ['pc'],
    ) as GameConfig['targetPlatforms']

    // Conditional follow-ups
    let onlineServices: GameConfig['onlineServices'] = []
    if (multiplayerMode === 'online' || multiplayerMode === 'hybrid') {
      onlineServices = await output.multiSelect(
        'Online services:',
        ['leaderboards', 'accounts', 'matchmaking', 'live-ops'],
        [],
      ) as GameConfig['onlineServices']
    }

    const contentStructure = await output.select(
      'Content structure:',
      ['discrete', 'open-world', 'procedural', 'endless', 'mission-based'],
      'discrete',
    ) as GameConfig['contentStructure']

    const economy = await output.select(
      'Economy model:',
      ['none', 'progression', 'monetized', 'both'],
      'none',
    ) as GameConfig['economy']

    // Advanced options — defaults derived from Zod schema to prevent drift
    const schemaDefaults = GameConfigSchema.parse({ engine })
    let narrative: GameConfig['narrative'] = schemaDefaults.narrative
    let supportedLocales: string[] = schemaDefaults.supportedLocales
    let npcAiComplexity: GameConfig['npcAiComplexity'] = schemaDefaults.npcAiComplexity
    let hasModding = schemaDefaults.hasModding
    let persistence: GameConfig['persistence'] = schemaDefaults.persistence

    const showAdvanced = await output.confirm('Configure advanced game options?', false)
    if (showAdvanced) {
      narrative = await output.select(
        'Narrative depth:',
        ['none', 'light', 'heavy'],
        'none',
      ) as GameConfig['narrative']

      supportedLocales = await output.multiInput(
        'Supported locales (comma-separated):',
        ['en'],
      )

      npcAiComplexity = await output.select(
        'NPC AI complexity:',
        ['none', 'simple', 'complex'],
        'none',
      ) as GameConfig['npcAiComplexity']

      hasModding = await output.confirm('Mod support?', false)

      persistence = await output.select(
        'Persistence level:',
        ['none', 'settings-only', 'profile', 'progression', 'cloud'],
        'progression',
      ) as GameConfig['persistence']
    }

    gameConfig = {
      engine,
      multiplayerMode,
      targetPlatforms,
      onlineServices,
      contentStructure,
      economy,
      narrative,
      supportedLocales,
      npcAiComplexity,
      hasModding,
      persistence,
    }
  }

  return { methodology, depth, platforms, traits, projectType, gameConfig }
}
