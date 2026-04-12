/**
 * Flag family constants and validation shared by `scaffold init` and
 * `scaffold adopt`.
 *
 * Extracted from `src/cli/commands/init.ts` so that adopt can reuse the
 * same family detection, mixed-family rejection, and project-type
 * consistency checks without duplicating the logic.
 *
 * Every constant keeps its `as const` assertion — the literal union
 * narrowing is relied on elsewhere for type-safe argv key lookups.
 */

import type { z } from 'zod'
import type {
  GameConfigSchema,
  WebAppConfigSchema,
  BackendConfigSchema,
  CliConfigSchema,
  LibraryConfigSchema,
  MobileAppConfigSchema,
  DataPipelineConfigSchema,
  MlConfigSchema,
  BrowserExtensionConfigSchema,
  ResearchConfigSchema,
} from '../config/schema.js'

// Local type aliases keep the `buildFlagOverrides` cast sites readable
// without introducing new runtime dependencies.
type GameConfig = z.infer<typeof GameConfigSchema>
type WebAppConfig = z.infer<typeof WebAppConfigSchema>
type BackendConfig = z.infer<typeof BackendConfigSchema>
type CliConfig = z.infer<typeof CliConfigSchema>
type LibraryConfig = z.infer<typeof LibraryConfigSchema>
type MobileAppConfig = z.infer<typeof MobileAppConfigSchema>
type DataPipelineConfig = z.infer<typeof DataPipelineConfigSchema>
type MlConfig = z.infer<typeof MlConfigSchema>
type BrowserExtensionConfig = z.infer<typeof BrowserExtensionConfigSchema>
type ResearchConfig = z.infer<typeof ResearchConfigSchema>

// ---------------------------------------------------------------------------
// Flag family constants (verbatim from init.ts)
// ---------------------------------------------------------------------------

export const PROJECT_TYPE_FLAG = 'project-type' as const

export const GAME_FLAGS = [
  'engine', 'multiplayer', 'target-platforms', 'online-services',
  'content-structure', 'economy', 'narrative', 'locales',
  'npc-ai', 'modding', 'persistence',
] as const

export const WEB_FLAGS = [
  'web-rendering', 'web-deploy-target',
  'web-realtime', 'web-auth-flow',
] as const

export const BACKEND_FLAGS = [
  'backend-api-style', 'backend-data-store', 'backend-auth',
  'backend-messaging', 'backend-deploy-target',
] as const

export const CLI_TYPE_FLAGS = [
  'cli-interactivity', 'cli-distribution',
  'cli-structured-output',
] as const

export const LIB_FLAGS = [
  'lib-visibility', 'lib-runtime-target', 'lib-bundle-format',
  'lib-type-definitions', 'lib-doc-level',
] as const

export const MOBILE_FLAGS = [
  'mobile-platform', 'mobile-distribution', 'mobile-offline', 'mobile-push-notifications',
] as const

export const PIPELINE_FLAGS = [
  'pipeline-processing', 'pipeline-orchestration',
  'pipeline-quality', 'pipeline-schema', 'pipeline-catalog',
] as const
export const ML_FLAGS = ['ml-phase', 'ml-model-type', 'ml-serving', 'ml-experiment-tracking'] as const
export const EXT_FLAGS = ['ext-manifest', 'ext-ui-surfaces', 'ext-content-script', 'ext-background-worker'] as const
export const RESEARCH_FLAGS = [
  'research-driver', 'research-interaction', 'research-domain', 'research-tracking',
] as const

// ---------------------------------------------------------------------------
// Discriminated-union payload for adopt's merge pipeline
// ---------------------------------------------------------------------------

export type PartialConfigOverrides =
  | { type: 'game'; partial: Partial<GameConfig> }
  | { type: 'web-app'; partial: Partial<WebAppConfig> }
  | { type: 'backend'; partial: Partial<BackendConfig> }
  | { type: 'cli'; partial: Partial<CliConfig> }
  | { type: 'library'; partial: Partial<LibraryConfig> }
  | { type: 'mobile-app'; partial: Partial<MobileAppConfig> }
  | { type: 'data-pipeline'; partial: Partial<DataPipelineConfig> }
  | { type: 'ml'; partial: Partial<MlConfig> }
  | { type: 'browser-extension'; partial: Partial<BrowserExtensionConfig> }
  | { type: 'research'; partial: Partial<ResearchConfig> }
  | undefined

// ---------------------------------------------------------------------------
// Private family detection helper
// ---------------------------------------------------------------------------

