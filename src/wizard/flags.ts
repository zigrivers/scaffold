/**
 * Per-project-type flag interfaces.
 *
 * Each project type collects its CLI-flag values into one grouped interface
 * so that adding a new project type is a focused change (one new flag
 * interface + one new question block) rather than threading 4-5 fields
 * through WizardOptions, runWizard, askWizardQuestions, and tests.
 *
 * Field names within each group match the camelCase form of the CLI flag
 * names (e.g., `--web-rendering` → `webRendering`).
 */

export interface GameFlags {
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
}

export interface WebAppFlags {
  webRendering?: string
  webDeployTarget?: string
  webRealtime?: string
  webAuthFlow?: string
}

export interface BackendFlags {
  backendApiStyle?: string
  backendDataStore?: string[]
  backendAuth?: string
  backendMessaging?: string
  backendDeployTarget?: string
}

export interface CliFlags {
  cliInteractivity?: string
  cliDistribution?: string[]
  cliStructuredOutput?: boolean
}

export interface LibraryFlags {
  libVisibility?: string
  libRuntimeTarget?: string
  libBundleFormat?: string
  libTypeDefinitions?: boolean
  libDocLevel?: string
}

export interface MobileAppFlags {
  mobilePlatform?: string
  mobileDistribution?: string
  mobileOffline?: string
  mobilePushNotifications?: boolean
}

export interface DataPipelineFlags {
  pipelineProcessing?: string
  pipelineOrchestration?: string
  pipelineQuality?: string
  pipelineSchema?: string
  pipelineCatalog?: boolean
}

export interface MlFlags {
  mlPhase?: string
  mlModelType?: string
  mlServing?: string
  mlExperimentTracking?: boolean
}

export interface BrowserExtensionFlags {
  extManifest?: string
  extUiSurfaces?: string[]
  extContentScript?: boolean
  extBackgroundWorker?: boolean
}
