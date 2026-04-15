/**
 * Per-project-type flag interfaces.
 *
 * Each project type collects its CLI-flag values into one grouped interface
 * so that adding a new project type is a focused change (one new flag
 * interface + one new question block) rather than threading 4-5 fields
 * through WizardOptions, runWizard, askWizardQuestions, and tests.
 *
 * Field types are derived from the Zod-derived config types so the valid
 * values are tracked in a single source of truth (the schema). The broad
 * `string`/`string[]` yargs values are narrowed to these literal unions at
 * the single CLI boundary in `src/cli/commands/init.ts`, which is safe
 * because yargs' `choices:` validates enum values at runtime.
 *
 * Field names within each group match the camelCase form of the CLI flag
 * names (e.g., `--web-rendering` → `webRendering`).
 */

import type {
  GameConfig, WebAppConfig, BackendConfig, CliConfig, LibraryConfig,
  MobileAppConfig, DataPipelineConfig, MlConfig, BrowserExtensionConfig,
  ResearchConfig,
} from '../types/index.js'

export interface GameFlags {
  engine?: GameConfig['engine']
  multiplayer?: GameConfig['multiplayerMode']
  targetPlatforms?: GameConfig['targetPlatforms']
  onlineServices?: GameConfig['onlineServices']
  contentStructure?: GameConfig['contentStructure']
  economy?: GameConfig['economy']
  narrative?: GameConfig['narrative']
  locales?: GameConfig['supportedLocales']
  npcAi?: GameConfig['npcAiComplexity']
  modding?: GameConfig['hasModding']
  persistence?: GameConfig['persistence']
}

export interface WebAppFlags {
  webRendering?: WebAppConfig['renderingStrategy']
  webDeployTarget?: WebAppConfig['deployTarget']
  webRealtime?: WebAppConfig['realtime']
  webAuthFlow?: WebAppConfig['authFlow']
}

export interface BackendFlags {
  backendApiStyle?: BackendConfig['apiStyle']
  backendDataStore?: BackendConfig['dataStore']
  backendAuth?: BackendConfig['authMechanism']
  backendMessaging?: BackendConfig['asyncMessaging']
  backendDeployTarget?: BackendConfig['deployTarget']
  backendDomain?: BackendConfig['domain']
}

export interface CliFlags {
  cliInteractivity?: CliConfig['interactivity']
  cliDistribution?: CliConfig['distributionChannels']
  cliStructuredOutput?: CliConfig['hasStructuredOutput']
}

export interface LibraryFlags {
  libVisibility?: LibraryConfig['visibility']
  libRuntimeTarget?: LibraryConfig['runtimeTarget']
  libBundleFormat?: LibraryConfig['bundleFormat']
  libTypeDefinitions?: LibraryConfig['hasTypeDefinitions']
  libDocLevel?: LibraryConfig['documentationLevel']
}

export interface MobileAppFlags {
  mobilePlatform?: MobileAppConfig['platform']
  mobileDistribution?: MobileAppConfig['distributionModel']
  mobileOffline?: MobileAppConfig['offlineSupport']
  mobilePushNotifications?: MobileAppConfig['hasPushNotifications']
}

export interface DataPipelineFlags {
  pipelineProcessing?: DataPipelineConfig['processingModel']
  pipelineOrchestration?: DataPipelineConfig['orchestration']
  pipelineQuality?: DataPipelineConfig['dataQualityStrategy']
  pipelineSchema?: DataPipelineConfig['schemaManagement']
  pipelineCatalog?: DataPipelineConfig['hasDataCatalog']
}

export interface MlFlags {
  mlPhase?: MlConfig['projectPhase']
  mlModelType?: MlConfig['modelType']
  mlServing?: MlConfig['servingPattern']
  mlExperimentTracking?: MlConfig['hasExperimentTracking']
}

export interface BrowserExtensionFlags {
  extManifest?: BrowserExtensionConfig['manifestVersion']
  extUiSurfaces?: BrowserExtensionConfig['uiSurfaces']
  extContentScript?: BrowserExtensionConfig['hasContentScript']
  extBackgroundWorker?: BrowserExtensionConfig['hasBackgroundWorker']
}

export interface ResearchFlags {
  researchDriver?: ResearchConfig['experimentDriver']
  researchInteraction?: ResearchConfig['interactionMode']
  researchDomain?: ResearchConfig['domain']
  researchTracking?: ResearchConfig['hasExperimentTracking']
}
