import type { OutputContext } from '../cli/output/context.js'
import type { ProjectType, GameConfig, WebAppConfig, BackendConfig, CliConfig } from '../types/index.js'
import { GameConfigSchema, ProjectTypeSchema } from '../config/schema.js'

export interface WizardAnswers {
  methodology: 'deep' | 'mvp' | 'custom'
  depth: 1 | 2 | 3 | 4 | 5
  platforms: Array<'claude-code' | 'codex' | 'gemini'>
  traits: string[]
  projectType?: ProjectType
  gameConfig?: GameConfig
  webAppConfig?: WebAppConfig
  backendConfig?: BackendConfig
  cliConfig?: CliConfig
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
  depth?: number
  adapters?: string[]
  traits?: string[]
  engine?: string
  multiplayer?: string
  targetPlatforms?: string[]
  onlineServices?: string[]
  contentStructure?: string
  economy?: string
  narrative?: string
  locales?: string[]
  npcAi?: string
  modding?: boolean
  persistence?: string
  // Web-app flags
  webRendering?: string
  webDeployTarget?: string
  webRealtime?: string
  webAuthFlow?: string
  // Backend flags
  backendApiStyle?: string
  backendDataStore?: string[]
  backendAuth?: string
  backendMessaging?: string
  backendDeployTarget?: string
  // CLI flags
  cliInteractivity?: string
  cliDistribution?: string[]
  cliStructuredOutput?: boolean
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
  const defaultDepth: 1 | 2 | 3 | 4 | 5 = methodology === 'mvp' ? 1 : methodology === 'deep' ? 5 : 3
  let depth: 1 | 2 | 3 | 4 | 5 = defaultDepth
  if (options.depth !== undefined) {
    depth = options.depth as 1 | 2 | 3 | 4 | 5
  } else if (methodology === 'custom' && !auto) {
    const depthStr = await output.prompt<string>('Depth (1-5) [3]:', '3')
    const parsed = parseInt(depthStr)
    if (parsed >= 1 && parsed <= 5) depth = parsed as 1 | 2 | 3 | 4 | 5
  }

  // Platform selection (simplified — claude-code always included)
  let platforms: Array<'claude-code' | 'codex' | 'gemini'>
  if (options.adapters) {
    platforms = options.adapters as Array<'claude-code' | 'codex' | 'gemini'>
  } else if (!auto) {
    platforms = ['claude-code']
    const addCodex = await output.confirm('Include Codex adapter?', false)
    if (addCodex) platforms.push('codex')
    const addGemini = await output.confirm('Include Gemini adapter?', false)
    if (addGemini) platforms.push('gemini')
  } else {
    platforms = ['claude-code']
  }

  // Traits (web/mobile/desktop)
  let traits: string[]
  if (options.traits) {
    traits = options.traits
  } else if (!auto) {
    traits = []
    const isWeb = await output.confirm('Is this a web application?', false)
    if (isWeb) traits.push('web')
    const isMobile = await output.confirm('Is this a mobile application?', false)
    if (isMobile) traits.push('mobile')
  } else {
    traits = []
  }

  // Project type question (skip if --project-type was provided)
  let projectType: ProjectType | undefined
  if (options.projectType) {
    projectType = options.projectType as ProjectType
  } else if (!auto) {
    const selected = await output.select(
      'What type of project is this?',
      [...ProjectTypeSchema.options],
      'web-app',
    )
    projectType = selected as ProjectType
  }

  // Web-App configuration
  let webAppConfig: WebAppConfig | undefined
  if (projectType === 'web-app') {
    if (auto && !options.webRendering) {
      throw new Error('--web-rendering is required in auto mode for web-app projects')
    }

    const renderingStrategy = options.webRendering
      ? options.webRendering as WebAppConfig['renderingStrategy']
      : await output.select('Rendering strategy?', ['spa', 'ssr', 'ssg', 'hybrid']) as WebAppConfig['renderingStrategy']

    const deployTarget = options.webDeployTarget
      ? options.webDeployTarget as WebAppConfig['deployTarget']
      : !auto
        ? await output.select('Deploy target?',
          ['static', 'serverless', 'container', 'edge', 'long-running'], 'serverless') as WebAppConfig['deployTarget']
        : 'serverless'

    const realtime = options.webRealtime
      ? options.webRealtime as WebAppConfig['realtime']
      : !auto
        ? await output.select('Real-time needs?', ['none', 'websocket', 'sse'], 'none') as WebAppConfig['realtime']
        : 'none'

    const authFlow = options.webAuthFlow
      ? options.webAuthFlow as WebAppConfig['authFlow']
      : !auto
        ? await output.select('How do users authenticate?',
          ['none', 'session', 'oauth', 'passkey'], 'none') as WebAppConfig['authFlow']
        : 'none'

    webAppConfig = { renderingStrategy, deployTarget, realtime, authFlow }
  }

