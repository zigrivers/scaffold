import type { OutputContext } from '../cli/output/context.js'
import type {
  ProjectType, GameConfig, WebAppConfig, BackendConfig,
  CliConfig, LibraryConfig, MobileAppConfig,
  DataPipelineConfig, MlConfig, BrowserExtensionConfig,
} from '../types/index.js'
import type {
  GameFlags, WebAppFlags, BackendFlags, CliFlags, LibraryFlags,
  MobileAppFlags, DataPipelineFlags, MlFlags, BrowserExtensionFlags,
} from './flags.js'
import { GameConfigSchema, ProjectTypeSchema } from '../config/schema.js'
import { coreCopy, getCopyForType, optionsFromCopy } from './copy/index.js'

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
}): Promise<WizardAnswers> {
  const { output, suggestion, auto } = options

  let bannerShown = false
  function showBannerOnce(): void {
    if (!bannerShown && !auto && output.supportsInteractivePrompts()) {
      output.info('Tip: Type ? at any choice prompt to see help.')
      bannerShown = true
    }
  }

  // Methodology question (skip if --methodology was provided)
  let methodology: 'deep' | 'mvp' | 'custom' = suggestion as 'deep' | 'mvp'
  if (options.methodology) {
    methodology = options.methodology as 'deep' | 'mvp' | 'custom'
  } else if (!auto) {
    // In interactive mode, ask via OutputContext.prompt
    const answer = await output.prompt<string>(
      `Select methodology (deep/mvp/custom) [${suggestion}]:`,
      suggestion,
      coreCopy.methodology,
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
    const depthStr = await output.prompt<string>('Depth (1-5) [3]:', '3', coreCopy.depth)
    const parsed = parseInt(depthStr)
    if (parsed >= 1 && parsed <= 5) depth = parsed as 1 | 2 | 3 | 4 | 5
  }

  // Platform selection (simplified — claude-code always included)
  let platforms: Array<'claude-code' | 'codex' | 'gemini'>
  if (options.adapters) {
    platforms = options.adapters as Array<'claude-code' | 'codex' | 'gemini'>
  } else if (!auto) {
    platforms = ['claude-code']
    const addCodex = await output.confirm('Include Codex adapter?', false, coreCopy.codexAdapter)
    if (addCodex) platforms.push('codex')
    const addGemini = await output.confirm('Include Gemini adapter?', false, coreCopy.geminiAdapter)
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
    const isWeb = await output.confirm('Is this a web application?', false, coreCopy.webTrait)
    if (isWeb) traits.push('web')
    const isMobile = await output.confirm('Is this a mobile application?', false, coreCopy.mobileTrait)
    if (isMobile) traits.push('mobile')
  } else {
    traits = []
  }

  // Project type question (skip if --project-type was provided)
  let projectType: ProjectType | undefined
  if (options.projectType) {
    projectType = options.projectType as ProjectType
  } else if (!auto) {
    showBannerOnce()
    const ptCopy = coreCopy.projectType
    const selected = await output.select(
      'What type of project is this?',
      optionsFromCopy(ptCopy.options!, [...ProjectTypeSchema.options]),
      'web-app',
      ptCopy,
    )
    projectType = selected as ProjectType
  }

  // Web-App configuration
  let webAppConfig: WebAppConfig | undefined
  if (projectType === 'web-app') {
    const copy = getCopyForType('web-app')
    showBannerOnce()

    if (auto && !options.webAppFlags?.webRendering) {
      throw new Error('--web-rendering is required in auto mode for web-app projects')
    }

    const renderingStrategy: WebAppConfig['renderingStrategy'] = options.webAppFlags?.webRendering
      ?? await output.select(
        'Rendering strategy?',
        optionsFromCopy(copy.renderingStrategy.options!, ['spa', 'ssr', 'ssg', 'hybrid']),
        undefined,
        copy.renderingStrategy,
      ) as WebAppConfig['renderingStrategy']

    const deployTarget: WebAppConfig['deployTarget'] = options.webAppFlags?.webDeployTarget
      ?? (!auto
        ? await output.select('Deploy target?',
          optionsFromCopy(copy.deployTarget.options!, ['static', 'serverless', 'container', 'edge', 'long-running']),
          'serverless',
          copy.deployTarget,
        ) as WebAppConfig['deployTarget']
        : 'serverless')

    const realtime: WebAppConfig['realtime'] = options.webAppFlags?.webRealtime
      ?? (!auto
        ? await output.select('Real-time needs?',
          optionsFromCopy(copy.realtime.options!, ['none', 'websocket', 'sse']),
          'none',
          copy.realtime,
        ) as WebAppConfig['realtime']
        : 'none')

    const authFlow: WebAppConfig['authFlow'] = options.webAppFlags?.webAuthFlow
      ?? (!auto
        ? await output.select('How do users authenticate?',
          optionsFromCopy(copy.authFlow.options!, ['none', 'session', 'oauth', 'passkey']),
          'none',
          copy.authFlow,
        ) as WebAppConfig['authFlow']
        : 'none')

    webAppConfig = { renderingStrategy, deployTarget, realtime, authFlow }
  }

  // Backend configuration
  let backendConfig: BackendConfig | undefined
  if (projectType === 'backend') {
    const copy = getCopyForType('backend')
    showBannerOnce()

    if (auto && !options.backendFlags?.backendApiStyle) {
      throw new Error('--backend-api-style is required in auto mode for backend projects')
    }

    const apiStyle: BackendConfig['apiStyle'] = options.backendFlags?.backendApiStyle
      ?? await output.select('API style?',
        optionsFromCopy(copy.apiStyle.options!, ['rest', 'graphql', 'grpc', 'trpc', 'none']),
        undefined,
        copy.apiStyle,
      ) as BackendConfig['apiStyle']

    const dataStore: BackendConfig['dataStore'] = options.backendFlags?.backendDataStore
      ?? (!auto
        ? await output.multiSelect('Data store(s)?',
          optionsFromCopy(copy.dataStore.options!, ['relational', 'document', 'key-value']),
          ['relational'],
          copy.dataStore,
        ) as BackendConfig['dataStore']
        : ['relational'])

    let authMechanism: BackendConfig['authMechanism']
    if (apiStyle === 'none') {
      if (options.backendFlags?.backendAuth && options.backendFlags.backendAuth !== 'none') {
        output.warn('--backend-auth ignored because --backend-api-style is none (no API to authenticate)')
      }
      authMechanism = 'none'
    } else {
      authMechanism = options.backendFlags?.backendAuth
        ?? (!auto
          ? await output.select('How does the API verify requests?',
            optionsFromCopy(copy.authMechanism.options!, ['none', 'jwt', 'session', 'oauth', 'apikey']),
            'none',
            copy.authMechanism,
          ) as BackendConfig['authMechanism']
          : 'none')
    }

    const asyncMessaging: BackendConfig['asyncMessaging'] = options.backendFlags?.backendMessaging
      ?? (!auto
        ? await output.select('Async messaging?',
          optionsFromCopy(copy.asyncMessaging.options!, ['none', 'queue', 'event-driven']),
          'none',
          copy.asyncMessaging,
        ) as BackendConfig['asyncMessaging']
        : 'none')

    const deployTarget: BackendConfig['deployTarget'] = options.backendFlags?.backendDeployTarget
      ?? (!auto
        ? await output.select('Deploy target?',
          optionsFromCopy(copy.deployTarget.options!, ['serverless', 'container', 'long-running']),
          'container',
          copy.deployTarget,
        ) as BackendConfig['deployTarget']
        : 'container')

    backendConfig = { apiStyle, dataStore, authMechanism, asyncMessaging, deployTarget }
  }

  // CLI configuration
  let cliConfig: CliConfig | undefined
  if (projectType === 'cli') {
    const copy = getCopyForType('cli')
    showBannerOnce()

    if (auto && !options.cliFlags?.cliInteractivity) {
      throw new Error('--cli-interactivity is required in auto mode for cli projects')
    }

    const interactivity: CliConfig['interactivity'] = options.cliFlags?.cliInteractivity
      ?? await output.select('Interactivity model?',
        optionsFromCopy(copy.interactivity.options!, ['args-only', 'interactive', 'hybrid']),
        undefined,
        copy.interactivity,
      ) as CliConfig['interactivity']

    const distributionChannels: CliConfig['distributionChannels'] = options.cliFlags?.cliDistribution
      ?? (!auto
        ? await output.multiSelect('Distribution channels?',
          optionsFromCopy(copy.distributionChannels.options!, ['package-manager', 'system-package-manager', 'standalone-binary', 'container']),
          ['package-manager'],
          copy.distributionChannels,
        ) as CliConfig['distributionChannels']
        : ['package-manager'])

    const hasStructuredOutput = options.cliFlags?.cliStructuredOutput
      ?? (!auto ? await output.confirm('Support structured output (--json)?', false, copy.hasStructuredOutput) : false)

    cliConfig = { interactivity, distributionChannels, hasStructuredOutput }
  }

  // Library configuration
  let libraryConfig: LibraryConfig | undefined
  if (projectType === 'library') {
    const copy = getCopyForType('library')
    showBannerOnce()

    if (auto && !options.libraryFlags?.libVisibility) {
      throw new Error('--lib-visibility is required in auto mode for library projects')
    }
    const visibility: LibraryConfig['visibility'] = options.libraryFlags?.libVisibility
      ?? await output.select('Library visibility?',
        optionsFromCopy(copy.visibility.options!, ['public', 'internal']),
        undefined,
        copy.visibility,
      ) as LibraryConfig['visibility']

    const runtimeTarget: LibraryConfig['runtimeTarget'] = options.libraryFlags?.libRuntimeTarget
      ?? (!auto
        ? await output.select('Runtime target?',
          optionsFromCopy(copy.runtimeTarget.options!, ['node', 'browser', 'isomorphic', 'edge']),
          'isomorphic',
          copy.runtimeTarget,
        ) as LibraryConfig['runtimeTarget']
        : 'isomorphic')

    const bundleFormat: LibraryConfig['bundleFormat'] = options.libraryFlags?.libBundleFormat
      ?? (!auto
        ? await output.select('Bundle format?',
          optionsFromCopy(copy.bundleFormat.options!, ['esm', 'cjs', 'dual', 'unbundled']),
          'dual',
          copy.bundleFormat,
        ) as LibraryConfig['bundleFormat']
        : 'dual')

    const hasTypeDefinitions = options.libraryFlags?.libTypeDefinitions
      ?? (!auto ? await output.confirm('Ship type definitions?', true, copy.hasTypeDefinitions) : true)

    const documentationLevel: LibraryConfig['documentationLevel'] = options.libraryFlags?.libDocLevel
      ?? (!auto
        ? await output.select('Documentation level?',
          optionsFromCopy(copy.documentationLevel.options!, ['none', 'readme', 'api-docs', 'full-site']),
          'readme',
          copy.documentationLevel,
        ) as LibraryConfig['documentationLevel']
        : 'readme')

    libraryConfig = { visibility, runtimeTarget, bundleFormat, hasTypeDefinitions, documentationLevel }
  }

  // Mobile-app configuration
  let mobileAppConfig: MobileAppConfig | undefined
  if (projectType === 'mobile-app') {
    const copy = getCopyForType('mobile-app')
    showBannerOnce()

    if (auto && !options.mobileAppFlags?.mobilePlatform) {
      throw new Error('--mobile-platform is required in auto mode for mobile-app projects')
    }
    const platform: MobileAppConfig['platform'] = options.mobileAppFlags?.mobilePlatform
      ?? await output.select(
        'Target platform?',
        optionsFromCopy(copy.platform.options!, ['ios', 'android', 'cross-platform']),
        undefined,
        copy.platform,
      ) as MobileAppConfig['platform']

    const distributionModel: MobileAppConfig['distributionModel'] = options.mobileAppFlags?.mobileDistribution
      ?? (!auto
        ? await output.select('Distribution model?',
          optionsFromCopy(copy.distributionModel.options!, ['public', 'private', 'mixed']),
          'public',
          copy.distributionModel,
        ) as MobileAppConfig['distributionModel']
        : 'public')

    const offlineSupport: MobileAppConfig['offlineSupport'] = options.mobileAppFlags?.mobileOffline
      ?? (!auto
        ? await output.select('Offline support?',
          optionsFromCopy(copy.offlineSupport.options!, ['none', 'cache', 'offline-first']),
          'none',
          copy.offlineSupport,
        ) as MobileAppConfig['offlineSupport']
        : 'none')

    const hasPushNotifications = options.mobileAppFlags?.mobilePushNotifications
      ?? (!auto ? await output.confirm('Push notification support?', false, copy.hasPushNotifications) : false)

    mobileAppConfig = { platform, distributionModel, offlineSupport, hasPushNotifications }
  }

  // Data pipeline configuration
  let dataPipelineConfig: DataPipelineConfig | undefined
  if (projectType === 'data-pipeline') {
    const copy = getCopyForType('data-pipeline')
    showBannerOnce()

    if (auto && !options.dataPipelineFlags?.pipelineProcessing) {
      throw new Error('--pipeline-processing is required in auto mode for data-pipeline projects')
    }

    const processingModel: DataPipelineConfig['processingModel'] = options.dataPipelineFlags?.pipelineProcessing
      ?? await output.select(
        'Processing model?',
        optionsFromCopy(copy.processingModel.options!, ['batch', 'streaming', 'hybrid']),
        undefined,
        copy.processingModel,
      ) as DataPipelineConfig['processingModel']

    const orchestration: DataPipelineConfig['orchestration'] = options.dataPipelineFlags?.pipelineOrchestration
      ?? (!auto
        ? await output.select('Orchestration pattern?',
          optionsFromCopy(copy.orchestration.options!, ['none', 'dag-based', 'event-driven', 'scheduled']),
          'none',
          copy.orchestration,
        ) as DataPipelineConfig['orchestration']
        : 'none')

    const dataQualityStrategy: DataPipelineConfig['dataQualityStrategy'] = options.dataPipelineFlags?.pipelineQuality
      ?? (!auto
        ? await output.select('Data quality strategy?',
          optionsFromCopy(copy.dataQualityStrategy.options!, ['none', 'validation', 'testing', 'observability']),
          'validation',
          copy.dataQualityStrategy,
        ) as DataPipelineConfig['dataQualityStrategy']
        : 'validation')

    const schemaManagement: DataPipelineConfig['schemaManagement'] = options.dataPipelineFlags?.pipelineSchema
      ?? (!auto
        ? await output.select('Schema management?',
          optionsFromCopy(copy.schemaManagement.options!, ['none', 'schema-registry', 'contracts']),
          'none',
          copy.schemaManagement,
        ) as DataPipelineConfig['schemaManagement']
        : 'none')

    const hasDataCatalog = options.dataPipelineFlags?.pipelineCatalog
      ?? (!auto ? await output.confirm('Data catalog support?', false, copy.hasDataCatalog) : false)

    dataPipelineConfig = { processingModel, orchestration, dataQualityStrategy, schemaManagement, hasDataCatalog }
  }

  // ML configuration
  let mlConfig: MlConfig | undefined
  if (projectType === 'ml') {
    const copy = getCopyForType('ml')
    showBannerOnce()

    if (auto && !options.mlFlags?.mlPhase) {
      throw new Error('--ml-phase is required in auto mode for ml projects')
    }

    const projectPhase: MlConfig['projectPhase'] = options.mlFlags?.mlPhase
      ?? await output.select(
        'Project phase?',
        optionsFromCopy(copy.projectPhase.options!, ['training', 'inference', 'both']),
        undefined,
        copy.projectPhase,
      ) as MlConfig['projectPhase']

    const modelType: MlConfig['modelType'] = options.mlFlags?.mlModelType
      ?? (!auto
        ? await output.select('Model type?',
          optionsFromCopy(copy.modelType.options!, ['classical', 'deep-learning', 'llm']),
          'deep-learning',
          copy.modelType,
        ) as MlConfig['modelType']
        : 'deep-learning')

    // Default serving pattern depends on project phase to satisfy schema constraints:
    // training-only requires 'none', inference/both require non-'none'
    const autoServingDefault: MlConfig['servingPattern'] =
      projectPhase === 'training' ? 'none' : 'realtime'
    const servingPattern: MlConfig['servingPattern'] = options.mlFlags?.mlServing
      ?? (!auto
        ? await output.select('Serving pattern?',
          optionsFromCopy(copy.servingPattern.options!, ['none', 'batch', 'realtime', 'edge']),
          autoServingDefault,
          copy.servingPattern,
        ) as MlConfig['servingPattern']
        : autoServingDefault)

    const hasExperimentTracking = options.mlFlags?.mlExperimentTracking
      ?? (!auto ? await output.confirm('Experiment tracking?', true, copy.hasExperimentTracking) : true)

    mlConfig = { projectPhase, modelType, servingPattern, hasExperimentTracking }
  }

  // Browser extension configuration
  let browserExtensionConfig: BrowserExtensionConfig | undefined
  if (projectType === 'browser-extension') {
    const copy = getCopyForType('browser-extension')
    showBannerOnce()

    const manifestVersion: BrowserExtensionConfig['manifestVersion'] = options.browserExtensionFlags?.extManifest
      ?? (!auto
        ? await output.select('Manifest version?',
          optionsFromCopy(copy.manifestVersion.options!, ['2', '3']),
          '3',
          copy.manifestVersion,
        ) as BrowserExtensionConfig['manifestVersion']
        : '3')

    const uiSurfaces: BrowserExtensionConfig['uiSurfaces'] = options.browserExtensionFlags?.extUiSurfaces
      ?? (!auto
        ? await output.multiSelect('UI surfaces?',
          optionsFromCopy(copy.uiSurfaces.options!, ['popup', 'options', 'newtab', 'devtools', 'sidepanel']),
          ['popup'],
          copy.uiSurfaces,
        ) as BrowserExtensionConfig['uiSurfaces']
        : ['popup'])

    const hasContentScript = options.browserExtensionFlags?.extContentScript
      ?? (!auto ? await output.confirm('Content script support?', false, copy.hasContentScript) : false)

    const hasBackgroundWorker = options.browserExtensionFlags?.extBackgroundWorker
      ?? (!auto ? await output.confirm('Background worker support?', true, copy.hasBackgroundWorker) : true)

    browserExtensionConfig = { manifestVersion, uiSurfaces, hasContentScript, hasBackgroundWorker }
  }

  // Game config questions (only when projectType === 'game')
  let gameConfig: GameConfig | undefined
  if (projectType === 'game') {
    const copy = getCopyForType('game')
    showBannerOnce()

    const gf = options.gameFlags
    // Core questions — use flag if provided, else ask (or default in auto mode)
    const engine: GameConfig['engine'] = gf?.engine
      ?? (!auto
        ? await output.select(
          'Game engine:',
          optionsFromCopy(copy.engine.options!, ['unity', 'unreal', 'godot', 'custom']),
          undefined,
          copy.engine,
        ) as GameConfig['engine']
        : 'custom')

    // Derive Zod defaults from engine (used for auto mode and advanced defaults)
    const schemaDefaults = GameConfigSchema.parse({ engine })

    const multiplayerMode: GameConfig['multiplayerMode'] = gf?.multiplayer
      ?? (!auto
        ? await output.select(
          'Multiplayer mode:',
          optionsFromCopy(copy.multiplayerMode.options!, ['none', 'local', 'online', 'hybrid']),
          'none',
          copy.multiplayerMode,
        ) as GameConfig['multiplayerMode']
        : schemaDefaults.multiplayerMode)

    const targetPlatforms: GameConfig['targetPlatforms'] = gf?.targetPlatforms
      ?? (!auto
        ? await output.multiSelect(
          'Target platforms:',
          optionsFromCopy(copy.targetPlatforms.options!, ['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar']),
          ['pc'],
          copy.targetPlatforms,
        ) as GameConfig['targetPlatforms']
        : schemaDefaults.targetPlatforms)

    // Conditional follow-ups
    let onlineServices: GameConfig['onlineServices']
    if (gf?.onlineServices) {
      onlineServices = gf.onlineServices
    } else if ((multiplayerMode === 'online' || multiplayerMode === 'hybrid') && !auto) {
      onlineServices = await output.multiSelect(
        'Online services:',
        optionsFromCopy(copy.onlineServices.options!, ['leaderboards', 'accounts', 'matchmaking', 'live-ops']),
        [],
        copy.onlineServices,
      ) as GameConfig['onlineServices']
    } else {
      onlineServices = schemaDefaults.onlineServices
    }

    const contentStructure: GameConfig['contentStructure'] = gf?.contentStructure
      ?? (!auto
        ? await output.select(
          'Content structure:',
          optionsFromCopy(copy.contentStructure.options!, ['discrete', 'open-world', 'procedural', 'endless', 'mission-based']),
          'discrete',
          copy.contentStructure,
        ) as GameConfig['contentStructure']
        : schemaDefaults.contentStructure)

    const economy: GameConfig['economy'] = gf?.economy
      ?? (!auto
        ? await output.select(
          'Economy model:',
          optionsFromCopy(copy.economy.options!, ['none', 'progression', 'monetized', 'both']),
          'none',
          copy.economy,
        ) as GameConfig['economy']
        : schemaDefaults.economy)

    // Advanced options — defaults derived from Zod schema to prevent drift
    let narrative: GameConfig['narrative'] = gf?.narrative ?? schemaDefaults.narrative
    let supportedLocales: string[] = gf?.locales ?? schemaDefaults.supportedLocales
    let npcAiComplexity: GameConfig['npcAiComplexity'] = gf?.npcAi ?? schemaDefaults.npcAiComplexity
    let hasModding = gf?.modding ?? schemaDefaults.hasModding
    let persistence: GameConfig['persistence'] = gf?.persistence ?? schemaDefaults.persistence

    // If any advanced flag was provided via CLI, skip the gate question
    const hasAdvancedFlag = gf?.narrative !== undefined || gf?.locales !== undefined ||
      gf?.npcAi !== undefined || gf?.modding !== undefined || gf?.persistence !== undefined

    // Show advanced questions if: any advanced flag is set (force open), or user confirms
    const showAdvanced = hasAdvancedFlag || (!auto && await output.confirm('Configure advanced game options?', false, coreCopy.advancedGameGate))

    if (showAdvanced && !auto) {
      // Ask each unflagged advanced question interactively
      if (gf?.narrative === undefined) {
        narrative = await output.select(
          'Narrative depth:',
          optionsFromCopy(copy.narrative.options!, ['none', 'light', 'heavy']),
          'none',
          copy.narrative,
        ) as GameConfig['narrative']
      }
      if (gf?.locales === undefined) {
        supportedLocales = await output.multiInput(
          'Supported locales (comma-separated):',
          ['en'],
          copy.supportedLocales,
        )
      }
      if (gf?.npcAi === undefined) {
        npcAiComplexity = await output.select(
          'NPC AI complexity:',
          optionsFromCopy(copy.npcAiComplexity.options!, ['none', 'simple', 'complex']),
          'none',
          copy.npcAiComplexity,
        ) as GameConfig['npcAiComplexity']
      }
      if (gf?.modding === undefined) {
        hasModding = await output.confirm('Mod support?', false, copy.hasModding)
      }
      if (gf?.persistence === undefined) {
        persistence = await output.select(
          'Persistence level:',
          optionsFromCopy(copy.persistence.options!, ['none', 'settings-only', 'profile', 'progression', 'cloud']),
          'progression',
          copy.persistence,
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
