import type { OutputContext } from '../cli/output/context.js'
import type {
  ProjectType, GameConfig, WebAppConfig, BackendConfig,
  CliConfig, LibraryConfig, MobileAppConfig,
  DataPipelineConfig, MlConfig, BrowserExtensionConfig,
} from '../types/index.js'
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
  libraryConfig?: LibraryConfig
  mobileAppConfig?: MobileAppConfig
  dataPipelineConfig?: DataPipelineConfig
  mlConfig?: MlConfig
  browserExtensionConfig?: BrowserExtensionConfig
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
  // Library flags
  libVisibility?: string
  libRuntimeTarget?: string
  libBundleFormat?: string
  libTypeDefinitions?: boolean
  libDocLevel?: string
  // Mobile-app flags
  mobilePlatform?: string
  mobileDistribution?: string
  mobileOffline?: string
  mobilePushNotifications?: boolean
  // Data-pipeline flags
  pipelineProcessing?: string
  pipelineOrchestration?: string
  pipelineQuality?: string
  pipelineSchema?: string
  pipelineCatalog?: boolean
  // ML flags
  mlPhase?: string
  mlModelType?: string
  mlServing?: string
  mlExperimentTracking?: boolean
  // Browser-extension flags
  extManifest?: string
  extUiSurfaces?: string[]
  extContentScript?: boolean
  extBackgroundWorker?: boolean
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

    let authMechanism: BackendConfig['authMechanism']
    if (apiStyle === 'none') {
      if (options.backendAuth && options.backendAuth !== 'none') {
        output.warn('--backend-auth ignored because --backend-api-style is none (no API to authenticate)')
      }
      authMechanism = 'none'
    } else {
      authMechanism = options.backendAuth
        ? options.backendAuth as BackendConfig['authMechanism']
        : !auto
          ? await output.select('How does the API verify requests?',
            ['none', 'jwt', 'session', 'oauth', 'apikey'],
            'none') as BackendConfig['authMechanism']
          : 'none'
    }

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

  // Library configuration
  let libraryConfig: LibraryConfig | undefined
  if (projectType === 'library') {
    if (auto && !options.libVisibility) {
      throw new Error('--lib-visibility is required in auto mode for library projects')
    }
    const visibility = options.libVisibility
      ? options.libVisibility as LibraryConfig['visibility']
      : await output.select('Library visibility?', ['public', 'internal']) as LibraryConfig['visibility']

    const runtimeTarget = options.libRuntimeTarget
      ? options.libRuntimeTarget as LibraryConfig['runtimeTarget']
      : !auto
        ? await output.select('Runtime target?',
          ['node', 'browser', 'isomorphic', 'edge'],
          'isomorphic') as LibraryConfig['runtimeTarget']
        : 'isomorphic'

    const bundleFormat = options.libBundleFormat
      ? options.libBundleFormat as LibraryConfig['bundleFormat']
      : !auto
        ? await output.select('Bundle format?',
          ['esm', 'cjs', 'dual', 'unbundled'],
          'dual') as LibraryConfig['bundleFormat']
        : 'dual'

    const hasTypeDefinitions = options.libTypeDefinitions
      ?? (!auto ? await output.confirm('Ship type definitions?', true) : true)

    const documentationLevel = options.libDocLevel
      ? options.libDocLevel as LibraryConfig['documentationLevel']
      : !auto
        ? await output.select('Documentation level?',
          ['none', 'readme', 'api-docs', 'full-site'],
          'readme') as LibraryConfig['documentationLevel']
        : 'readme'

    libraryConfig = { visibility, runtimeTarget, bundleFormat, hasTypeDefinitions, documentationLevel }
  }

  // Mobile-app configuration
  let mobileAppConfig: MobileAppConfig | undefined
  if (projectType === 'mobile-app') {
    if (auto && !options.mobilePlatform) {
      throw new Error('--mobile-platform is required in auto mode for mobile-app projects')
    }
    const platform = options.mobilePlatform
      ? options.mobilePlatform as MobileAppConfig['platform']
      : await output.select('Target platform?', ['ios', 'android', 'cross-platform']) as MobileAppConfig['platform']

    const distributionModel = options.mobileDistribution
      ? options.mobileDistribution as MobileAppConfig['distributionModel']
      : !auto
        ? await output.select('Distribution model?',
          ['public', 'private', 'mixed'],
          'public') as MobileAppConfig['distributionModel']
        : 'public'

    const offlineSupport = options.mobileOffline
      ? options.mobileOffline as MobileAppConfig['offlineSupport']
      : !auto
        ? await output.select('Offline support?',
          ['none', 'cache', 'offline-first'],
          'none') as MobileAppConfig['offlineSupport']
        : 'none'

    const hasPushNotifications = options.mobilePushNotifications
      ?? (!auto ? await output.confirm('Push notification support?', false) : false)

    mobileAppConfig = { platform, distributionModel, offlineSupport, hasPushNotifications }
  }

  // Data pipeline configuration
  let dataPipelineConfig: DataPipelineConfig | undefined
  if (projectType === 'data-pipeline') {
    if (auto && !options.pipelineProcessing) {
      throw new Error('--pipeline-processing is required in auto mode for data-pipeline projects')
    }

    const processingModel = options.pipelineProcessing
      ? options.pipelineProcessing as DataPipelineConfig['processingModel']
      : await output.select(
        'Processing model?',
        ['batch', 'streaming', 'hybrid'],
      ) as DataPipelineConfig['processingModel']

    const orchestration = options.pipelineOrchestration
      ? options.pipelineOrchestration as DataPipelineConfig['orchestration']
      : !auto
        ? await output.select('Orchestration pattern?',
          ['none', 'dag-based', 'event-driven', 'scheduled'], 'none') as DataPipelineConfig['orchestration']
        : 'none'

    const dataQualityStrategy = options.pipelineQuality
      ? options.pipelineQuality as DataPipelineConfig['dataQualityStrategy']
      : !auto
        ? await output.select('Data quality strategy?',
          ['none', 'validation', 'testing', 'observability'], 'validation') as DataPipelineConfig['dataQualityStrategy']
        : 'validation'

    const schemaManagement = options.pipelineSchema
      ? options.pipelineSchema as DataPipelineConfig['schemaManagement']
      : !auto
        ? await output.select('Schema management?',
          ['none', 'schema-registry', 'contracts'], 'none') as DataPipelineConfig['schemaManagement']
        : 'none'

    const hasDataCatalog = options.pipelineCatalog
      ?? (!auto ? await output.confirm('Data catalog support?', false) : false)

    dataPipelineConfig = { processingModel, orchestration, dataQualityStrategy, schemaManagement, hasDataCatalog }
  }

  // ML configuration
  let mlConfig: MlConfig | undefined
  if (projectType === 'ml') {
    if (auto && !options.mlPhase) {
      throw new Error('--ml-phase is required in auto mode for ml projects')
    }

    const projectPhase = options.mlPhase
      ? options.mlPhase as MlConfig['projectPhase']
      : await output.select('Project phase?', ['training', 'inference', 'both']) as MlConfig['projectPhase']

    const modelType = options.mlModelType
      ? options.mlModelType as MlConfig['modelType']
      : !auto
        ? await output.select('Model type?',
          ['classical', 'deep-learning', 'llm'], 'deep-learning') as MlConfig['modelType']
        : 'deep-learning'

    // Default serving pattern depends on project phase to satisfy schema constraints:
    // training-only requires 'none', inference/both require non-'none'
    const autoServingDefault: MlConfig['servingPattern'] =
      projectPhase === 'training' ? 'none' : 'realtime'
    const servingPattern = options.mlServing
      ? options.mlServing as MlConfig['servingPattern']
      : !auto
        ? await output.select('Serving pattern?',
          ['none', 'batch', 'realtime', 'edge'], autoServingDefault) as MlConfig['servingPattern']
        : autoServingDefault

    const hasExperimentTracking = options.mlExperimentTracking
      ?? (!auto ? await output.confirm('Experiment tracking?', true) : true)

    mlConfig = { projectPhase, modelType, servingPattern, hasExperimentTracking }
  }

  // Browser extension configuration
  let browserExtensionConfig: BrowserExtensionConfig | undefined
  if (projectType === 'browser-extension') {
    const manifestVersion = options.extManifest
      ? options.extManifest as BrowserExtensionConfig['manifestVersion']
      : !auto
        ? await output.select('Manifest version?', ['2', '3'], '3') as BrowserExtensionConfig['manifestVersion']
        : '3'

    const uiSurfaces = options.extUiSurfaces
      ? options.extUiSurfaces as BrowserExtensionConfig['uiSurfaces']
      : !auto
        ? await output.multiSelect('UI surfaces?',
          ['popup', 'options', 'newtab', 'devtools', 'sidepanel'],
          ['popup']) as BrowserExtensionConfig['uiSurfaces']
        : ['popup'] as BrowserExtensionConfig['uiSurfaces']

    const hasContentScript = options.extContentScript
      ?? (!auto ? await output.confirm('Content script support?', false) : false)

    const hasBackgroundWorker = options.extBackgroundWorker
      ?? (!auto ? await output.confirm('Background worker support?', true) : true)

    browserExtensionConfig = { manifestVersion, uiSurfaces, hasContentScript, hasBackgroundWorker }
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

  return {
    methodology, depth, platforms, traits, projectType,
    webAppConfig, backendConfig, cliConfig,
    libraryConfig, mobileAppConfig, dataPipelineConfig,
    mlConfig, browserExtensionConfig, gameConfig,
  }
}