  // Backend configuration
  let backendConfig: BackendConfig | undefined
  if (projectType === 'backend') {
    if (auto && !options.backendApiStyle) {
      throw new Error('--backend-api-style is required in auto mode for backend projects')
    }

    const apiStyle = options.backendApiStyle
      ? options.backendApiStyle as BackendConfig['apiStyle']
      : await output.select('API style?',
        ['rest', 'graphql', 'grpc', 'trpc', 'none']) as BackendConfig['apiStyle']

    const dataStore = options.backendDataStore
      ? options.backendDataStore as BackendConfig['dataStore']
      : !auto
        ? await output.multiSelect('Data store(s)?',
          ['relational', 'document', 'key-value'], ['relational']) as BackendConfig['dataStore']
        : ['relational'] as BackendConfig['dataStore']

    const authMechanism = apiStyle === 'none'
      ? 'none' as BackendConfig['authMechanism']
      : options.backendAuth
        ? options.backendAuth as BackendConfig['authMechanism']
        : !auto
          ? await output.select('How does the API verify requests?',
            ['none', 'jwt', 'session', 'oauth', 'apikey'],
            'none') as BackendConfig['authMechanism']
          : 'none'

    const asyncMessaging = options.backendMessaging
      ? options.backendMessaging as BackendConfig['asyncMessaging']
      : !auto
        ? await output.select('Async messaging?',
          ['none', 'queue', 'event-driven'], 'none') as BackendConfig['asyncMessaging']
        : 'none'

    const deployTarget = options.backendDeployTarget
      ? options.backendDeployTarget as BackendConfig['deployTarget']
      : !auto
        ? await output.select('Deploy target?',
          ['serverless', 'container', 'long-running'], 'container') as BackendConfig['deployTarget']
        : 'container'

    backendConfig = { apiStyle, dataStore, authMechanism, asyncMessaging, deployTarget }
  }

  // CLI configuration
  let cliConfig: CliConfig | undefined
  if (projectType === 'cli') {
    if (auto && !options.cliInteractivity) {
      throw new Error('--cli-interactivity is required in auto mode for cli projects')
    }

    const interactivity = options.cliInteractivity
      ? options.cliInteractivity as CliConfig['interactivity']
      : await output.select('Interactivity model?',
        ['args-only', 'interactive', 'hybrid']) as CliConfig['interactivity']

    const distributionChannels = options.cliDistribution
      ? options.cliDistribution as CliConfig['distributionChannels']
      : !auto
        ? await output.multiSelect('Distribution channels?',
          ['package-manager', 'system-package-manager', 'standalone-binary', 'container'],
          ['package-manager']) as CliConfig['distributionChannels']
        : ['package-manager'] as CliConfig['distributionChannels']

    const hasStructuredOutput = options.cliStructuredOutput
      ?? (!auto ? await output.confirm('Support structured output (--json)?', false) : false)

    cliConfig = { interactivity, distributionChannels, hasStructuredOutput }
  }