/**
 * Detect which project-type flag family an argv belongs to.
 *
 * Checks flag families in the canonical precedence order (game → web-app →
 * backend → cli → library → mobile-app → data-pipeline → ml →
 * browser-extension) and returns the first match, or `undefined` when no
 * type-specific flags are present.
 *
 * This helper intentionally returns only the first precedence match — it is
 * NOT suitable for mixed-family detection. `applyFlagFamilyValidation`
 * computes its own booleans because it needs to know about ALL families
 * present in argv to reject mixed-family usage.
 */
function detectFamily(
  argv: Record<string, unknown>,
):
  | 'game'
  | 'web-app'
  | 'backend'
  | 'cli'
  | 'library'
  | 'mobile-app'
  | 'data-pipeline'
  | 'ml'
  | 'browser-extension'
  | 'research'
  | undefined {
  if (GAME_FLAGS.some((f) => argv[f] !== undefined)) return 'game'
  if (WEB_FLAGS.some((f) => argv[f] !== undefined)) return 'web-app'
  if (BACKEND_FLAGS.some((f) => argv[f] !== undefined)) return 'backend'
  if (CLI_TYPE_FLAGS.some((f) => argv[f] !== undefined)) return 'cli'
  if (LIB_FLAGS.some((f) => argv[f] !== undefined)) return 'library'
  if (MOBILE_FLAGS.some((f) => argv[f] !== undefined)) return 'mobile-app'
  if (PIPELINE_FLAGS.some((f) => argv[f] !== undefined)) return 'data-pipeline'
  if (ML_FLAGS.some((f) => argv[f] !== undefined)) return 'ml'
  if (EXT_FLAGS.some((f) => argv[f] !== undefined)) return 'browser-extension'
  if (RESEARCH_FLAGS.some((f) => argv[f] !== undefined)) return 'research'
  return undefined
}

// ---------------------------------------------------------------------------
// Validation (verbatim from init.ts .check() closure, minus init-only checks)
// ---------------------------------------------------------------------------

/**
 * Apply all project-type flag-family validation rules.
 *
 * Throws on violation and returns `true` on success so it can be used as
 * the body of yargs' `.check()` contract.
 *
 * Init-only checks (`--depth`, `--adapters`, `--traits`) stay in the init
 * command's own `.check()` closure.
 */