  // Game config questions (only when projectType === 'game')
  let gameConfig: GameConfig | undefined
  if (projectType === 'game') {
    // Core questions — use flag if provided, else ask (or default in auto mode)
    const engine: GameConfig['engine'] = options.engine
      ? options.engine as GameConfig['engine']
      : !auto
        ? await output.select('Game engine:', ['unity', 'unreal', 'godot', 'custom']) as GameConfig['engine']
        : 'custom'

    // Derive Zod defaults from engine (used for auto mode and advanced defaults)
    const schemaDefaults = GameConfigSchema.parse({ engine })

    const multiplayerMode: GameConfig['multiplayerMode'] = options.multiplayer
      ? options.multiplayer as GameConfig['multiplayerMode']
      : !auto
        ? await output.select(
          'Multiplayer mode:', ['none', 'local', 'online', 'hybrid'], 'none',
        ) as GameConfig['multiplayerMode']
        : schemaDefaults.multiplayerMode

    const targetPlatforms: GameConfig['targetPlatforms'] = options.targetPlatforms
      ? options.targetPlatforms as GameConfig['targetPlatforms']
      : !auto
        ? await output.multiSelect(
          'Target platforms:',
          ['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar'],
          ['pc'],
        ) as GameConfig['targetPlatforms']
        : schemaDefaults.targetPlatforms

    // Conditional follow-ups
    let onlineServices: GameConfig['onlineServices']
    if (options.onlineServices) {
      onlineServices = options.onlineServices as GameConfig['onlineServices']
    } else if ((multiplayerMode === 'online' || multiplayerMode === 'hybrid') && !auto) {
      onlineServices = await output.multiSelect(
        'Online services:',
        ['leaderboards', 'accounts', 'matchmaking', 'live-ops'],
        [],
      ) as GameConfig['onlineServices']
    } else {
      onlineServices = schemaDefaults.onlineServices
    }

    const contentStructure: GameConfig['contentStructure'] = options.contentStructure
      ? options.contentStructure as GameConfig['contentStructure']
      : !auto
        ? await output.select(
          'Content structure:',
          ['discrete', 'open-world', 'procedural', 'endless', 'mission-based'],
          'discrete',
        ) as GameConfig['contentStructure']
        : schemaDefaults.contentStructure

    const economy: GameConfig['economy'] = options.economy
      ? options.economy as GameConfig['economy']
      : !auto
        ? await output.select(
          'Economy model:', ['none', 'progression', 'monetized', 'both'], 'none',
        ) as GameConfig['economy']
        : schemaDefaults.economy

    // Advanced options — defaults derived from Zod schema to prevent drift
    let narrative: GameConfig['narrative'] = options.narrative
      ? options.narrative as GameConfig['narrative']
      : schemaDefaults.narrative
    let supportedLocales: string[] = options.locales ?? schemaDefaults.supportedLocales
    let npcAiComplexity: GameConfig['npcAiComplexity'] = options.npcAi
      ? options.npcAi as GameConfig['npcAiComplexity']
      : schemaDefaults.npcAiComplexity
    let hasModding = options.modding ?? schemaDefaults.hasModding
    let persistence: GameConfig['persistence'] = options.persistence
      ? options.persistence as GameConfig['persistence']
      : schemaDefaults.persistence

    // If any advanced flag was provided via CLI, skip the gate question
    const hasAdvancedFlag = options.narrative !== undefined || options.locales !== undefined ||
      options.npcAi !== undefined || options.modding !== undefined || options.persistence !== undefined

    // Show advanced questions if: any advanced flag is set (force open), or user confirms
    const showAdvanced = hasAdvancedFlag || (!auto && await output.confirm('Configure advanced game options?', false))

    if (showAdvanced && !auto) {
      // Ask each unflagged advanced question interactively
      if (options.narrative === undefined) {
        narrative = await output.select(
          'Narrative depth:',
          ['none', 'light', 'heavy'],
          'none',
        ) as GameConfig['narrative']
      }
      if (options.locales === undefined) {
        supportedLocales = await output.multiInput(
          'Supported locales (comma-separated):',
          ['en'],
        )
      }
      if (options.npcAi === undefined) {
        npcAiComplexity = await output.select(
          'NPC AI complexity:',
          ['none', 'simple', 'complex'],
          'none',
        ) as GameConfig['npcAiComplexity']
      }
      if (options.modding === undefined) {
        hasModding = await output.confirm('Mod support?', false)
      }
      if (options.persistence === undefined) {
        persistence = await output.select(
          'Persistence level:',
          ['none', 'settings-only', 'profile', 'progression', 'cloud'],
          'progression',
        ) as GameConfig['persistence']
      }
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

  return { methodology, depth, platforms, traits, projectType, webAppConfig, backendConfig, cliConfig, gameConfig }
}