export function applyFlagFamilyValidation(argv: Record<string, unknown>): true | never {
  // Game flags auto-set --project-type game; error if explicitly non-game
  const hasGameFlag = GAME_FLAGS.some((f) => argv[f] !== undefined)
  if (hasGameFlag) {
    if (argv['project-type'] !== undefined && argv['project-type'] !== 'game') {
      throw new Error('Game flags (--engine, --multiplayer, etc.) require --project-type game')
    }
  }

  // --online-services requires --multiplayer online|hybrid
  if (argv['online-services'] !== undefined) {
    if (argv.multiplayer !== 'online' && argv.multiplayer !== 'hybrid') {
      throw new Error('--online-services requires --multiplayer online or --multiplayer hybrid')
    }
  }

  const validPlatforms = ['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar']
  if (argv['target-platforms']) {
    for (const p of argv['target-platforms'] as string[]) {
      if (!validPlatforms.includes(p)) {
        throw new Error(`Invalid target platform "${p}". Valid: ${validPlatforms.join(', ')}`)
      }
    }
  }

  const validServices = ['leaderboards', 'accounts', 'matchmaking', 'live-ops']
  if (argv['online-services']) {
    for (const s of argv['online-services'] as string[]) {
      if (!validServices.includes(s)) {
        throw new Error(`Invalid online service "${s}". Valid: ${validServices.join(', ')}`)
      }
    }
  }

  // Validate locale format
  const localeRegex = /^[a-z]{2}(-[A-Z]{2})?$/
  if (argv.locales) {
    for (const l of argv.locales as string[]) {
      if (!localeRegex.test(l)) {
        throw new Error(`Invalid locale "${l}". Must match pattern: en, en-US, ja, fr-FR`)
      }
    }
  }

  // New project type flag detection
  const hasWebFlag = WEB_FLAGS.some((f) => argv[f] !== undefined)
  const hasBackendFlag = BACKEND_FLAGS.some(
    (f) => argv[f] !== undefined,
  )
  const hasCliFlag = CLI_TYPE_FLAGS.some(
    (f) => argv[f] !== undefined,
  )
  const hasLibFlag = LIB_FLAGS.some((f) => argv[f] !== undefined)
  const hasMobileFlag = MOBILE_FLAGS.some((f) => argv[f] !== undefined)
  const hasPipelineFlag = PIPELINE_FLAGS.some((f) => argv[f] !== undefined)
  const hasMlFlag = ML_FLAGS.some((f) => argv[f] !== undefined)
  const hasExtFlag = EXT_FLAGS.some((f) => argv[f] !== undefined)
  const hasResearchFlag = RESEARCH_FLAGS.some((f) => argv[f] !== undefined)

  // Reject mixed-family flags
  const typeCount = [
    hasGameFlag, hasWebFlag, hasBackendFlag,
    hasCliFlag, hasLibFlag, hasMobileFlag,
    hasPipelineFlag, hasMlFlag, hasExtFlag,
    hasResearchFlag,
  ].filter(Boolean).length
  if (typeCount > 1) {
    throw new Error(
      'Cannot mix flags from multiple project types'
      + ' (--web-*, --backend-*, --cli-*, --lib-*, --mobile-*, --pipeline-*, --ml-*, --research-*, --ext-*, game flags)',
    )
  }

  // Web flags require web-app project type
  if (hasWebFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'web-app') {
    throw new Error('--web-* flags require --project-type web-app')
  }
  if (hasBackendFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'backend') {
    throw new Error('--backend-* flags require --project-type backend')
  }
  if (hasCliFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'cli') {
    throw new Error('--cli-* flags require --project-type cli')
  }
  if (hasLibFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'library') {
    throw new Error('--lib-* flags require --project-type library')
  }
  if (hasMobileFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'mobile-app') {
    throw new Error('--mobile-* flags require --project-type mobile-app')
  }
  if (hasPipelineFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'data-pipeline') {
    throw new Error('--pipeline-* flags require --project-type data-pipeline')
  }
  if (hasMlFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'ml') {
    throw new Error('--ml-* flags require --project-type ml')
  }
  if (hasExtFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'browser-extension') {
    throw new Error('--ext-* flags require --project-type browser-extension')
  }
  if (hasResearchFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'research') {
    throw new Error('--research-* flags require --project-type research')
  }
  // Cross-field: notebook-driven + autonomous
  if (argv['research-driver'] === 'notebook-driven' && argv['research-interaction'] === 'autonomous') {
    throw new Error('Notebook-driven execution cannot be fully autonomous')
  }

  // CSV enum validation for array flags
  const validDataStores = ['relational', 'document', 'key-value']
  if (argv['backend-data-store']) {
    const invalid = (argv['backend-data-store'] as string[]).filter(
      (v: string) => !validDataStores.includes(v),
    )
    if (invalid.length) {
      throw new Error(
        `Invalid --backend-data-store value(s): ${invalid.join(', ')}`,
      )
    }
  }
  if (
    argv['backend-data-store'] &&
    (argv['backend-data-store'] as string[]).length === 0
  ) {
    throw new Error('--backend-data-store requires at least one value')
  }
  const validDistChannels = [
    'package-manager', 'system-package-manager',
    'standalone-binary', 'container',
  ]
  if (argv['cli-distribution']) {
    const invalid = (argv['cli-distribution'] as string[]).filter(
      (v: string) => !validDistChannels.includes(v),
    )
    if (invalid.length) {
      throw new Error(
        `Invalid --cli-distribution value(s): ${invalid.join(', ')}`,
      )
    }
  }
  if (
    argv['cli-distribution'] &&
    (argv['cli-distribution'] as string[]).length === 0
  ) {
    throw new Error('--cli-distribution requires at least one value')
  }
  const validUiSurfaces = ['popup', 'options', 'newtab', 'devtools', 'sidepanel']
  if (argv['ext-ui-surfaces']) {
    const invalid = (argv['ext-ui-surfaces'] as string[]).filter(
      (v: string) => !validUiSurfaces.includes(v),
    )
    if (invalid.length) {
      throw new Error(
        `Invalid --ext-ui-surfaces value(s): ${invalid.join(', ')}`,
      )
    }
  }
  if (
    argv['ext-ui-surfaces'] &&
    (argv['ext-ui-surfaces'] as string[]).length === 0
  ) {
    throw new Error('--ext-ui-surfaces requires at least one value')
  }

  // WebApp cross-field validation
  if (['ssr', 'hybrid'].includes(argv['web-rendering'] as string) && argv['web-deploy-target'] === 'static') {
    throw new Error('SSR/hybrid rendering requires compute, not static hosting')
  }
  if (argv['web-auth-flow'] === 'session' && argv['web-deploy-target'] === 'static') {
    throw new Error('Session auth requires server state, incompatible with static hosting')
  }

  return true
}

// ---------------------------------------------------------------------------
// buildFlagOverrides — argv → PartialConfigOverrides (for adopt merge)
// ---------------------------------------------------------------------------

/**
 * Walk argv and return a discriminated-union payload keyed by the detected
 * project-type flag family. Returns `undefined` when no type-specific flags
 * are present.
 *
 * Field names are mapped from the kebab-case CLI flag form to the camelCase
 * schema field names (see `src/config/schema.ts`). Precedence matches the
 * init command's detection order: game → web-app → backend → cli → library
 * → mobile-app → data-pipeline → ml → browser-extension.
 *
 * `applyFlagFamilyValidation` must be called before this function to
 * guarantee at most one family is present in argv.
 */
export function buildFlagOverrides(argv: Record<string, unknown>): PartialConfigOverrides {
  const family = detectFamily(argv)
  switch (family) {
  case 'game': {
    const partial: Partial<GameConfig> = {}
    if (argv.engine !== undefined) {
      partial.engine = argv.engine as GameConfig['engine']
    }
    if (argv.multiplayer !== undefined) {
      partial.multiplayerMode = argv.multiplayer as GameConfig['multiplayerMode']
    }
    if (argv['target-platforms'] !== undefined) {
      partial.targetPlatforms = argv['target-platforms'] as GameConfig['targetPlatforms']
    }
    if (argv['online-services'] !== undefined) {
      partial.onlineServices = argv['online-services'] as GameConfig['onlineServices']
    }
    if (argv['content-structure'] !== undefined) {
      partial.contentStructure = argv['content-structure'] as GameConfig['contentStructure']
    }
    if (argv.economy !== undefined) {
      partial.economy = argv.economy as GameConfig['economy']
    }
    if (argv.narrative !== undefined) {
      partial.narrative = argv.narrative as GameConfig['narrative']
    }
    if (argv.locales !== undefined) {
      partial.supportedLocales = argv.locales as GameConfig['supportedLocales']
    }
    if (argv['npc-ai'] !== undefined) {
      partial.npcAiComplexity = argv['npc-ai'] as GameConfig['npcAiComplexity']
    }
    if (argv.modding !== undefined) {
      partial.hasModding = argv.modding as boolean
    }
    if (argv.persistence !== undefined) {
      partial.persistence = argv.persistence as GameConfig['persistence']
    }
    return { type: 'game', partial }
  }
  case 'web-app': {
    const partial: Partial<WebAppConfig> = {}
    if (argv['web-rendering'] !== undefined) {
      partial.renderingStrategy = argv['web-rendering'] as WebAppConfig['renderingStrategy']
    }
    if (argv['web-deploy-target'] !== undefined) {
      partial.deployTarget = argv['web-deploy-target'] as WebAppConfig['deployTarget']
    }
    if (argv['web-realtime'] !== undefined) {
      partial.realtime = argv['web-realtime'] as WebAppConfig['realtime']
    }
    if (argv['web-auth-flow'] !== undefined) {
      partial.authFlow = argv['web-auth-flow'] as WebAppConfig['authFlow']
    }
    return { type: 'web-app', partial }
  }
  case 'backend': {
    const partial: Partial<BackendConfig> = {}
    if (argv['backend-api-style'] !== undefined) {
      partial.apiStyle = argv['backend-api-style'] as BackendConfig['apiStyle']
    }
    if (argv['backend-data-store'] !== undefined) {
      partial.dataStore = argv['backend-data-store'] as BackendConfig['dataStore']
    }
    if (argv['backend-auth'] !== undefined) {
      partial.authMechanism = argv['backend-auth'] as BackendConfig['authMechanism']
    }
    if (argv['backend-messaging'] !== undefined) {
      partial.asyncMessaging = argv['backend-messaging'] as BackendConfig['asyncMessaging']
    }
    if (argv['backend-deploy-target'] !== undefined) {
      partial.deployTarget = argv['backend-deploy-target'] as BackendConfig['deployTarget']
    }
    return { type: 'backend', partial }
  }
  case 'cli': {
    const partial: Partial<CliConfig> = {}
    if (argv['cli-interactivity'] !== undefined) {
      partial.interactivity = argv['cli-interactivity'] as CliConfig['interactivity']
    }
    if (argv['cli-distribution'] !== undefined) {
      partial.distributionChannels = argv['cli-distribution'] as CliConfig['distributionChannels']
    }
    if (argv['cli-structured-output'] !== undefined) {
      partial.hasStructuredOutput = argv['cli-structured-output'] as boolean
    }
    return { type: 'cli', partial }
  }
  case 'library': {
    const partial: Partial<LibraryConfig> = {}
    if (argv['lib-visibility'] !== undefined) {
      partial.visibility = argv['lib-visibility'] as LibraryConfig['visibility']
    }
    if (argv['lib-runtime-target'] !== undefined) {
      partial.runtimeTarget = argv['lib-runtime-target'] as LibraryConfig['runtimeTarget']
    }
    if (argv['lib-bundle-format'] !== undefined) {
      partial.bundleFormat = argv['lib-bundle-format'] as LibraryConfig['bundleFormat']
    }
    if (argv['lib-type-definitions'] !== undefined) {
      partial.hasTypeDefinitions = argv['lib-type-definitions'] as boolean
    }
    if (argv['lib-doc-level'] !== undefined) {
      partial.documentationLevel = argv['lib-doc-level'] as LibraryConfig['documentationLevel']
    }
    return { type: 'library', partial }
  }
  case 'mobile-app': {
    const partial: Partial<MobileAppConfig> = {}
    if (argv['mobile-platform'] !== undefined) {
      partial.platform = argv['mobile-platform'] as MobileAppConfig['platform']
    }
    if (argv['mobile-distribution'] !== undefined) {
      partial.distributionModel = argv['mobile-distribution'] as MobileAppConfig['distributionModel']
    }
    if (argv['mobile-offline'] !== undefined) {
      partial.offlineSupport = argv['mobile-offline'] as MobileAppConfig['offlineSupport']
    }
    if (argv['mobile-push-notifications'] !== undefined) {
      partial.hasPushNotifications = argv['mobile-push-notifications'] as boolean
    }
    return { type: 'mobile-app', partial }
  }
  case 'data-pipeline': {
    const partial: Partial<DataPipelineConfig> = {}
    if (argv['pipeline-processing'] !== undefined) {
      partial.processingModel = argv['pipeline-processing'] as DataPipelineConfig['processingModel']
    }
    if (argv['pipeline-orchestration'] !== undefined) {
      partial.orchestration = argv['pipeline-orchestration'] as DataPipelineConfig['orchestration']
    }
    if (argv['pipeline-quality'] !== undefined) {
      partial.dataQualityStrategy = argv['pipeline-quality'] as DataPipelineConfig['dataQualityStrategy']
    }
    if (argv['pipeline-schema'] !== undefined) {
      partial.schemaManagement = argv['pipeline-schema'] as DataPipelineConfig['schemaManagement']
    }
    if (argv['pipeline-catalog'] !== undefined) {
      partial.hasDataCatalog = argv['pipeline-catalog'] as boolean
    }
    return { type: 'data-pipeline', partial }
  }
  case 'ml': {
    const partial: Partial<MlConfig> = {}
    if (argv['ml-phase'] !== undefined) {
      partial.projectPhase = argv['ml-phase'] as MlConfig['projectPhase']
    }
    if (argv['ml-model-type'] !== undefined) {
      partial.modelType = argv['ml-model-type'] as MlConfig['modelType']
    }
    if (argv['ml-serving'] !== undefined) {
      partial.servingPattern = argv['ml-serving'] as MlConfig['servingPattern']
    }
    if (argv['ml-experiment-tracking'] !== undefined) {
      partial.hasExperimentTracking = argv['ml-experiment-tracking'] as boolean
    }
    return { type: 'ml', partial }
  }
  case 'browser-extension': {
    const partial: Partial<BrowserExtensionConfig> = {}
    if (argv['ext-manifest'] !== undefined) {
      partial.manifestVersion = argv['ext-manifest'] as BrowserExtensionConfig['manifestVersion']
    }
    if (argv['ext-ui-surfaces'] !== undefined) {
      partial.uiSurfaces = argv['ext-ui-surfaces'] as BrowserExtensionConfig['uiSurfaces']
    }
    if (argv['ext-content-script'] !== undefined) {
      partial.hasContentScript = argv['ext-content-script'] as boolean
    }
    if (argv['ext-background-worker'] !== undefined) {
      partial.hasBackgroundWorker = argv['ext-background-worker'] as boolean
    }
    return { type: 'browser-extension', partial }
  }
  case 'research': {
    const partial: Partial<ResearchConfig> = {}
    if (argv['research-driver'] !== undefined) {
      partial.experimentDriver = argv['research-driver'] as ResearchConfig['experimentDriver']
    }
    if (argv['research-interaction'] !== undefined) {
      partial.interactionMode = argv['research-interaction'] as ResearchConfig['interactionMode']
    }
    if (argv['research-domain'] !== undefined) {
      partial.domain = argv['research-domain'] as ResearchConfig['domain']
    }
    if (argv['research-tracking'] !== undefined) {
      partial.hasExperimentTracking = argv['research-tracking'] as boolean
    }
    return { type: 'research', partial }
  }
  default:
    return undefined
  }
}
